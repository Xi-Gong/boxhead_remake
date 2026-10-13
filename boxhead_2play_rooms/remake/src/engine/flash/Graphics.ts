/**
 * AS2 MovieClip drawing API (Flash 8) as a command recorder + Canvas2D renderer.        OWNER: lane C
 *
 * Used by lane E's MovieClip: forward clear/lineStyle/beginFill/beginBitmapFill/beginGradientFill/moveTo/lineTo/
 * curveTo/endFill to an instance, call `render(ctx, cx, deviceScale)` beneath the children and use `bounds()` for
 * getBounds.
 *
 * Semantics (Flash Player 8, as modelled by Ruffle's `Drawing`):
 *   - The drawing is a list of paths in command order. A fill path starts at beginFill*() and ends at the next
 *     beginFill*()/endFill(); it is auto-closed (a LineTo back to the fill start is added — also to the active
 *     line, so the outline closes too). moveTo() inside a fill closes the current sub-path first.
 *   - Line segments drawn while a fill is open are painted AFTER that fill (on top of it); otherwise lines paint in
 *     command order. Fills use the even-odd rule.
 *   - lineStyle(thickness): thickness truncated to an integer and capped at 255 [ORACLE P4]; 0 = hairline (1 device
 *     pixel at any scale); undefined = no line; strokes
 *     thinner than one device pixel are drawn as hairlines. Caps/joints default to round, miter limit 3.
 *     noScale 'none'|'vertical'|'horizontal' strokes keep their width in stage pixels (scaled by deviceScale only).
 *   - Alphas are 0..100 (clamped, -> 0..255 truncated); colors are 0xRRGGBB.
 *   - beginBitmapFill(bmd, matrix, repeat = true, smoothing = false): matrix maps bitmap pixels -> local space;
 *     repeat = false clamps (extends the edge pixels) like Flash.
 *   - beginGradientFill(type 'linear'|'radial', colors, alphas, ratios, matrix, spread, interpolation, focal):
 *     matrix is a flash.geom.Matrix mapping the gradient square [-819.2, 819.2]² to local space, or a
 *     {matrixType: "box", x, y, w, h, r} object (createGradientBox semantics). spread 'pad'|'reflect'|'repeat',
 *     interpolation 'RGB'|'linearRGB' (approximated with extra stops).
 *   - bounds(): Flash shape bounds (geometry + half the stroke width; curves use exact extrema); null when empty.
 *
 * Rendering cost: one Path2D per finished path (cached), fills with alpha 0 and invisible strokes are skipped,
 * bitmap patterns are created once per bitmap per render call.
 */
import { ColorTransform, Matrix, Rectangle } from './geom.ts';
import type { BitmapData } from './BitmapData.ts';
import { alpha100To255, applyCxToRGBA, cssRGBA, cxAlphaOnlyFactor, toUint32 } from './color.ts';
import { snappedPath2D, strokeSnap } from './strokeSnap.ts';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// command opcodes in the flat command arrays
const M = 0, L = 1, Q = 2;

export interface SolidFill { kind: 'solid'; rgb: number; alpha: number }
export interface BitmapFill { kind: 'bitmap'; bmd: BitmapData; matrix: Matrix; repeat: boolean; smooth: boolean }
export interface GradientFill {
  kind: 'gradient'; type: 'linear' | 'radial'; colors: number[]; alphas: number[]; ratios: number[]; matrix: Matrix;
  spread: 'pad' | 'reflect' | 'repeat'; interp: 'rgb' | 'linearRGB'; focal: number;
}
export type FillStyle = SolidFill | BitmapFill | GradientFill;

export interface LineStyle {
  width: number; rgb: number; alpha: number; pixelHinting: boolean;
  noScale: 'normal' | 'none' | 'vertical' | 'horizontal';
  caps: 'round' | 'butt' | 'square'; joints: 'round' | 'bevel' | 'miter'; miterLimit: number;
}

interface FillPath { kind: 'fill'; style: FillStyle; cmds: number[]; p2d?: Path2D }
interface LinePath { kind: 'line'; style: LineStyle; cmds: number[]; closed: boolean; p2d?: Path2D }
type DrawPath = FillPath | LinePath;

interface Bounds { xMin: number; yMin: number; xMax: number; yMax: number }

const emptyBounds = (): Bounds => ({ xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity });

function encompass(b: Bounds, x: number, y: number, r: number): void {
  if (x - r < b.xMin) b.xMin = x - r;
  if (y - r < b.yMin) b.yMin = y - r;
  if (x + r > b.xMax) b.xMax = x + r;
  if (y + r > b.yMax) b.yMax = y + r;
}

/** Extend bounds by a quadratic Bézier (exact extrema) with radius r. */
function encompassQuad(b: Bounds, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, r: number): void {
  encompass(b, x0, y0, r);
  encompass(b, x1, y1, r);
  const ext = (p0: number, p1: number, p2: number): number | null => {
    const den = p0 - 2 * p1 + p2;
    if (den === 0) return null;
    const t = (p0 - p1) / den;
    return t > 0 && t < 1 ? t : null;
  };
  const at = (t: number, p0: number, p1: number, p2: number): number => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  const tx = ext(x0, cx, x1);
  if (tx !== null) encompass(b, at(tx, x0, cx, x1), at(tx, y0, cy, y1), r);
  const ty = ext(y0, cy, y1);
  if (ty !== null) encompass(b, at(ty, x0, cx, x1), at(ty, y0, cy, y1), r);
}

function buildPath2D(cmds: number[], close: boolean): Path2D {
  const p = new Path2D();
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i]!;
    if (op === M) { p.moveTo(cmds[i + 1]!, cmds[i + 2]!); i += 3; }
    else if (op === L) { p.lineTo(cmds[i + 1]!, cmds[i + 2]!); i += 3; }
    else { p.quadraticCurveTo(cmds[i + 1]!, cmds[i + 2]!, cmds[i + 3]!, cmds[i + 4]!); i += 5; }
  }
  if (close) p.closePath();
  return p;
}

/** True when the commands contain at least one drawing (non-move) segment. */
function hasSegments(cmds: number[]): boolean {
  for (let i = 0; i < cmds.length;) {
    if (cmds[i] !== M) return true;
    i += 3;
  }
  return false;
}

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isNaN(n) ? d : n; };

/** Convert the AS2 gradient matrix argument to a Matrix (gradient square -> local space). */
export function gradientMatrixArg(m: unknown): Matrix {
  if (m instanceof Matrix) return m.clone();
  if (m && typeof m === 'object') {
    const o = m as Record<string, unknown>;
    if (String(o.matrixType) === 'box') {
      const r = new Matrix();
      r.createGradientBox(num(o.w), num(o.h), num(o.r), num(o.x), num(o.y));
      return r;
    }
    return new Matrix(num(o.a, 1), num(o.b), num(o.c), num(o.d, 1), num(o.tx), num(o.ty));
  }
  return new Matrix();
}

// ------------------------------------------------------------------ gradient paint (shared with lane E if useful)

const srgbToLinear = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linearToSrgb = (v: number): number => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

interface Stop { t: number; r: number; g: number; b: number; a: number }

function gradientStops(g: GradientFill, cx: ColorTransform | null): Stop[] {
  const n = Math.min(g.colors.length, g.alphas.length, g.ratios.length);
  let stops: Stop[] = [];
  for (let i = 0; i < n; i++) {
    const c = g.colors[i]!;
    const [r, gg, b, a] = applyCxToRGBA((c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff, g.alphas[i]!, cx);
    stops.push({ t: Math.max(0, Math.min(255, g.ratios[i]!)) / 255, r, g: gg, b, a });
  }
  // ratios must be non-decreasing for canvas
  for (let i = 1; i < stops.length; i++) if (stops[i]!.t < stops[i - 1]!.t) stops[i]!.t = stops[i - 1]!.t;
  if (g.interp === 'linearRGB' && stops.length > 1) {
    const out: Stop[] = [stops[0]!];
    for (let i = 1; i < stops.length; i++) {
      const s0 = stops[i - 1]!, s1 = stops[i]!;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        const mix = (a: number, b: number): number => linearToSrgb(srgbToLinear(a) + (srgbToLinear(b) - srgbToLinear(a)) * f);
        out.push({ t: s0.t + (s1.t - s0.t) * f, r: mix(s0.r, s1.r), g: mix(s0.g, s1.g), b: mix(s0.b, s1.b), a: s0.a + (s1.a - s0.a) * f });
      }
    }
    stops = out;
  }
  return stops;
}

/**
 * Create a CanvasGradient in GRADIENT space (the [-819.2, 819.2] square) covering gradient-space x range
 * [x0, x1] (linear) or radius rMax (radial), expanding reflect/repeat spreads into repeated stops.
 */
export function createGradientPaint(ctx: Ctx2D, g: GradientFill, cx: ColorTransform | null, x0: number, x1: number, rMax: number): CanvasGradient | null {
  const stops = gradientStops(g, cx);
  if (stops.length === 0) return null;
  const SPAN = 1638.4, HALF = 819.2;
  let k0 = 0, k1 = 1;
  if (g.spread !== 'pad') {
    if (g.type === 'linear') {
      k0 = Math.floor((x0 + HALF) / SPAN);
      k1 = Math.ceil((x1 + HALF) / SPAN);
    } else {
      k1 = Math.ceil(rMax / HALF);
    }
    const MAXP = 64;
    if (k1 - k0 > MAXP) { const mid = Math.floor((k0 + k1) / 2); k0 = mid - MAXP / 2; k1 = mid + MAXP / 2; }
    if (k1 <= k0) k1 = k0 + 1;
  }
  const periods = k1 - k0;
  let grad: CanvasGradient;
  if (g.type === 'linear') grad = ctx.createLinearGradient(-HALF + k0 * SPAN, 0, -HALF + k1 * SPAN, 0);
  else {
    const f = Math.max(-1, Math.min(1, g.focal || 0)) * HALF;
    grad = ctx.createRadialGradient(f, 0, 0, 0, 0, HALF * periods);
  }
  for (let p = 0; p < periods; p++) {
    const reflect = g.spread === 'reflect' && ((k0 + p) % 2 !== 0);
    for (let i = 0; i < stops.length; i++) {
      const s = reflect ? stops[stops.length - 1 - i]! : stops[i]!;
      const t = reflect ? 1 - s.t : s.t;
      grad.addColorStop(Math.min(1, Math.max(0, (p + t) / periods)), cssRGBA(s.r, s.g, s.b, s.a));
    }
  }
  return grad;
}

// ------------------------------------------------------------------ Graphics

export class Graphics {
  private paths: DrawPath[] = [];
  private currentFill: FillPath | null = null;
  private currentLine: LinePath | null = null;
  private pendingLines: LinePath[] = [];
  private cursorX = 0;
  private cursorY = 0;
  private fillStartX = 0;
  private fillStartY = 0;
  private shapeB: Bounds = emptyBounds();
  private edgeB: Bounds = emptyBounds();
  private empty = true;
  /** Incremented on every change (cache invalidation for renderers). */
  version = 0;

  get isEmpty(): boolean { return this.empty; }

  private dirty(): void { this.empty = false; this.version++; }

  clear(): void {
    this.paths = [];
    this.currentFill = null;
    this.currentLine = null;
    this.pendingLines = [];
    this.cursorX = this.cursorY = this.fillStartX = this.fillStartY = 0;
    this.shapeB = emptyBounds();
    this.edgeB = emptyBounds();
    this.empty = true;
    this.version++;
  }

  // ------------------------------------------------------------------ styles

  lineStyle(thickness?: number, rgb?: number, alpha?: number, pixelHinting?: boolean, noScale?: string, capsStyle?: string,
    jointStyle?: string, miterLimit?: number): void {
    if (thickness === undefined || thickness === null) { this.setLineStyle(null); return; }
    let width = Number(thickness);
    // [ORACLE P4] the thickness is truncated to an integer (5.5 draws like 5, 0.5 like a hairline) and capped at 255.
    width = Number.isNaN(width) ? 0 : Math.trunc(Math.max(0, Math.min(255, width)));
    const ns = noScale === 'none' || noScale === 'vertical' || noScale === 'horizontal' ? noScale : 'normal';
    const caps = capsStyle === 'square' ? 'square' : capsStyle === 'none' ? 'butt' : 'round';
    const joints = jointStyle === 'miter' ? 'miter' : jointStyle === 'bevel' ? 'bevel' : 'round';
    let limit = 3;
    if (joints === 'miter' && miterLimit !== undefined) limit = Math.max(1, Math.min(255, num(miterLimit, 3)));
    this.setLineStyle({
      width, rgb: rgb === undefined ? 0 : toUint32(rgb) & 0xffffff, alpha: alpha100To255(alpha), pixelHinting: !!pixelHinting,
      noScale: ns, caps, joints, miterLimit: limit,
    });
  }

  beginFill(rgb?: number, alpha?: number): void {
    if (rgb === undefined || rgb === null) { this.setFillStyle(null); return; }
    this.setFillStyle({ kind: 'solid', rgb: toUint32(rgb) & 0xffffff, alpha: alpha100To255(alpha) });
  }

  beginBitmapFill(bmd: BitmapData, matrix?: Matrix | null, repeat: boolean = true, smoothing: boolean = false): void {
    if (!bmd || typeof bmd !== 'object' || typeof (bmd as BitmapData).drawTo !== 'function') { this.setFillStyle(null); return; }
    const m = matrix && typeof matrix === 'object'
      ? new Matrix(num(matrix.a, 1), num(matrix.b), num(matrix.c), num(matrix.d, 1), num(matrix.tx), num(matrix.ty))
      : new Matrix();
    this.setFillStyle({ kind: 'bitmap', bmd, matrix: m, repeat: repeat === undefined ? true : !!repeat, smooth: !!smoothing });
  }

  beginGradientFill(type: string, colors: number[], alphas: number[], ratios: number[], matrix: Matrix | object,
    spreadMethod?: string, interpolationMethod?: string, focalPointRatio?: number): void {
    if (type === undefined || type === null) { this.setFillStyle(null); return; }
    const t = String(type).toLowerCase();
    if (t !== 'linear' && t !== 'radial') return; // invalid type: Flash leaves the fill unchanged
    if (!colors || !alphas || !ratios || matrix === undefined || matrix === null) return;
    const n = Math.min(colors.length, alphas.length, ratios.length);
    if (!(n > 0)) return;
    const cs: number[] = [], as: number[] = [], rs: number[] = [];
    for (let i = 0; i < n; i++) {
      cs.push(toUint32(colors[i]) & 0xffffff);
      as.push(alpha100To255(num(alphas[i])));
      rs.push(Math.max(0, Math.min(255, Math.round(num(ratios[i])))));
    }
    this.setFillStyle({
      kind: 'gradient', type: t, colors: cs, alphas: as, ratios: rs, matrix: gradientMatrixArg(matrix),
      spread: spreadMethod === 'reflect' ? 'reflect' : spreadMethod === 'repeat' ? 'repeat' : 'pad',
      interp: interpolationMethod === 'linearRGB' ? 'linearRGB' : 'rgb', focal: num(focalPointRatio),
    });
  }

  endFill(): void { this.setFillStyle(null); }

  // ------------------------------------------------------------------ path commands

  moveTo(x: number, y: number): void {
    if (x === undefined || y === undefined) return;
    this.command(M, [num(x), num(y)]);
  }

  lineTo(x: number, y: number): void {
    if (x === undefined || y === undefined) return;
    this.command(L, [num(x), num(y)]);
  }

  curveTo(controlX: number, controlY: number, anchorX: number, anchorY: number): void {
    if (anchorX === undefined || anchorY === undefined) return;
    this.command(Q, [num(controlX), num(controlY), num(anchorX), num(anchorY)]);
  }

  // ------------------------------------------------------------------ state machine (mirrors Flash/Ruffle Drawing)

  private closePath(): void {
    if (this.currentFill && (this.cursorX !== this.fillStartX || this.cursorY !== this.fillStartY)) {
      this.currentFill.cmds.push(L, this.fillStartX, this.fillStartY);
      if (this.currentLine) this.currentLine.cmds.push(L, this.fillStartX, this.fillStartY);
      this.dirty();
    }
  }

  private setFillStyle(style: FillStyle | null): void {
    this.closePath();
    if (this.currentFill) { this.paths.push(this.currentFill); this.currentFill = null; }
    for (const l of this.pendingLines) this.paths.push(l);
    this.pendingLines = [];
    if (this.currentLine) {
      const existing = this.currentLine;
      existing.closed = this.cursorX === this.fillStartX && this.cursorY === this.fillStartY;
      this.paths.push(existing);
      this.currentLine = { kind: 'line', style: existing.style, cmds: [M, this.cursorX, this.cursorY], closed: false };
    }
    if (style) this.currentFill = { kind: 'fill', style, cmds: [M, this.cursorX, this.cursorY] };
    this.fillStartX = this.cursorX;
    this.fillStartY = this.cursorY;
    this.dirty();
  }

  private setLineStyle(style: LineStyle | null): void {
    if (this.currentLine) {
      const existing = this.currentLine;
      existing.closed = this.cursorX === this.fillStartX && this.cursorY === this.fillStartY;
      if (this.currentFill) this.pendingLines.push(existing);
      else this.paths.push(existing);
      this.currentLine = null;
    }
    if (style) this.currentLine = { kind: 'line', style, cmds: [M, this.cursorX, this.cursorY], closed: false };
    this.dirty();
  }

  private command(op: number, args: number[]): void {
    const isMove = op === M;
    if (isMove) {
      this.closePath();
      this.fillStartX = args[0]!;
      this.fillStartY = args[1]!;
    }
    if (this.currentFill) this.currentFill.cmds.push(op, ...args);
    let stroke = 0;
    if (this.currentLine) {
      this.currentLine.cmds.push(op, ...args);
      stroke = this.currentLine.style.width;
    }
    if (!isMove) {
      const r = stroke / 2;
      if (this.fillStartX === this.cursorX && this.fillStartY === this.cursorY) {
        encompass(this.shapeB, this.cursorX, this.cursorY, r);
        encompass(this.edgeB, this.cursorX, this.cursorY, 0);
      }
      if (op === L) {
        encompass(this.shapeB, args[0]!, args[1]!, r);
        encompass(this.edgeB, args[0]!, args[1]!, 0);
      } else {
        encompassQuad(this.shapeB, this.cursorX, this.cursorY, args[0]!, args[1]!, args[2]!, args[3]!, r);
        encompassQuad(this.edgeB, this.cursorX, this.cursorY, args[0]!, args[1]!, args[2]!, args[3]!, 0);
      }
    }
    const n = args.length;
    this.cursorX = args[n - 2]!;
    this.cursorY = args[n - 1]!;
    this.dirty();
  }

  // ------------------------------------------------------------------ queries

  /** Flash shape bounds in local space (includes half stroke widths), or null when nothing was drawn. */
  bounds(): Rectangle | null {
    const b = this.shapeB;
    if (!(b.xMax >= b.xMin) || !(b.yMax >= b.yMin)) return null;
    return new Rectangle(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
  }

  /** Geometry-only bounds (no stroke widths), or null. */
  edgeBounds(): Rectangle | null {
    const b = this.edgeB;
    if (!(b.xMax >= b.xMin) || !(b.yMax >= b.yMin)) return null;
    return new Rectangle(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
  }

  /** All paths in paint order (finished paths, the open fill, pending lines, the current line). */
  private paintList(): { path: DrawPath; cmds: number[]; closed: boolean; cache: boolean }[] {
    const out: { path: DrawPath; cmds: number[]; closed: boolean; cache: boolean }[] = [];
    for (const p of this.paths) out.push({ path: p, cmds: p.cmds, closed: p.kind === 'line' && p.closed, cache: true });
    if (this.currentFill) out.push({ path: this.currentFill, cmds: this.currentFill.cmds, closed: false, cache: false });
    const tail = (l: LinePath): void => {
      if (this.currentFill) out.push({ path: l, cmds: [...l.cmds, L, this.fillStartX, this.fillStartY], closed: true, cache: false });
      else out.push({ path: l, cmds: l.cmds, closed: this.cursorX === this.fillStartX && this.cursorY === this.fillStartY, cache: false });
    };
    for (const l of this.pendingLines) tail(l);
    if (this.currentLine) tail(this.currentLine);
    return out;
  }

  /**
   * Point hit test in local coordinates (fills: even-odd; strokes: distance <= half width, at least 0.5 px).
   * Pure JS (works headless).
   */
  hitTest(x: number, y: number): boolean {
    for (const { path, cmds } of this.paintList()) {
      if (path.kind === 'fill') {
        if (fillContains(cmds, x, y)) return true;
      } else if (strokeContains(cmds, x, y, Math.max(0.5, path.style.width / 2))) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * Draw into `ctx`, whose current transform maps local logical coordinates to device pixels. `cx` is applied to all
   * colours (null = identity); `deviceScale` is device px per stage px (noScale strokes).
   */
  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, cx: ColorTransform | null, deviceScale: number): void {
    if (this.empty) return;
    const list = this.paintList();
    if (list.length === 0) return;
    const c = ctx as Ctx2D;
    const base = c.getTransform();
    const devScale = Math.sqrt(Math.abs(base.a * base.d - base.b * base.c)) || 1;
    const patterns = new Map<string, CanvasPattern | null>();
    const prevAlpha = c.globalAlpha;
    const prevSmooth = c.imageSmoothingEnabled;
    try {
      for (const item of list) {
        const p = item.path;
        if (!hasSegments(item.cmds)) continue;
        let p2d: Path2D;
        if (item.cache && p.p2d) p2d = p.p2d;
        else {
          p2d = buildPath2D(item.cmds, item.closed);
          if (item.cache) p.p2d = p2d;
        }
        if (p.kind === 'fill') this.renderFill(c, p.style, p2d, item.cmds, cx, base, patterns);
        else this.renderLine(c, p.style, p2d, item.cmds, item.closed, cx, base, devScale, deviceScale);
        c.globalAlpha = prevAlpha;
      }
    } finally {
      c.setTransform(base);
      c.globalAlpha = prevAlpha;
      c.imageSmoothingEnabled = prevSmooth;
    }
  }

  private renderFill(c: Ctx2D, style: FillStyle, p2d: Path2D, cmds: number[], cx: ColorTransform | null, base: DOMMatrix,
    patterns: Map<string, CanvasPattern | null>): void {
    if (style.kind === 'solid') {
      const [r, g, b, a] = applyCxToRGBA((style.rgb >>> 16) & 0xff, (style.rgb >>> 8) & 0xff, style.rgb & 0xff, style.alpha, cx);
      if (a <= 0) return;
      c.fillStyle = cssRGBA(r, g, b, a);
      c.fill(p2d, 'evenodd');
      return;
    }
    if (style.kind === 'bitmap') {
      const bmd = style.bmd;
      if (!(bmd.width > 0)) return;
      let alphaMul = 1;
      let src: CanvasImageSource | null;
      let key = `${bmd.id}:${bmd.version}`;
      if (cx && !cx.isIdentity()) {
        if (cx.isAlphaOnly() && cx.alphaMultiplier <= 1) alphaMul = cxAlphaOnlyFactor(cx);
        else key += `:${cx.toString()}`;
      }
      if (alphaMul <= 0) return;
      if (style.repeat) {
        const pk = `${key}:r`;
        let pat = patterns.get(pk);
        if (pat === undefined) {
          src = tintedSource(bmd, cx && !cx.isAlphaOnly() ? cx : null);
          pat = src ? c.createPattern(src, 'repeat') : null;
          patterns.set(pk, pat);
        }
        if (!pat) return;
        const k = 1 / bmd.scale, m = style.matrix;
        pat.setTransform(new DOMMatrix([m.a * k, m.b * k, m.c * k, m.d * k, m.tx, m.ty]));
        c.globalAlpha *= alphaMul;
        c.imageSmoothingEnabled = style.smooth;
        if (style.smooth) c.imageSmoothingQuality = 'low';
        c.fillStyle = pat;
        c.fill(p2d, 'evenodd');
        return;
      }
      // clamp mode: clip to the path, draw the bitmap plus its stretched edge pixels
      src = tintedSource(bmd, cx && !cx.isAlphaOnly() ? cx : null);
      if (!src) return;
      const m = style.matrix;
      const W = bmd.deviceWidth, H = bmd.deviceHeight, k = 1 / bmd.scale;
      const bm = new DOMMatrix([m.a * k, m.b * k, m.c * k, m.d * k, m.tx, m.ty]);
      const inv = bm.inverse();
      const lb = cmdBounds(cmds);
      let ex0 = 0, ey0 = 0, ex1 = W, ey1 = H;
      if (lb) {
        for (const [px, py] of [[lb.xMin, lb.yMin], [lb.xMax, lb.yMin], [lb.xMin, lb.yMax], [lb.xMax, lb.yMax]] as const) {
          const q = inv.transformPoint({ x: px, y: py });
          ex0 = Math.min(ex0, Math.floor(q.x) - 1); ey0 = Math.min(ey0, Math.floor(q.y) - 1);
          ex1 = Math.max(ex1, Math.ceil(q.x) + 1); ey1 = Math.max(ey1, Math.ceil(q.y) + 1);
        }
      }
      c.save();
      c.clip(p2d, 'evenodd');
      c.setTransform(base.multiply(bm));
      c.globalAlpha *= alphaMul;
      c.imageSmoothingEnabled = style.smooth;
      c.drawImage(src, 0, 0, W, H, 0, 0, W, H);
      if (ex0 < 0) c.drawImage(src, 0, 0, 1, H, ex0, 0, -ex0, H);
      if (ex1 > W) c.drawImage(src, W - 1, 0, 1, H, W, 0, ex1 - W, H);
      if (ey0 < 0) c.drawImage(src, 0, 0, W, 1, 0, ey0, W, -ey0);
      if (ey1 > H) c.drawImage(src, 0, H - 1, W, 1, 0, H, W, ey1 - H);
      if (ex0 < 0 && ey0 < 0) c.drawImage(src, 0, 0, 1, 1, ex0, ey0, -ex0, -ey0);
      if (ex1 > W && ey0 < 0) c.drawImage(src, W - 1, 0, 1, 1, W, ey0, ex1 - W, -ey0);
      if (ex0 < 0 && ey1 > H) c.drawImage(src, 0, H - 1, 1, 1, ex0, H, -ex0, ey1 - H);
      if (ex1 > W && ey1 > H) c.drawImage(src, W - 1, H - 1, 1, 1, W, H, ex1 - W, ey1 - H);
      c.restore();
      return;
    }
    // gradient: clip to the path, then fill the path's bounding box in gradient space
    const gm = new DOMMatrix([style.matrix.a, style.matrix.b, style.matrix.c, style.matrix.d, style.matrix.tx, style.matrix.ty]);
    const det = gm.a * gm.d - gm.b * gm.c;
    if (det === 0 || !Number.isFinite(det)) return;
    const inv = gm.inverse();
    const lb = cmdBounds(cmds);
    if (!lb) return;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity, rMax = 0;
    for (const [px, py] of [[lb.xMin, lb.yMin], [lb.xMax, lb.yMin], [lb.xMin, lb.yMax], [lb.xMax, lb.yMax]] as const) {
      const q = inv.transformPoint({ x: px, y: py });
      gx0 = Math.min(gx0, q.x); gy0 = Math.min(gy0, q.y); gx1 = Math.max(gx1, q.x); gy1 = Math.max(gy1, q.y);
      rMax = Math.max(rMax, Math.hypot(q.x, q.y));
    }
    const paint = createGradientPaint(c, style, cx, gx0, gx1, rMax);
    if (!paint) return;
    c.save();
    c.clip(p2d, 'evenodd');
    c.setTransform(base.multiply(gm));
    c.fillStyle = paint;
    c.fillRect(gx0 - 1, gy0 - 1, gx1 - gx0 + 2, gy1 - gy0 + 2);
    c.restore();
  }

  private renderLine(c: Ctx2D, style: LineStyle, p2d: Path2D, cmds: number[], closed: boolean, cx: ColorTransform | null,
    base: DOMMatrix, devScale: number, deviceScale: number): void {
    const [r, g, b, a] = applyCxToRGBA((style.rgb >>> 16) & 0xff, (style.rgb >>> 8) & 0xff, style.rgb & 0xff, style.alpha, cx);
    if (a <= 0) return;
    c.strokeStyle = cssRGBA(r, g, b, a);
    c.lineCap = style.caps;
    c.lineJoin = style.joints;
    c.miterLimit = style.miterLimit;
    // device width; whole widths and hairlines are snapped to the pixel grid like Flash (strokeSnap.ts, lane V probe)
    const devW = style.width === 0 ? 0 : style.noScale !== 'normal' ? style.width * deviceScale : style.width * devScale;
    const snap = strokeSnap(devW);
    if (snap.mode !== 0) {
      const dp = snappedPath2D(cmds, { a: base.a, b: base.b, c: base.c, d: base.d, tx: base.e, ty: base.f }, snap.mode, closed);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.lineWidth = snap.width;
      c.stroke(dp);
      c.setTransform(base);
      return;
    }
    if (style.noScale !== 'normal') {
      // stroke in device space with a fixed pixel width
      const dp = new Path2D();
      dp.addPath(p2d, base);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.lineWidth = snap.width;
      c.stroke(dp);
      c.setTransform(base);
      return;
    }
    c.lineWidth = style.width;
    c.stroke(p2d);
  }
}

// ------------------------------------------------------------------ helpers

/** Bounds of the points in a command list (control points included; conservative). */
function cmdBounds(cmds: number[]): Bounds | null {
  const b = emptyBounds();
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i]!;
    const n = op === Q ? 4 : 2;
    for (let j = 0; j < n; j += 2) encompass(b, cmds[i + 1 + j]!, cmds[i + 2 + j]!, 0);
    i += 1 + n;
  }
  return b.xMax >= b.xMin ? b : null;
}

/** Tinted copies of bitmap fills, cached per bitmap version + transform. */
const tintCache = new WeakMap<BitmapData, { key: string; img: CanvasImageSource }>();

function tintedSource(bmd: BitmapData, cx: ColorTransform | null): CanvasImageSource | null {
  if (!cx) return bmd.toImageSource();
  const key = `${bmd.version}:${cx.toString()}`;
  const hit = tintCache.get(bmd);
  if (hit && hit.key === key) return hit.img;
  const copy = bmd.clone();
  copy.colorTransform(copy.rectangle, cx);
  const img = copy.toImageSource();
  if (!img) return null;
  tintCache.set(bmd, { key, img });
  return img;
}

/** Flatten commands into polylines (quadratics subdivided). */
function flatten(cmds: number[]): number[][] {
  const polys: number[][] = [];
  let cur: number[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i]!;
    if (op === M) {
      if (cur.length > 2) polys.push(cur);
      x = cmds[i + 1]!; y = cmds[i + 2]!;
      cur = [x, y];
      i += 3;
    } else if (op === L) {
      x = cmds[i + 1]!; y = cmds[i + 2]!;
      cur.push(x, y);
      i += 3;
    } else {
      const cx = cmds[i + 1]!, cy = cmds[i + 2]!, ax = cmds[i + 3]!, ay = cmds[i + 4]!;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        cur.push((1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ax, (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ay);
      }
      x = ax; y = ay;
      i += 5;
    }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

function fillContains(cmds: number[], px: number, py: number): boolean {
  let inside = false;
  for (const poly of flatten(cmds)) {
    const n = poly.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i * 2]!, yi = poly[i * 2 + 1]!, xj = poly[j * 2]!, yj = poly[j * 2 + 1]!;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function strokeContains(cmds: number[], px: number, py: number, r: number): boolean {
  const r2 = r * r;
  for (const poly of flatten(cmds)) {
    for (let i = 0; i + 3 < poly.length; i += 2) {
      const x0 = poly[i]!, y0 = poly[i + 1]!, x1 = poly[i + 2]!, y1 = poly[i + 3]!;
      const dx = x1 - x0, dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
      const qx = x0 + t * dx - px, qy = y0 + t * dy - py;
      if (qx * qx + qy * qy <= r2) return true;
    }
  }
  return false;
}
