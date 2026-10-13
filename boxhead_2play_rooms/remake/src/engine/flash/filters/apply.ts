/**
 * Filter pixel maths (Flash 8 BitmapFilter semantics).                 OWNER: lane C (engine core); lane P (perf/fidelity)
 *
 * Contract used by BitmapData.applyFilter (lane C) and by the display-list renderer for filtered display objects
 * (lane E). Works on raw premultiplied-alpha RGBA pixel buffers so it is testable in Node; canvas glue lives in the
 * callers. This is the CPU REFERENCE implementation; filters/gl.ts is a WebGL2 port of exactly these maths (fast
 * path in the browser), see its header.
 *
 * `deviceScale` scales all spatial parameters because buffers are in device pixels:
 *   - distance  -> distance * scale
 *   - blurX/Y   -> (blur - 1) * scale + 1   (radius-preserving: a Flash blur of B covers a box of B pixels including
 *                  the centre one, i.e. a radius of (B-1)/2; this keeps the radius in LOGICAL pixels identical at any
 *                  scale and reduces to the plain value at scale 1. Same rule Ruffle uses when rendering scaled.)
 *
 * MODEL — fitted to the real Flash Player (oracle probe P5, tests/goldens/flash/p5_filters.json; checked by
 * tests/unit/oracle/filters.test.ts). Integers are 0..255 premultiplied values unless noted.
 *   Blur  — box of total weight B = min(blur, 255): r = (B-1)/2, m = ceil(r)-1, taps -m..m weigh 1, the two taps at
 *           ±(m+1) weigh a = r-m (exact); out = floor(Σ w·v / B). ALL `quality` horizontal passes run first, then all
 *           vertical passes, each floored to 8 bits (exact on all 40 P5 blur grids). Blur <= 1 or quality 0 is a
 *           no-op; pixels outside the buffer are 0. All four premultiplied channels are blurred.
 *   Glow / DropShadow — A = blur(srcA) (INNER: blur(255 - srcA)); a drop-shadow offset d is applied by sampling A at
 *           p - D/256 with D = ceil(d·256) and bilinear weights in 1/256 (Σ w·A >> 16); g = min(255, ⌊A·strength⌋);
 *           ga = round(g·alpha/255); glow colour premultiplied with round(c·ga/255). Composite with k = sa+1 or
 *           256-sa (Flash's x/255 ≈ x·(k)>>8): outer: s + (glow·(256-sa) >> 8); outer knockout: glow·(256-sa') >> 8
 *           where sa' is the source alpha at p - (pad, pad) for GlowFilter (Flash quirk: pad = the generateFilterRect
 *           padding) and at p for DropShadowFilter; hideObject: glow; inner: (glow·(sa+1) >> 8) + (s·(256-ga) >> 8);
 *           inner knockout / hideObject: glow·(sa+1) >> 8.
 *   Bevel — A = blur(srcA); H = A sampled at p + D/256, S = A at p - D/256 (D = ceil(d·256), bilinear >> 16);
 *           highlight amount = min(255, ⌊(H-S)·strength⌋) when H > S, shadow amount likewise when S > H; coloured
 *           like the glow (first colour of a SWF BEVELFILTER record = highlight); composited like the glow for
 *           inner/outer, full: glow + (s·(256-ga) >> 8); knockout drops the source term.
 *   GradientGlow — like Glow, but the premultiplied colour is a 256-entry gradient lookup at g (un-premultiplied
 *           stops interpolated per channel with floor, premultiplied with round); an INNER gradient glow indexes the
 *           gradient with blur(srcA) (not 255 - srcA); type 'full' composites like the bevel.
 *   ColorMatrix — on un-premultiplied values u = round(p·255/a) (a = 0 -> 0): c' = clamp(⌊m·[r,g,b,a] + offset⌋),
 *           premultiplied with round(c'·a'/255).
 *   Parameters are normalised like the Flash AS2 setters: blur clamped to 0..255, quality to int 0..15, strength to
 *   8.8 fixed point in 0..255, alpha to 0..255 (truncated).
 *   KNOWN RESIDUALS vs FP32 (all ±1 except where noted): drop shadow 4 px of 'dropA_game_5_2_0.5'; bevel 1–32 px per
 *   case (outer bevel 'bevelB_game_outer_219' up to ±3); gradient-glow colour channels; ColorMatrix on
 *   semi-transparent pixels (FP8 rounds differently anyway) and on fully transparent pixels with offsets (Flash
 *   writes position-dependent colour garbage there; alpha matches).
 */
import type { BitmapFilter, BevelFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter } from '../filters.ts';
import { unpremul, type Pixels } from '../color.ts';

export type { Pixels } from '../color.ts';

export interface Padding { left: number; top: number; right: number; bottom: number }

// ------------------------------------------------------------------ parameter normalisation (Flash setters)

const clampNum = (v: number, lo: number, hi: number): number => (v > lo ? (v < hi ? v : hi) : lo); // NaN -> lo
const normBlur = (v: number): number => clampNum(Number(v), 0, 255);
const normPasses = (q: number): number => clampNum(Math.trunc(Number(q)) || 0, 0, 15);
const normStrength = (s: number): number => clampNum(Math.trunc(Number(s) * 256) || 0, 0, 0xff00) / 256;
const normAlpha8 = (a: number): number => Math.trunc(clampNum(Number(a), 0, 1) * 255);
const deg2rad = (d: number): number => (Number(d) || 0) * Math.PI / 180;

/** Device-space blur amount for a logical blur value (radius preserving), clamped to 255. */
export function deviceBlur(blur: number, deviceScale: number): number {
  const b = normBlur(blur);
  return Math.min(255, (b - 1) * deviceScale + 1);
}

/** Extra pixels one blur pass of `b` (device units) reaches on each side. */
const blurReach = (b: number): number => (b <= 1 ? 0 : Math.ceil((Math.min(b, 255) - 1) / 2));

// ------------------------------------------------------------------ blur

/** One box-blur pass of total weight B: taps -m..m weigh 1, the taps at ±(m+1) weigh a (exact, 0 < a <= 1). */
export interface BlurKernel { m: number; a: number; B: number }

/** Kernel of a device blur amount `b` (null = no-op, i.e. b <= 1). */
export function blurKernel(b: number): BlurKernel | null {
  const B = Math.min(b, 255);
  if (!(B > 1)) return null;
  const r = (B - 1) / 2;
  const m = Math.ceil(r) - 1;
  return { m, a: r - m, B };
}

/** Guards floor() against binary rounding of exact integer quotients (uniform areas must stay exact). */
const BLUR_EPS = 1e-9;

/** Bounds of the possibly non-zero samples of a plane: [x0, x1) × [y0, y1). */
interface Box { x0: number; y0: number; x1: number; y1: number }

/** Horizontal pass on rows box.y0..y1, writing columns box.x0-(m+1) .. box.x1+(m+1); returns the grown box. */
function hPass(src: Uint8Array, dst: Uint8Array, w: number, ch: number, k: BlurKernel, box: Box): Box {
  const { m, a, B } = k;
  const ox0 = Math.max(0, box.x0 - m - 1), ox1 = Math.min(w, box.x1 + m + 1);
  for (let y = box.y0; y < box.y1; y++) {
    const row = y * w * ch;
    for (let c = 0; c < ch; c++) {
      const base = row + c;
      let S = 0;
      for (let j = ox0 - m; j <= ox0 + m; j++) if (j >= 0 && j < w) S += src[base + j * ch]!;
      for (let x = ox0; x < ox1; x++) {
        const l = x - m - 1, r = x + m + 1;
        const E = (l >= 0 ? src[base + l * ch]! : 0) + (r < w ? src[base + r * ch]! : 0);
        dst[base + x * ch] = Math.floor((S + a * E) / B + BLUR_EPS);
        if (r < w) S += src[base + r * ch]!;
        if (x >= m) S -= src[base + (x - m) * ch]!;
      }
    }
  }
  return { x0: ox0, x1: ox1, y0: box.y0, y1: box.y1 };
}

/** Vertical pass (row-major with per-column running sums); returns the grown box. */
function vPass(src: Uint8Array, dst: Uint8Array, w: number, h: number, ch: number, k: BlurKernel, box: Box, sums: Float64Array): Box {
  const { m, a, B } = k;
  const oy0 = Math.max(0, box.y0 - m - 1), oy1 = Math.min(h, box.y1 + m + 1);
  const stride = w * ch;
  const c0 = box.x0 * ch, c1 = box.x1 * ch;
  sums.fill(0, c0, c1);
  for (let j = oy0 - m; j <= oy0 + m; j++) {
    if (j < 0 || j >= h) continue;
    const row = j * stride;
    for (let c = c0; c < c1; c++) sums[c]! += src[row + c]!;
  }
  for (let y = oy0; y < oy1; y++) {
    const l = y - m - 1, r = y + m + 1, out = y - m;
    const lrow = l >= 0 ? l * stride : -1, rrow = r < h ? r * stride : -1, orow = out >= 0 ? out * stride : -1;
    const drow = y * stride;
    for (let c = c0; c < c1; c++) {
      const rv = rrow >= 0 ? src[rrow + c]! : 0;
      const E = (lrow >= 0 ? src[lrow + c]! : 0) + rv;
      const S = sums[c]!;
      dst[drow + c] = Math.floor((S + a * E) / B + BLUR_EPS);
      sums[c] = S + rv - (orow >= 0 ? src[orow + c]! : 0);
    }
  }
  return { x0: box.x0, x1: box.x1, y0: oy0, y1: oy1 };
}

/** Bounds of the non-zero samples of a plane (null when all zero). */
function nonZeroBox(d: Uint8Array, w: number, h: number, ch: number): Box | null {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  const stride = w * ch;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    let first = -1, last = -1;
    for (let i = 0; i < stride; i++) if (d[row + i] !== 0) { first = i; break; }
    if (first < 0) continue;
    for (let i = stride - 1; i >= first; i--) if (d[row + i] !== 0) { last = i; break; }
    if (y < y0) y0 = y;
    y1 = y + 1;
    const fx = Math.floor(first / ch), lx = Math.floor(last / ch) + 1;
    if (fx < x0) x0 = fx;
    if (lx > x1) x1 = lx;
  }
  return y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/**
 * Flash box blur of a plane with `ch` interleaved 8-bit channels (4 = premultiplied RGBA, 1 = alpha plane): ALL
 * `passes` horizontal passes first, then all vertical passes (verified against Flash Player: P5 goldens), each pass
 * floored to 8 bits. Pixels outside the buffer are 0. Returns a new array (the input is not modified).
 */
export function blurPlane(data: Uint8Array | Uint8ClampedArray, w: number, h: number, ch: number, bx: number, by: number,
  passes: number): Uint8Array {
  const kx = blurKernel(bx), ky = blurKernel(by);
  const out = new Uint8Array(data.length);
  out.set(data);
  if (passes <= 0 || (!kx && !ky)) return out;
  let box = nonZeroBox(out, w, h, ch);
  if (!box) return out;
  let cur = out, tmp = new Uint8Array(data.length);
  if (kx) {
    for (let p = 0; p < passes; p++) {
      box = hPass(cur, tmp, w, ch, kx, box);
      const t = cur; cur = tmp; tmp = t;
    }
  }
  if (ky) {
    const sums = new Float64Array(w * ch);
    for (let p = 0; p < passes; p++) {
      box = vPass(cur, tmp, w, h, ch, ky, box, sums);
      const t = cur; cur = tmp; tmp = t;
    }
  }
  return cur;
}

/** Box-blur an alpha plane (1 byte per pixel). Exposed for tests. */
export function blurAlphaPlane(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, bx: number, by: number, passes: number): Uint8ClampedArray {
  const r = blurPlane(alpha, w, h, 1, bx, by, passes);
  return new Uint8ClampedArray(r.buffer, r.byteOffset, r.length);
}

function extractAlpha(src: Pixels): Uint8Array {
  const n = src.width * src.height;
  const a = new Uint8Array(n);
  const d = src.data;
  for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3]!;
  return a;
}

function applyBlur(src: Pixels, f: BlurFilter, s: number): Pixels {
  const r = blurPlane(src.data, src.width, src.height, 4, deviceBlur(f.blurX, s), deviceBlur(f.blurY, s), normPasses(f.quality));
  return { data: new Uint8ClampedArray(r.buffer, r.byteOffset, r.length), width: src.width, height: src.height };
}

// ------------------------------------------------------------------ glow / drop shadow

/** Fixed-point (1/256 px) sample offset of a filter offset d: the sample position p - d is quantised DOWN. */
export function offset256(d: number): number { return Math.ceil(d * 256 - 1e-7); }

/**
 * Sample a plane at p - d with bilinear weights in 1/256 px (Flash: offset = ceil(d·256)/256, result floored).
 * Outside the plane is 0. Returns `plane` itself when the offset is (0, 0).
 */
export function shiftPlane(plane: Uint8Array, w: number, h: number, dx: number, dy: number): Uint8Array {
  const DX = offset256(dx), DY = offset256(dy);
  if (DX === 0 && DY === 0) return plane;
  const ix = DX >> 8, iy = DY >> 8, fx = DX & 255, fy = DY & 255;
  const w00 = (256 - fx) * (256 - fy), w10 = fx * (256 - fy), w01 = (256 - fx) * fy, w11 = fx * fy;
  const out = new Uint8Array(w * h);
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : plane[y * w + x]!);
  for (let y = 0; y < h; y++) {
    const sy = y - iy;
    if (sy < 0 || sy > h) continue; // rows sy and sy-1 both outside
    for (let x = 0; x < w; x++) {
      const sx = x - ix;
      if (sx < 0 || sx > w) continue;
      out[y * w + x] = (at(sx, sy) * w00 + at(sx - 1, sy) * w10 + at(sx, sy - 1) * w01 + at(sx - 1, sy - 1) * w11) >>> 16;
    }
  }
  return out;
}

/** Normalised glow / drop-shadow parameters (device units). */
export interface GlowParams {
  /** Glow colour (0..255 each), alpha (0..255 integer) and strength (8.8 fixed point value). */
  r: number; g: number; b: number; alpha: number; strength: number;
  inner: boolean; knockout: boolean; hideObject: boolean;
  bx: number; by: number; passes: number;
  /** Offset of the shadow (device px, unquantised). */
  dx: number; dy: number;
  /** Outer knockout only: the hole is cut with the source alpha sampled at p - (kx, ky) (Flash quirk). */
  kx: number; ky: number;
}

/** Glow alpha after strength: min(255, floor(A·strength)). */
const strengthen = (A: number, s: number): number => { const v = Math.floor(A * s + 1e-9); return v > 255 ? 255 : v; };
/** round(a·b/255) for integers 0..255. */
const mul255 = (a: number, b: number): number => ((a * b + 127) / 255) | 0;

function glowCore(src: Pixels, p: GlowParams): Pixels {
  const w = src.width, h = src.height, d = src.data, n = w * h;
  const plane = new Uint8Array(n);
  for (let i = 0; i < n; i++) plane[i] = p.inner ? 255 - d[i * 4 + 3]! : d[i * 4 + 3]!;
  const A = shiftPlane(blurPlane(plane, w, h, 1, p.bx, p.by, p.passes), w, h, p.dx, p.dy);
  const out = new Uint8ClampedArray(d.length);
  // premultiplied glow colour per glow alpha value (256-entry table)
  const lut = new Uint8Array(256 * 4);
  for (let g = 0; g < 256; g++) {
    const ga = mul255(g, p.alpha);
    lut[g * 4] = mul255(p.r, ga); lut[g * 4 + 1] = mul255(p.g, ga); lut[g * 4 + 2] = mul255(p.b, ga); lut[g * 4 + 3] = ga;
  }
  const knock = !p.inner && p.knockout;
  const kx = p.kx | 0, ky = p.ky | 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const o = i * 4;
      const g = strengthen(A[i]!, p.strength) * 4;
      const gr = lut[g]!, gg = lut[g + 1]!, gb = lut[g + 2]!, ga = lut[g + 3]!;
      const sa = d[o + 3]!;
      if (p.inner) {
        const k = sa + 1;
        if (p.knockout || p.hideObject) {
          out[o] = (gr * k) >> 8; out[o + 1] = (gg * k) >> 8; out[o + 2] = (gb * k) >> 8; out[o + 3] = (ga * k) >> 8;
        } else {
          const r = 256 - ga;
          out[o] = ((gr * k) >> 8) + ((d[o]! * r) >> 8); out[o + 1] = ((gg * k) >> 8) + ((d[o + 1]! * r) >> 8);
          out[o + 2] = ((gb * k) >> 8) + ((d[o + 2]! * r) >> 8); out[o + 3] = ((ga * k) >> 8) + ((sa * r) >> 8);
        }
      } else if (p.hideObject) {
        out[o] = gr; out[o + 1] = gg; out[o + 2] = gb; out[o + 3] = ga;
      } else if (knock) {
        const xx = x - kx, yy = y - ky;
        const ka = xx >= 0 && yy >= 0 && xx < w && yy < h ? d[(yy * w + xx) * 4 + 3]! : 0;
        const k = 256 - ka;
        out[o] = (gr * k) >> 8; out[o + 1] = (gg * k) >> 8; out[o + 2] = (gb * k) >> 8; out[o + 3] = (ga * k) >> 8;
      } else {
        const k = 256 - sa;
        out[o] = d[o]! + ((gr * k) >> 8); out[o + 1] = d[o + 1]! + ((gg * k) >> 8);
        out[o + 2] = d[o + 2]! + ((gb * k) >> 8); out[o + 3] = sa + ((ga * k) >> 8);
      }
    }
  }
  return { data: out, width: w, height: h };
}

const rgb8 = (c: number): [number, number, number] => [(c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff];

/** Generic blur padding of one axis as Flash's generateFilterRect computes it: max(1, ceil(blur·q/2)) (q >= 1). */
const flashBlurPad = (b: number, q: number): number => (q <= 0 ? 0 : Math.max(1, Math.ceil((b * q) / 2)));

export function glowParams(f: GlowFilter, s: number): GlowParams {
  const [r, g, b] = rgb8(Number(f.color) >>> 0);
  const bx = deviceBlur(f.blurX, s), by = deviceBlur(f.blurY, s), passes = normPasses(f.quality);
  return {
    r, g, b, alpha: normAlpha8(f.alpha), strength: normStrength(f.strength), inner: !!f.inner, knockout: !!f.knockout,
    hideObject: false, bx, by, passes, dx: 0, dy: 0, kx: flashBlurPad(bx, passes), ky: flashBlurPad(by, passes),
  };
}

export function dropShadowParams(f: DropShadowFilter, s: number): GlowParams {
  const [r, g, b] = rgb8(Number(f.color) >>> 0);
  const [dx, dy] = offsetOf(f.distance, f.angle, s);
  return {
    r, g, b, alpha: normAlpha8(f.alpha), strength: normStrength(f.strength), inner: !!f.inner, knockout: !!f.knockout,
    hideObject: !!f.hideObject, bx: deviceBlur(f.blurX, s), by: deviceBlur(f.blurY, s), passes: normPasses(f.quality),
    dx, dy, kx: 0, ky: 0,
  };
}

function applyGlow(src: Pixels, f: GlowFilter, s: number): Pixels { return glowCore(src, glowParams(f, s)); }

export function offsetOf(distance: number, angleDeg: number, s: number): [number, number] {
  const a = deg2rad(angleDeg);
  const dist = (Number(distance) || 0) * s;
  return [Math.cos(a) * dist, Math.sin(a) * dist];
}

function applyDropShadow(src: Pixels, f: DropShadowFilter, s: number): Pixels { return glowCore(src, dropShadowParams(f, s)); }

// ------------------------------------------------------------------ bevel

/** Normalised bevel parameters (device units). */
export interface BevelParams {
  hr: number; hg: number; hb: number; ha: number; sr: number; sg: number; sb: number; sa: number; strength: number;
  type: 'inner' | 'outer' | 'full'; knockout: boolean; bx: number; by: number; passes: number; dx: number; dy: number;
}

export function bevelParams(f: BevelFilter, s: number): BevelParams {
  const [hr, hg, hb] = rgb8(Number(f.highlightColor) >>> 0);
  const [sr, sg, sb] = rgb8(Number(f.shadowColor) >>> 0);
  const [dx, dy] = offsetOf(f.distance, f.angle, s);
  return {
    hr, hg, hb, ha: normAlpha8(f.highlightAlpha), sr, sg, sb, sa: normAlpha8(f.shadowAlpha), strength: normStrength(f.strength),
    type: f.type === 'outer' || f.type === 'full' ? f.type : 'inner', knockout: !!f.knockout,
    bx: deviceBlur(f.blurX, s), by: deviceBlur(f.blurY, s), passes: normPasses(f.quality), dx, dy,
  };
}

/** Composite a premultiplied effect colour g (0..255 each) with the source pixel s (Flash fixed-point maths). */
function compositeEffect(out: Uint8ClampedArray, o: number, d: Uint8ClampedArray, gr: number, gg: number, gb: number, ga: number,
  mode: 'inner' | 'outer' | 'full', knockout: boolean): void {
  const sa = d[o + 3]!;
  if (mode === 'inner') {
    const k = sa + 1;
    if (knockout) { out[o] = (gr * k) >> 8; out[o + 1] = (gg * k) >> 8; out[o + 2] = (gb * k) >> 8; out[o + 3] = (ga * k) >> 8; return; }
    const r = 256 - ga;
    out[o] = ((gr * k) >> 8) + ((d[o]! * r) >> 8); out[o + 1] = ((gg * k) >> 8) + ((d[o + 1]! * r) >> 8);
    out[o + 2] = ((gb * k) >> 8) + ((d[o + 2]! * r) >> 8); out[o + 3] = ((ga * k) >> 8) + ((sa * r) >> 8);
    return;
  }
  if (mode === 'outer') {
    const k = 256 - sa;
    if (knockout) { out[o] = (gr * k) >> 8; out[o + 1] = (gg * k) >> 8; out[o + 2] = (gb * k) >> 8; out[o + 3] = (ga * k) >> 8; return; }
    out[o] = d[o]! + ((gr * k) >> 8); out[o + 1] = d[o + 1]! + ((gg * k) >> 8);
    out[o + 2] = d[o + 2]! + ((gb * k) >> 8); out[o + 3] = sa + ((ga * k) >> 8);
    return;
  }
  if (knockout) { out[o] = gr; out[o + 1] = gg; out[o + 2] = gb; out[o + 3] = ga; return; }
  const r = 256 - ga;
  out[o] = gr + ((d[o]! * r) >> 8); out[o + 1] = gg + ((d[o + 1]! * r) >> 8);
  out[o + 2] = gb + ((d[o + 2]! * r) >> 8); out[o + 3] = ga + ((sa * r) >> 8);
}

function bevelCore(src: Pixels, p: BevelParams): Pixels {
  const w = src.width, h = src.height, d = src.data;
  const A = blurPlane(extractAlpha(src), w, h, 1, p.bx, p.by, p.passes);
  // highlight side samples p + D, shadow side p - D, with D = ceil(d·256)/256 for both
  const Dx = offset256(p.dx) / 256, Dy = offset256(p.dy) / 256;
  const H = shiftPlane(A, w, h, -Dx, -Dy), S = shiftPlane(A, w, h, Dx, Dy);
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0, n = w * h; i < n; i++) {
    const diff = H[i]! - S[i]!;
    let gr = 0, gg = 0, gb = 0, ga = 0;
    if (diff > 0) {
      const a = mul255(strengthen(diff, p.strength), p.ha);
      gr = mul255(p.hr, a); gg = mul255(p.hg, a); gb = mul255(p.hb, a); ga = a;
    } else if (diff < 0) {
      const a = mul255(strengthen(-diff, p.strength), p.sa);
      gr = mul255(p.sr, a); gg = mul255(p.sg, a); gb = mul255(p.sb, a); ga = a;
    }
    compositeEffect(out, i * 4, d, gr, gg, gb, ga, p.type, p.knockout);
  }
  return { data: out, width: w, height: h };
}

function applyBevel(src: Pixels, f: BevelFilter, s: number): Pixels { return bevelCore(src, bevelParams(f, s)); }

// ------------------------------------------------------------------ gradient glow

/** Rounding used when interpolating gradient stops (tuned against the P5 goldens). */
export const gradientRound = { mode: 'floor' as 'round' | 'floor' };

/**
 * 256-entry PREMULTIPLIED gradient lookup (Uint8, 4 per entry) from AS2 colors / alphas (0..1) / ratios (0..255):
 * un-premultiplied stops interpolated linearly per channel, then premultiplied with round(c·a/255).
 */
export function gradientLUT8(colors: readonly number[], alphas: readonly number[], ratios: readonly number[]): Uint8Array {
  const n = Math.min(colors.length, alphas.length, ratios.length);
  const lut = new Uint8Array(256 * 4);
  if (n === 0) return lut;
  const stops: { t: number; c: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const c = Number(colors[i]) >>> 0;
    stops.push({ t: clampNum(Math.round(Number(ratios[i])), 0, 255), c: [(c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff, normAlpha8(alphas[i]!)] });
  }
  const rnd = gradientRound.mode === 'floor' ? Math.floor : Math.round;
  for (let i = 0; i < 256; i++) {
    let v: number[];
    const first = stops[0]!, last = stops[stops.length - 1]!;
    if (i <= first.t) v = first.c;
    else if (i >= last.t) v = last.c;
    else {
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1]!.t < i) k++;
      const s0 = stops[k]!, s1 = stops[k + 1]!;
      const span = s1.t - s0.t;
      const f = span <= 0 ? 1 : (i - s0.t) / span;
      v = s0.c.map((c0, j) => rnd(c0 + (s1.c[j]! - c0) * f));
    }
    const a = v[3]!;
    lut[i * 4] = mul255(v[0]!, a); lut[i * 4 + 1] = mul255(v[1]!, a); lut[i * 4 + 2] = mul255(v[2]!, a); lut[i * 4 + 3] = a;
  }
  return lut;
}

/** 256-entry premultiplied gradient lookup as Float32 0..1 (kept for callers/tests of the old API). */
export function gradientLUT(colors: readonly number[], alphas: readonly number[], ratios: readonly number[]): Float32Array {
  const l8 = gradientLUT8(colors, alphas, ratios);
  const out = new Float32Array(l8.length);
  for (let i = 0; i < l8.length; i++) out[i] = l8[i]! / 255;
  return out;
}

/** Normalised gradient glow parameters (device units). */
export interface GradientGlowParams {
  lut: Uint8Array; strength: number; type: 'inner' | 'outer' | 'full'; knockout: boolean;
  bx: number; by: number; passes: number; dx: number; dy: number;
}

export function gradientGlowParams(f: GradientGlowFilter, s: number): GradientGlowParams {
  const [dx, dy] = offsetOf(f.distance, f.angle, s);
  return {
    lut: gradientLUT8(f.colors ?? [], f.alphas ?? [], f.ratios ?? []), strength: normStrength(f.strength),
    type: f.type === 'outer' || f.type === 'full' ? f.type : 'inner', knockout: !!f.knockout,
    bx: deviceBlur(f.blurX, s), by: deviceBlur(f.blurY, s), passes: normPasses(f.quality), dx, dy,
  };
}

function gradientGlowCore(src: Pixels, p: GradientGlowParams): Pixels {
  const w = src.width, h = src.height, d = src.data, n = w * h;
  // NB: unlike GlowFilter, an INNER gradient glow indexes the gradient with the blurred alpha itself (P5 golden)
  const plane = new Uint8Array(n);
  for (let i = 0; i < n; i++) plane[i] = d[i * 4 + 3]!;
  const A = shiftPlane(blurPlane(plane, w, h, 1, p.bx, p.by, p.passes), w, h, p.dx, p.dy);
  const out = new Uint8ClampedArray(d.length);
  const lut = p.lut;
  for (let i = 0; i < n; i++) {
    const g = strengthen(A[i]!, p.strength) * 4;
    compositeEffect(out, i * 4, d, lut[g]!, lut[g + 1]!, lut[g + 2]!, lut[g + 3]!, p.type, p.knockout);
  }
  return { data: out, width: w, height: h };
}

function applyGradientGlow(src: Pixels, f: GradientGlowFilter, s: number): Pixels { return gradientGlowCore(src, gradientGlowParams(f, s)); }

// ------------------------------------------------------------------ color matrix

/** Flash un-premultiply (getPixel32): min(255, (p·⌊65280/a⌋ + 127) >> 8); a = 0 gives 0 (= color.unpremul). */
export const flashUnpremul = unpremul;

/** Un-premultiply used by ColorMatrixFilter: round(p·255/a), max 255 (closest fit to the FP32 goldens, ±1). */
const cmUnpremul = (p: number, a: number): number => (a === 0 ? 0 : a === 255 ? p : Math.min(255, Math.round((p * 255) / a)));

/**
 * Apply a 4x5 Flash colour matrix to premultiplied pixels, returning a new buffer: un-premultiply (cmUnpremul),
 * c' = clamp(floor(m·[r,g,b,a] + offset)), premultiply with round(c'·a'/255).
 */
export function applyColorMatrixToPixels(src: Pixels, m: readonly number[]): Pixels {
  const M = new Float64Array(20);
  for (let i = 0; i < 20; i++) M[i] = Number(m[i]) || 0;
  const d = src.data, out = new Uint8ClampedArray(d.length);
  const cl = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.floor(v));
  for (let o = 0; o < d.length; o += 4) {
    const A = d[o + 3]!;
    const r = cmUnpremul(d[o]!, A), g = cmUnpremul(d[o + 1]!, A), b = cmUnpremul(d[o + 2]!, A);
    const na = cl(M[15]! * r + M[16]! * g + M[17]! * b + M[18]! * A + M[19]!);
    const nr = cl(M[0]! * r + M[1]! * g + M[2]! * b + M[3]! * A + M[4]!);
    const ng = cl(M[5]! * r + M[6]! * g + M[7]! * b + M[8]! * A + M[9]!);
    const nb = cl(M[10]! * r + M[11]! * g + M[12]! * b + M[13]! * A + M[14]!);
    out[o] = mul255(nr, na); out[o + 1] = mul255(ng, na); out[o + 2] = mul255(nb, na); out[o + 3] = na;
  }
  return { data: out, width: src.width, height: src.height };
}

// ------------------------------------------------------------------ public API

/** Device pixels the drop-shadow / bevel sample offset D (1/256 px) moves content: [towards -x/-y, towards +x/+y]. */
const offsetReach = (d: number): [number, number] => {
  const D = offset256(d);
  return [Math.max(0, -Math.floor(D / 256)), Math.max(0, Math.ceil(D / 256))];
};

/** Padding of a single filter in device pixels (the extent the output can actually reach; >= Flash's). */
export function singleFilterPadding(f: BitmapFilter, deviceScale: number): Padding {
  const pad: Padding = { left: 0, top: 0, right: 0, bottom: 0 };
  const blurPad = (bxL: number, byL: number, quality: number): void => {
    const passes = normPasses(quality);
    const px = passes * blurReach(deviceBlur(bxL, deviceScale));
    const py = passes * blurReach(deviceBlur(byL, deviceScale));
    pad.left += px; pad.right += px; pad.top += py; pad.bottom += py;
  };
  const shiftPad = (distance: number, angle: number, both: boolean): void => {
    const [dx, dy] = offsetOf(distance, angle, deviceScale);
    const [xl, xr] = offsetReach(dx), [yt, yb] = offsetReach(dy);
    if (both) {
      const sx = Math.max(xl, xr), sy = Math.max(yt, yb);
      pad.left += sx; pad.right += sx; pad.top += sy; pad.bottom += sy;
      return;
    }
    pad.left += xl; pad.right += xr; pad.top += yt; pad.bottom += yb;
  };
  switch (f.kind) {
    case 'blur': { const b = f as BlurFilter; blurPad(b.blurX, b.blurY, b.quality); break; }
    case 'glow': { const g = f as GlowFilter; blurPad(g.blurX, g.blurY, g.quality); break; }
    case 'dropShadow': {
      const g = f as DropShadowFilter; blurPad(g.blurX, g.blurY, g.quality); shiftPad(g.distance, g.angle, false); break;
    }
    case 'bevel': { const g = f as BevelFilter; blurPad(g.blurX, g.blurY, g.quality); shiftPad(g.distance, g.angle, true); break; }
    case 'gradientGlow': {
      const g = f as GradientGlowFilter; blurPad(g.blurX, g.blurY, g.quality); shiftPad(g.distance, g.angle, false); break;
    }
    default: break; // colorMatrix: no growth
  }
  return pad;
}

/** Extra device pixels a filter chain can extend beyond the source on each side. */
export function filterPadding(filters: readonly BitmapFilter[], deviceScale: number): Padding {
  const total: Padding = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const f of filters) {
    if (!f) continue;
    const p = singleFilterPadding(f, deviceScale);
    total.left += p.left; total.top += p.top; total.right += p.right; total.bottom += p.bottom;
  }
  return total;
}

/**
 * Flash's BitmapData.generateFilterRect padding of one filter at scale 1 (P5: ceil(blur·quality/2) per side, at least
 * 1 for quality >= 1; quality >= 3 deviates slightly in Flash and is not modelled).
 */
export function flashFilterRectPadding(f: BitmapFilter): Padding {
  const g = f as unknown as { blurX: number; blurY: number; quality: number };
  if (f.kind === 'colorMatrix' || g.blurX === undefined) return { left: 0, top: 0, right: 0, bottom: 0 };
  const q = normPasses(g.quality);
  const px = flashBlurPad(normBlur(g.blurX), q), py = flashBlurPad(normBlur(g.blurY), q);
  return { left: px, right: px, top: py, bottom: py };
}

/** Apply one filter (returns a new buffer of the same size). Unknown filters return a copy. */
export function applyFilterToPixels(src: Pixels, f: BitmapFilter, deviceScale: number): Pixels {
  switch (f.kind) {
    case 'blur': return applyBlur(src, f as BlurFilter, deviceScale);
    case 'glow': return applyGlow(src, f as GlowFilter, deviceScale);
    case 'dropShadow': return applyDropShadow(src, f as DropShadowFilter, deviceScale);
    case 'bevel': return applyBevel(src, f as BevelFilter, deviceScale);
    case 'gradientGlow': return applyGradientGlow(src, f as GradientGlowFilter, deviceScale);
    case 'colorMatrix': return applyColorMatrixToPixels(src, (f as ColorMatrixFilter).matrix);
    default: return { data: src.data.slice(), width: src.width, height: src.height };
  }
}

/**
 * Apply `filters` in order to `src` (which must already include `filterPadding` transparent pixels around the
 * content). Returns a new buffer of the same size.
 */
export function applyFiltersToPixels(src: Pixels, filters: readonly BitmapFilter[], deviceScale: number): Pixels {
  let cur: Pixels = { data: src.data.slice(), width: src.width, height: src.height };
  for (const f of filters) if (f) cur = applyFilterToPixels(cur, f, deviceScale);
  return cur;
}
