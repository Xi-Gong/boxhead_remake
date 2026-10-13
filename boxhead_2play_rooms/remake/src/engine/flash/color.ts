/**
 * Color helpers shared by BitmapData, Graphics, filters and the display-list renderer.        OWNER: lane C
 *
 * Conventions:
 *   - ARGB numbers are uint32 (0xAARRGGBB), un-premultiplied, as used by the Flash API.
 *   - `Pixels` buffers are PREMULTIPLIED RGBA8 (see filters/apply.ts); canvas ImageData is UN-premultiplied.
 *   - Premultiply = round(c·a/255) (Flash, P3b). Flash un-premultiplies with min(255,(p·⌊65280/a⌋+127)>>8) (unpremul);
 *     canvas writes use the lossless round-to-nearest inverse (unpremulRound / unpremultiplyInPlace).
 *   - Color transforms are applied the way Flash Player does it: multipliers in 8.8 fixed point (truncated),
 *     offsets truncated to integers, c' = clamp(((c * mult8) >> 8) + offset, 0, 255) on un-premultiplied channels,
 *     and fully transparent pixels are left untouched (an alpha offset does not make them visible).
 */
import type { ColorTransform } from './geom.ts';

/** Premultiplied RGBA8 pixels, row-major, `data.length === width * height * 4`. */
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

// ------------------------------------------------------------------ ARGB numbers

/** ECMA ToUint32 (NaN/Infinity -> 0). */
export function toUint32(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return (n < 0 ? Math.ceil(n) : Math.floor(n)) >>> 0;
}

/** ECMA ToInt32 (NaN/Infinity -> 0). */
export function toInt32(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return n | 0;
}

export const argbAlpha = (c: number): number => (c >>> 24) & 0xff;
export const argbRed = (c: number): number => (c >>> 16) & 0xff;
export const argbGreen = (c: number): number => (c >>> 8) & 0xff;
export const argbBlue = (c: number): number => c & 0xff;

/** Pack channels (0..255) into an ARGB uint32. */
export function argb(a: number, r: number, g: number, b: number): number {
  return (((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

/** CSS color string for un-premultiplied channels (alpha 0..255). */
export function cssRGBA(r: number, g: number, b: number, a: number): string {
  return a >= 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a / 255})`;
}

/** CSS color string for an ARGB uint32. */
export function cssARGB(c: number): string {
  return cssRGBA(argbRed(c), argbGreen(c), argbBlue(c), argbAlpha(c));
}

/** AS2 drawing-API alpha (0..100, clamped) -> 0..255 (truncated, as Flash). NaN -> 0; undefined -> 255. */
export function alpha100To255(alpha: number | undefined): number {
  if (alpha === undefined) return 255;
  const a = Number(alpha);
  if (!(a > 0)) return 0;
  return Math.trunc(Math.min(a, 100) / 100 * 255);
}

// ------------------------------------------------------------------ color transforms

/** A ColorTransform quantised the way Flash stores it (8.8 multipliers, integer offsets). */
export interface CxFixed { rm: number; gm: number; bm: number; am: number; ro: number; go: number; bo: number; ao: number }

const fixed8 = (m: number): number => {
  const v = Math.trunc(m * 256);
  if (Number.isNaN(v)) return 0;
  return Math.max(-32768, Math.min(32767, v));
};
const int16 = (o: number): number => {
  const v = Math.trunc(o);
  if (Number.isNaN(v)) return 0;
  return Math.max(-32768, Math.min(32767, v));
};

export function cxToFixed(cx: ColorTransform): CxFixed {
  return {
    rm: fixed8(cx.redMultiplier), gm: fixed8(cx.greenMultiplier), bm: fixed8(cx.blueMultiplier), am: fixed8(cx.alphaMultiplier),
    ro: int16(cx.redOffset), go: int16(cx.greenOffset), bo: int16(cx.blueOffset), ao: int16(cx.alphaOffset),
  };
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Apply a (fixed) color transform to one channel value. */
export const cxChannel = (c: number, mult8: number, add: number): number => clamp255(((c * mult8) >> 8) + add);

/**
 * Apply a color transform to an un-premultiplied RGBA color (channels 0..255). Returns a new 4-tuple.
 * A fully transparent color is returned unchanged (Flash semantics).
 */
export function applyCxToRGBA(r: number, g: number, b: number, a: number, cx: ColorTransform | CxFixed | null):
  [number, number, number, number] {
  if (!cx || a <= 0) return [r, g, b, a];
  const f = 'rm' in cx ? cx : cxToFixed(cx);
  return [cxChannel(r, f.rm, f.ro), cxChannel(g, f.gm, f.go), cxChannel(b, f.bm, f.bo), cxChannel(a, f.am, f.ao)];
}

/** Apply a color transform to an ARGB uint32 (un-premultiplied). */
export function applyCxToARGB(c: number, cx: ColorTransform | CxFixed | null): number {
  const [r, g, b, a] = applyCxToRGBA(argbRed(c), argbGreen(c), argbBlue(c), argbAlpha(c), cx);
  return argb(a, r, g, b);
}

/** CSS color of an RGB number + alpha (0..255) after a color transform. */
export function cssWithCx(rgb: number, alpha255: number, cx: ColorTransform | CxFixed | null): string {
  const [r, g, b, a] = applyCxToRGBA((rgb >>> 16) & 0xff, (rgb >>> 8) & 0xff, rgb & 0xff, alpha255, cx);
  return cssRGBA(r, g, b, a);
}

// ------------------------------------------------------------------ premultiplication

/** Premultiply one channel: round(c * a / 255). */
export const premul = (c: number, a: number): number => ((c * a + 127) / 255) | 0;
/**
 * Un-premultiply one channel the way Flash does (getPixel32, colour transforms, paletteMap input; oracle P3b, fitted
 * to all 32,639 (value, alpha) pairs): min(255, (c·⌊65280/a⌋ + 127) >> 8). NOT lossless with premul().
 */
export const unpremul = (c: number, a: number): number => (a === 0 ? 0 : a === 255 ? c : Math.min(255, (c * Math.floor(65280 / a) + 127) >> 8));
/**
 * Un-premultiply to canvas ImageData: round(c·255/a), clamped. Lossless with premul() (and with the browser's own
 * premultiply in putImageData), so a premultiplied buffer survives a canvas write unchanged.
 */
export const unpremulRound = (c: number, a: number): number => (a === 0 ? 0 : Math.min(255, ((c * 255 + (a >> 1)) / a) | 0));

/** In place: un-premultiplied RGBA8 (canvas ImageData) -> premultiplied. */
export function premultiplyInPlace(d: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 255) continue;
    if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; continue; }
    d[i] = premul(d[i]!, a);
    d[i + 1] = premul(d[i + 1]!, a);
    d[i + 2] = premul(d[i + 2]!, a);
  }
}

/** In place: premultiplied RGBA8 -> un-premultiplied for a canvas write (lossless round trip, see unpremulRound). */
export function unpremultiplyInPlace(d: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 255) continue;
    if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; continue; }
    d[i] = unpremulRound(d[i]!, a);
    d[i + 1] = unpremulRound(d[i + 1]!, a);
    d[i + 2] = unpremulRound(d[i + 2]!, a);
  }
}

/** In place: premultiplied RGBA8 -> un-premultiplied values as Flash reports them (unpremul: getPixel32, paletteMap). */
export function unpremultiplyFlashInPlace(d: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 255) continue;
    if (a === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; continue; }
    d[i] = unpremul(d[i]!, a);
    d[i + 1] = unpremul(d[i + 1]!, a);
    d[i + 2] = unpremul(d[i + 2]!, a);
  }
}

/**
 * Apply a color transform in place to premultiplied pixels (tinted bitmap copies, BitmapData.colorTransform,
 * draw() with a non-trivial color transform). Transparent pixels stay transparent.
 */
export function applyCxToPixels(px: Pixels, cx: ColorTransform | CxFixed): void {
  const f = 'rm' in cx ? cx : cxToFixed(cx);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 0) continue;
    const r = unpremul(d[i]!, a), g = unpremul(d[i + 1]!, a), b = unpremul(d[i + 2]!, a);
    const na = cxChannel(a, f.am, f.ao);
    d[i] = premul(cxChannel(r, f.rm, f.ro), na);
    d[i + 1] = premul(cxChannel(g, f.gm, f.go), na);
    d[i + 2] = premul(cxChannel(b, f.bm, f.bo), na);
    d[i + 3] = na;
  }
}

/** Same as applyCxToPixels but on UN-premultiplied data (canvas ImageData). */
export function applyCxToImageData(d: Uint8ClampedArray, cx: ColorTransform | CxFixed): void {
  const f = 'rm' in cx ? cx : cxToFixed(cx);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 0) continue;
    d[i] = cxChannel(d[i]!, f.rm, f.ro);
    d[i + 1] = cxChannel(d[i + 1]!, f.gm, f.go);
    d[i + 2] = cxChannel(d[i + 2]!, f.bm, f.bo);
    d[i + 3] = cxChannel(a, f.am, f.ao);
  }
}

/** Effective globalAlpha for an alpha-only color transform (8.8 quantised like Flash). */
export function cxAlphaOnlyFactor(cx: ColorTransform): number {
  return Math.max(0, Math.min(1, fixed8(cx.alphaMultiplier) / 256));
}
