/**
 * Canvas2D renderer for the AS2 display list (lane E).
 *
 * Model (Flash semantics):
 *   - Every object is drawn with the device transform  base ∘ parent ∘ ... ∘ object  (ctx.setTransform per leaf).
 *   - Color transforms are applied at the leaves (fills/strokes/glyphs/bitmaps); a parent's _alpha multiplies each
 *     leaf separately — no group opacity, as in Flash.
 *   - Masks (PlaceObject clipDepth) clip the masked sibling range by the mask's FILL geometry (alpha and strokes
 *     ignored): a Shape mask is applied with ctx.clip(evenodd); any other mask is rendered into an offscreen layer
 *     ('destination-in').
 *   - Objects with filters are rendered (with identity color transform) into an offscreen canvas padded by
 *     filterPadding(), filtered by the WebGL2 backend (flash/filters/gl.ts: canvas upload, no readback; lane P) or, as
 *     a fallback, on the CPU by applyFiltersToPixels(), and composited with the object's accumulated color transform
 *     (alpha-only -> globalAlpha; otherwise applied to the filtered pixels, in the GL present pass). The result
 *     is cached per object and reused while the subtree version ($ver), the device matrix (incl. the fractional
 *     offset: filtered objects are NOT pixel-snapped - Flash 8/28 draw them at their exact sub-pixel position, see
 *     tools/oracle/visual/snapProbe.ts), the filter list and the device scale are unchanged.
 *   - Static and dynamic text is rasterized on a SOFTWARE canvas and cached per object (drawTextCached): Chrome's GPU
 *     canvas drops thin strokes of small glyph paths entirely at some sub-pixel offsets. Texts with CSMTextSettings
 *     UseFlashType are rendered with the measured FlashType model instead (drawFlashTypeStatic / drawFlashTypeEdit).
 *   - cacheAsBitmap and blend modes are not rendered specially (this SWF uses neither in placements).
 */
import { ColorTransform } from '../../flash/geom.ts';
import { applyFiltersToPixels, filterPadding } from '../../flash/filters/apply.ts';
import { snappedPath2D, strokeSnap } from '../../flash/strokeSnap.ts';
import { glFilterImage, glFiltersEnabled } from '../../flash/filters/gl.ts';
import {
  applyCxToImageData, applyCxToPixels, applyCxToRGBA, cssRGBA, cxAlphaOnlyFactor, cxToFixed, premultiplyInPlace,
  unpremultiplyInPlace,
} from '../../flash/color.ts';
import type { FillStyle, LineStyle, RGBA, Rect } from '../../../shared/assetSchema.ts';
import type { Bitmap, Button, DisplayObject, MorphShape, MovieClip, Shape, StaticText, TextField } from '../DisplayObject.ts';
import type { Library } from '../Library.ts';
import { engine } from '../state.ts';
import { invert, matScale, mul, transformBounds, type Bounds, type M6 } from '../mat.ts';
import { cmdsToSvg } from '../paths.ts';
import type { LaidLine, TextLayout } from '../text.ts';
import { compositeGlyphs, glyphsBounds, q4, roundHalfEven, staticTextClip, type ClipRect, type FtGlyph } from '../flashType.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const NORMAL = 0, MASK = 1;
/** Color transform turning every visible fill opaque black (mask rendering). */
const MASK_CX = new ColorTransform(0, 0, 0, 1, 0, 0, 0, 255);

/**
 * Debug switches (gallery, visual tests): render filters / masks; textCache = software-rasterized text cache
 * (drawTextCached); filterPixelSnap = the old (wrong) pixel snapping of filtered objects, for before/after comparisons;
 * flashType = FlashType rendering of CSMTextSettings texts (off: plain outline anti-aliasing, as before lane T).
 */
export const renderConfig = { filters: true, masks: true, textCache: true, filterPixelSnap: false, flashType: true };

/** Render statistics of the last frame (gallery / perf panel). */
export const renderStats = { objects: 0, filtered: 0, filterCacheHits: 0, masks: 0 };

/** Cumulative filter computations by backend and time spent (ms) in their steps (perf probes). */
export const filterStats = { gl: 0, cpu: 0, msContent: 0, msFilter: 0, msCopy: 0 };
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

// ==================================================================================================== entry points

/** Render a display list root (Player.render). ctx transform must map stage px -> device px. */
export function renderStage(root: DisplayObject, ctx: Ctx, ds: number): void {
  renderStats.objects = 0; renderStats.filtered = 0; renderStats.filterCacheHits = 0; renderStats.masks = 0;
  const t = ctx.getTransform();
  const base: M6 = { a: t.a, b: t.b, c: t.c, d: t.d, tx: t.e, ty: t.f };
  const alpha = ctx.globalAlpha;
  try {
    drawObj(root, ctx, base, null, ds, NORMAL);
  } finally {
    ctx.setTransform(t);
    ctx.globalAlpha = alpha;
  }
}

/**
 * IDrawable.renderContent (BitmapData.draw): own matrix / colour transform / visibility / blend mode are ignored, but
 * the object's OWN filters are applied (verified in Flash, oracle P4); children render fully.
 */
export function renderContentOf(o: DisplayObject, ctx: Ctx | CanvasRenderingContext2D, cx: ColorTransform | null, ds: number): void {
  const c = ctx as Ctx;
  const t = c.getTransform();
  const base: M6 = { a: t.a, b: t.b, c: t.c, d: t.d, tx: t.e, ty: t.f };
  const alpha = c.globalAlpha;
  const ccx = cx && !cx.isIdentity() ? cx : null;
  try {
    if (o.$filters && renderConfig.filters) drawFiltered(o, c, base, ccx, ds);
    else drawContent(o, c, base, ccx, ds, NORMAL);
  } finally {
    c.setTransform(t);
    c.globalAlpha = alpha;
  }
}

/** Render one object with an explicit device matrix (gallery helpers): includes its filters, ignores visibility. */
export function renderObjectAt(o: DisplayObject, ctx: Ctx, m: M6, ds: number, withFilters = true): void {
  const t = ctx.getTransform();
  try {
    const cx = o.$cx;
    if (withFilters && o.$filters && renderConfig.filters) drawFiltered(o, ctx, m, cx, ds);
    else drawContent(o, ctx, m, cx, ds, NORMAL);
  } finally {
    ctx.setTransform(t);
    ctx.globalAlpha = 1;
  }
}

// ==================================================================================================== traversal

function combine(own: ColorTransform, parent: ColorTransform | null): ColorTransform {
  const c = own.clone();
  if (parent) c.concat(parent);
  return c;
}

const setT = (ctx: Ctx, m: M6): void => ctx.setTransform(m.a, m.b, m.c, m.d, m.tx, m.ty);

/**
 * Leaf culling: false when local bounds `b` transformed by `m` miss the target canvas entirely (tiled BitmapData
 * backings render the whole source once per tile; this keeps big rooms cheap).
 */
function onCanvas(ctx: Ctx, m: M6, b: Bounds): boolean {
  const cv = ctx.canvas as AnyCanvas | undefined;
  if (!cv) return true;
  const r = transformBounds(m, b);
  return r.xMax >= -2 && r.yMax >= -2 && r.xMin <= cv.width + 2 && r.yMin <= cv.height + 2;
}

function drawObj(o: DisplayObject, ctx: Ctx, pm: M6, pcx: ColorTransform | null, ds: number, mode: number): void {
  if (!o.$visible) return;
  if (o.$maskOf && mode === NORMAL) return; // script masks are not drawn
  const m = mul(pm, o.$m);
  const cx = o.$cx && mode === NORMAL ? combine(o.$cx, pcx) : pcx;
  if (mode === NORMAL && o.$maskedBy) { drawScriptMasked(o, ctx, m, cx, ds); return; }
  if (mode === NORMAL && o.$filters && renderConfig.filters) { drawFiltered(o, ctx, m, cx, ds); return; }
  drawContent(o, ctx, m, cx, ds, mode);
}

function drawContent(o: DisplayObject, ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number, mode: number): void {
  renderStats.objects++;
  switch (o.$kind) {
    case 'mc': {
      const mc = o as MovieClip;
      if (mc.$g && !mc.$g.isEmpty) {
        setT(ctx, m);
        mc.$g.render(ctx, mode === MASK ? MASK_CX : cx, ds);
      }
      drawList(mc.$list, ctx, m, cx, ds, mode);
      break;
    }
    case 'button':
      drawList((o as Button).$current, ctx, m, cx, ds, mode);
      break;
    case 'shape':
      drawShape(o as Shape, ctx, m, cx, ds, mode);
      break;
    case 'morph':
      drawMorph(o as MorphShape, ctx, m, cx, ds, mode);
      break;
    case 'text': {
      const t = o as StaticText;
      if (mode === NORMAL && renderConfig.flashType && t.$def.csm?.flashType && drawFlashTypeStatic(t, ctx, m, cx)) break;
      drawTextCached(t, ctx, m, cx, mode, t.$def.bounds, (c, mm) => drawStaticText(t, c, mm, cx, mode));
      break;
    }
    case 'edit': {
      const tf = o as TextField;
      const r = tf.$rect;
      const focused = engine.focus === tf && tf.$type === 'input';
      if (mode === NORMAL && renderConfig.flashType && tf.$def?.csm?.flashType && drawFlashTypeEdit(tf, ctx, m, cx)) {
        if (focused) drawCaret(tf, ctx, m, cx);
        break;
      }
      if (focused) drawEditText(tf, ctx, m, cx, mode); // blinking caret: no cache
      else drawTextCached(tf, ctx, m, cx, mode, { xMin: r.x, yMin: r.y, xMax: r.x + r.w, yMax: r.y + r.h }, (c, mm) => drawEditText(tf, c, mm, cx, mode));
      break;
    }
    case 'bitmap':
      drawBitmapObj(o as Bitmap, ctx, m, cx, ds, mode);
      break;
  }
}

function drawList(list: readonly DisplayObject[], ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number, mode: number): void {
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c.$clipDepth > 0) {
      let j = i + 1;
      while (j < list.length && list[j]!.$depth <= c.$clipDepth) j++;
      if (mode === NORMAL && renderConfig.masks) drawMasked(c, list, i + 1, j, ctx, m, cx, ds);
      else for (let k = i + 1; k < j; k++) drawObj(list[k]!, ctx, m, cx, ds, mode);
      i = j - 1;
      continue;
    }
    drawObj(c, ctx, m, cx, ds, mode);
  }
}

// ==================================================================================================== masks

const maskPathCache = new WeakMap<object, Path2D>();

/** Combined fill path of a Shape (fills of a shape never overlap, so even-odd union is exact). */
function shapeMaskPath(s: Shape): Path2D {
  let p = maskPathCache.get(s.$def);
  if (!p) {
    const L = engine.library!;
    p = new Path2D();
    for (const layer of s.$def.layers) for (const f of layer.fills) p.addPath(L.path2d(f));
    maskPathCache.set(s.$def, p);
  }
  return p;
}

function drawMasked(mask: DisplayObject, list: readonly DisplayObject[], from: number, to: number, ctx: Ctx, m: M6,
  cx: ColorTransform | null, ds: number): void {
  if (from >= to) return;
  renderStats.masks++;
  const mm = mul(m, mask.$m);
  if (mask.$kind === 'shape') {
    ctx.save();
    try {
      setT(ctx, mm);
      ctx.clip(shapeMaskPath(mask as Shape), 'evenodd');
      for (let k = from; k < to; k++) drawObj(list[k]!, ctx, m, cx, ds, NORMAL);
    } finally {
      ctx.restore();
    }
    return;
  }
  drawLayerMasked(mask, mm, (lctx, off) => {
    const mo = translate(m, off);
    for (let k = from; k < to; k++) drawObj(list[k]!, lctx, mo, cx, ds, NORMAL);
  }, ctx, ds);
}

const translate = (m: M6, off: { x: number; y: number }): M6 => ({ ...m, tx: m.tx - off.x, ty: m.ty - off.y });

/** General mask: render content and mask into offscreen layers and composite with destination-in. */
function drawLayerMasked(mask: DisplayObject, mm: M6, content: (ctx: Ctx, off: { x: number; y: number }) => void, ctx: Ctx, ds: number): void {
  const mb = mask.$boundsWith(mm);
  if (!mb) return;
  const cv = ctx.canvas as AnyCanvas;
  const x0 = Math.max(0, Math.floor(mb.xMin) - 1), y0 = Math.max(0, Math.floor(mb.yMin) - 1);
  const x1 = Math.min(cv.width, Math.ceil(mb.xMax) + 1), y1 = Math.min(cv.height, Math.ceil(mb.yMax) + 1);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const layer = acquire(w, h), mk = acquire(w, h);
  try {
    const off = { x: x0, y: y0 };
    content(layer.ctx, off);
    drawContent(mask, mk.ctx, translate(mm, off), null, ds, MASK);
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.globalAlpha = 1;
    layer.ctx.globalCompositeOperation = 'destination-in';
    layer.ctx.drawImage(mk.canvas, 0, 0, w, h, 0, 0, w, h);
    layer.ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0, w, h, x0, y0, w, h);
  } finally {
    release(mk);
    release(layer);
  }
}

function drawScriptMasked(o: DisplayObject, ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number): void {
  const mask = o.$maskedBy!;
  // base (stage -> device) = m ∘ inverse(concat(o)); mask device matrix = base ∘ concat(mask)
  const base = mul(m, invert(o.$concat()));
  const mm = mul(base, mask.$concat());
  drawLayerMasked(mask, mm, (lctx, off) => {
    const mo = translate(m, off);
    if (o.$filters) drawFiltered(o, lctx, mo, cx, ds);
    else drawContent(o, lctx, mo, cx, ds, NORMAL);
  }, ctx, ds);
}

// ==================================================================================================== filters

/**
 * Per-object filter cache. `valid` = the canvas holds the result for `key`; `missed` = the previous render missed.
 * An object whose key changes on consecutive renders (animated content, jittering rollover filters, the XSI shadow
 * layer during pre-rendering) is drawn straight from the GL output without the extra copy into its cache canvas.
 */
interface FilterCache { key: string; canvas: AnyCanvas | null; ctx: Ctx | null; w: number; h: number; valid: boolean; missed: boolean }

function bitmapSig(o: DisplayObject, depth = 0): string {
  if (o.$kind === 'bitmap') { const b = (o as Bitmap).$bmd; return `${b.id ?? 0}:${b.version}`; }
  if (depth > 8) return '';
  const kids = o.$kids();
  if (!kids) return '';
  let s = '';
  for (const k of kids) if (k.$kind === 'bitmap' || k.$kind === 'mc' || k.$kind === 'button') s += bitmapSig(k, depth + 1);
  return s;
}

// ==================================================================================================== text cache

/**
 * Text objects are rasterized on a SOFTWARE (willReadFrequently) canvas, cached per object and blitted at an integer
 * device offset. Reason: Chrome's GPU canvas (Skia/Ganesh, also in Electron; seen with ANGLE/D3D11 and headless)
 * drops the coverage of small thin glyph paths ENTIRELY at some sub-pixel offsets - e.g. the 12 px italic Calibri
 * 'l' / 'd' stems of the options window's "Turns the Friendly damage on/off ..." line vanished at 1x (lane V,
 * tests/visual). The CPU rasterizer is exact. The key holds the content version, the device matrix (incl. the
 * fractional offset), the size and the colour transform, so static text costs one drawImage per frame. Mask
 * rendering (geometry only) draws directly.
 */
interface TextCache { key: string; canvas: AnyCanvas; ctx: Ctx }
const textCaches = new WeakMap<DisplayObject, TextCache>();

function drawTextCached(o: DisplayObject, ctx: Ctx, m: M6, cx: ColorTransform | null, mode: number, bounds: Bounds,
  draw: (c: Ctx, mm: M6) => void): void {
  if (mode !== NORMAL || !renderConfig.textCache) { draw(ctx, m); return; }
  const db = transformBounds(m, bounds);
  // glyphs (italics, AA) may poke slightly out of the declared text bounds
  const pad = 3 + Math.ceil(Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d)));
  const X = Math.floor(db.xMin) - pad, Y = Math.floor(db.yMin) - pad;
  const X1 = Math.ceil(db.xMax) + pad, Y1 = Math.ceil(db.yMax) + pad;
  const cv = ctx.canvas as AnyCanvas | undefined;
  if (cv && (X1 < 0 || Y1 < 0 || X > cv.width || Y > cv.height)) return;
  const W = X1 - X, H = Y1 - Y;
  if (!(W > 0 && H > 0)) return;
  if (W * H > 2048 * 1024) { draw(ctx, m); return; }
  const fx = m.tx - X, fy = m.ty - Y;
  const key = `${o.$ver}|${m.a},${m.b},${m.c},${m.d}|${fx},${fy}|${W}x${H}|${cx ? cxKey(cx) : ''}`;
  let c = textCaches.get(o);
  if (!c || c.key !== key) {
    if (!c || c.canvas.width < W || c.canvas.height < H) {
      const cc = createCanvas(Math.max(W, c?.canvas.width ?? 0), Math.max(H, c?.canvas.height ?? 0), true);
      c = { key, canvas: cc.canvas, ctx: cc.ctx };
      textCaches.set(o, c);
    }
    c.key = key;
    const tc = c.ctx;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = 'source-over';
    tc.clearRect(0, 0, c.canvas.width, c.canvas.height);
    draw(tc, { a: m.a, b: m.b, c: m.c, d: m.d, tx: fx, ty: fy });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c.canvas, 0, 0, W, H, X, Y, W, H);
}

// ==================================================================================================== FlashType text

/**
 * Texts with CSMTextSettings UseFlashType ("anti-alias for readability") are rendered with Flash's FlashType model
 * (../flashType.ts: quarter-pixel positions, grid-fitted alignment zones, distance-field CSM coverage; measured in
 * Flash Player 28) in DEVICE pixels, so it also grid-fits at render scale 2. The composite is cached per object
 * RELATIVE to the snapped text origin (X0, Y0): moving the text by any amount only changes where the cached canvas
 * is blitted, and glyph masks are shared between all texts. Matrices that rotate, skew or mirror fall back to the
 * outline renderer (Flash itself drops grid fitting there; the game never does it to FlashType text).
 */
interface FtCache { key: string; canvas: AnyCanvas | null; ctx: Ctx | null; x0: number; y0: number; w: number; h: number }
const ftCaches = new WeakMap<DisplayObject, FtCache>();
interface FtBuild { glyphs: FtGlyph[]; clip: ClipRect; bg?: { rect: ClipRect; color: readonly [number, number, number, number] } }

const ftMatrixOk = (m: M6): boolean => m.b === 0 && m.c === 0 && m.a > 0.01 && m.d > 0.01;

function drawFtCached(o: DisplayObject, ctx: Ctx, X0: number, Y0: number, key: string, gridFit: number, build: () => FtBuild | null): boolean {
  let c = ftCaches.get(o);
  if (!c || c.key !== key) {
    const b = build();
    if (!b) return false;
    let bb = glyphsBounds(b.glyphs, gridFit);
    if (b.bg) bb = bb ? { x0: Math.min(bb.x0, b.bg.rect.x0), y0: Math.min(bb.y0, b.bg.rect.y0), x1: Math.max(bb.x1, b.bg.rect.x1), y1: Math.max(bb.y1, b.bg.rect.y1) } : { ...b.bg.rect };
    if (bb) bb = { x0: Math.max(bb.x0, b.clip.x0), y0: Math.max(bb.y0, b.clip.y0), x1: Math.min(bb.x1, b.clip.x1), y1: Math.min(bb.y1, b.clip.y1) };
    const w = bb ? bb.x1 - bb.x0 : 0, h = bb ? bb.y1 - bb.y0 : 0;
    if (w * h > 4096 * 2048) return false;
    const prev = c;
    c = { key, canvas: null, ctx: null, x0: bb?.x0 ?? 0, y0: bb?.y0 ?? 0, w, h };
    if (bb && w > 0 && h > 0) {
      const data = new Uint8ClampedArray(w * h * 4);
      if (b.bg) {
        const [r, g, bl, a] = b.bg.color;
        const r0 = b.bg.rect;
        for (let y = Math.max(r0.y0, bb.y0); y < Math.min(r0.y1, bb.y1); y++) {
          for (let x = Math.max(r0.x0, bb.x0); x < Math.min(r0.x1, bb.x1); x++) {
            const i = ((y - bb.y0) * w + (x - bb.x0)) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = bl; data[i + 3] = a;
          }
        }
      }
      compositeGlyphs(b.glyphs, gridFit, data, w, h, bb.x0, bb.y0, b.clip);
      const reuse = prev?.canvas && prev.canvas.width >= w && prev.canvas.height >= h ? prev : null;
      const cc = reuse ? { canvas: reuse.canvas!, ctx: reuse.ctx! } : createCanvas(w, h, true);
      cc.ctx.setTransform(1, 0, 0, 1, 0, 0);
      cc.ctx.clearRect(0, 0, cc.canvas.width, cc.canvas.height);
      cc.ctx.putImageData(new ImageData(data as ImageDataArray, w, h), 0, 0);
      c.canvas = cc.canvas; c.ctx = cc.ctx;
    }
    ftCaches.set(o, c);
  }
  if (c.canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c.canvas, 0, 0, c.w, c.h, X0 + c.x0, Y0 + c.y0, c.w, c.h);
  }
  return true;
}

/** DefineText with CSMTextSettings (FlashType). Returns false when the outline renderer must be used. */
function drawFlashTypeStatic(o: StaticText, ctx: Ctx, m: M6, cx: ColorTransform | null): boolean {
  const def = o.$def;
  const L = engine.library;
  const tm = def.m;
  if (!L || !ftMatrixOk(m) || tm.b !== 0 || tm.c !== 0 || !(tm.a > 0) || !(tm.d > 0)) return false;
  const sx = m.a * tm.a, sy = m.d * tm.d;
  const mtx = q4(m.a * tm.tx), mty = q4(m.d * tm.ty);
  // [FlashType] text origin: quarter pixels, round half to even, +1 px right / 1 px up (csmProbe.ts, flashType.ts)
  const X0 = roundHalfEven(q4(m.tx) + mtx) + 1, Y0 = roundHalfEven(q4(m.ty) + mty) - 1;
  const cv = ctx.canvas as AnyCanvas | undefined;
  if (cv) {
    const b = def.bounds;
    const x0 = X0 - mtx + b.xMin * m.a, x1 = X0 - mtx + b.xMax * m.a, y0 = Y0 - mty + b.yMin * m.d, y1 = Y0 - mty + b.yMax * m.d;
    if (x1 < -2 || y1 < -2 || x0 > cv.width + 2 || y0 > cv.height + 2) return true; // off canvas
  }
  const key = `${o.$ver}|${sx},${sy}|${mtx},${mty}|${cx ? cxKey(cx) : ''}`;
  return drawFtCached(o, ctx, X0, Y0, key, def.csm!.gridFit, () => {
    const glyphs: FtGlyph[] = [];
    for (const rec of def.records) {
      const font = L.font(rec.fontId);
      if (!font) continue;
      const col = applyCxToRGBA(rec.color[0], rec.color[1], rec.color[2], rec.color[3], cx);
      if (col[3] <= 0) continue;
      // [FlashType] record y relative to the snapped origin (quantized: fractional parent scales must stay on device pixels)
      const base = Math.round(rec.y * sy);
      const hint = font.alignZones?.hint ?? 1;
      let acc = rec.x;
      for (const g of rec.glyphs) {
        const fg = font.glyphs[g.i];
        if (fg?.d) {
          glyphs.push({ d: fg.d, zone: font.alignZones?.zones[g.i], key: `${font.id}:${g.i}`, sizeX: rec.height * sx, sizeY: rec.height * sy,
            pen: q4(acc * sx), base, hint, color: col });
        }
        acc += g.adv;
      }
    }
    const b = def.bounds;
    // [FlashType] clipped to the DefineText bounds in the glyph frame (csmProbe clip cases); staticTextClip owns
    // the frame contract (0.1.1 bugs: absolute clip killed centred text; missing tm.t shift clipped menu labels)
    const clip = staticTextClip(b, m, tm);
    return { glyphs, clip };
  });
}

/**
 * v0.1.8 (EMBEDDED_FONT_CJK_FALLBACK): a FlashType EDIT field can only render when EVERY code is covered by its
 * embedded font (the FT cache draws embedded outlines only). A code missing from the font (CJK in the Latin-only
 * game fonts) makes the whole field drop to the outline renderer, which draws missing codes device-side instead
 * of skipping them. Latin-only fields keep the exact FlashType path.
 */
export function ftEditCodesCovered(tf: TextField): boolean {
  const L = engine.library;
  if (!L || !tf.$embed) return false;
  for (const line of tf.$getLayout().lines) {
    for (const g of line.glyphs) {
      if (g.code === 32 || g.code === 13 || g.code === 10 || g.code === 160) continue;
      const res = tf.$font(g.fmt);
      if (!res.font) return false;
      if (!L.fontCodeMap(res.font).has(g.code)) return false;
    }
  }
  return true;
}

/** DefineEditText with CSMTextSettings (FlashType), embedded fonts only. False: use the outline renderer. */
function drawFlashTypeEdit(tf: TextField, ctx: Ctx, m: M6, cx: ColorTransform | null): boolean {
  const L = engine.library;
  if (!L || !ftMatrixOk(m) || !tf.$embed || tf.$border) return false;
  if (!ftEditCodesCovered(tf)) return false; // any missing code: whole field via the outline renderer
  const X0 = roundHalfEven(q4(m.tx)) + 1, Y0 = roundHalfEven(q4(m.ty)) - 1;
  const key = `${tf.$ver}|${m.a},${m.d}|${cx ? cxKey(cx) : ''}|${tf.$background ? tf.$backgroundColor : ''}`;
  return drawFtCached(tf, ctx, X0, Y0, key, tf.$def!.csm!.gridFit, () => {
    const lay = tf.$getLayout();
    const r = tf.$rect;
    // [FlashType] centered / right-aligned lines start further right by the trailing letterSpacing that Flash's
    // textWidth keeps (measured on fields 371/373/536, letterSpacing -2: +1 px centered)
    const ls = tf.$fmt.letterSpacing;
    const dx0 = tf.$fmt.align === 'center' ? -ls / 2 : tf.$fmt.align === 'right' ? -ls : 0;
    const glyphs: FtGlyph[] = [];
    // [FlashType] the first baseline rounds, but floors when the field leading is negative (measured: fields
    // 291-297, leading -3, baseline 9.52 draws at 9; leading +2 fields draw at round)
    const negLead = tf.$fmt.leading < 0;
    for (const line of lay.lines) {
      const base = (negLead ? Math.floor((r.y + 2 + line.baseline) * m.d) : Math.round((r.y + 2 + line.baseline) * m.d));
      for (const g of line.glyphs) {
        if (g.code === 32 || g.code === 13 || g.code === 10 || g.code === 160) continue;
        const res = tf.$font(g.fmt);
        if (!res.font) return null; // device font: outline/canvas path
        const idx = L.fontCodeMap(res.font).get(g.code);
        if (idx === undefined) continue;
        const fg = res.font.glyphs[idx];
        if (!fg?.d) continue;
        const c = g.fmt.color;
        const col = applyCxToRGBA((c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff, 255, cx);
        if (col[3] <= 0) continue;
        glyphs.push({ d: fg.d, zone: res.font.alignZones?.zones[idx], key: `${res.font.id}:${idx}`, sizeX: g.fmt.size * m.a, sizeY: g.fmt.size * m.d,
          pen: q4((r.x + 2 + g.x + dx0) * m.a), base, hint: res.font.alignZones?.hint ?? 1, color: col });
      }
    }
    const rect = { x0: Math.floor(r.x * m.a), y0: Math.floor(r.y * m.d), x1: Math.floor((r.x + r.w) * m.a), y1: Math.floor((r.y + r.h) * m.d) };
    const bgc = tf.$background ? applyCxToRGBA((tf.$backgroundColor >>> 16) & 0xff, (tf.$backgroundColor >>> 8) & 0xff, tf.$backgroundColor & 0xff, 255, cx) : null;
    return { glyphs, clip: rect, bg: bgc && bgc[3] > 0 ? { rect, color: bgc } : undefined };
  });
}

/** Blinking caret of a focused input field (drawn on top of a cached text). */
function drawCaret(tf: TextField, ctx: Ctx, m: M6, cx: ColorTransform | null): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (((now - engine.caretT0) % 1000) >= 500) return;
  const r = tf.$rect;
  const { x, top, h } = caretPos(tf, tf.$getLayout());
  setT(ctx, m);
  ctx.fillStyle = colorCss(tf.$fmt.color, cx) ?? '#000';
  const sc = matScale(m) || 1;
  ctx.fillRect(r.x + 2 + x, r.y + 2 + top, 1 / sc * Math.max(1, sc / 2), h);
}

function cxKey(cx: ColorTransform): string {
  return `${cx.redMultiplier},${cx.greenMultiplier},${cx.blueMultiplier},${cx.alphaMultiplier},${cx.redOffset},${cx.greenOffset},${cx.blueOffset},${cx.alphaOffset}`;
}

function drawFiltered(o: DisplayObject, ctx: Ctx, m0: M6, cx: ColorTransform | null, ds: number): void {
  const filters = o.$filters!;
  // NOT pixel-snapped: Flash 8 and 28 draw a filtered object at its exact sub-pixel position, like an unfiltered one
  // (tools/oracle/visual/snapProbe.ts: squares with an identity ColorMatrix / invisible Glow / DropShadow at
  // fractional positions and scales have their edges exactly where the unfiltered copies have them). The content
  // keeps its fractional offset inside the integer-aligned filter canvas (fx, fy below).
  const m: M6 = renderConfig.filterPixelSnap ? { a: m0.a, b: m0.b, c: m0.c, d: m0.d, tx: Math.round(m0.tx), ty: Math.round(m0.ty) } : m0;
  const lb = o.$boundsWith(null);
  if (!lb) return;
  renderStats.filtered++;
  const db = transformBounds(m, lb);
  const pad = filterPadding(filters, ds);
  const cv = ctx.canvas as AnyCanvas;
  let X = Math.floor(db.xMin) - 1 - pad.left, Y = Math.floor(db.yMin) - 1 - pad.top;
  let X1 = Math.ceil(db.xMax) + 1 + pad.right, Y1 = Math.ceil(db.yMax) + 1 + pad.bottom;
  // limit to the visible target area (plus enough margin for the filter to see content just outside)
  let clipped = false;
  const mx = pad.left + pad.right + 2, my = pad.top + pad.bottom + 2;
  if (X < -mx) { X = -mx; clipped = true; }
  if (Y < -my) { Y = -my; clipped = true; }
  if (X1 > cv.width + mx) { X1 = cv.width + mx; clipped = true; }
  if (Y1 > cv.height + my) { Y1 = cv.height + my; clipped = true; }
  const W = X1 - X, H = Y1 - Y;
  if (W <= 0 || H <= 0) return;
  if (W * H > 4096 * 4096) { drawContent(o, ctx, m, cx, ds, NORMAL); return; }
  const alphaOnly = !cx || (cx.isAlphaOnly() && cx.alphaMultiplier <= 1);
  const fx = m.tx - X, fy = m.ty - Y;
  const key = `${o.$ver}|${m.a},${m.b},${m.c},${m.d}|${fx},${fy}|${W}x${H}|${ds}|${o.$fkey}|` +
    `${alphaOnly ? '' : cxKey(cx!)}|${clipped ? `${X},${Y}` : ''}|${bitmapSig(o)}`;
  let cache = o.$fcache as FilterCache | null;
  const a = alphaOnly && cx ? cxAlphaOnlyFactor(cx) : 1;
  if (cache && cache.key === key && cache.valid && cache.canvas) {
    renderStats.filterCacheHits++;
    cache.missed = false;
  } else {
    const useGL = glFiltersEnabled();
    const volatile = useGL && !!cache && cache.missed && cache.key !== key;
    const scratch = acquire(W, H, !useGL);
    try {
      let t0 = now();
      drawContent(o, scratch.ctx, { a: m.a, b: m.b, c: m.c, d: m.d, tx: fx, ty: fy }, null, ds, NORMAL);
      scratch.ctx.setTransform(1, 0, 0, 1, 0, 0);
      let t1 = now();
      filterStats.msContent += t1 - t0;
      const out = useGL ? glFilterImage(scratch.canvas, 0, 0, W, H, filters, ds, { cx: alphaOnly ? null : cxToFixed(cx!) }) : null;
      t0 = now();
      filterStats.msFilter += t0 - t1;
      if (out && volatile) {
        // changed again since the last render: composite straight from the GL output, leave the cache stale
        cache!.key = key; cache!.valid = false; cache!.missed = true;
        filterStats.gl++;
        if (a > 0) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const prev = ctx.globalAlpha;
          ctx.globalAlpha = prev * a;
          ctx.drawImage(out, 0, 0, W, H, X, Y, W, H);
          ctx.globalAlpha = prev;
        }
        return;
      }
      if (out) {
        // GPU path: no readback; the filtered result is copied into the cache canvas
        if (!cache || !cache.canvas || cache.canvas.width < W || cache.canvas.height < H) {
          const c = createCanvas(Math.max(W, cache?.canvas?.width ?? 0), Math.max(H, cache?.canvas?.height ?? 0));
          cache = { key, canvas: c.canvas, ctx: c.ctx, w: W, h: H, valid: true, missed: true };
          o.$fcache = cache;
        }
        cache.key = key; cache.w = W; cache.h = H; cache.valid = true; cache.missed = true;
        const cc = cache.ctx!;
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.globalAlpha = 1;
        cc.globalCompositeOperation = 'source-over';
        cc.clearRect(0, 0, cache.canvas!.width, cache.canvas!.height);
        cc.drawImage(out, 0, 0, W, H, 0, 0, W, H);
        t1 = now();
        filterStats.msCopy += t1 - t0;
        filterStats.gl++;
      } else {
        // CPU reference path (no WebGL2, backend 'cpu', or GL failure)
        filterStats.cpu++;
        const img = scratch.ctx.getImageData(0, 0, W, H);
        premultiplyInPlace(img.data);
        const res = applyFiltersToPixels({ data: img.data, width: W, height: H }, filters, ds);
        if (!alphaOnly) applyCxToPixels(res, cx!);
        unpremultiplyInPlace(res.data);
        if (!cache || !cache.canvas || cache.canvas.width < W || cache.canvas.height < H) {
          const c = createCanvas(W, H);
          cache = { key, canvas: c.canvas, ctx: c.ctx, w: W, h: H, valid: true, missed: true };
          o.$fcache = cache;
        }
        cache.key = key; cache.w = W; cache.h = H; cache.valid = true; cache.missed = true;
        const outImg = new ImageData(res.data.length === W * H * 4 ? res.data as ImageDataArray : new Uint8ClampedArray(res.data) as ImageDataArray, W, H);
        cache.ctx!.setTransform(1, 0, 0, 1, 0, 0);
        cache.ctx!.clearRect(0, 0, cache.canvas!.width, cache.canvas!.height);
        cache.ctx!.putImageData(outImg, 0, 0);
      }
    } finally {
      release(scratch);
    }
  }
  if (a <= 0 || !cache?.canvas) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  ctx.drawImage(cache.canvas, 0, 0, W, H, X, Y, W, H);
  ctx.globalAlpha = prev;
}

// ==================================================================================================== canvases

function createCanvas(w: number, h: number, readback = false): { canvas: AnyCanvas; ctx: Ctx } {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  const opts = { willReadFrequently: readback } as CanvasRenderingContext2DSettings;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', opts) as OffscreenCanvasRenderingContext2D;
    return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d', opts)! };
}

interface Scratch { canvas: AnyCanvas; ctx: Ctx; readback: boolean }
const pool: Scratch[] = [];

function acquire(w: number, h: number, readback = false): Scratch {
  let best = -1;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i]!;
    if (s.readback === readback && s.canvas.width >= w && s.canvas.height >= h &&
      (best < 0 || s.canvas.width * s.canvas.height < pool[best]!.canvas.width * pool[best]!.canvas.height)) best = i;
  }
  let s: Scratch;
  if (best >= 0) s = pool.splice(best, 1)[0]!;
  else {
    const c = createCanvas(Math.max(w, 64), Math.max(h, 64), readback);
    s = { canvas: c.canvas, ctx: c.ctx, readback };
  }
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.globalAlpha = 1;
  s.ctx.globalCompositeOperation = 'source-over';
  s.ctx.clearRect(0, 0, w, h);
  return s;
}

function release(s: Scratch): void {
  if (pool.length < 8) pool.push(s);
}

let factoryCtx: Ctx | null = null;
function factory(): Ctx {
  if (!factoryCtx) factoryCtx = createCanvas(1, 1).ctx;
  return factoryCtx;
}

// ==================================================================================================== paint helpers

const solidCache = new WeakMap<RGBA, string>();

function solidCss(c: RGBA, cx: ColorTransform | null): string | null {
  if (!cx) {
    if (c[3] <= 0) return null;
    let s = solidCache.get(c);
    if (!s) { s = cssRGBA(c[0], c[1], c[2], c[3]); solidCache.set(c, s); }
    return s;
  }
  const [r, g, b, a] = applyCxToRGBA(c[0], c[1], c[2], c[3], cx);
  return a > 0 ? cssRGBA(r, g, b, a) : null;
}

type GradStyle = Extract<FillStyle, { t: 'linear' | 'radial' | 'focal' }>;
const gradCache = new WeakMap<object, Map<string, CanvasGradient>>();
const SPAN = 32768, HALF = 16384;

function gradientFor(g: GradStyle, cx: ColorTransform | null, r: Bounds): CanvasGradient | null {
  let k0 = 0, k1 = 1;
  if (g.spread !== 'pad') {
    if (g.t === 'linear') { k0 = Math.floor((r.xMin + HALF) / SPAN); k1 = Math.ceil((r.xMax + HALF) / SPAN); }
    else {
      const rad = Math.max(Math.hypot(r.xMin, r.yMin), Math.hypot(r.xMax, r.yMin), Math.hypot(r.xMin, r.yMax), Math.hypot(r.xMax, r.yMax));
      k1 = Math.ceil(rad / HALF);
    }
    if (k1 - k0 > 64) { const mid = (k0 + k1) >> 1; k0 = mid - 32; k1 = mid + 32; }
    if (k1 <= k0) k1 = k0 + 1;
  }
  const key = `${cx ? cxKey(cx) : ''}|${k0}|${k1}`;
  let per = gradCache.get(g);
  if (!per) { per = new Map(); gradCache.set(g, per); }
  let grad = per.get(key);
  if (grad) return grad;
  if (g.stops.length === 0) return null;
  const f = factory();
  const periods = k1 - k0;
  if (g.t === 'linear') grad = f.createLinearGradient(-HALF + k0 * SPAN, 0, -HALF + k1 * SPAN, 0);
  else {
    const fp = Math.max(-1, Math.min(1, g.focal ?? 0)) * HALF;
    grad = f.createRadialGradient(fp, 0, 0, 0, 0, HALF * periods);
  }
  const stops = g.stops.map((s) => {
    const [cr, cg, cb, ca] = applyCxToRGBA(s.c[0], s.c[1], s.c[2], s.c[3], cx);
    return { t: s.r / 255, css: cssRGBA(cr, cg, cb, ca) };
  });
  for (let i = 1; i < stops.length; i++) if (stops[i]!.t < stops[i - 1]!.t) stops[i]!.t = stops[i - 1]!.t;
  for (let p = 0; p < periods; p++) {
    const reflect = g.spread === 'reflect' && ((k0 + p) & 1) !== 0;
    for (let i = 0; i < stops.length; i++) {
      const s = reflect ? stops[stops.length - 1 - i]! : stops[i]!;
      const t = reflect ? 1 - s.t : s.t;
      grad.addColorStop(Math.min(1, Math.max(0, (p + t) / periods)), s.css);
    }
  }
  per.set(key, grad);
  return grad;
}

const patternCache = new WeakMap<object, { r?: CanvasPattern | null; n?: CanvasPattern | null }>();
function patternFor(img: CanvasImageSource, repeat: boolean): CanvasPattern | null {
  let e = patternCache.get(img as object);
  if (!e) { e = {}; patternCache.set(img as object, e); }
  if (repeat) { if (e.r === undefined) e.r = factory().createPattern(img, 'repeat'); return e.r; }
  if (e.n === undefined) e.n = factory().createPattern(img, 'no-repeat');
  return e.n;
}

function paintFill(ctx: Ctx, L: Library, style: FillStyle, path: Path2D, cx: ColorTransform | null, mode: number, bounds: Rect, seal = 0): void {
  if (mode === MASK) {
    ctx.fillStyle = '#000';
    ctx.fill(path, 'evenodd');
    return;
  }
  switch (style.t) {
    case 'solid': {
      const css = solidCss(style.c, cx);
      if (css) {
        ctx.fillStyle = css;
        ctx.fill(path, 'evenodd');
        if (seal > 0) {
          // Conflation seal (lane X2): adjacent fills AA their shared edge against transparency, leaving a
          // background hairline between different-coloured regions (Flash's rasterizer conflates shared edges).
          // Stroking the boundary with the fill colour, CLIPPED to the region itself, covers the under-covered
          // interior half of the seam without widening the region's outer silhouette.
          ctx.save();
          ctx.clip(path, 'evenodd');
          ctx.lineWidth = seal;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = css;
          ctx.stroke(path);
          ctx.restore();
        }
      }
      return;
    }
    case 'linear':
    case 'radial':
    case 'focal': {
      const gm = style.m;
      const det = gm.a * gm.d - gm.b * gm.c;
      if (!det || !Number.isFinite(det)) {
        const last = style.stops[style.stops.length - 1];
        const css = last ? solidCss(last.c, cx) : null;
        if (css) { ctx.fillStyle = css; ctx.fill(path, 'evenodd'); }
        return;
      }
      const r = transformBounds(invert(gm), bounds);
      const grad = gradientFor(style, cx, r);
      if (!grad) return;
      ctx.save();
      try {
        ctx.clip(path, 'evenodd');
        ctx.transform(gm.a, gm.b, gm.c, gm.d, gm.tx, gm.ty);
        ctx.fillStyle = grad;
        const mx = (r.xMax - r.xMin) * 0.01 + 1, my = (r.yMax - r.yMin) * 0.01 + 1;
        ctx.fillRect(r.xMin - mx, r.yMin - my, r.xMax - r.xMin + 2 * mx, r.yMax - r.yMin + 2 * my);
      } finally {
        ctx.restore();
      }
      return;
    }
    case 'bitmap': {
      let img: CanvasImageSource | undefined = L.bitmap(style.bitmapId);
      if (!img) return;
      let alpha = 1;
      if (cx) {
        if (cx.isAlphaOnly() && cx.alphaMultiplier <= 1) alpha = cxAlphaOnlyFactor(cx);
        else img = L.tintedBitmap(style.bitmapId, cxKey(cx), (d) => applyCxToImageData(d, cx)) ?? img;
      }
      if (alpha <= 0) return;
      const pat = patternFor(img, style.repeat);
      if (!pat) return;
      const bm = style.m;
      pat.setTransform(new DOMMatrix([bm.a, bm.b, bm.c, bm.d, bm.tx, bm.ty]));
      const prevA = ctx.globalAlpha, prevS = ctx.imageSmoothingEnabled;
      ctx.globalAlpha = prevA * alpha;
      ctx.imageSmoothingEnabled = style.smooth;
      ctx.fillStyle = pat;
      ctx.fill(path, 'evenodd');
      ctx.globalAlpha = prevA;
      ctx.imageSmoothingEnabled = prevS;
      return;
    }
  }
}

/** Device-space snapped stroke paths, per stroke record (key: device matrix + snap mode). */
const snapPathCache = new WeakMap<object, { key: string; p: Path2D }>();

/**
 * Stroke a path with the line style: `path` = its local Path2D, `cmds` = its flat command array (also the key of the
 * snapped-path cache). `m` is the device matrix (ctx already has it). Strokes whose device width is whole or below
 * 1 px are snapped to the pixel grid like Flash (flash/strokeSnap.ts) and stroked in device space.
 */
function strokePath(ctx: Ctx, ls: LineStyle, path: () => Path2D, cmds: () => readonly number[], cacheKey: object, m: M6,
  cx: ColorTransform | null, scale: number, ds: number): void {
  const f = ls.fill;
  const c = ls.c ?? (f ? (f.t === 'solid' ? f.c : f.t === 'bitmap' ? undefined : f.stops[0]?.c) : undefined);
  if (!c || scale <= 0) return;
  const css = solidCss(c, cx);
  if (!css) return;
  const snap = strokeSnap(ls.noHScale || ls.noVScale ? ls.w * ds : ls.w * scale);
  const cap = ls.startCap ?? 'round';
  ctx.lineCap = cap === 'none' ? 'butt' : cap;
  ctx.lineJoin = ls.join ?? 'round';
  if (ls.join === 'miter') ctx.miterLimit = Math.max(1, ls.miter ?? 3);
  ctx.strokeStyle = css;
  if (snap.mode === 0) {
    ctx.lineWidth = snap.width / scale;
    ctx.stroke(path());
    return;
  }
  const key = `${m.a},${m.b},${m.c},${m.d},${m.tx},${m.ty},${snap.mode}`;
  let e = snapPathCache.get(cacheKey);
  if (!e || e.key !== key) {
    e = { key, p: snappedPath2D(cmds(), m, snap.mode) };
    snapPathCache.set(cacheKey, e);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = snap.width;
  ctx.stroke(e.p);
  setT(ctx, m);
}

// ==================================================================================================== leaves

function drawShape(o: Shape, ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number, mode: number): void {
  const L = engine.library;
  if (!L) return;
  const def = o.$def;
  if (!onCanvas(ctx, m, def.bounds)) return;
  setT(ctx, m);
  const scale = matScale(m);
  for (const layer of def.layers) {
    for (const f of layer.fills) {
      const style = layer.fillStyles[f.s];
      if (style) paintFill(ctx, L, style, L.path2d(f), cx, mode, def.bounds, mode === NORMAL && layer.fills.length > 1 ? 1 / scale : 0);
    }
    if (mode === MASK) continue;
    for (const s of layer.strokes) {
      const ls = layer.lineStyles[s.s];
      if (ls) strokePath(ctx, ls, () => L.path2d(s), () => L.cmds(s), s, m, cx, scale, ds);
    }
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpC = (a: RGBA, b: RGBA, t: number): RGBA =>
  [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t)), Math.round(lerp(a[3], b[3], t))];
const lerpM = (a: { a: number; b: number; c: number; d: number; tx: number; ty: number }, b: typeof a, t: number): typeof a =>
  ({ a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t), c: lerp(a.c, b.c, t), d: lerp(a.d, b.d, t), tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t) });

function lerpFill(a: FillStyle, b: FillStyle, t: number): FillStyle {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a.t === 'solid' && b.t === 'solid') return { t: 'solid', c: lerpC(a.c, b.c, t) };
  if ((a.t === 'linear' || a.t === 'radial' || a.t === 'focal') && (b.t === 'linear' || b.t === 'radial' || b.t === 'focal')) {
    const stops = a.stops.map((s, i) => {
      const e = b.stops[i] ?? s;
      return { r: Math.round(lerp(s.r, e.r, t)), c: lerpC(s.c, e.c, t) };
    });
    return { ...a, m: lerpM(a.m, b.m, t), stops, focal: a.focal !== undefined ? lerp(a.focal, b.focal ?? a.focal, t) : undefined };
  }
  if (a.t === 'bitmap' && b.t === 'bitmap') return { ...a, m: lerpM(a.m, b.m, t) };
  return a;
}

interface MorphStyleCache { fills: Map<string, FillStyle>; lines: Map<string, LineStyle> }
const morphStyleCache = new WeakMap<object, MorphStyleCache>();

function drawMorph(o: MorphShape, ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number, mode: number): void {
  const L = engine.library;
  if (!L) return;
  const def = o.$def;
  const fr = L.morphFrame(def, o.$ratio);
  const t = Math.max(0, Math.min(65535, Math.round(o.$ratio))) / 65535;
  let sc = morphStyleCache.get(fr);
  if (!sc) { sc = { fills: new Map(), lines: new Map() }; morphStyleCache.set(fr, sc); }
  const bounds = o.$selfBounds()!;
  if (!onCanvas(ctx, m, bounds)) return;
  setT(ctx, m);
  const scale = matScale(m);
  def.layers.forEach((layer, li) => {
    const fl = fr.layers[li]!;
    if (!fl.fillP2D) fl.fillP2D = fl.fills.map((c) => (c.length ? new Path2D(cmdsToSvg(c)) : null));
    layer.fills.forEach((f, k) => {
      const p = fl.fillP2D![k];
      const pair = layer.fillStyles[f.s];
      if (!p || !pair) return;
      const key = `${li}:${f.s}`;
      let st = sc!.fills.get(key);
      if (!st) { st = lerpFill(pair[0], pair[1], t); sc!.fills.set(key, st); }
      paintFill(ctx, L, st, p, cx, mode, bounds, mode === NORMAL && layer.fills.length > 1 ? 1 / scale : 0);
    });
    if (mode === MASK) return;
    if (!fl.strokeP2D) fl.strokeP2D = fl.strokes.map((c) => (c.length ? new Path2D(cmdsToSvg(c)) : null));
    layer.strokes.forEach((s, k) => {
      const p = fl.strokeP2D![k];
      const pair = layer.lineStyles[s.s];
      if (!p || !pair) return;
      const key = `${li}:${s.s}`;
      let ls = sc!.lines.get(key);
      if (!ls) {
        const [a, b] = pair;
        ls = { ...a, w: lerp(a.w, b.w, t), c: a.c && b.c ? lerpC(a.c, b.c, t) : a.c };
        sc!.lines.set(key, ls);
      }
      const sc2 = fl.strokes[k]!;
      strokePath(ctx, ls, () => p, () => sc2, sc2, m, cx, scale, ds);
    });
  });
}

function drawStaticText(o: StaticText, ctx: Ctx, m: M6, cx: ColorTransform | null, mode: number): void {
  const L = engine.library;
  if (!L) return;
  const def = o.$def;
  if (!onCanvas(ctx, m, def.bounds)) return;
  const tm = mul(m, def.m);
  for (const rec of def.records) {
    const font = L.font(rec.fontId);
    if (!font) continue;
    const css = mode === MASK ? '#000' : solidCss(rec.color, cx);
    if (!css) continue;
    ctx.fillStyle = css;
    const s = rec.height / 1024;
    let x = rec.x;
    const y = rec.y;
    for (const g of rec.glyphs) {
      const p = L.glyphPath(font, g.i);
      if (p) {
        ctx.setTransform(tm.a * s, tm.b * s, tm.c * s, tm.d * s, tm.a * x + tm.c * y + tm.tx, tm.b * x + tm.d * y + tm.ty);
        ctx.fill(p, 'nonzero');
      }
      x += g.adv;
    }
  }
}

const colorCss = (rgb: number, cx: ColorTransform | null): string | null => {
  const [r, g, b, a] = applyCxToRGBA((rgb >>> 16) & 0xff, (rgb >>> 8) & 0xff, rgb & 0xff, 255, cx);
  return a > 0 ? cssRGBA(r, g, b, a) : null;
};

function drawEditText(tf: TextField, ctx: Ctx, m: M6, cx: ColorTransform | null, mode: number): void {
  const L = engine.library;
  const lay = tf.$getLayout();
  const r = tf.$rect;
  setT(ctx, m);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    if (tf.$background) {
      const bg = mode === MASK ? '#000' : colorCss(tf.$backgroundColor, cx);
      if (bg) { ctx.fillStyle = bg; ctx.fill(); }
    }
    if (tf.$border && mode !== MASK) {
      const bc = colorCss(tf.$borderColor, cx);
      if (bc) {
        const sc = matScale(m) || 1;
        ctx.lineWidth = 1 / sc;
        ctx.strokeStyle = bc;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
    ctx.clip();
    const ox = r.x + 2, oy = r.y + 2;
    let lastColor = -1, lastCss: string | null = null;
    for (const line of lay.lines) {
      const by = oy + line.baseline;
      for (const g of line.glyphs) {
        if (g.code === 32 || g.code === 13 || g.code === 10) continue;
        const fmt = g.fmt;
        if (mode === MASK) lastCss = '#000';
        else if (fmt.color !== lastColor) { lastColor = fmt.color; lastCss = colorCss(fmt.color, cx); }
        if (!lastCss) continue;
        const res = tf.$font(fmt);
        const gx = ox + g.x;
        const idx = res.font && L ? L.fontCodeMap(res.font).get(g.code) : undefined;
        if (res.font && L && idx !== undefined) {
          const p = L.glyphPath(res.font, idx);
          if (!p) continue;
          const s = fmt.size / 1024;
          ctx.setTransform(m.a * s, m.b * s, m.c * s, m.d * s, m.a * gx + m.c * by + m.tx, m.b * gx + m.d * by + m.ty);
          ctx.fillStyle = lastCss;
          ctx.fill(p, 'nonzero');
        } else {
          // v0.1.8 (EMBEDDED_FONT_CJK_FALLBACK): codes missing from the embedded font draw with the device font
          // stack (the same path as non-embedded text) instead of being skipped.
          setT(ctx, m);
          ctx.font = res.css.replace('SIZE', String(fmt.size));
          ctx.fillStyle = lastCss;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(String.fromCharCode(g.code), gx, by);
        }
      }
      if (mode !== MASK) drawUnderlines(ctx, m, line, ox, by, cx);
    }
    // caret
    if (mode !== MASK && engine.focus === tf && tf.$type === 'input') {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (((now - engine.caretT0) % 1000) < 500) {
        const { x, top, h } = caretPos(tf, lay);
        setT(ctx, m);
        ctx.fillStyle = colorCss(tf.$fmt.color, cx) ?? '#000';
        const sc = matScale(m) || 1;
        ctx.fillRect(ox + x, oy + top, 1 / sc * Math.max(1, sc / 2), h);
      }
    }
  } finally {
    ctx.restore();
  }
}

function drawUnderlines(ctx: Ctx, m: M6, line: LaidLine, ox: number, by: number, cx: ColorTransform | null): void {
  let any = false;
  for (const g of line.glyphs) if (g.fmt.underline) { any = true; break; }
  if (!any) return;
  setT(ctx, m);
  for (const g of line.glyphs) {
    if (!g.fmt.underline) continue;
    const css = colorCss(g.fmt.color, cx);
    if (!css) continue;
    ctx.fillStyle = css;
    ctx.fillRect(ox + g.x, by + Math.max(1, g.fmt.size * 0.08), g.adv, Math.max(0.5, g.fmt.size / 20));
  }
}

function caretPos(tf: TextField, lay: TextLayout): { x: number; top: number; h: number } {
  const idx = engine.caretIndex;
  const size = tf.$fmt.size;
  if (lay.lines.length === 0) {
    const al = tf.$fmt.align;
    const w = tf.$rect.w - 4;
    return { x: al === 'center' ? w / 2 : al === 'right' ? w : 0, top: 0, h: size * 1.1 };
  }
  for (const line of lay.lines) {
    if (idx >= line.start && idx <= line.end) {
      let x = line.x;
      for (const g of line.glyphs) { if (g.index >= idx) break; x = g.x + g.adv; }
      if (line.glyphs.length && idx <= line.glyphs[0]!.index) x = line.glyphs[0]!.x;
      return { x, top: line.top, h: line.ascent + line.descent };
    }
  }
  const last = lay.lines[lay.lines.length - 1]!;
  const lg = last.glyphs[last.glyphs.length - 1];
  return { x: lg ? lg.x + lg.adv : last.x, top: last.top, h: last.ascent + last.descent };
}

function drawBitmapObj(b: Bitmap, ctx: Ctx, m: M6, cx: ColorTransform | null, ds: number, mode: number): void {
  const bmd = b.$bmd;
  const w = bmd.width, h = bmd.height;
  if (!(w > 0 && h > 0)) return;
  let mm = m;
  if (b.$snap !== 'never' && m.b === 0 && m.c === 0 &&
    (b.$snap === 'always' || (Math.abs(m.a - ds) < ds * 0.001 && Math.abs(m.d - ds) < ds * 0.001))) {
    mm = { ...m, tx: Math.round(m.tx), ty: Math.round(m.ty) };
  }
  setT(ctx, mm);
  if (mode === MASK) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
  let a = 1;
  if (cx) {
    if (cx.isAlphaOnly() && cx.alphaMultiplier <= 1) a = cxAlphaOnlyFactor(cx);
    else {
      drawTintedBitmap(b, ctx, mm, cx);
      return;
    }
  }
  if (a <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  bmd.drawTo(ctx as CanvasRenderingContext2D, 0, 0, w, h, 0, 0, w, h, b.$smooth);
  ctx.globalAlpha = prev;
}

/** Bitmap under a non-alpha color transform: tint a device-resolution copy (rare). */
function drawTintedBitmap(b: Bitmap, ctx: Ctx, m: M6, cx: ColorTransform): void {
  const bmd = b.$bmd;
  const s = bmd.scale || 1;
  const W = Math.round(bmd.width * s), H = Math.round(bmd.height * s);
  const sc = acquire(W, H, true);
  try {
    sc.ctx.setTransform(s, 0, 0, s, 0, 0);
    bmd.drawTo(sc.ctx as CanvasRenderingContext2D, 0, 0, bmd.width, bmd.height, 0, 0, bmd.width, bmd.height, false);
    sc.ctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = sc.ctx.getImageData(0, 0, W, H);
    applyCxToImageData(img.data, cx);
    sc.ctx.putImageData(img, 0, 0);
    setT(ctx, m);
    const prevS = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = b.$smooth;
    ctx.drawImage(sc.canvas, 0, 0, W, H, 0, 0, bmd.width, bmd.height);
    ctx.imageSmoothingEnabled = prevS;
  } finally {
    release(sc);
  }
}
