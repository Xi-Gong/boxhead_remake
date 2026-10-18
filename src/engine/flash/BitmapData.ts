/**
 * flash.display.BitmapData (AS2, Flash 8) on Canvas2D.          OWNER: lane C (engine core)
 *
 * RESOLUTION MODEL (load-bearing, see plan "引擎规则"):
 *   - All AS2-visible geometry (width/height, rectangles, points, matrices passed to draw) is in LOGICAL 1x pixels,
 *     exactly as in Flash. The pixel store ("backing") is logical × `scale` device pixels (scale = renderScale, 1 or 2).
 *   - copyPixels / fillRect / applyFilter / paletteMap operate on logical rects; integer logical coordinates map to
 *     `× scale` device pixels. Filter parameters (blur, distance) are multiplied by `scale` (see filters/apply.ts).
 *   - draw(source, m) renders `source` with device transform = scale ∘ m. The source's OWN transform, color transform,
 *     visibility and filters are ignored (Flash semantics); its children's are applied.
 *   - Large bitmaps (> maxCanvasSize device px in either dimension, i.e. > 2048 logical px at scale 2) use a tiled
 *     backing transparently (1024² device-px tiles, allocated on first write; untouched tiles are a uniform colour).
 *   - Headless (tests / Node): `BitmapData.headless = true` (or no canvas implementation available) gives a
 *     NullBacking that keeps sizes/bookkeeping but stores no pixels; every call is a cheap no-op.
 *
 * Colors are ARGB uint32 numbers as in Flash (e.g. 0xFF0000FF = opaque blue). For non-transparent bitmaps alpha is
 * forced to 0xFF. Like Flash, pixels are stored premultiplied (canvas), so colours of semi-transparent pixels lose
 * precision.
 *
 * Flash semantics reproduced (Flash Player traces in the Ruffle AVM1 test corpus + Ruffle's implementation):
 *   - size must be 1..2880 (SWF8) or the object is invalid: width/height read undefined (oracle P3) and every method is
 *     a no-op; dispose() makes width/height read -1.
 *   - rectangle fields are converted with ToInt32 (truncation), points with truncation toward zero.
 *   - copyPixels: without alphaBitmap, mergeAlpha defaults to false; with an alphaBitmap it defaults to true.
 *     Pixels are composited (source-over) when mergeAlpha is true or when a transparent source is copied into an
 *     opaque bitmap; otherwise they are replaced (including alpha). With an alphaBitmap, pixels outside the
 *     alphaBitmap are left untouched and the source alpha is multiplied by the alphaBitmap's alpha.
 *   - draw(): the clip rectangle is in DESTINATION coordinates; matrix tx/ty are quantised to twips; a BitmapData
 *     source with a translation-only matrix is placed at tx, ty snapped DOWN to 1/4 px (oracle P3: 10.4999 -> 10.25),
 *     nearest-sampled, with anti-aliased (coverage) edges when the position is fractional, smoothing on or off;
 *     'alpha'/'erase' blend modes with a BitmapData source are no-ops. A display-object source is drawn with its OWN
 *     filters applied (oracle P4) but without its own matrix / colour transform / visibility / blend mode.
 *   - applyFilter runs on the WebGL2 filter backend (filters/gl.ts, no readback) when available, else on the CPU
 *     reference (filters/apply.ts); ColorMatrixFilter always uses the CPU paths below.
 *   - getPixel / getPixel32 / paletteMap / colorTransform see Flash's un-premultiplied values (color.unpremul).
 *   - paletteMap: output = rArr[r] + gArr[g] + bArr[b] + aArr[a] (32-bit wrap) on un-premultiplied source values;
 *     a missing array is the identity for that channel (i << shift); undefined entries count as 0; non-transparent
 *     targets keep the RGB and force alpha 0xFF.
 *   - getPixel32 returns a SIGNED 32-bit value (AVM1), e.g. 0xFFFF0000 -> -65536.
 */
import { ColorTransform, Matrix, Point, Rectangle } from './geom.ts';
import type { BitmapFilter, ColorMatrixFilter } from './filters.ts';
import { applyFilterToPixels, filterPadding } from './filters/apply.ts';
import { glFilterImage, glFiltersEnabled } from './filters/gl.ts';
import {
  applyCxToImageData, argbAlpha, cssARGB, cxAlphaOnlyFactor, premul, premultiplyInPlace, toInt32, toUint32, unpremul,
  unpremultiplyFlashInPlace, unpremultiplyInPlace, type Pixels,
} from './color.ts';

/** Anything that can be rendered by BitmapData.draw (implemented by engine/swf DisplayObject, lane E). */
export interface IDrawable {
  /**
   * Render this object's CONTENT (its graphics/children and its own filters, NOT its own matrix/colorTransform/visibility) into
   * `ctx`, whose current transform maps this object's local logical space to device pixels.
   * `cx` is the accumulated color transform to apply to leaves (null = identity).
   */
  renderContent(ctx: CanvasRenderingContext2D, cx: ColorTransform | null, deviceScale: number): void;
  /** Local-space bounds of the content (Flash getBounds(this) semantics), used for tile culling. */
  contentBounds(): Rectangle;
  /**
   * OPTIONAL: local-space bounds of everything renderContent can paint, INCLUDING children's filter spill and stroke
   * antialiasing (Flash bounds exclude filters). Used to cull work on tiled targets. When absent, contentBounds()
   * grown by BitmapData.drawCullMargin logical px is used.
   */
  renderBounds?(): Rectangle;
}

export interface BitmapDataOptions {
  /** Device pixels per logical pixel for this bitmap (default BitmapData.defaultScale). */
  scale?: number;
  /**
   * Hint: only the alpha channel of this bitmap matters (decal masks used as copyPixels alphaBitmap / paletteMap'd
   * alpha). IMPLEMENTATION: stored as a normal RGBA canvas/tiled backing (4 bytes per device pixel instead of 1) so
   * that every operation stays on the GPU path; combine with `scale: 1` to keep big masks small (BIG ONE 2784² at
   * 1x = 31 MB instead of 124 MB at 2x). Mixed-scale copyPixels (mask at 1x, target at 2x) is supported.
   */
  alphaOnly?: boolean;
}

// ==================================================================================================== canvas glue

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

interface CanvasPair { canvas: AnyCanvas; ctx: Ctx2D }

function canvasAvailable(): boolean {
  return typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && typeof document.createElement === 'function');
}

function createCanvas(w: number, h: number, alpha: boolean, willReadFrequently = false): CanvasPair {
  const opts = { alpha, willReadFrequently } as CanvasRenderingContext2DSettings;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    const ctx = canvas.getContext('2d', opts) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('BitmapData: OffscreenCanvas 2D context unavailable');
    return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', opts);
  if (!ctx) throw new Error('BitmapData: canvas 2D context unavailable');
  return { canvas, ctx };
}

/** Reset the bits of context state the backings rely on (cheaper than save/restore on hot paths). */
function resetState(ctx: Ctx2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Pool of scratch canvases (GPU ones for compositing, CPU ones with willReadFrequently for readbacks). */
class ScratchPool {
  private free: (CanvasPair & { w: number; h: number })[] = [];
  private readonly cpu: boolean;
  constructor(cpu: boolean) { this.cpu = cpu; }
  acquire(w: number, h: number): CanvasPair {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let best = -1;
    for (let i = 0; i < this.free.length; i++) {
      const s = this.free[i]!;
      if (s.w >= w && s.h >= h && (best < 0 || s.w * s.h < this.free[best]!.w * this.free[best]!.h)) best = i;
    }
    let s: CanvasPair & { w: number; h: number };
    if (best >= 0) s = this.free.splice(best, 1)[0]!;
    else {
      // grow to a power-of-two-ish size to improve reuse
      const gw = Math.max(w, 64), gh = Math.max(h, 64);
      s = { ...createCanvas(gw, gh, true, this.cpu), w: gw, h: gh };
    }
    resetState(s.ctx);
    s.ctx.imageSmoothingEnabled = false;
    s.ctx.clearRect(0, 0, w, h);
    return s;
  }
  release(s: CanvasPair): void {
    const c = s.canvas;
    this.free.push({ ...s, w: c.width, h: c.height });
    if (this.free.length > 6) {
      // drop the largest
      let li = 0;
      for (let i = 1; i < this.free.length; i++) if (this.free[i]!.w * this.free[i]!.h > this.free[li]!.w * this.free[li]!.h) li = i;
      const [big] = this.free.splice(li, 1);
      if (big) { big.canvas.width = 1; big.canvas.height = 1; }
    }
  }
}

const gpuScratch = new ScratchPool(false);
const cpuScratch = new ScratchPool(true);

// ==================================================================================================== device rects

/** Integer device-pixel rectangle. */
interface DRect { x: number; y: number; w: number; h: number }

const drIntersect = (a: DRect, b: DRect): DRect | null => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};

/** Callback that paints in GLOBAL device coordinates; the ctx origin is at global (ox, oy). */
type PaintFn = (ctx: Ctx2D, ox: number, oy: number) => void;

/**
 * A source piece: `img` region (sx, sy, w, h) covering global device rect (gx, gy, w, h). When `img` is null the
 * region is a uniform colour (`css`).
 */
type PieceFn = (img: CanvasImageSource | null, sx: number, sy: number, w: number, h: number, gx: number, gy: number, css: string | null) => void;

interface Backing {
  readonly kind: 'canvas' | 'tiled' | 'null';
  /** Paint into device rect r. When `clip` is set the drawing is clipped to r; otherwise fn must stay inside r. */
  paint(r: DRect, fn: PaintFn, clip: boolean): void;
  /** Enumerate the pieces covering device rect r (transparent uniform regions are skipped). */
  pieces(r: DRect, cb: PieceFn): void;
  /** Read device rect r (must lie inside the backing) as un-premultiplied ImageData. */
  read(r: DRect): ImageData;
  /** Replace pixels at (x, y) with un-premultiplied ImageData (clipped to the backing). */
  write(img: ImageData, x: number, y: number): void;
  /** Fill device rect r with a colour, REPLACING pixels (alpha included). */
  fill(r: DRect, argbColor: number): void;
  clone(): Backing;
  dispose(): void;
  /** The single canvas holding all pixels, if any. */
  singleCanvas(): AnyCanvas | null;
}

/** Fill helper honouring replace semantics on a ctx whose canvas is opaque (alpha:false) or transparent. */
function fillReplace(ctx: Ctx2D, x: number, y: number, w: number, h: number, argbColor: number, opaque: boolean): void {
  const a = argbAlpha(argbColor);
  if (opaque || a === 255) {
    ctx.fillStyle = cssARGB(opaque ? (argbColor | 0xff000000) >>> 0 : argbColor);
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.clearRect(x, y, w, h);
  if (a > 0) {
    ctx.fillStyle = cssARGB(argbColor);
    ctx.fillRect(x, y, w, h);
  }
}

function readViaScratch(src: CanvasImageSource, sx: number, sy: number, w: number, h: number): ImageData {
  const s = cpuScratch.acquire(w, h);
  try {
    s.ctx.globalCompositeOperation = 'copy';
    s.ctx.drawImage(src, sx, sy, w, h, 0, 0, w, h);
    s.ctx.globalCompositeOperation = 'source-over';
    return s.ctx.getImageData(0, 0, w, h);
  } finally {
    cpuScratch.release(s);
  }
}

class CanvasBacking implements Backing {
  readonly kind = 'canvas' as const;
  readonly w: number;
  readonly h: number;
  readonly opaque: boolean;
  c: CanvasPair;
  constructor(w: number, h: number, opaque: boolean, fill: number | null) {
    this.w = w; this.h = h; this.opaque = opaque;
    this.c = createCanvas(w, h, !opaque);
    this.c.ctx.imageSmoothingEnabled = false;
    if (fill !== null && (opaque || argbAlpha(fill) > 0)) fillReplace(this.c.ctx, 0, 0, w, h, fill, opaque);
  }
  paint(r: DRect, fn: PaintFn, clip: boolean): void {
    const ctx = this.c.ctx;
    if (clip) {
      ctx.save();
      resetState(ctx);
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      try { fn(ctx, 0, 0); } finally { ctx.restore(); resetState(ctx); }
    } else {
      resetState(ctx);
      try { fn(ctx, 0, 0); } finally { resetState(ctx); }
    }
  }
  pieces(r: DRect, cb: PieceFn): void {
    const q = drIntersect(r, { x: 0, y: 0, w: this.w, h: this.h });
    if (q) cb(this.c.canvas, q.x, q.y, q.w, q.h, q.x, q.y, null);
  }
  read(r: DRect): ImageData { return readViaScratch(this.c.canvas, r.x, r.y, r.w, r.h); }
  write(img: ImageData, x: number, y: number): void {
    resetState(this.c.ctx);
    this.c.ctx.putImageData(img, x, y);
  }
  fill(r: DRect, argbColor: number): void {
    resetState(this.c.ctx);
    fillReplace(this.c.ctx, r.x, r.y, r.w, r.h, argbColor, this.opaque);
  }
  clone(): Backing {
    const b = new CanvasBacking(this.w, this.h, this.opaque, null);
    b.c.ctx.globalCompositeOperation = 'copy';
    b.c.ctx.drawImage(this.c.canvas, 0, 0);
    resetState(b.c.ctx);
    return b;
  }
  dispose(): void { this.c.canvas.width = 1; this.c.canvas.height = 1; }
  singleCanvas(): AnyCanvas { return this.c.canvas; }
}

interface Tile { x: number; y: number; w: number; h: number; c: CanvasPair | null; uniform: number }

class TiledBacking implements Backing {
  readonly kind = 'tiled' as const;
  readonly w: number;
  readonly h: number;
  readonly opaque: boolean;
  readonly tileSize: number;
  readonly cols: number;
  readonly rows: number;
  tiles: Tile[];
  constructor(w: number, h: number, opaque: boolean, fill: number, tileSize: number) {
    this.w = w; this.h = h; this.opaque = opaque; this.tileSize = tileSize;
    this.cols = Math.ceil(w / tileSize); this.rows = Math.ceil(h / tileSize);
    this.tiles = [];
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const x = tx * tileSize, y = ty * tileSize;
        this.tiles.push({ x, y, w: Math.min(tileSize, w - x), h: Math.min(tileSize, h - y), c: null, uniform: this.norm(fill) });
      }
    }
  }
  private norm(c: number): number {
    if (this.opaque) return (c | 0xff000000) >>> 0;
    return argbAlpha(c) === 0 ? 0 : c >>> 0;
  }
  /** Number of tiles holding a canvas (for tests / memory stats). */
  get allocatedTiles(): number { return this.tiles.filter((t) => t.c).length; }
  private tilesIn(r: DRect): Tile[] {
    const out: Tile[] = [];
    const tx0 = Math.max(0, Math.floor(r.x / this.tileSize)), ty0 = Math.max(0, Math.floor(r.y / this.tileSize));
    const tx1 = Math.min(this.cols - 1, Math.floor((r.x + r.w - 1) / this.tileSize));
    const ty1 = Math.min(this.rows - 1, Math.floor((r.y + r.h - 1) / this.tileSize));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) out.push(this.tiles[ty * this.cols + tx]!);
    return out;
  }
  private ensure(t: Tile): CanvasPair {
    if (!t.c) {
      t.c = createCanvas(t.w, t.h, !this.opaque);
      t.c.ctx.imageSmoothingEnabled = false;
      if (this.opaque || argbAlpha(t.uniform) > 0) fillReplace(t.c.ctx, 0, 0, t.w, t.h, t.uniform, this.opaque);
    }
    return t.c;
  }
  paint(r: DRect, fn: PaintFn, clip: boolean): void {
    for (const t of this.tilesIn(r)) {
      const q = drIntersect(r, t);
      if (!q) continue;
      const ctx = this.ensure(t).ctx;
      ctx.save();
      resetState(ctx);
      if (clip || q.w !== t.w || q.h !== t.h) {
        ctx.beginPath();
        ctx.rect(q.x - t.x, q.y - t.y, q.w, q.h);
        ctx.clip();
      }
      try { fn(ctx, t.x, t.y); } finally { ctx.restore(); resetState(ctx); }
    }
  }
  pieces(r: DRect, cb: PieceFn): void {
    for (const t of this.tilesIn(r)) {
      const q = drIntersect(r, t);
      if (!q) continue;
      if (t.c) cb(t.c.canvas, q.x - t.x, q.y - t.y, q.w, q.h, q.x, q.y, null);
      else if (argbAlpha(t.uniform) > 0) cb(null, 0, 0, q.w, q.h, q.x, q.y, cssARGB(t.uniform));
    }
  }
  read(r: DRect): ImageData {
    const s = cpuScratch.acquire(r.w, r.h);
    try {
      this.pieces(r, (img, sx, sy, w, h, gx, gy, css) => {
        if (img) s.ctx.drawImage(img, sx, sy, w, h, gx - r.x, gy - r.y, w, h);
        else if (css) { s.ctx.fillStyle = css; s.ctx.fillRect(gx - r.x, gy - r.y, w, h); }
      });
      return s.ctx.getImageData(0, 0, r.w, r.h);
    } finally {
      cpuScratch.release(s);
    }
  }
  write(img: ImageData, x: number, y: number): void {
    const r = { x, y, w: img.width, h: img.height };
    for (const t of this.tilesIn(r)) {
      const q = drIntersect(r, t);
      if (!q) continue;
      const ctx = this.ensure(t).ctx;
      resetState(ctx);
      ctx.putImageData(img, x - t.x, y - t.y, q.x - x, q.y - y, q.w, q.h);
    }
  }
  fill(r: DRect, argbColor: number): void {
    for (const t of this.tilesIn(r)) {
      const q = drIntersect(r, t);
      if (!q) continue;
      if (q.w === t.w && q.h === t.h) {
        // whole tile: drop the canvas, remember the colour
        if (t.c) { t.c.canvas.width = 1; t.c.canvas.height = 1; t.c = null; }
        t.uniform = this.norm(argbColor);
        continue;
      }
      const ctx = this.ensure(t).ctx;
      resetState(ctx);
      fillReplace(ctx, q.x - t.x, q.y - t.y, q.w, q.h, argbColor, this.opaque);
    }
  }
  clone(): Backing {
    const b = new TiledBacking(this.w, this.h, this.opaque, 0, this.tileSize);
    for (let i = 0; i < this.tiles.length; i++) {
      const s = this.tiles[i]!, d = b.tiles[i]!;
      d.uniform = s.uniform;
      if (s.c) {
        const c = createCanvas(s.w, s.h, !this.opaque);
        c.ctx.imageSmoothingEnabled = false;
        c.ctx.globalCompositeOperation = 'copy';
        c.ctx.drawImage(s.c.canvas, 0, 0);
        resetState(c.ctx);
        d.c = c;
      }
    }
    return b;
  }
  dispose(): void {
    for (const t of this.tiles) if (t.c) { t.c.canvas.width = 1; t.c.canvas.height = 1; t.c = null; }
  }
  singleCanvas(): null { return null; }
}

class NullBacking implements Backing {
  readonly kind = 'null' as const;
  paint(): void {}
  pieces(): void {}
  read(r: DRect): ImageData {
    // Node may lack ImageData: return a structurally compatible object.
    const data = new Uint8ClampedArray(Math.max(0, r.w * r.h * 4));
    return { data, width: r.w, height: r.h, colorSpace: 'srgb' } as unknown as ImageData;
  }
  write(): void {}
  fill(): void {}
  clone(): Backing { return this; }
  dispose(): void {}
  singleCanvas(): null { return null; }
}

function newImageData(w: number, h: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(Math.max(1, w), Math.max(1, h));
  return { data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
}

// ==================================================================================================== helpers

const BLEND_MODES: Record<string, GlobalCompositeOperation | 'noop' | null> = {
  normal: 'source-over', layer: 'source-over', multiply: 'multiply', screen: 'screen', lighten: 'lighten',
  darken: 'darken', difference: 'difference', add: 'lighter', subtract: null, invert: 'difference', alpha: 'destination-in',
  erase: 'destination-out', overlay: 'overlay', hardlight: 'hard-light',
};
const BLEND_BY_NUMBER = ['normal', 'normal', 'layer', 'multiply', 'screen', 'lighten', 'darken', 'difference', 'add',
  'subtract', 'invert', 'alpha', 'erase', 'overlay', 'hardlight'];

function blendName(mode: string | number | undefined): string {
  if (mode === undefined || mode === null) return 'normal';
  if (typeof mode === 'number') return BLEND_BY_NUMBER[mode] ?? 'normal';
  const m = String(mode).toLowerCase();
  return m in BLEND_MODES ? m : 'normal';
}

/** AVM1 coerce of a point coordinate (`as i32`: truncation toward zero, saturating, NaN -> 0). */
const ptCoord = (v: unknown): number => {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(-2147483648, Math.min(2147483647, Math.trunc(n)));
};

const twips = (v: number): number => Math.trunc(v * 20) / 20;

interface IRect { x: number; y: number; w: number; h: number }

function rectArg(r: Rectangle | undefined | null): IRect | null {
  if (!r || typeof r !== 'object') return null;
  if (!('x' in r) || !('y' in r) || !('width' in r) || !('height' in r)) return null;
  return { x: toInt32(r.x), y: toInt32(r.y), w: toInt32(r.width), h: toInt32(r.height) };
}

function isBitmapData(v: unknown): v is BitmapData {
  return v instanceof BitmapData;
}

function isDrawable(v: unknown): v is IDrawable {
  return !!v && typeof (v as IDrawable).renderContent === 'function' && typeof (v as IDrawable).contentBounds === 'function';
}

/** Axis-aligned bounds of rect r transformed by m. */
function transformBounds(m: Matrix, x: number, y: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const xs = [m.a * x + m.c * y + m.tx, m.a * (x + w) + m.c * y + m.tx, m.a * x + m.c * (y + h) + m.tx, m.a * (x + w) + m.c * (y + h) + m.tx];
  const ys = [m.b * x + m.d * y + m.ty, m.b * (x + w) + m.d * y + m.ty, m.b * x + m.d * (y + h) + m.ty, m.b * (x + w) + m.d * (y + h) + m.ty];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** One run of destination pixels of a 1:1 blit at a fractional offset: dest start, source start, count, coverage. */
interface CoverageSeg { d: number; s: number; n: number; cov: number }

/**
 * Columns (or rows) of a 1:1 blit of `size` source pixels placed at fractional device offset `t`: full-coverage pixels
 * are nearest-sampled (source floor(x + 0.5 - t)) and merged into one run; the partially covered first / last pixel
 * take the nearest source pixel inside the image with their coverage.
 */
function coverageSegments(t: number, size: number): CoverageSeg[] {
  const out: CoverageSeg[] = [];
  const x0 = Math.floor(t), x1 = Math.ceil(t + size) - 1;
  const src = (x: number): number => Math.min(size - 1, Math.max(0, Math.floor(x + 0.5 - t)));
  const cov = (x: number): number => Math.min(x + 1, t + size) - Math.max(x, t);
  for (let x = x0; x <= x1;) {
    const c = cov(x);
    if (c >= 1) {
      let n = 1;
      while (x + n <= x1 && cov(x + n) >= 1) n++;
      out.push({ d: x, s: src(x), n, cov: 1 });
      x += n;
    } else {
      if (c > 0) out.push({ d: x, s: src(x), n: 1, cov: c });
      x++;
    }
  }
  return out;
}

// ==================================================================================================== BitmapData

let nextId = 1;
// Repeated immutable sprites often have transparent padding. Keep only eligibility, never pixel copies.
const clearBorders = new WeakMap<BitmapData, {version: number; uses: number; clear?: boolean}>();

export class BitmapData {
  /** Global render scale for newly created bitmaps (1 or 2). Set once at boot from settings. */
  static defaultScale = 2;
  /** Use pixel-less backings (headless simulation tests). */
  static headless = false;
  /** Maximum single-canvas dimension in device pixels before tiling kicks in. */
  static maxCanvasSize = 4096;
  /** Tile edge in device pixels for tiled backings. */
  static tileSize = 1024;
  /** Flash 8 (SWF <= 9) size limit. */
  static readonly MAX_SIZE = 2880;
  /** Logical px added around IDrawable.contentBounds() for culling when renderBounds() is not implemented. */
  static drawCullMargin = 64;

  private readonly _w: number;
  private readonly _h: number;
  readonly transparent: boolean;
  /** Device pixels per logical pixel. */
  readonly scale: number;
  /** Options.alphaOnly hint (see BitmapDataOptions). */
  readonly alphaOnly: boolean;
  /** Incremented on every pixel mutation (lets renderers invalidate caches). */
  version = 0;
  disposed = false;
  /** False when the constructor arguments were invalid (Flash: the object has no bitmap). */
  readonly valid: boolean;
  /** Unique id (engine use: cache keys). */
  readonly id = nextId++;
  private backing: Backing;

  constructor(width: number, height: number, transparent: boolean = true, fillColor: number = 0xffffffff, options?: BitmapDataOptions) {
    this._w = toUint32(width);
    this._h = toUint32(height);
    this.transparent = transparent === undefined ? true : !!transparent;
    this.scale = options?.scale && options.scale > 0 ? options.scale : BitmapData.defaultScale;
    this.alphaOnly = !!options?.alphaOnly;
    this.valid = this._w >= 1 && this._h >= 1 && this._w <= BitmapData.MAX_SIZE && this._h <= BitmapData.MAX_SIZE;
    let fill = fillColor === undefined ? 0xffffffff : toUint32(fillColor);
    if (!this.transparent) fill = (fill | 0xff000000) >>> 0;
    this.backing = this.valid ? BitmapData.makeBacking(this._w, this._h, this.scale, !this.transparent, fill) : new NullBacking();
  }

  private static makeBacking(w: number, h: number, scale: number, opaque: boolean, fill: number): Backing {
    if (BitmapData.headless || !canvasAvailable()) return new NullBacking();
    const dw = Math.round(w * scale), dh = Math.round(h * scale);
    if (dw > BitmapData.maxCanvasSize || dh > BitmapData.maxCanvasSize) return new TiledBacking(dw, dh, opaque, fill, BitmapData.tileSize);
    return new CanvasBacking(dw, dh, opaque, fill);
  }

  /** Logical width (Flash: undefined for an invalid size, -1 after dispose()). */
  get width(): number { return this.live ? this._w : this.valid ? -1 : (undefined as unknown as number); }
  /** Logical height (-1 when invalid or disposed, as in Flash). */
  get height(): number { return this.live ? this._h : this.valid ? -1 : (undefined as unknown as number); }
  get rectangle(): Rectangle { return this.live ? new Rectangle(0, 0, this._w, this._h) : new Rectangle(0, 0, -1, -1); }
  /** Device pixel size of the backing. */
  get deviceWidth(): number { return Math.round(this._w * this.scale); }
  get deviceHeight(): number { return Math.round(this._h * this.scale); }
  /** Engine: which backing is in use ('canvas' | 'tiled' | 'null'). */
  get backingKind(): 'canvas' | 'tiled' | 'null' { return this.backing.kind; }
  /** Engine: allocated tile count of a tiled backing (0 otherwise). */
  get allocatedTiles(): number { return this.backing instanceof TiledBacking ? this.backing.allocatedTiles : 0; }

  private get live(): boolean { return this.valid && !this.disposed; }

  private dev(v: number): number { return Math.round(v * this.scale); }
  private devRect(x: number, y: number, w: number, h: number): DRect {
    const x0 = this.dev(x), y0 = this.dev(y);
    return { x: x0, y: y0, w: this.dev(x + w) - x0, h: this.dev(y + h) - y0 };
  }
  private touch(): void { this.version++; }
  /** Headless (NullBacking): pixel operations are validated, then become no-ops (no canvas/scratch access). */
  private get pixelless(): boolean { return this.backing.kind === 'null'; }

  // ------------------------------------------------------------------------------------------------ fillRect

  fillRect(rect: Rectangle, color: number): void {
    if (!this.live) return;
    const r = rectArg(rect);
    if (!r) return;
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
    const x1 = Math.min(this._w, r.x + r.w), y1 = Math.min(this._h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) return;
    let c = toUint32(color);
    if (!this.transparent) c = (c | 0xff000000) >>> 0;
    this.backing.fill(this.devRect(x0, y0, x1 - x0, y1 - y0), c);
    this.touch();
  }

  // ------------------------------------------------------------------------------------------------ copyPixels

  copyPixels(sourceBitmap: BitmapData, sourceRect: Rectangle, destPoint: Point, alphaBitmap?: BitmapData,
    alphaPoint?: Point, mergeAlpha?: boolean): void {
    if (!this.live || !isBitmapData(sourceBitmap) || !sourceBitmap.live) return;
    const sr = rectArg(sourceRect);
    if (!sr || !destPoint) return;
    const dx = ptCoord(destPoint.x), dy = ptCoord(destPoint.y);
    if (isBitmapData(alphaBitmap) && alphaBitmap.live) {
      const ax = ptCoord(alphaPoint?.x), ay = ptCoord(alphaPoint?.y);
      const merge = mergeAlpha === undefined ? true : !!mergeAlpha;
      if (alphaBitmap === sourceBitmap && ax === sr.x && ay === sr.y) {
        this.copyPlain(sourceBitmap, sr, dx, dy, merge);
      } else {
        this.copyMasked(sourceBitmap, sr, dx, dy, alphaBitmap, ax, ay, merge);
      }
    } else {
      this.copyPlain(sourceBitmap, sr, dx, dy, !!mergeAlpha);
    }
  }

  /** Clamp a source rect + dest point against source and destination bounds (Flash clamp_with_intersection). */
  private clampCopy(src: BitmapData, sr: IRect, dx: number, dy: number): { sx: number; sy: number; dx: number; dy: number; w: number; h: number } | null {
    let sx = sr.x, sy = sr.y, w = sr.w, h = sr.h;
    if (sx < 0) { dx -= sx; w += sx; sx = 0; }
    if (sy < 0) { dy -= sy; h += sy; sy = 0; }
    if (sx + w > src._w) w = src._w - sx;
    if (sy + h > src._h) h = src._h - sy;
    if (dx < 0) { sx -= dx; w += dx; dx = 0; }
    if (dy < 0) { sy -= dy; h += dy; dy = 0; }
    if (dx + w > this._w) w = this._w - dx;
    if (dy + h > this._h) h = this._h - dy;
    if (w <= 0 || h <= 0) return null;
    return { sx, sy, dx, dy, w, h };
  }

  private copyPlain(src: BitmapData, sr: IRect, dx0: number, dy0: number, merge: boolean): void {
    const c = this.clampCopy(src, sr, dx0, dy0);
    if (!c) return;
    const blend = merge || (src.transparent && !this.transparent);
    const needClear = !blend && src.transparent && this.transparent;
    const d = this.devRect(c.dx, c.dy, c.w, c.h);
    const sd = src.devRect(c.sx, c.sy, c.w, c.h);
    if (src === this && (needClear || this.backing.kind === 'tiled')) {
      // self copy with overlapping regions: stage through a scratch canvas first
      const s = gpuScratch.acquire(sd.w, sd.h);
      try {
        this.backing.pieces(sd, (img, px, py, w, h, gx, gy, css) => {
          if (img) s.ctx.drawImage(img, px, py, w, h, gx - sd.x, gy - sd.y, w, h);
          else if (css) { s.ctx.fillStyle = css; s.ctx.fillRect(gx - sd.x, gy - sd.y, w, h); }
        });
        this.backing.paint(d, (ctx, ox, oy) => {
          if (needClear) ctx.clearRect(d.x - ox, d.y - oy, d.w, d.h);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(s.canvas, 0, 0, sd.w, sd.h, d.x - ox, d.y - oy, d.w, d.h);
        }, false);
      } finally {
        gpuScratch.release(s);
      }
      this.touch();
      return;
    }
    const k = this.scale / src.scale;
    this.backing.paint(d, (ctx, ox, oy) => {
      if (needClear) ctx.clearRect(d.x - ox, d.y - oy, d.w, d.h);
      ctx.imageSmoothingEnabled = false;
      src.backing.pieces(sd, (img, px, py, w, h, gx, gy, css) => {
        const tx = d.x + (gx - sd.x) * k - ox, ty = d.y + (gy - sd.y) * k - oy;
        if (img) ctx.drawImage(img, px, py, w, h, tx, ty, w * k, h * k);
        else if (css) { ctx.fillStyle = css; ctx.fillRect(tx, ty, w * k, h * k); }
      });
    }, false);
    this.touch();
  }

  private copyMasked(src: BitmapData, sr: IRect, dx: number, dy: number, mask: BitmapData, ax: number, ay: number, merge: boolean): void {
    // Effective region in destination space: dest rect ∩ dest bounds ∩ mapped source bounds ∩ mapped mask bounds.
    const x0 = Math.max(dx, 0, dx - sr.x, dx - ax), y0 = Math.max(dy, 0, dy - sr.y, dy - ay);
    const x1 = Math.min(dx + sr.w, this._w, dx - sr.x + src._w, dx - ax + mask._w);
    const y1 = Math.min(dy + sr.h, this._h, dy - sr.y + src._h, dy - ay + mask._h);
    if (x1 <= x0 || y1 <= y0) return;
    if (this.pixelless || src.pixelless || mask.pixelless) { this.touch(); return; } // headless: no scratch canvases
    const w = x1 - x0, h = y1 - y0;
    const sx = sr.x + (x0 - dx), sy = sr.y + (y0 - dy);
    const mx = ax + (x0 - dx), my = ay + (y0 - dy);
    const d = this.devRect(x0, y0, w, h);
    const blend = merge || !this.transparent;
    // Compose source × mask alpha in a scratch at destination resolution.
    const s = gpuScratch.acquire(d.w, d.h);
    try {
      const sctx = s.ctx;
      sctx.imageSmoothingEnabled = false;
      const drawInto = (bmd: BitmapData, lx: number, ly: number): void => {
        const r = bmd.devRect(lx, ly, w, h);
        const k = this.scale / bmd.scale;
        bmd.backing.pieces(r, (img, px, py, pw, ph, gx, gy, css) => {
          const tx = (gx - r.x) * k, ty = (gy - r.y) * k;
          if (img) sctx.drawImage(img, px, py, pw, ph, tx, ty, pw * k, ph * k);
          else if (css) { sctx.fillStyle = css; sctx.fillRect(tx, ty, pw * k, ph * k); }
        });
      };
      drawInto(src, sx, sy);
      if (mask.transparent) {
        if (mask.backing.kind === 'canvas') {
          sctx.globalCompositeOperation = 'destination-in';
          drawInto(mask, mx, my);
        } else {
          // several mask pieces: flatten them first (destination-in with a partial image clears the rest)
          const m = gpuScratch.acquire(d.w, d.h);
          try {
            const r = mask.devRect(mx, my, w, h);
            const k = this.scale / mask.scale;
            m.ctx.imageSmoothingEnabled = false;
            mask.backing.pieces(r, (img, px, py, pw, ph, gx, gy, css) => {
              const tx = (gx - r.x) * k, ty = (gy - r.y) * k;
              if (img) m.ctx.drawImage(img, px, py, pw, ph, tx, ty, pw * k, ph * k);
              else if (css) { m.ctx.fillStyle = css; m.ctx.fillRect(tx, ty, pw * k, ph * k); }
            });
            sctx.globalCompositeOperation = 'destination-in';
            sctx.drawImage(m.canvas, 0, 0, d.w, d.h, 0, 0, d.w, d.h);
          } finally {
            gpuScratch.release(m);
          }
        }
        sctx.globalCompositeOperation = 'source-over';
      }
      this.backing.paint(d, (ctx, ox, oy) => {
        if (!blend) ctx.clearRect(d.x - ox, d.y - oy, d.w, d.h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(s.canvas, 0, 0, d.w, d.h, d.x - ox, d.y - oy, d.w, d.h);
      }, false);
    } finally {
      gpuScratch.release(s);
    }
    this.touch();
  }

  // ------------------------------------------------------------------------------------------------ draw

  draw(source: IDrawable | BitmapData, matrix?: Matrix, colorTransform?: ColorTransform, blendMode?: string | number,
    clipRect?: Rectangle, smoothing?: boolean): void {
    if (!this.live) return;
    const isBmd = isBitmapData(source);
    if (isBmd ? !source.live : !isDrawable(source)) return;
    const m = matrix && typeof matrix === 'object'
      ? new Matrix(Number(matrix.a), Number(matrix.b), Number(matrix.c), Number(matrix.d), twips(Number(matrix.tx)), twips(Number(matrix.ty)))
      : new Matrix();
    // a BitmapData source with a translation-only matrix is placed at tx/ty snapped DOWN to 1/4 px (oracle P3); a
    // tiled source (pieces) is kept pixel-aligned (floor) so its tiles cannot show anti-aliased seams
    if (isBmd && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) {
      const q = source.backing.kind === 'tiled' ? 1 : 4;
      m.tx = Math.floor(m.tx * q) / q; m.ty = Math.floor(m.ty * q) / q;
    }
    // canvas setTransform() silently ignores non-finite values: never draw with them
    if (![m.a, m.b, m.c, m.d, m.tx, m.ty].every(Number.isFinite)) return;
    const cx = colorTransform instanceof ColorTransform && !colorTransform.isIdentity() ? colorTransform : null;
    const blend = blendName(blendMode);
    const smooth = !!smoothing;
    if (isBmd && (blend === 'alpha' || blend === 'erase')) return;

    // Affected logical region: transformed source bounds ∩ clip ∩ bitmap.
    let bx0: number, by0: number, bx1: number, by1: number;
    if (isBmd) {
      ({ x0: bx0, y0: by0, x1: bx1, y1: by1 } = transformBounds(m, 0, 0, source._w, source._h));
    } else {
      const rb = typeof source.renderBounds === 'function' ? source.renderBounds() : null;
      const b = rb ?? source.contentBounds();
      if (!b || !(b.width > 0) || !(b.height > 0)) return;
      ({ x0: bx0, y0: by0, x1: bx1, y1: by1 } = transformBounds(m, b.x, b.y, b.width, b.height));
      // strokes/antialiasing (and, without renderBounds, children's filters) spill outside Flash bounds
      const margin = rb ? 1 : BitmapData.drawCullMargin;
      bx0 -= margin; by0 -= margin; bx1 += margin; by1 += margin;
      // the source's OWN filters are applied (P4): grow by their spill (device px at this scale -> logical)
      const own = (source as { $filters?: BitmapFilter[] | null }).$filters;
      if (own && own.length) {
        const p = filterPadding(own, this.scale), k = 1 / this.scale;
        bx0 -= p.left * k; by0 -= p.top * k; bx1 += p.right * k; by1 += p.bottom * k;
      }
    }
    let cx0 = 0, cy0 = 0, cx1 = this._w, cy1 = this._h;
    if (clipRect && typeof clipRect === 'object') {
      const r = { x: twips(Number(clipRect.x)), y: twips(Number(clipRect.y)), w: twips(Number(clipRect.width)), h: twips(Number(clipRect.height)) };
      if (!(r.w > 0) || !(r.h > 0)) return;
      cx0 = Math.max(cx0, r.x); cy0 = Math.max(cy0, r.y); cx1 = Math.min(cx1, r.x + r.w); cy1 = Math.min(cy1, r.y + r.h);
    }
    const s = this.scale;
    const clipDev: DRect = { x: Math.floor(cx0 * s), y: Math.floor(cy0 * s), w: 0, h: 0 };
    clipDev.w = Math.ceil(cx1 * s) - clipDev.x; clipDev.h = Math.ceil(cy1 * s) - clipDev.y;
    const areaDev: DRect = { x: Math.floor(bx0 * s), y: Math.floor(by0 * s), w: 0, h: 0 };
    areaDev.w = Math.ceil(bx1 * s) - areaDev.x; areaDev.h = Math.ceil(by1 * s) - areaDev.y;
    const R = drIntersect(clipDev, areaDev);
    if (!R) return;

    if (isBmd) this.drawBitmap(source, m, cx, blend, R, !!clipRect && typeof clipRect === 'object', smooth);
    else this.drawDrawable(source, m, cx, blend, R);
    this.touch();
  }

  private drawBitmap(src: BitmapData, m: Matrix, cx: ColorTransform | null, blend: string, R: DRect, userClip: boolean, smooth: boolean): void {
    if (src === this) {
      // drawing a bitmap into itself: work from a snapshot (tiles would otherwise be read after being overwritten)
      const snap = this.clone();
      try { this.drawBitmap(snap, m, cx, blend, R, userClip, smooth); } finally { snap.dispose(); }
      return;
    }
    const s = this.scale;
    const op = BLEND_MODES[blend] ?? 'source-over';
    let alpha = 1;
    let staged: CanvasPair | null = null;
    if (cx) {
      if (cx.isAlphaOnly() && cx.alphaMultiplier <= 1) alpha = cxAlphaOnlyFactor(cx);
      else staged = src.stagedWithCx(cx);
    }
    if (alpha <= 0) { if (staged) gpuScratch.release(staged); return; }
    const translationOnly = m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1;
    try {
      const tx = m.tx, ty = m.ty; // snapped to 1/4 px (or floored for tiled sources) for translation-only matrices (draw())
      const k = 1 / src.scale;
      const single = staged ? staged.canvas : src.backing.singleCanvas();
      if (translationOnly && src.scale === s && single && (!Number.isInteger(s * tx) || !Number.isInteger(s * ty))) {
        if (!staged && alpha === 1 && blend === 'normal' && src.hasClearBorder()) {
          // Coverage segments only differ from nearest placement on the outermost source pixels.
          // With a verified transparent border those segments paint nothing. Preserve Flash's
          // half-pixel tie direction, and submit the identical interior in one blit instead of nine.
          this.backing.paint(R, (ctx, ox, oy) => {
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(single, Math.ceil(s * tx - 0.5) - ox, Math.ceil(s * ty - 0.5) - oy);
          }, userClip);
          return;
        }
        // Flash: nearest-sampled interior, anti-aliased edges with coverage floor(c·255)/255 (oracle P3 drawBD)
        const px = coverageSegments(s * tx, src.deviceWidth), py = coverageSegments(s * ty, src.deviceHeight);
        this.backing.paint(R, (ctx, ox, oy) => {
          ctx.globalCompositeOperation = op as GlobalCompositeOperation;
          ctx.imageSmoothingEnabled = false;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          for (const a of py) {
            for (const b of px) {
              const c = a.cov * b.cov;
              if (c <= 0) continue;
              ctx.globalAlpha = alpha * (c >= 1 ? 1 : Math.floor(c * 255) / 255);
              ctx.drawImage(single, b.s, a.s, b.n, a.n, b.d - ox, a.d - oy, b.n, a.n);
            }
          }
        }, userClip);
        return;
      }
      this.backing.paint(R, (ctx, ox, oy) => {
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = op as GlobalCompositeOperation;
        ctx.imageSmoothingEnabled = translationOnly ? false : smooth;
        if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = 'low';
        ctx.setTransform(s * m.a * k, s * m.b * k, s * m.c * k, s * m.d * k, s * tx - ox, s * ty - oy);
        if (staged) {
          ctx.drawImage(staged.canvas, 0, 0, src.deviceWidth, src.deviceHeight, 0, 0, src.deviceWidth, src.deviceHeight);
        } else {
          src.backing.pieces({ x: 0, y: 0, w: src.deviceWidth, h: src.deviceHeight }, (img, px, py, w, h, gx, gy, css) => {
            if (img) ctx.drawImage(img, px, py, w, h, gx, gy, w, h);
            else if (css) { ctx.fillStyle = css; ctx.fillRect(gx, gy, w, h); }
          });
        }
      }, userClip);
    } finally {
      if (staged) gpuScratch.release(staged);
    }
  }

  private hasClearBorder(): boolean {
    if (!this.transparent || this.backing.kind !== 'canvas' || this.deviceWidth * this.deviceHeight > 262144) return false;
    let entry = clearBorders.get(this);
    if (!entry || entry.version !== this.version) {
      entry = {version: this.version, uses: 0}; clearBorders.set(this, entry);
    }
    if (entry.clear !== undefined) return entry.clear;
    // Avoid readback for mutable render targets and one-off draws. Static animation frames qualify quickly.
    if (++entry.uses < 8) return false;
    entry.clear = false;
    const w = this.deviceWidth, h = this.deviceHeight;
    try {
      const pixels = this.backing.read({x: 0, y: 0, w, h}).data, stride = w * 4;
      for (let x = 3; x < stride; x += 4) if (pixels[x] || pixels[(h - 1) * stride + x]) return false;
      for (let y = 1; y < h - 1; y++) if (pixels[y * stride + 3] || pixels[(y + 1) * stride - 1]) return false;
      entry.clear = true;
    } catch { /* A tainted canvas keeps the original draw-only path. */ }
    return entry.clear;
  }

  /** A scratch canvas holding this bitmap's pixels with a color transform applied (CPU). Caller releases it. */
  private stagedWithCx(cx: ColorTransform): CanvasPair {
    const all = { x: 0, y: 0, w: this.deviceWidth, h: this.deviceHeight };
    const img = this.backing.read(all);
    applyCxToImageData(img.data, cx);
    const s = gpuScratch.acquire(all.w, all.h);
    s.ctx.putImageData(img, 0, 0);
    return s;
  }

  private drawDrawable(src: IDrawable, m: Matrix, cx: ColorTransform | null, blend: string, R: DRect): void {
    const s = this.scale;
    const op = BLEND_MODES[blend];
    const render = (ctx: Ctx2D, ox: number, oy: number): void => {
      ctx.setTransform(s * m.a, s * m.b, s * m.c, s * m.d, s * m.tx - ox, s * m.ty - oy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.save();
      try { src.renderContent(ctx as CanvasRenderingContext2D, cx, s); } finally { ctx.restore(); }
    };
    if (blend === 'normal' || blend === 'layer' || op === undefined) {
      this.backing.paint(R, render, true);
      return;
    }
    // Non-normal blend: flatten the object into a layer first, then composite the layer.
    const layer = gpuScratch.acquire(R.w, R.h);
    try {
      render(layer.ctx, R.x, R.y);
      resetState(layer.ctx);
      if (blend === 'subtract') {
        this.compositeSubtract(layer, R);
        return;
      }
      this.backing.paint(R, (ctx, ox, oy) => {
        ctx.globalCompositeOperation = op as GlobalCompositeOperation;
        ctx.drawImage(layer.canvas, 0, 0, R.w, R.h, R.x - ox, R.y - oy, R.w, R.h);
      }, true);
    } finally {
      gpuScratch.release(layer);
    }
  }

  /** 'subtract' has no canvas equivalent: dst = max(0, dst - src) per colour channel (CPU). */
  private compositeSubtract(layer: CanvasPair, R: DRect): void {
    const q = drIntersect(R, { x: 0, y: 0, w: this.deviceWidth, h: this.deviceHeight });
    if (!q) return;
    const dst = this.backing.read(q);
    const srcImg = readViaScratch(layer.canvas, q.x - R.x, q.y - R.y, q.w, q.h);
    const d = dst.data, sd = srcImg.data;
    for (let i = 0; i < d.length; i += 4) {
      const sa = sd[i + 3]! / 255;
      if (sa === 0) continue;
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, d[i + c]! - sd[i + c]! * sa);
    }
    this.backing.write(dst, q.x, q.y);
  }

  // ------------------------------------------------------------------------------------------------ pixel I/O helpers

  /** Read a logical rect (clamped to the bitmap) as premultiplied pixels at device resolution (engine / tests). */
  readPixels(rect?: Rectangle): Pixels & { x: number; y: number } {
    const r = rect ? { x: Math.floor(rect.x), y: Math.floor(rect.y), w: Math.ceil(rect.width), h: Math.ceil(rect.height) } : { x: 0, y: 0, w: this._w, h: this._h };
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(this._w, r.x + r.w), y1 = Math.min(this._h, r.y + r.h);
    if (!this.live || x1 <= x0 || y1 <= y0) return { data: new Uint8ClampedArray(0), width: 0, height: 0, x: 0, y: 0 };
    const d = this.devRect(x0, y0, x1 - x0, y1 - y0);
    const img = this.backing.read(d);
    const data = new Uint8ClampedArray(img.data);
    premultiplyInPlace(data);
    return { data, width: d.w, height: d.h, x: d.x, y: d.y };
  }

  /** Replace device pixels (premultiplied) at device position (x, y). Engine helper. */
  writePixels(px: Pixels, x: number, y: number): void {
    if (!this.live) return;
    const img = newImageData(px.width, px.height);
    img.data.set(px.data);
    unpremultiplyInPlace(img.data);
    if (!this.transparent) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    this.backing.write(img, x, y);
    this.touch();
  }

  /** Process a device-space region in chunks: read (with padding), transform, then write all results. */
  private processRegion(src: BitmapData, srcDev: DRect, destDev: DRect, pad: { left: number; top: number; right: number; bottom: number },
    fn: (px: Pixels) => Pixels): void {
    const CH = 2048;
    const results: { img: ImageData; x: number; y: number }[] = [];
    for (let oy = 0; oy < destDev.h; oy += CH) {
      for (let ox = 0; ox < destDev.w; ox += CH) {
        const cw = Math.min(CH, destDev.w - ox), ch = Math.min(CH, destDev.h - oy);
        // input region in source device space (with padding), clipped to the source
        const ix = srcDev.x + ox - pad.left, iy = srcDev.y + oy - pad.top;
        const iw = cw + pad.left + pad.right, ih = ch + pad.top + pad.bottom;
        const buf = new Uint8ClampedArray(iw * ih * 4);
        const inter = drIntersect({ x: ix, y: iy, w: iw, h: ih }, { x: 0, y: 0, w: src.deviceWidth, h: src.deviceHeight });
        if (inter) {
          const img = src.backing.read(inter);
          const rowLen = inter.w * 4;
          for (let row = 0; row < inter.h; row++) {
            const so = row * rowLen;
            const doff = ((inter.y - iy + row) * iw + (inter.x - ix)) * 4;
            buf.set(img.data.subarray(so, so + rowLen), doff);
          }
          premultiplyInPlace(buf);
        }
        const out = fn({ data: buf, width: iw, height: ih });
        const img = newImageData(cw, ch);
        for (let row = 0; row < ch; row++) {
          const so = ((row + pad.top) * iw + pad.left) * 4;
          img.data.set(out.data.subarray(so, so + cw * 4), row * cw * 4);
        }
        unpremultiplyInPlace(img.data);
        if (!this.transparent) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        results.push({ img, x: destDev.x + ox, y: destDev.y + oy });
      }
    }
    for (const r of results) this.backing.write(r.img, r.x, r.y);
  }

  // ------------------------------------------------------------------------------------------------ applyFilter

  /** Returns 0 on success, -1 on invalid arguments, -2 if the source is not a BitmapData (AVM1 return codes). */
  applyFilter(sourceBitmap: BitmapData, sourceRect: Rectangle, destPoint: Point, filter: BitmapFilter): number {
    if (!this.live) return -1;
    if (!isBitmapData(sourceBitmap)) return -2;
    if (!sourceBitmap.live) return -3;
    if (!filter || typeof (filter as BitmapFilter).kind !== 'string' || !sourceRect || !destPoint) return -1;
    // AVM1: rect fields `as u32` (negative -> 0), point `as i32`
    const u = (v: unknown): number => { const n = Math.trunc(Number(v)); return n > 0 ? Math.min(n, 4294967295) : 0; };
    let sx = u(sourceRect.x), sy = u(sourceRect.y), w = u(sourceRect.width), h = u(sourceRect.height);
    let dx = ptCoord(destPoint.x), dy = ptCoord(destPoint.y);
    if (w === 0 || h === 0) return 0;
    // clamp source rect to source, dest to this (Flash clamp_with_intersection)
    if (sx + w > sourceBitmap._w) w = sourceBitmap._w - sx;
    if (sy + h > sourceBitmap._h) h = sourceBitmap._h - sy;
    if (dx < 0) { sx -= dx; w += dx; dx = 0; }
    if (dy < 0) { sy -= dy; h += dy; dy = 0; }
    if (dx + w > this._w) w = this._w - dx;
    if (dy + h > this._h) h = this._h - dy;
    if (w <= 0 || h <= 0) return 0;
    if (this.backing.kind === 'null' || sourceBitmap.backing.kind === 'null') { this.touch(); return 0; }

    if (this.tryFastColorMatrix(sourceBitmap, filter, sx, sy, dx, dy, w, h)) { this.touch(); return 0; }
    if (filter.kind === 'colorMatrix' && sourceBitmap.scale === this.scale) {
      this.colorMatrixCPU(sourceBitmap, (filter as ColorMatrixFilter).matrix, sourceBitmap.devRect(sx, sy, w, h), this.devRect(dx, dy, w, h));
      this.touch();
      return 0;
    }

    if (filter.kind !== 'colorMatrix' && glFiltersEnabled() && this.applyFilterGL(sourceBitmap, filter, sx, sy, w, h, dx, dy)) {
      this.touch();
      return 0;
    }
    const scale = sourceBitmap.scale;
    const pad = filterPadding([filter], scale);
    const srcDev = sourceBitmap.devRect(sx, sy, w, h);
    let destDev = this.devRect(dx, dy, w, h);
    if (sourceBitmap.scale !== this.scale) {
      // different resolutions: filter at source resolution into a temporary bitmap, then copy (nearest)
      const tmp = new BitmapData(w, h, this.transparent, 0, { scale: sourceBitmap.scale });
      tmp.processRegion(sourceBitmap, srcDev, tmp.devRect(0, 0, w, h), pad, (px) => applyFilterToPixels(px, filter, scale));
      this.copyPlain(tmp, { x: 0, y: 0, w, h }, dx, dy, false);
      tmp.dispose();
      return 0;
    }
    destDev = { x: destDev.x, y: destDev.y, w: srcDev.w, h: srcDev.h };
    this.processRegion(sourceBitmap, srcDev, destDev, pad, (px) => applyFilterToPixels(px, filter, scale));
    this.touch();
    return 0;
  }

  /**
   * applyFilter on the WebGL2 backend: the padded source region is staged into a GPU scratch canvas (pieces, no
   * readback), filtered by glFilterImage and drawn back over the destination rect (replace semantics; opaque targets get
   * un-premultiplied colour with alpha 255, like processRegion). Returns false when GL is unavailable for this call.
   */
  private applyFilterGL(src: BitmapData, filter: BitmapFilter, sx: number, sy: number, w: number, h: number, dx: number, dy: number): boolean {
    const scale = src.scale;
    const pad = filterPadding([filter], scale);
    const srcDev = src.devRect(sx, sy, w, h);
    const ix = srcDev.x - pad.left, iy = srcDev.y - pad.top;
    const iw = srcDev.w + pad.left + pad.right, ih = srcDev.h + pad.top + pad.bottom;
    const inter = drIntersect({ x: ix, y: iy, w: iw, h: ih }, { x: 0, y: 0, w: src.deviceWidth, h: src.deviceHeight });
    const single = src.backing.singleCanvas();
    // single-canvas source: upload the region straight from it into a padded frame (no staging canvas / extra flush)
    const stage = single ? null : gpuScratch.acquire(iw, ih);
    try {
      let out: CanvasImageSource | null;
      const opts = { opaque: !this.transparent };
      if (single) {
        out = inter
          ? glFilterImage(single, inter.x, inter.y, inter.w, inter.h, [filter], scale, opts, { w: iw, h: ih, x: inter.x - ix, y: inter.y - iy })
          : glFilterImage(single, 0, 0, 0, 0, [filter], scale, opts, { w: iw, h: ih, x: 0, y: 0 });
      } else {
        if (inter) {
          stage!.ctx.imageSmoothingEnabled = false;
          src.backing.pieces(inter, (img, px, py, pw, ph, gx, gy, css) => {
            if (img) stage!.ctx.drawImage(img, px, py, pw, ph, gx - ix, gy - iy, pw, ph);
            else if (css) { stage!.ctx.fillStyle = css; stage!.ctx.fillRect(gx - ix, gy - iy, pw, ph); }
          });
        }
        out = glFilterImage(stage!.canvas, 0, 0, iw, ih, [filter], scale, opts);
      }
      if (!out) return false;
      const res = out;
      const dest: DRect = src.scale === this.scale
        ? { x: this.dev(dx), y: this.dev(dy), w: srcDev.w, h: srcDev.h }
        : this.devRect(dx, dy, w, h);
      this.backing.paint(dest, (ctx, ox, oy) => {
        ctx.clearRect(dest.x - ox, dest.y - oy, dest.w, dest.h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(res, pad.left, pad.top, srcDev.w, srcDev.h, dest.x - ox, dest.y - oy, dest.w, dest.h);
      }, true);
      return true;
    } finally {
      if (stage) gpuScratch.release(stage);
    }
  }

  /**
   * GPU fast path for the in-game brightness flash (CWorld.Process_Brightness): an in-place ColorMatrixFilter with
   * identity multipliers and non-negative integer RGB offsets.
   *   - opaque bitmap: additive fill ('lighter') — exact (clamp(c + o)).
   *   - transparent bitmap: save the region, additive fill, then 'destination-in' with the saved copy to restore the
   *     alpha. Exact for fully transparent and fully opaque pixels (the DeathMatch bmDraw only has those when the filter
   *     runs); for partially transparent pixels it yields min(255, R + o)·a/255 instead of Flash's min(a, R + o·a/255).
   */
  private tryFastColorMatrix(src: BitmapData, filter: BitmapFilter, sx: number, sy: number, dx: number, dy: number, w: number, h: number): boolean {
    if (filter.kind !== 'colorMatrix' || src !== this || sx !== dx || sy !== dy) return false;
    const m = (filter as ColorMatrixFilter).matrix.map(Number);
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const mult = [m[0], m[1], m[2], m[3], m[5], m[6], m[7], m[8], m[10], m[11], m[12], m[13], m[15], m[16], m[17], m[18]];
    if (mult.some((v, i) => v !== id[i]) || m[19] !== 0) return false;
    const offs = [m[4]!, m[9]!, m[14]!];
    if (offs.some((o) => !(o >= 0) || Math.abs(o - Math.round(o)) > 1e-6)) return false;
    const [r, g, b] = offs.map((o) => Math.min(255, Math.round(o)));
    if (r === 0 && g === 0 && b === 0) return true;
    const d = this.devRect(dx, dy, w, h);
    const add = (ctx: Ctx2D, ox: number, oy: number): void => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(d.x - ox, d.y - oy, d.w, d.h);
    };
    if (!this.transparent) {
      this.backing.paint(d, add, false);
      return true;
    }
    const saved = gpuScratch.acquire(d.w, d.h);
    try {
      this.backing.pieces(d, (img, px, py, pw, ph, gx, gy, css) => {
        if (img) saved.ctx.drawImage(img, px, py, pw, ph, gx - d.x, gy - d.y, pw, ph);
        else if (css) { saved.ctx.fillStyle = css; saved.ctx.fillRect(gx - d.x, gy - d.y, pw, ph); }
      });
      this.backing.paint(d, (ctx, ox, oy) => {
        add(ctx, ox, oy);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(saved.canvas, 0, 0, d.w, d.h, d.x - ox, d.y - oy, d.w, d.h);
      }, true);
    } finally {
      gpuScratch.release(saved);
    }
    return true;
  }

  /**
   * ColorMatrixFilter on the CPU directly in the un-premultiplied domain of canvas ImageData (the domain Flash's
   * colour matrix works in) — no premultiply round trip, no padding copies.
   */
  private colorMatrixCPU(src: BitmapData, matrix: readonly number[], srcDev: DRect, destDev: DRect): void {
    const M = new Float32Array(20);
    for (let i = 0; i < 20; i++) M[i] = Number(matrix[i]) || 0;
    const opaque = !this.transparent;
    const CH = 2048;
    const out: { img: ImageData; x: number; y: number }[] = [];
    for (let oy = 0; oy < srcDev.h; oy += CH) {
      for (let ox = 0; ox < srcDev.w; ox += CH) {
        const r = { x: srcDev.x + ox, y: srcDev.y + oy, w: Math.min(CH, srcDev.w - ox), h: Math.min(CH, srcDev.h - oy) };
        const img = src.backing.read(r);
        const d = img.data;
        const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19] = M as unknown as number[];
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i]!, G = d[i + 1]!, B = d[i + 2]!, A = d[i + 3]!;
          // Flash floors the matrix result (oracle P5); the Uint8ClampedArray store clamps
          d[i] = Math.floor(m0! * R + m1! * G + m2! * B + m3! * A + m4!);
          d[i + 1] = Math.floor(m5! * R + m6! * G + m7! * B + m8! * A + m9!);
          d[i + 2] = Math.floor(m10! * R + m11! * G + m12! * B + m13! * A + m14!);
          d[i + 3] = opaque ? 255 : Math.floor(m15! * R + m16! * G + m17! * B + m18! * A + m19!);
        }
        out.push({ img, x: destDev.x + ox, y: destDev.y + oy });
      }
    }
    for (const o of out) this.backing.write(o.img, o.x, o.y);
  }

  /** Rectangle affected by applyFilter(this-sized source rect, filter), in logical pixels. */
  generateFilterRect(sourceRect: Rectangle, filter: BitmapFilter): Rectangle {
    if (!this.live || !sourceRect || !filter) return new Rectangle(0, 0, 0, 0);
    const p = filterPadding([filter], 1);
    return new Rectangle(sourceRect.x - p.left, sourceRect.y - p.top, sourceRect.width + p.left + p.right, sourceRect.height + p.top + p.bottom);
  }

  // ------------------------------------------------------------------------------------------------ paletteMap

  paletteMap(sourceBitmap: BitmapData, sourceRect: Rectangle, destPoint: Point, redArray?: number[] | null, greenArray?: number[] | null,
    blueArray?: number[] | null, alphaArray?: number[] | null): void {
    if (!this.live || !isBitmapData(sourceBitmap) || !sourceBitmap.live) return;
    const sr = rectArg(sourceRect);
    if (!sr || !destPoint) return;
    const c = this.clampCopy(sourceBitmap, sr, ptCoord(destPoint.x), ptCoord(destPoint.y));
    if (!c) return;
    if (this.pixelless || sourceBitmap.pixelless) { this.touch(); return; }
    const table = (arr: number[] | null | undefined, shift: number): Uint32Array => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) t[i] = arr && typeof arr === 'object' ? toUint32(arr[i]) : (i << shift) >>> 0;
      return t;
    };
    const R = table(redArray, 16), G = table(greenArray, 8), B = table(blueArray, 0), A = table(alphaArray, 24);
    if (this.backing.kind === 'null' || sourceBitmap.backing.kind === 'null') { this.touch(); return; }
    const opaque = !this.transparent;
    const map = (px: Pixels): Pixels => {
      const d = px.data;
      unpremultiplyFlashInPlace(d);
      for (let i = 0; i < d.length; i += 4) {
        const v = (R[d[i]!]! + G[d[i + 1]!]! + B[d[i + 2]!]! + A[d[i + 3]!]!) >>> 0;
        const a = opaque ? 255 : v >>> 24;
        d[i] = (v >>> 16) & 0xff; d[i + 1] = (v >>> 8) & 0xff; d[i + 2] = v & 0xff; d[i + 3] = a;
      }
      premultiplyInPlace(d);
      return px;
    };
    const srcDev = sourceBitmap.devRect(c.sx, c.sy, c.w, c.h);
    if (sourceBitmap.scale !== this.scale) {
      const tmp = new BitmapData(c.w, c.h, this.transparent, 0, { scale: sourceBitmap.scale });
      tmp.processRegion(sourceBitmap, srcDev, tmp.devRect(0, 0, c.w, c.h), { left: 0, top: 0, right: 0, bottom: 0 }, map);
      this.copyPlain(tmp, { x: 0, y: 0, w: c.w, h: c.h }, c.dx, c.dy, false);
      tmp.dispose();
      return;
    }
    this.processRegion(sourceBitmap, srcDev, this.devRect(c.dx, c.dy, c.w, c.h), { left: 0, top: 0, right: 0, bottom: 0 }, map);
    this.touch();
  }

  // ------------------------------------------------------------------------------------------------ colorTransform

  colorTransform(rect: Rectangle, cx: ColorTransform): void {
    if (!this.live || !(cx instanceof ColorTransform)) return;
    // Flash bug: only an alpha multiplier >= 1 (no offsets) has no effect.
    if (cx.redMultiplier === 1 && cx.greenMultiplier === 1 && cx.blueMultiplier === 1 && cx.alphaMultiplier >= 1 &&
      cx.redOffset === 0 && cx.greenOffset === 0 && cx.blueOffset === 0 && cx.alphaOffset === 0) return;
    const r = rectArg(rect);
    if (!r) return;
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(this._w, r.x + r.w), y1 = Math.min(this._h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) return;
    if (this.backing.kind !== 'null') {
      const d = this.devRect(x0, y0, x1 - x0, y1 - y0);
      const opaque = !this.transparent;
      this.processRegion(this, d, d, { left: 0, top: 0, right: 0, bottom: 0 }, (px) => {
        unpremultiplyFlashInPlace(px.data);
        applyCxToImageData(px.data, cx);
        if (opaque) for (let i = 3; i < px.data.length; i += 4) px.data[i] = 255;
        premultiplyInPlace(px.data);
        return px;
      });
    }
    this.touch();
  }

  // ------------------------------------------------------------------------------------------------ pixels

  private readPixelARGB(x: number, y: number): number {
    const img = this.backing.read({ x: this.dev(x), y: this.dev(y), w: 1, h: 1 });
    const d = img.data;
    // canvas ImageData is un-premultiplied with round-to-nearest (lossless): recover the stored premultiplied value,
    // then un-premultiply it the way Flash's getPixel32 does
    const a = d[3]!;
    const fl = (c: number): number => (a === 0 || a === 255 ? c : unpremul(premul(c, a), a));
    return ((a << 24) | (fl(d[0]!) << 16) | (fl(d[1]!) << 8) | fl(d[2]!)) >>> 0;
  }

  /** RGB of the pixel (un-premultiplied, no alpha). Out of bounds -> 0. */
  getPixel(x: number, y: number): number {
    if (!this.live) return -1;
    const px = toUint32(x), py = toUint32(y);
    if (px >= this._w || py >= this._h) return 0;
    return this.readPixelARGB(px, py) & 0xffffff;
  }

  /** ARGB of the pixel as a SIGNED 32-bit number (AVM1). Out of bounds -> 0. */
  getPixel32(x: number, y: number): number {
    if (!this.live) return -1;
    const px = toUint32(x), py = toUint32(y);
    if (px >= this._w || py >= this._h) return 0;
    let c = this.readPixelARGB(px, py);
    if (!this.transparent) c = (c | 0xff000000) >>> 0;
    return c | 0;
  }

  setPixel32(x: number, y: number, color: number): void {
    if (!this.live) return;
    const px = toUint32(x), py = toUint32(y);
    if (px >= this._w || py >= this._h) return;
    let c = toUint32(color);
    if (!this.transparent) c = (c | 0xff000000) >>> 0;
    this.backing.fill(this.devRect(px, py, 1, 1), c);
    this.touch();
  }

  /** Sets RGB, keeping the pixel's alpha (transparent bitmaps). */
  setPixel(x: number, y: number, color: number): void {
    if (!this.live) return;
    const px = toUint32(x), py = toUint32(y);
    if (px >= this._w || py >= this._h) return;
    const rgb = toUint32(color) & 0xffffff;
    const a = this.transparent ? argbAlpha(this.readPixelARGB(px, py)) : 255;
    this.backing.fill(this.devRect(px, py, 1, 1), ((a << 24) | rgb) >>> 0);
    this.touch();
  }

  clone(): BitmapData {
    const b = Object.create(BitmapData.prototype) as BitmapData;
    const fields = b as unknown as Record<string, unknown>;
    fields._w = this._w; fields._h = this._h; fields.transparent = this.transparent; fields.scale = this.scale;
    fields.alphaOnly = this.alphaOnly; fields.version = 0; fields.disposed = false; fields.valid = this.valid;
    fields.id = nextId++;
    fields.backing = this.live ? (this.backing.kind === 'null' ? new NullBacking() : this.backing.clone()) : new NullBacking();
    return b;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.backing.dispose();
    this.backing = new NullBacking();
    this.touch();
  }

  // ------------------------------------------------------------------ engine-only API (not Flash)

  /**
   * Blit a logical sub-rectangle of this bitmap into a 2D context whose transform maps logical px -> device px.
   * Used by the Bitmap display object (attachBitmap) and by presenters. Handles tiled backings (one drawImage per
   * intersected tile; pieces are placed at exact tile boundaries, so use integer-aligned transforms to avoid seams).
   */
  drawTo(ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number,
    dw: number = sw, dh: number = sh, smoothing = false): void {
    if (!this.live || sw <= 0 || sh <= 0) return;
    const s = this.scale;
    const r: DRect = { x: Math.floor(sx * s), y: Math.floor(sy * s), w: 0, h: 0 };
    r.w = Math.ceil((sx + sw) * s) - r.x; r.h = Math.ceil((sy + sh) * s) - r.y;
    const kx = dw / (sw * s), ky = dh / (sh * s);
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = smoothing;
    try {
      this.backing.pieces(r, (img, px, py, w, h, gx, gy, css) => {
        const tx = dx + (gx - sx * s) * kx, ty = dy + (gy - sy * s) * ky;
        if (img) ctx.drawImage(img, px, py, w, h, tx, ty, w * kx, h * ky);
        else if (css) { const f = ctx.fillStyle; ctx.fillStyle = css; ctx.fillRect(tx, ty, w * kx, h * ky); ctx.fillStyle = f; }
      });
    } finally {
      ctx.imageSmoothingEnabled = prevSmooth;
    }
  }

  /**
   * A single image source holding all pixels (device resolution), e.g. for createPattern(). Non-tiled bitmaps return
   * their own canvas (do not draw into it); tiled bitmaps are composed into a new canvas (expensive).
   */
  toImageSource(): CanvasImageSource | null {
    if (!this.live || this.backing.kind === 'null') return null;
    const c = this.backing.singleCanvas();
    if (c) return c;
    const out = createCanvas(this.deviceWidth, this.deviceHeight, this.transparent);
    this.backing.pieces({ x: 0, y: 0, w: this.deviceWidth, h: this.deviceHeight }, (img, px, py, w, h, gx, gy, css) => {
      if (img) out.ctx.drawImage(img, px, py, w, h, gx, gy, w, h);
      else if (css) { out.ctx.fillStyle = css; out.ctx.fillRect(gx, gy, w, h); }
    });
    return out.canvas;
  }

  /**
   * Engine: create a bitmap from a decoded image (library bitmaps). The image is drawn scaled by `scale`
   * (nearest-neighbour unless `smoothing`).
   */
  static fromImageSource(img: CanvasImageSource, width: number, height: number, transparent = true,
    options?: BitmapDataOptions & { smoothing?: boolean }): BitmapData {
    const b = new BitmapData(width, height, transparent, 0, options);
    if (!b.live || b.backing.kind === 'null') return b;
    const s = b.scale;
    b.backing.paint({ x: 0, y: 0, w: b.deviceWidth, h: b.deviceHeight }, (ctx, ox, oy) => {
      ctx.imageSmoothingEnabled = !!options?.smoothing;
      ctx.drawImage(img, -ox, -oy, width * s, height * s);
    }, false);
    b.touch();
    return b;
  }
}
