/**
 * WebGL2 filter backend.                                                         OWNER: lane P (performance)
 *
 * WHY: the CPU reference (./apply.ts) needs getImageData/putImageData round trips (GPU readbacks) and runs the box
 * blur on the main thread; at render scale 2 a full-screen BlurFilter(7,7,3) took ~1.5 s and every XSI frame two
 * readbacks. This backend runs the SAME maths on the GPU: canvas -> texture upload (texImage2D, GPU copy, no
 * readback), ping-pong passes in RGBA8 / R8 textures, result drawn back with drawImage(glCanvas).
 *
 * EXACTNESS: every step is the integer formula of apply.ts evaluated with integer shader arithmetic on 0..255 texel
 * values (texelFetch -> round(v·255); results written as k/255 to unorm8 targets, which stores k exactly):
 *   - box blur: v = (S·D + aN·E) / (B·D) in uint32 when a·D and B·D are integers (D = 2^k; true for every blur that is
 *     a multiple of 2^-16 px at render scale 1 or 2, i.e. all SWF and tweened values), else float32 with a 1e-4
 *     guard (rare ±1 differences, never accumulating beyond ±1 per pass);
 *   - offsets (1/256 px bilinear >> 16), strength (A·str256 >> 8), alpha/colour premultiply ((a·b+127)/255) and all
 *     composites (x·k >> 8) are exact integers; gradient LUT = exact RGBA8 texture;
 *   - ColorMatrix: un-premultiply exact, the 4x5 product in float32 (CPU: float64) -> rare ±1.
 *   tests/browser/run-filters-gl.ts compares this backend with the CPU reference (synthetic buffers + library
 *   symbols); max channel difference must be <= 2 (measured: 0 on all integer-blur cases).
 * Color transforms of filtered display objects and the "opaque target" conversion of BitmapData.applyFilter are
 * applied in the final present pass with the exact integer maths of color.ts (applyCxToPixels / unpremultiply).
 *
 * BACKEND CHOICE: `filterBackend.current` = 'gl' (default when WebGL2 works) or 'cpu'. Override with the URL
 * parameter `?filterBackend=cpu` or `globalThis.__BOXHEAD_FILTER_BACKEND__ = 'cpu'` before the engine loads, or call
 * setFilterBackend(). Node (tests) has no WebGL2 -> CPU. Any GL error / context loss / region larger than
 * MAX_TEXTURE_SIZE makes the call return null and the caller falls back to the CPU path.
 * CPU-ONLY PATHS that remain: BitmapData.applyFilter with ColorMatrixFilter (in-place brightness fast path and the
 * un-premultiplied CPU path), paletteMap, colorTransform, draw() with non-alpha colour transforms of bitmaps.
 */
import type { BitmapFilter, BevelFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter } from '../filters.ts';
import type { CxFixed, Pixels } from '../color.ts';
import {
  bevelParams, blurKernel, deviceBlur, dropShadowParams, glowParams, gradientGlowParams, offset256,
  type BlurKernel, type GlowParams,
} from './apply.ts';

// ==================================================================================================== backend switch

export type FilterBackend = 'gl' | 'cpu';

function initialBackend(): FilterBackend {
  const g = globalThis as { __BOXHEAD_FILTER_BACKEND__?: unknown; location?: { search?: string } };
  if (g.__BOXHEAD_FILTER_BACKEND__ === 'cpu' || g.__BOXHEAD_FILTER_BACKEND__ === 'gl') return g.__BOXHEAD_FILTER_BACKEND__;
  try {
    const q = typeof g.location?.search === 'string' ? new URLSearchParams(g.location.search).get('filterBackend') : null;
    if (q === 'cpu' || q === 'gl') return q;
  } catch { /* no URL */ }
  return 'gl';
}

/** Selected filter backend ('gl' falls back to the CPU per call when WebGL2 is unavailable). */
export const filterBackend: { current: FilterBackend } = { current: initialBackend() };

export function setFilterBackend(b: FilterBackend): void { filterBackend.current = b; }

/** Counters (debug overlay / perf probes). */
export const glFilterStats = { runs: 0, passes: 0, fallbacks: 0, lastError: '' };

/** Options of a GL filter run. */
export interface GLFilterOptions {
  /** Colour transform applied to the filtered (premultiplied) result, like color.applyCxToPixels. */
  cx?: CxFixed | null;
  /** Destination is an opaque bitmap: output un-premultiplied colour with alpha 255 (like BitmapData.writePixels). */
  opaque?: boolean;
}

// ==================================================================================================== shaders

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location = 0) out vec4 o;
uniform ivec2 uSize;
bool inb(ivec2 q) { return q.x >= 0 && q.y >= 0 && q.x < uSize.x && q.y < uSize.y; }
int u8(float v) { return int(v * 255.0 + 0.5); }
ivec4 u8v(vec4 v) { return ivec4(v * 255.0 + 0.5); }
`;

/** Blur pass shared code: S (taps -m..m) and E (taps ±(m+1)) along uDir; exact uint or float division. */
const BLUR_COMMON = `
uniform sampler2D uSrc;
uniform ivec2 uDir;
uniform int uM;
uniform int uExact;
uniform uint uD;
uniform uint uAN;
uniform uint uBN;
uniform float uA;
uniform float uB;
`;

const FS_BLUR4 = PRE + BLUR_COMMON + `
ivec4 tap(ivec2 q) { return inb(q) ? u8v(texelFetch(uSrc, q, 0)) : ivec4(0); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int i = uDir.x != 0 ? p.x : p.y;
  int n = uDir.x != 0 ? uSize.x : uSize.y;
  int lo = max(-uM, -i), hi = min(uM, n - 1 - i);
  ivec4 S = ivec4(0);
  for (int j = lo; j <= hi; j++) S += u8v(texelFetch(uSrc, p + uDir * j, 0));
  ivec4 E = tap(p - uDir * (uM + 1)) + tap(p + uDir * (uM + 1));
  uvec4 v;
  if (uExact == 1) v = (uvec4(S) * uD + uvec4(E) * uAN) / uBN;
  else v = uvec4(floor((vec4(S) + uA * vec4(E)) / uB + 1e-4));
  o = vec4(min(v, uvec4(255u))) / 255.0;
}`;

/** Alpha-plane blur pass: reads component uChan of uSrc (optionally 255 - x), writes R8. uM < 0: plain copy. */
const FS_BLUR1 = PRE + BLUR_COMMON + `
uniform int uChan;
uniform int uInv;
int val(ivec2 q) { int c = u8(texelFetch(uSrc, q, 0)[uChan]); return uInv == 1 ? 255 - c : c; }
int tap(ivec2 q) { return inb(q) ? val(q) : 0; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uM < 0) { o = vec4(float(val(p)) / 255.0, 0.0, 0.0, 1.0); return; }
  int i = uDir.x != 0 ? p.x : p.y;
  int n = uDir.x != 0 ? uSize.x : uSize.y;
  int lo = max(-uM, -i), hi = min(uM, n - 1 - i);
  int S = 0;
  for (int j = lo; j <= hi; j++) S += val(p + uDir * j);
  int E = tap(p - uDir * (uM + 1)) + tap(p + uDir * (uM + 1));
  uint v;
  if (uExact == 1) v = (uint(S) * uD + uint(E) * uAN) / uBN;
  else v = uint(floor((float(S) + uA * float(E)) / uB + 1e-4));
  o = vec4(float(min(v, 255u)) / 255.0, 0.0, 0.0, 1.0);
}`;

/** Shared: shifted bilinear sampling of the R8 plane uA (1/256 px weights, >> 16) and the composite modes. */
const EFFECT_COMMON = `
uniform sampler2D uSrc;
uniform sampler2D uA;
int Aat(ivec2 q) { return inb(q) ? u8(texelFetch(uA, q, 0).r) : 0; }
int sampleA(ivec2 p, ivec2 I, ivec2 F) {
  if (F == ivec2(0)) return Aat(p - I);
  ivec2 s = p - I;
  return (Aat(s) * (256 - F.x) * (256 - F.y) + Aat(s - ivec2(1, 0)) * F.x * (256 - F.y)
    + Aat(s - ivec2(0, 1)) * (256 - F.x) * F.y + Aat(s - ivec2(1, 1)) * F.x * F.y) >> 16;
}
ivec4 colorize(ivec3 c, int a) { return ivec4((c * a + 127) / 255, a); }
// type: 0 inner, 1 outer, 2 full
ivec4 composite(ivec4 g, ivec4 s, int type, int knock) {
  if (type == 0) {
    ivec4 r = (g * (s.a + 1)) >> 8;
    return knock == 1 ? r : r + ((s * (256 - g.a)) >> 8);
  }
  if (type == 1) {
    ivec4 r = (g * (256 - s.a)) >> 8;
    return knock == 1 ? r : s + r;
  }
  return knock == 1 ? g : g + ((s * (256 - g.a)) >> 8);
}
`;

const FS_GLOW = PRE + EFFECT_COMMON + `
uniform ivec2 uI;
uniform ivec2 uF;
uniform int uStr;
uniform int uAlpha;
uniform ivec3 uColor;
uniform int uMode; // 0 outer, 1 outer knockout, 2 hideObject, 3 inner, 4 inner knockout / hideObject
uniform ivec2 uK;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec4 s = u8v(texelFetch(uSrc, p, 0));
  int g = min(255, (sampleA(p, uI, uF) * uStr) >> 8);
  ivec4 gp = colorize(uColor, (g * uAlpha + 127) / 255);
  ivec4 r;
  if (uMode == 0) r = s + ((gp * (256 - s.a)) >> 8);
  else if (uMode == 1) {
    ivec2 q = p - uK;
    int ka = inb(q) ? u8(texelFetch(uSrc, q, 0).a) : 0;
    r = (gp * (256 - ka)) >> 8;
  } else if (uMode == 2) r = gp;
  else if (uMode == 3) r = ((gp * (s.a + 1)) >> 8) + ((s * (256 - gp.a)) >> 8);
  else r = (gp * (s.a + 1)) >> 8;
  o = vec4(r) / 255.0;
}`;

const FS_BEVEL = PRE + EFFECT_COMMON + `
uniform ivec2 uI1;
uniform ivec2 uF1;
uniform ivec2 uI2;
uniform ivec2 uF2;
uniform int uStr;
uniform ivec4 uHi;
uniform ivec4 uSh;
uniform int uType;
uniform int uKnock;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec4 s = u8v(texelFetch(uSrc, p, 0));
  int d = sampleA(p, uI1, uF1) - sampleA(p, uI2, uF2);
  ivec4 g = ivec4(0);
  if (d > 0) g = colorize(uHi.rgb, (min(255, (d * uStr) >> 8) * uHi.a + 127) / 255);
  else if (d < 0) g = colorize(uSh.rgb, (min(255, (-d * uStr) >> 8) * uSh.a + 127) / 255);
  o = vec4(composite(g, s, uType, uKnock)) / 255.0;
}`;

const FS_GGLOW = PRE + EFFECT_COMMON + `
uniform sampler2D uLut;
uniform ivec2 uI;
uniform ivec2 uF;
uniform int uStr;
uniform int uType;
uniform int uKnock;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec4 s = u8v(texelFetch(uSrc, p, 0));
  int g = min(255, (sampleA(p, uI, uF) * uStr) >> 8);
  ivec4 c = u8v(texelFetch(uLut, ivec2(g, 0), 0));
  o = vec4(composite(c, s, uType, uKnock)) / 255.0;
}`;

const FS_CMATRIX = PRE + `
uniform sampler2D uSrc;
uniform vec4 uR;
uniform vec4 uG;
uniform vec4 uB;
uniform vec4 uAl;
uniform vec4 uOff;
int cl(float v) { return v <= 0.0 ? 0 : (v >= 255.0 ? 255 : int(floor(v))); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec4 c = u8v(texelFetch(uSrc, p, 0));
  int A = c.a;
  ivec3 u = A == 0 ? ivec3(0) : (A == 255 ? c.rgb : min(ivec3(255), (2 * c.rgb * 255 + A) / (2 * A)));
  vec4 v = vec4(vec3(u), float(A));
  int na = cl(dot(uAl, v) + uOff.a);
  ivec3 n = ivec3(cl(dot(uR, v) + uOff.r), cl(dot(uG, v) + uOff.g), cl(dot(uB, v) + uOff.b));
  o = vec4(ivec4((n * na + 127) / 255, na)) / 255.0;
}`;

const FS_PRESENT = PRE + `
uniform sampler2D uSrc;
uniform int uFlip;
uniform int uOriginY;
uniform int uCx;
uniform ivec4 uMul;
uniform ivec4 uAdd;
uniform int uOpaque;
int fdiv256(int x) { return x >= 0 ? x / 256 : -((-x + 255) / 256); }
int cxch(int c, int m, int a) { return clamp(fdiv256(c * m) + a, 0, 255); }
ivec3 unpremul(ivec3 c, int a) { return min(ivec3(255), (c * 255 + (a >> 1)) / a); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uFlip == 1) p.y = uSize.y - 1 - (p.y - uOriginY);
  ivec4 c = u8v(texelFetch(uSrc, p, 0));
  if (uCx == 1 && c.a > 0) {
    int a = c.a;
    ivec3 u = unpremul(c.rgb, a);
    int na = cxch(a, uMul.a, uAdd.a);
    ivec3 n = ivec3(cxch(u.r, uMul.r, uAdd.r), cxch(u.g, uMul.g, uAdd.g), cxch(u.b, uMul.b, uAdd.b));
    c = ivec4((n * na + 127) / 255, na);
  }
  if (uOpaque == 1) c = c.a == 0 ? ivec4(0, 0, 0, 255) : (c.a == 255 ? c : ivec4(unpremul(c.rgb, c.a), 255));
  o = vec4(c) / 255.0;
}`;

// ==================================================================================================== GL state

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

interface Tex { tex: WebGLTexture; w: number; h: number; r8: boolean }

interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

class GLFilterContext {
  readonly canvas: AnyCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly maxSize: number;
  private readonly progs = new Map<string, Prog>();
  private readonly fbo: WebGLFramebuffer;
  private readonly vao: WebGLVertexArrayObject;
  /** Upload target (re-specified per run). */
  readonly up: Tex;
  /** RGBA work textures and R8 alpha planes (grow-only). */
  readonly rgba: [Tex, Tex];
  readonly planes: [Tex, Tex];
  readonly lut: Tex;
  lost = false;

  constructor(canvas: AnyCanvas, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.fbo = gl.createFramebuffer()!;
    this.vao = gl.createVertexArray()!;
    const mk = (r8: boolean): Tex => ({ tex: gl.createTexture()!, w: 0, h: 0, r8 });
    this.up = mk(false);
    this.rgba = [mk(false), mk(false)];
    this.planes = [mk(true), mk(true)];
    this.lut = mk(false);
    for (const t of [this.up, ...this.rgba, ...this.planes, this.lut]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.bindVertexArray(this.vao);
  }

  prog(name: string, fs: string): Prog {
    let pr = this.progs.get(name);
    if (pr) return pr;
    const gl = this.gl;
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`GL filter shader ${name}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`GL filter program ${name}: ${gl.getProgramInfoLog(p)}`);
    pr = { p, u: new Map() };
    this.progs.set(name, pr);
    return pr;
  }

  use(pr: Prog): void { this.gl.useProgram(pr.p); }

  loc(pr: Prog, n: string): WebGLUniformLocation | null {
    let l = pr.u.get(n);
    if (l === undefined) { l = this.gl.getUniformLocation(pr.p, n); pr.u.set(n, l); }
    return l;
  }

  /** Make sure `t` can hold w×h (grow-only, rounded up to limit reallocations). */
  ensure(t: Tex, w: number, h: number): void {
    if (t.w >= w && t.h >= h) return;
    const gl = this.gl;
    const nw = Math.min(this.maxSize, Math.max(t.w, Math.ceil(w / 64) * 64));
    const nh = Math.min(this.maxSize, Math.max(t.h, Math.ceil(h / 64) * 64));
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    if (t.r8) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, nw, nh, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    t.w = nw; t.h = nh;
  }

  /** Bind `dst` as the render target with a w×h viewport. */
  target(dst: Tex | null, w: number, h: number): void {
    const gl = this.gl;
    if (dst) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst.tex, 0);
      gl.viewport(0, 0, w, h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  bindTex(unit: number, t: Tex): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
  }

  draw(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    glFilterStats.passes++;
  }
}

let ctxState: GLFilterContext | null = null;
let ctxFailed = false;

function createContext(): GLFilterContext | null {
  if (ctxFailed) return null;
  try {
    let canvas: AnyCanvas | null = null;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(64, 64);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; }
    if (!canvas) { ctxFailed = true; return null; }
    const attrs: WebGLContextAttributes = {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance', desynchronized: false,
    };
    const gl = (canvas as OffscreenCanvas).getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    if (!gl) { ctxFailed = true; return null; }
    const c = new GLFilterContext(canvas, gl);
    (canvas as EventTarget).addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      c.lost = true;
      if (ctxState === c) ctxState = null;
    });
    return c;
  } catch (e) {
    ctxFailed = true;
    glFilterStats.lastError = String(e);
    return null;
  }
}

function getContext(): GLFilterContext | null {
  if (ctxState && !ctxState.lost && !ctxState.gl.isContextLost()) return ctxState;
  ctxState = createContext();
  return ctxState;
}

/** True when the GL backend is selected and a WebGL2 context is available. */
export function glFiltersEnabled(): boolean {
  return filterBackend.current === 'gl' && getContext() !== null;
}

// ==================================================================================================== passes

/** Exact integer form of a blur kernel: (S·D + aN·E) / BN when a·D, B·D are integers and nothing overflows. */
interface KernelGL { m: number; exact: boolean; D: number; AN: number; BN: number; a: number; B: number }

function kernelGL(k: BlurKernel): KernelGL {
  const sMax = 255 * (2 * k.m + 1), eMax = 510;
  for (let s = 0; s <= 24; s++) {
    const D = 2 ** s;
    const AN = k.a * D, BN = k.B * D;
    if (Number.isInteger(AN) && Number.isInteger(BN)) {
      if (sMax * D + AN * eMax <= 0xffffffff) return { m: k.m, exact: true, D, AN, BN, a: k.a, B: k.B };
      break;
    }
  }
  return { m: k.m, exact: false, D: 1, AN: 0, BN: 1, a: k.a, B: k.B };
}

function setKernel(c: GLFilterContext, pr: Prog, k: KernelGL, horizontal: boolean): void {
  const gl = c.gl;
  gl.uniform2i(c.loc(pr, 'uDir'), horizontal ? 1 : 0, horizontal ? 0 : 1);
  gl.uniform1i(c.loc(pr, 'uM'), k.m);
  gl.uniform1i(c.loc(pr, 'uExact'), k.exact ? 1 : 0);
  gl.uniform1ui(c.loc(pr, 'uD'), k.D >>> 0);
  gl.uniform1ui(c.loc(pr, 'uAN'), k.AN >>> 0);
  gl.uniform1ui(c.loc(pr, 'uBN'), k.BN >>> 0);
  gl.uniform1f(c.loc(pr, 'uA'), k.a);
  gl.uniform1f(c.loc(pr, 'uB'), k.B);
}

/** Pass sequence of a blur: all horizontal passes, then all vertical passes. */
function blurSequence(bx: number, by: number, passes: number): { k: KernelGL; h: boolean }[] {
  const out: { k: KernelGL; h: boolean }[] = [];
  if (passes <= 0) return out;
  const kx = blurKernel(bx), ky = blurKernel(by);
  if (kx) { const k = kernelGL(kx); for (let p = 0; p < passes; p++) out.push({ k, h: true }); }
  if (ky) { const k = kernelGL(ky); for (let p = 0; p < passes; p++) out.push({ k, h: false }); }
  return out;
}

const otherRGBA = (c: GLFilterContext, cur: Tex): Tex => (cur === c.rgba[0] ? c.rgba[1] : c.rgba[0]);

/** RGBA blur of `cur` (ping-pong between cur and one work texture). Returns the texture holding the result. */
function runBlur(c: GLFilterContext, cur: Tex, w: number, h: number, bx: number, by: number, passes: number): Tex {
  const seq = blurSequence(bx, by, passes);
  if (!seq.length) return cur;
  const gl = c.gl;
  const pr = c.prog('blur4', FS_BLUR4);
  c.use(pr);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  let a = cur, b = otherRGBA(c, cur);
  c.ensure(b, w, h);
  for (const s of seq) {
    setKernel(c, pr, s.k, s.h);
    c.bindTex(0, a);
    c.target(b, w, h);
    c.draw();
    const t = a; a = b; b = t;
  }
  return a;
}

/** Blurred alpha plane (R8) of `cur` (inverted when `invert`). Returns the plane texture. */
function runAlphaBlur(c: GLFilterContext, cur: Tex, w: number, h: number, bx: number, by: number, passes: number, invert: boolean): Tex {
  const gl = c.gl;
  const pr = c.prog('blur1', FS_BLUR1);
  c.use(pr);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  const [p0, p1] = c.planes;
  c.ensure(p0, w, h); c.ensure(p1, w, h);
  const seq = blurSequence(bx, by, passes);
  let src: Tex = cur, dst = p0;
  const first = (s: { k: KernelGL; h: boolean } | null): void => {
    gl.uniform1i(c.loc(pr, 'uChan'), 3);
    gl.uniform1i(c.loc(pr, 'uInv'), invert ? 1 : 0);
    if (s) setKernel(c, pr, s.k, s.h);
    else gl.uniform1i(c.loc(pr, 'uM'), -1);
  };
  if (!seq.length) {
    first(null);
    c.bindTex(0, src); c.target(dst, w, h); c.draw();
    return dst;
  }
  for (let i = 0; i < seq.length; i++) {
    if (i === 0) first(seq[0]!);
    else {
      if (i === 1) { gl.uniform1i(c.loc(pr, 'uChan'), 0); gl.uniform1i(c.loc(pr, 'uInv'), 0); }
      setKernel(c, pr, seq[i]!.k, seq[i]!.h);
    }
    c.bindTex(0, src); c.target(dst, w, h); c.draw();
    src = dst; dst = dst === p0 ? p1 : p0;
  }
  return src;
}

/** Integer part / 1/256 fraction of a sample offset D (sample at p - D/256). */
function splitOffset(D: number): [number, number] { const i = Math.floor(D / 256); return [i, D - i * 256]; }

function setShift(c: GLFilterContext, pr: Prog, nameI: string, nameF: string, Dx: number, Dy: number): void {
  const [ix, fx] = splitOffset(Dx), [iy, fy] = splitOffset(Dy);
  c.gl.uniform2i(c.loc(pr, nameI), ix, iy);
  c.gl.uniform2i(c.loc(pr, nameF), fx, fy);
}

function runGlow(c: GLFilterContext, cur: Tex, w: number, h: number, p: GlowParams): Tex {
  const plane = runAlphaBlur(c, cur, w, h, p.bx, p.by, p.passes, p.inner);
  const gl = c.gl;
  const pr = c.prog('glow', FS_GLOW);
  c.use(pr);
  const out = otherRGBA(c, cur);
  c.ensure(out, w, h);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  gl.uniform1i(c.loc(pr, 'uA'), 1);
  setShift(c, pr, 'uI', 'uF', offset256(p.dx), offset256(p.dy));
  gl.uniform1i(c.loc(pr, 'uStr'), Math.round(p.strength * 256));
  gl.uniform1i(c.loc(pr, 'uAlpha'), p.alpha);
  gl.uniform3i(c.loc(pr, 'uColor'), p.r, p.g, p.b);
  const mode = p.inner ? (p.knockout || p.hideObject ? 4 : 3) : p.hideObject ? 2 : p.knockout ? 1 : 0;
  gl.uniform1i(c.loc(pr, 'uMode'), mode);
  gl.uniform2i(c.loc(pr, 'uK'), p.kx | 0, p.ky | 0);
  c.bindTex(0, cur); c.bindTex(1, plane);
  c.target(out, w, h);
  c.draw();
  return out;
}

const TYPE_ID = { inner: 0, outer: 1, full: 2 } as const;

function runBevel(c: GLFilterContext, cur: Tex, w: number, h: number, f: BevelFilter, ds: number): Tex {
  const p = bevelParams(f, ds);
  const plane = runAlphaBlur(c, cur, w, h, p.bx, p.by, p.passes, false);
  const gl = c.gl;
  const pr = c.prog('bevel', FS_BEVEL);
  c.use(pr);
  const out = otherRGBA(c, cur);
  c.ensure(out, w, h);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  gl.uniform1i(c.loc(pr, 'uA'), 1);
  const Dx = offset256(p.dx), Dy = offset256(p.dy);
  setShift(c, pr, 'uI1', 'uF1', -Dx, -Dy); // highlight side: sample at p + D
  setShift(c, pr, 'uI2', 'uF2', Dx, Dy); // shadow side: sample at p - D
  gl.uniform1i(c.loc(pr, 'uStr'), Math.round(p.strength * 256));
  gl.uniform4i(c.loc(pr, 'uHi'), p.hr, p.hg, p.hb, p.ha);
  gl.uniform4i(c.loc(pr, 'uSh'), p.sr, p.sg, p.sb, p.sa);
  gl.uniform1i(c.loc(pr, 'uType'), TYPE_ID[p.type]);
  gl.uniform1i(c.loc(pr, 'uKnock'), p.knockout ? 1 : 0);
  c.bindTex(0, cur); c.bindTex(1, plane);
  c.target(out, w, h);
  c.draw();
  return out;
}

function runGradientGlow(c: GLFilterContext, cur: Tex, w: number, h: number, f: GradientGlowFilter, ds: number): Tex {
  const p = gradientGlowParams(f, ds);
  const plane = runAlphaBlur(c, cur, w, h, p.bx, p.by, p.passes, false);
  const gl = c.gl;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, c.lut.tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // the LUT is premultiplied already
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, p.lut);
  const pr = c.prog('gglow', FS_GGLOW);
  c.use(pr);
  const out = otherRGBA(c, cur);
  c.ensure(out, w, h);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  gl.uniform1i(c.loc(pr, 'uA'), 1);
  gl.uniform1i(c.loc(pr, 'uLut'), 2);
  setShift(c, pr, 'uI', 'uF', offset256(p.dx), offset256(p.dy));
  gl.uniform1i(c.loc(pr, 'uStr'), Math.round(p.strength * 256));
  gl.uniform1i(c.loc(pr, 'uType'), TYPE_ID[p.type]);
  gl.uniform1i(c.loc(pr, 'uKnock'), p.knockout ? 1 : 0);
  c.bindTex(0, cur); c.bindTex(1, plane);
  c.target(out, w, h);
  c.draw();
  return out;
}

function runColorMatrix(c: GLFilterContext, cur: Tex, w: number, h: number, m: readonly number[]): Tex {
  const M = Array.from({ length: 20 }, (_, i) => Number(m[i]) || 0);
  const gl = c.gl;
  const pr = c.prog('cmatrix', FS_CMATRIX);
  c.use(pr);
  const out = otherRGBA(c, cur);
  c.ensure(out, w, h);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  gl.uniform4f(c.loc(pr, 'uR'), M[0]!, M[1]!, M[2]!, M[3]!);
  gl.uniform4f(c.loc(pr, 'uG'), M[5]!, M[6]!, M[7]!, M[8]!);
  gl.uniform4f(c.loc(pr, 'uB'), M[10]!, M[11]!, M[12]!, M[13]!);
  gl.uniform4f(c.loc(pr, 'uAl'), M[15]!, M[16]!, M[17]!, M[18]!);
  gl.uniform4f(c.loc(pr, 'uOff'), M[4]!, M[9]!, M[14]!, M[19]!);
  c.bindTex(0, cur);
  c.target(out, w, h);
  c.draw();
  return out;
}

function runChain(c: GLFilterContext, cur: Tex, w: number, h: number, filters: readonly BitmapFilter[], ds: number): Tex {
  for (const f of filters) {
    if (!f) continue;
    switch (f.kind) {
      case 'blur': {
        const b = f as BlurFilter;
        const q = Math.max(0, Math.min(15, Math.trunc(Number(b.quality)) || 0));
        cur = runBlur(c, cur, w, h, deviceBlur(b.blurX, ds), deviceBlur(b.blurY, ds), q);
        break;
      }
      case 'glow': cur = runGlow(c, cur, w, h, glowParams(f as GlowFilter, ds)); break;
      case 'dropShadow': cur = runGlow(c, cur, w, h, dropShadowParams(f as DropShadowFilter, ds)); break;
      case 'bevel': cur = runBevel(c, cur, w, h, f as BevelFilter, ds); break;
      case 'gradientGlow': cur = runGradientGlow(c, cur, w, h, f as GradientGlowFilter, ds); break;
      case 'colorMatrix': cur = runColorMatrix(c, cur, w, h, (f as ColorMatrixFilter).matrix); break;
      default: break;
    }
  }
  return cur;
}

/** Final pass: `cur` -> default framebuffer (top-left w×h of the canvas) or -> `dst`, applying cx / opaque. */
function present(c: GLFilterContext, cur: Tex, w: number, h: number, opts: GLFilterOptions | undefined, dst: Tex | null): void {
  const gl = c.gl;
  const pr = c.prog('present', FS_PRESENT);
  c.use(pr);
  gl.uniform2i(c.loc(pr, 'uSize'), w, h);
  gl.uniform1i(c.loc(pr, 'uSrc'), 0);
  const cx = opts?.cx ?? null;
  gl.uniform1i(c.loc(pr, 'uCx'), cx ? 1 : 0);
  if (cx) {
    gl.uniform4i(c.loc(pr, 'uMul'), cx.rm, cx.gm, cx.bm, cx.am);
    gl.uniform4i(c.loc(pr, 'uAdd'), cx.ro, cx.go, cx.bo, cx.ao);
  }
  gl.uniform1i(c.loc(pr, 'uOpaque'), opts?.opaque ? 1 : 0);
  c.bindTex(0, cur);
  if (dst) {
    gl.uniform1i(c.loc(pr, 'uFlip'), 0);
    c.target(dst, w, h);
  } else {
    const cv = c.canvas;
    if (cv.width < w || cv.height < h) {
      cv.width = Math.min(c.maxSize, Math.max(cv.width, Math.ceil(w / 64) * 64));
      cv.height = Math.min(c.maxSize, Math.max(cv.height, Math.ceil(h / 64) * 64));
    }
    const oy = cv.height - h;
    gl.uniform1i(c.loc(pr, 'uFlip'), 1);
    gl.uniform1i(c.loc(pr, 'uOriginY'), oy);
    c.target(null, w, h);
    gl.viewport(0, oy, w, h);
  }
  c.draw();
}

function fail(e: unknown): null {
  glFilterStats.fallbacks++;
  glFilterStats.lastError = String(e instanceof Error ? e.message : e);
  if (glFilterStats.fallbacks <= 3) console.warn('[filters/gl] falling back to the CPU filters:', e);
  if (ctxState && !(e instanceof RangeError)) { ctxFailed = true; ctxState = null; }
  return null;
}

// ==================================================================================================== public API

/**
 * Filter the w×h region at (sx, sy) of a canvas-like image source (its pixels are taken as the premultiplied
 * contents, i.e. exactly what is stored in the canvas) and leave the result in the top-left w×h corner of the
 * returned canvas, valid until the next call (draw it with drawImage(c, 0, 0, w, h, dx, dy, w, h)).
 * Returns null when the GL backend is not selected / unavailable / the region is too large: use the CPU path.
 */
export function glFilterImage(source: TexImageSource, sx: number, sy: number, w: number, h: number,
  filters: readonly BitmapFilter[], deviceScale: number, opts?: GLFilterOptions): AnyCanvas | null {
  if (filterBackend.current !== 'gl') return null;
  const c = getContext();
  if (!c || w <= 0 || h <= 0 || w > c.maxSize || h > c.maxSize) return null;
  try {
    const gl = c.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, c.up.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sx);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sy);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    c.up.w = w; c.up.h = h;
    const out = runChain(c, c.up, w, h, filters, deviceScale);
    present(c, out, w, h, opts, null);
    glFilterStats.runs++;
    return c.canvas;
  } catch (e) {
    return fail(e);
  }
}

/** Same on premultiplied pixels with a read-back (tests and the browser comparison page). */
export function glFilterPixels(src: Pixels, filters: readonly BitmapFilter[], deviceScale: number, opts?: GLFilterOptions): Pixels | null {
  if (filterBackend.current !== 'gl') return null;
  const c = getContext();
  const w = src.width, h = src.height;
  if (!c || w <= 0 || h <= 0 || w > c.maxSize || h > c.maxSize) return null;
  try {
    const gl = c.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, c.up.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(src.data.buffer, src.data.byteOffset, w * h * 4));
    c.up.w = w; c.up.h = h;
    let out = runChain(c, c.up, w, h, filters, deviceScale);
    if (opts?.cx || opts?.opaque) {
      const dst = otherRGBA(c, out);
      c.ensure(dst, w, h);
      present(c, out, w, h, opts, dst);
      out = dst;
    }
    c.target(out, w, h);
    const data = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    glFilterStats.runs++;
    return { data, width: w, height: h };
  } catch (e) {
    return fail(e);
  }
}

/** Read back the current contents of the GL output canvas region (tests). */
export function glReadOutput(w: number, h: number): Uint8ClampedArray | null {
  const c = ctxState;
  if (!c) return null;
  const gl = c.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const data = new Uint8ClampedArray(w * h * 4);
  gl.readPixels(0, c.canvas.height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  // flip rows (GL origin bottom-left)
  const row = w * 4, tmp = new Uint8ClampedArray(row);
  for (let y = 0; y < h >> 1; y++) {
    const a = y * row, b = (h - 1 - y) * row;
    tmp.set(data.subarray(a, a + row)); data.copyWithin(a, b, b + row); data.set(tmp, b);
  }
  return data;
}
