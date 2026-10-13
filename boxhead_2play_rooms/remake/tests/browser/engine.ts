/**
 * Browser checks for the canvas-backed BitmapData (scale 1, scale 2, tiled), filters and Graphics.
 * Loaded by tests/browser/engine.html; driven by tests/browser/run-engine.ts (playwright-core + installed Chrome).
 * Results go to window.__engineResults; PNG snapshots (base64) to window.__engineSnapshots.
 */
import { BitmapData, type IDrawable } from '../../src/engine/flash/BitmapData.ts';
import { Graphics } from '../../src/engine/flash/Graphics.ts';
import { ColorTransform, Matrix, Point, Rectangle } from '../../src/engine/flash/geom.ts';
import {
  BevelFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter, type BitmapFilter,
} from '../../src/engine/flash/filters.ts';
import { applyFiltersToPixels } from '../../src/engine/flash/filters/apply.ts';

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
const snapshots: Record<string, string> = {};
const perf: Record<string, number> = {};
const logEl = document.getElementById('log')!;

function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  logEl.innerHTML += `<span class="${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span> ${name}${detail ? ' — ' + detail : ''}\n`;
}

const hex = (v: number): string => '0x' + (v >>> 0).toString(16).padStart(8, '0');
/** ARGB comparison with per-channel tolerance. */
function near(a: number, b: number, tol = 2): boolean {
  for (let s = 0; s < 32; s += 8) if (Math.abs(((a >>> s) & 0xff) - ((b >>> s) & 0xff)) > tol) return false;
  return true;
}
function expectPixel(name: string, bmd: BitmapData, x: number, y: number, want: number, tol = 2): void {
  const got = bmd.getPixel32(x, y) >>> 0;
  check(name, near(got, want, tol), `(${x},${y}) got ${hex(got)} want ${hex(want)}`);
}

interface Config { label: string; scale: number; tiled: boolean }
const CONFIGS: Config[] = [
  { label: '1x', scale: 1, tiled: false },
  { label: '2x', scale: 2, tiled: false },
  { label: '2x-tiled', scale: 2, tiled: true },
];

function withConfig<T>(cfg: Config, fn: () => T): T {
  const saved = [BitmapData.defaultScale, BitmapData.maxCanvasSize, BitmapData.tileSize] as const;
  BitmapData.defaultScale = cfg.scale;
  if (cfg.tiled) { BitmapData.maxCanvasSize = 48; BitmapData.tileSize = 32; }
  try { return fn(); } finally { [BitmapData.defaultScale, BitmapData.maxCanvasSize, BitmapData.tileSize] = saved; }
}

async function snapshot(name: string, bmd: BitmapData, zoom = 1): Promise<void> {
  const c = document.createElement('canvas');
  c.width = Math.round(bmd.width * zoom * bmd.scale);
  c.height = Math.round(bmd.height * zoom * bmd.scale);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(zoom * bmd.scale, 0, 0, zoom * bmd.scale, 0, 0);
  bmd.drawTo(ctx, 0, 0, bmd.width, bmd.height, 0, 0);
  const title = document.createElement('div');
  title.textContent = name;
  document.getElementById('snaps')!.append(title, c);
  snapshots[name] = c.toDataURL('image/png').split(',')[1]!;
}

/** A display-object stand-in: draws a solid rect (local 0,0..w,h) and records render calls. */
class RectDrawable implements IDrawable {
  calls = 0;
  constructor(public w: number, public h: number, public color: string) {}
  renderContent(ctx: CanvasRenderingContext2D, cx: ColorTransform | null): void {
    this.calls++;
    ctx.fillStyle = this.color;
    ctx.globalAlpha *= cx ? cx.alphaMultiplier : 1;
    ctx.fillRect(0, 0, this.w, this.h);
  }
  contentBounds(): Rectangle { return new Rectangle(0, 0, this.w, this.h); }
}

/** Wrap a Graphics as an IDrawable. */
class GraphicsDrawable implements IDrawable {
  constructor(public g: Graphics) {}
  renderContent(ctx: CanvasRenderingContext2D, cx: ColorTransform | null, s: number): void { this.g.render(ctx, cx, s); }
  contentBounds(): Rectangle { return this.g.bounds() ?? new Rectangle(); }
}

// ------------------------------------------------------------------------------------------------ per-config checks

function basics(cfg: Config): void {
  const L = cfg.label;
  const t = new BitmapData(40, 30, true, 0x80ff0000);
  check(`${L} backing kind`, t.backingKind === (cfg.tiled ? 'tiled' : 'canvas'), t.backingKind);
  expectPixel(`${L} transparent fill colour (premultiplied storage)`, t, 5, 5, 0x80ff0000);
  const o = new BitmapData(40, 30, false, 0x12345678);
  expectPixel(`${L} opaque fill forces alpha FF`, o, 39, 29, 0xff345678, 0);
  check(`${L} getPixel32 is a signed int`, o.getPixel32(0, 0) === (0xff345678 | 0), String(o.getPixel32(0, 0)));
  check(`${L} getPixel drops alpha`, o.getPixel(0, 0) === 0x345678);

  // fillRect replaces (no compositing), alpha included
  t.fillRect(new Rectangle(10, 10, 5, 5), 0x00000000);
  expectPixel(`${L} fillRect transparent clears`, t, 12, 12, 0x00000000, 0);
  t.fillRect(new Rectangle(10, 10, 5, 5), 0x4000ff00);
  expectPixel(`${L} fillRect semi-transparent replaces`, t, 14, 14, 0x4000ff00, 3);
  expectPixel(`${L} fillRect leaves outside`, t, 15, 15, 0x80ff0000);
  o.fillRect(new Rectangle(-5, -5, 10, 10), 0x00ffffff);
  expectPixel(`${L} fillRect on opaque forces alpha, clips to bounds`, o, 0, 0, 0xffffffff, 0);
  expectPixel(`${L} fillRect clip edge`, o, 5, 5, 0xff345678, 0);

  // setPixel32 / setPixel
  o.setPixel32(20, 20, 0x00abcdef);
  expectPixel(`${L} setPixel32 opaque`, o, 20, 20, 0xffabcdef, 0);
  t.setPixel32(30, 20, 0x80123456);
  expectPixel(`${L} setPixel32 transparent`, t, 30, 20, 0x80123456, 4);
  t.setPixel(30, 20, 0xffffff);
  expectPixel(`${L} setPixel keeps alpha`, t, 30, 20, 0x80ffffff, 2);

  // clone
  const c = t.clone();
  expectPixel(`${L} clone copies pixels`, c, 14, 14, 0x4000ff00, 3);
  c.fillRect(c.rectangle, 0);
  expectPixel(`${L} clone is independent`, t, 5, 5, 0x80ff0000);
}

function copyPixelsChecks(cfg: Config): void {
  const L = cfg.label;
  const src = new BitmapData(20, 20, true, 0);
  src.fillRect(new Rectangle(5, 5, 10, 10), 0x8000ff00);
  // no merge: replace (dest blue becomes half green; transparent source pixels clear the dest)
  const d1 = new BitmapData(40, 40, true, 0xff0000ff);
  d1.copyPixels(src, new Rectangle(0, 0, 20, 20), new Point(10, 10));
  expectPixel(`${L} copyPixels replace: copied pixel`, d1, 20, 20, 0x8000ff00, 3);
  expectPixel(`${L} copyPixels replace: transparent source clears`, d1, 11, 11, 0x00000000, 0);
  expectPixel(`${L} copyPixels replace: outside untouched`, d1, 5, 5, 0xff0000ff, 0);
  // merge: composite over
  const d2 = new BitmapData(40, 40, true, 0xff0000ff);
  d2.copyPixels(src, new Rectangle(0, 0, 20, 20), new Point(10, 10), undefined, undefined, true);
  expectPixel(`${L} copyPixels mergeAlpha composites`, d2, 20, 20, 0xff007f80, 3);
  expectPixel(`${L} copyPixels mergeAlpha keeps dest under transparent src`, d2, 11, 11, 0xff0000ff, 0);
  // transparent source into an opaque bitmap always blends
  const d3 = new BitmapData(40, 40, false, 0xff0000ff);
  d3.copyPixels(src, new Rectangle(0, 0, 20, 20), new Point(10, 10));
  expectPixel(`${L} copyPixels into opaque blends`, d3, 20, 20, 0xff007f80, 3);
  // fractional / negative destination points truncate toward zero; clipping
  const d4 = new BitmapData(40, 40, true, 0);
  d4.copyPixels(src, new Rectangle(5, 5, 10, 10), new Point(2.7, 3.2));
  expectPixel(`${L} copyPixels truncates fractional destPoint (x)`, d4, 2, 3, 0x8000ff00, 3);
  expectPixel(`${L} copyPixels truncates fractional destPoint (outside)`, d4, 1, 3, 0, 0);
  d4.copyPixels(src, new Rectangle(5, 5, 10, 10), new Point(-8.9, 30));
  expectPixel(`${L} copyPixels negative destPoint clips`, d4, 1, 30, 0x8000ff00, 3);
  expectPixel(`${L} copyPixels negative destPoint clips (end)`, d4, 2, 30, 0, 0);
  // self copy, overlapping (scroll right by 3)
  const s = new BitmapData(30, 10, true, 0);
  s.fillRect(new Rectangle(0, 0, 10, 10), 0xffff0000);
  s.copyPixels(s, new Rectangle(0, 0, 20, 10), new Point(3, 0));
  expectPixel(`${L} self copy overlapping`, s, 12, 5, 0xffff0000, 0);
  expectPixel(`${L} self copy overlapping (cleared by transparent source)`, s, 13, 5, 0, 0);
  expectPixel(`${L} self copy keeps the unshifted part`, s, 1, 5, 0xffff0000, 0);
  // alphaBitmap: alpha multiplied, region outside the alpha bitmap untouched
  const mask = new BitmapData(15, 20, true, 0x80000000);
  mask.fillRect(new Rectangle(0, 0, 15, 10), 0xff000000);
  const d5 = new BitmapData(40, 40, true, 0xff0000ff);
  const solid = new BitmapData(20, 20, true, 0xffff0000);
  d5.copyPixels(solid, solid.rectangle, new Point(10, 10), mask, new Point(0, 0), false);
  expectPixel(`${L} alphaBitmap: opaque mask copies`, d5, 12, 12, 0xffff0000, 0);
  expectPixel(`${L} alphaBitmap: half mask (replace)`, d5, 12, 25, 0x80ff0000, 3);
  expectPixel(`${L} alphaBitmap: outside mask untouched`, d5, 26, 12, 0xff0000ff, 0);
  const d6 = new BitmapData(40, 40, true, 0xff0000ff);
  d6.copyPixels(solid, solid.rectangle, new Point(10, 10), mask, new Point(0, 0)); // mergeAlpha defaults to true
  expectPixel(`${L} alphaBitmap: half mask merges by default`, d6, 12, 25, 0xff7f0080, 3);
}

function drawChecks(cfg: Config): void {
  const L = cfg.label;
  const src = new BitmapData(4, 4, true, 0);
  src.setPixel32(0, 0, 0xffff0000);
  src.setPixel32(1, 0, 0xff00ff00);
  const d = new BitmapData(40, 40, true, 0);
  d.draw(src, new Matrix(2, 0, 0, 2, 10, 10));
  expectPixel(`${L} draw scaled (nearest) [0]`, d, 11, 11, 0xffff0000, 0);
  expectPixel(`${L} draw scaled (nearest) [1]`, d, 12, 10, 0xff00ff00, 0);
  // translation-only: tx/ty snap DOWN to 1/4 px (20.9 -> 20.75, 20.2 -> 20), nearest sampling, coverage edges (oracle P3)
  d.draw(src, new Matrix(1, 0, 0, 1, 20.9, 20.2));
  expectPixel(`${L} draw translation-only: quarter-pixel snap, interior`, d, 21, 20, 0xffff0000, 0);
  // at 2x the backing resolves the quarter pixels: getPixel32 reads the device pixel at (2x, 2y)
  const one = cfg.scale === 1;
  expectPixel(`${L} draw translation-only: quarter-pixel snap, edge coverage`, d, 20, 20, one ? 0x40ff0000 : 0, 3);
  {
    // P3 golden drawBD:10.5 / 10.25: 5-px red row -> 7F | FF FF FF FF | 7F  and  BF | FF.. | 3F
    const row = new BitmapData(5, 1, true, 0xffff0000);
    const t = new BitmapData(20, 4, true, 0);
    t.draw(row, new Matrix(1, 0, 0, 1, 10.5, 1));
    expectPixel(`${L} draw at x 10.5: left edge 50%`, t, 10, 1, one ? 0x7fff0000 : 0, 3);
    expectPixel(`${L} draw at x 10.5: interior`, t, 12, 1, 0xffff0000, 0);
    expectPixel(`${L} draw at x 10.5: right edge 50%`, t, 15, 1, one ? 0x7fff0000 : 0xffff0000, 3);
    const t2 = new BitmapData(20, 4, true, 0);
    t2.draw(row, new Matrix(1, 0, 0, 1, 10.4999, 1));
    expectPixel(`${L} draw at x 10.4999 (-> 10.25): left edge 75%`, t2, 10, 1, one ? 0xbfff0000 : 0x7fff0000, 3);
    expectPixel(`${L} draw at x 10.4999 (-> 10.25): right edge 25%`, t2, 15, 1, one ? 0x3fff0000 : 0x7fff0000, 3);
  }
  d.draw(src, new Matrix(1, 0, 0, 1, 30, 0), new ColorTransform(1, 1, 1, 0.5));
  expectPixel(`${L} draw alpha colorTransform`, d, 30, 0, 0x80ff0000, 3);
  d.draw(src, new Matrix(1, 0, 0, 1, 30, 10), new ColorTransform(0, 1, 1, 1, 0, 0, 255, 0));
  expectPixel(`${L} draw tint colorTransform (CPU path)`, d, 30, 10, 0xff0000ff, 0);
  d.draw(src, new Matrix(4, 0, 0, 4, 0, 24), undefined, 'normal', new Rectangle(0, 24, 2, 2));
  expectPixel(`${L} draw clipRect (inside)`, d, 1, 25, 0xffff0000, 0);
  expectPixel(`${L} draw clipRect (outside)`, d, 2, 25, 0, 0);
  // IDrawable across tiles
  const r = new RectDrawable(30, 20, 'rgb(255,128,0)');
  const big = new BitmapData(60, 50, true, 0);
  big.draw(r, new Matrix(1, 0, 0, 1, 5, 7));
  expectPixel(`${L} draw(IDrawable) top-left`, big, 5, 7, 0xffff8000, 0);
  expectPixel(`${L} draw(IDrawable) bottom-right`, big, 34, 26, 0xffff8000, 0);
  expectPixel(`${L} draw(IDrawable) outside`, big, 35, 26, 0, 0);
  if (cfg.tiled) check(`${L} draw(IDrawable) renders once per touched tile only`, r.calls > 1 && r.calls < 20 && big.allocatedTiles === r.calls, `calls=${r.calls} tiles=${big.allocatedTiles}`);
  // opaque target + semi-transparent draw composites over existing pixels
  const op = new BitmapData(10, 10, false, 0xff000000);
  op.draw(new RectDrawable(10, 10, 'rgba(255,255,255,0.5)'));
  expectPixel(`${L} draw onto opaque composites`, op, 3, 3, 0xff808080, 2);
  // split-screen composite (DeathMatch): scale 0.667 + smoothing
  const view = new BitmapData(48, 48, true, 0xff3060a0);
  const screen = new BitmapData(64, 48, true, 0);
  screen.draw(view, new Matrix(64 / 2 / 48, 0, 0, 64 / 2 / 48, -1, 8), undefined, 'normal', undefined, true);
  expectPixel(`${L} split-screen draw (smoothing)`, screen, 10, 20, 0xff3060a0, 2);
  expectPixel(`${L} split-screen draw leaves area outside the view`, screen, 40, 20, 0, 0);
}

function paletteChecks(cfg: Config): void {
  const L = cfg.label;
  // Flash Player reference (Ruffle corpus bitmap_data_thorough/paletteMap): transparent 3x3 0xAABBCCDD target,
  // opaque source 0x12345678 with (1,1) = 0xABCABCAB, rect (0,0,2,2) -> point (1,1), red array 256-i
  const target = new BitmapData(3, 3, true, 0xaabbccdd);
  const source = new BitmapData(3, 3, false, 0x12345678);
  source.setPixel32(1, 1, 0xabcabcab);
  const red = Array.from({ length: 256 }, (_, i) => 256 - i);
  target.paletteMap(source, new Rectangle(0, 0, 2, 2), new Point(1, 1), red);
  expectPixel(`${L} paletteMap sums lookups (Flash ref 0xff005744)`, target, 1, 1, 0xff005744, 0);
  expectPixel(`${L} paletteMap sums lookups (Flash ref 0xff00bce1)`, target, 2, 2, 0xff00bce1, 0);
  expectPixel(`${L} paletteMap leaves outside`, target, 0, 0, 0xaabbccdd, 2);
  const green = Array.from({ length: 256 }, (_, i) => 256 + i);
  const t2 = new BitmapData(3, 3, true, 0xaabbccdd);
  t2.paletteMap(source, new Rectangle(0, 0, 2, 2), new Point(1, 1), red, green);
  expectPixel(`${L} paletteMap full 32-bit sum (Flash ref 0xff00029a)`, t2, 1, 1, 0xff00029a, 0);
  // CDrawPrimitive.InvertAlpha on a decal mask
  const mask = new BitmapData(40, 40, true, 0);
  mask.fillRect(new Rectangle(10, 10, 10, 10), 0xff336699);
  const inv = Array.from({ length: 256 }, (_, i) => ((255 - i) << 24) | 0);
  mask.paletteMap(mask, mask.rectangle, new Point(0, 0), null, null, null, inv);
  check(`${L} InvertAlpha: piece becomes transparent`, (mask.getPixel32(15, 15) >>> 24) === 0, hex(mask.getPixel32(15, 15)));
  check(`${L} InvertAlpha: empty floor becomes opaque`, (mask.getPixel32(2, 2) >>> 24) === 255, hex(mask.getPixel32(2, 2)));
  // colorTransform
  const ct = new BitmapData(10, 10, true, 0xff808080);
  ct.colorTransform(new Rectangle(0, 0, 5, 10), new ColorTransform(1, 0, 0, 1, 0, 0, 0, -127));
  expectPixel(`${L} colorTransform rect`, ct, 2, 2, 0x80800000, 2);
  expectPixel(`${L} colorTransform outside`, ct, 7, 2, 0xff808080, 0);
}

/** Compare the canvas applyFilter path against the CPU reference on a synthetic image. */
function filterAgainstCpu(cfg: Config, name: string, filter: BitmapFilter, opaqueTarget = false): void {
  const L = cfg.label;
  const W = 24, H = 20;
  const b = new BitmapData(W, H, !opaqueTarget, opaqueTarget ? 0xff202020 : 0);
  b.fillRect(new Rectangle(8, 6, 8, 7), 0xffd04010);
  b.fillRect(new Rectangle(10, 8, 3, 2), 0xff10d040);
  const before = b.readPixels();
  const ref = applyFiltersToPixels({ data: before.data, width: before.width, height: before.height }, [filter], b.scale);
  b.applyFilter(b, b.rectangle, new Point(0, 0), filter);
  const after = b.readPixels();
  let maxDiff = 0, at = -1;
  for (let i = 0; i < ref.data.length; i++) {
    let want = ref.data[i]!;
    if (opaqueTarget && i % 4 === 3) want = 255;
    const d = Math.abs(after.data[i]! - want);
    if (d > maxDiff) { maxDiff = d; at = i; }
  }
  check(`${L} applyFilter ${name} == CPU reference`, maxDiff <= 2, `max channel diff ${maxDiff}${at >= 0 ? ' @' + ((at >> 2) % before.width) + ',' + Math.floor((at >> 2) / before.width) : ''}`);
}

function filterChecks(cfg: Config): void {
  const L = cfg.label;
  filterAgainstCpu(cfg, 'Blur(4,4,1)', new BlurFilter(4, 4, 1));
  filterAgainstCpu(cfg, 'Blur(3,5,2)', new BlurFilter(3, 5, 2));
  filterAgainstCpu(cfg, 'Glow(0,1,4,4,2,1) [XSI outline]', new GlowFilter(0x000000, 1, 4, 4, 2, 1));
  filterAgainstCpu(cfg, 'Glow inner knockout', new GlowFilter(0xffff00, 1, 3, 3, 2, 1, true, true));
  filterAgainstCpu(cfg, 'DropShadow(4,45)', new DropShadowFilter(4, 45, 0x000000, 0.8, 4, 4, 1, 1));
  filterAgainstCpu(cfg, 'DropShadow hideObject [XSI shadow]', new DropShadowFilter(0, 0, 0, 1, 4, 4, 0.25, 1, false, false, true));
  filterAgainstCpu(cfg, 'Bevel(2,45)', new BevelFilter(2, 45, 0xffffff, 1, 0x000000, 1, 2, 2, 0.5, 1));
  filterAgainstCpu(cfg, 'GradientGlow outer', new GradientGlowFilter(0, 0, [0xffff00, 0xffffff], [0, 1], [0, 210], 6, 6, 2.4, 1, 'outer'));
  filterAgainstCpu(cfg, 'ColorMatrix brightness (transparent, GPU lighter + destination-in)', new ColorMatrixFilter([1, 0, 0, 0, 153, 0, 1, 0, 0, 153, 0, 0, 1, 0, 153, 0, 0, 0, 1, 0]));
  filterAgainstCpu(cfg, 'ColorMatrix tint + alpha (transparent, CPU)', new ColorMatrixFilter([0.5, 0, 0, 0, 20, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.5, 0]));
  filterAgainstCpu(cfg, 'ColorMatrix brightness (opaque, GPU lighter)', new ColorMatrixFilter([1, 0, 0, 0, 204, 0, 1, 0, 0, 204, 0, 0, 1, 0, 204, 0, 0, 0, 1, 0]), true);
  filterAgainstCpu(cfg, 'ColorMatrix grayscale (opaque)', new ColorMatrixFilter([0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0]), true);
  // applyFilter into another bitmap at an offset
  const src = new BitmapData(10, 10, true, 0);
  src.fillRect(new Rectangle(4, 4, 2, 2), 0xffffffff);
  const dst = new BitmapData(30, 30, true, 0xff000080);
  dst.applyFilter(src, src.rectangle, new Point(10, 10), new GlowFilter(0xff0000, 1, 3, 3, 1, 1));
  expectPixel(`${L} applyFilter to dest point: object`, dst, 14, 14, 0xffffffff, 0);
  check(`${L} applyFilter to dest point: glow replaces dest pixels`, ((dst.getPixel32(13, 14) >>> 16) & 0xff) > 0 && (dst.getPixel32(13, 14) >>> 24) < 255, hex(dst.getPixel32(13, 14)));
  expectPixel(`${L} applyFilter to dest point: outside rect untouched`, dst, 9, 9, 0xff000080, 0);
}

function graphicsChecks(cfg: Config): void {
  const L = cfg.label;
  const tex = new BitmapData(4, 4, true, 0xff00ff00);
  tex.fillRect(new Rectangle(0, 0, 2, 2), 0xffff0000);
  const g = new Graphics();
  g.beginBitmapFill(tex, new Matrix(1, 0, 0, 1, 0, 0), true, false);
  g.moveTo(0, 0); g.lineTo(16, 0); g.lineTo(16, 16); g.lineTo(0, 16);
  g.endFill();
  g.beginFill(0xffffff, 50);
  g.moveTo(8, 0); g.lineTo(16, 0); g.lineTo(16, 8); g.lineTo(8, 8);
  g.endFill();
  g.lineStyle(0, 0x0000ff, 100);
  g.moveTo(0, 20); g.lineTo(16, 20);
  const b = new BitmapData(24, 24, true, 0);
  b.draw(new GraphicsDrawable(g));
  expectPixel(`${L} beginBitmapFill repeat (red quadrant)`, b, 4, 4, 0xffff0000, 0);
  expectPixel(`${L} beginBitmapFill repeat (green)`, b, 6, 4, 0xff00ff00, 0);
  expectPixel(`${L} shade fill over bitmap fill`, b, 12, 4, 0xffff7f7f, 3); // white 50% (127/255) over red
  // a hairline on an integer coordinate straddles two device rows (canvas pixel centres at .5): accept >= 50% coverage
  const hl = b.getPixel32(8, 20) >>> 0;
  check(`${L} hairline (1 device px, any scale)`, (hl & 0xff) > 250 && (hl >>> 24) >= 0x7f && ((hl >>> 8) & 0xffff) === 0, hex(hl));
  // non-repeating bitmap fill clamps (extends edge pixels)
  const g2 = new Graphics();
  g2.beginBitmapFill(tex, new Matrix(1, 0, 0, 1, 0, 0), false, false);
  g2.moveTo(0, 0); g2.lineTo(10, 0); g2.lineTo(10, 10); g2.lineTo(0, 10);
  g2.endFill();
  const b2 = new BitmapData(12, 12, true, 0);
  b2.draw(new GraphicsDrawable(g2));
  expectPixel(`${L} bitmap fill clamp (edge extended)`, b2, 9, 1, 0xff00ff00, 0);
  expectPixel(`${L} bitmap fill clamp (corner extended)`, b2, 9, 9, 0xff00ff00, 0);
  // gradient fill (linear pad, red -> blue)
  const g3 = new Graphics();
  const m = new Matrix();
  m.createGradientBox(20, 10, 0, 0, 0);
  g3.beginGradientFill('linear', [0xff0000, 0x0000ff], [100, 100], [0, 255], m);
  g3.moveTo(0, 0); g3.lineTo(20, 0); g3.lineTo(20, 10); g3.lineTo(0, 10);
  g3.endFill();
  const b3 = new BitmapData(20, 10, true, 0);
  b3.draw(new GraphicsDrawable(g3));
  const left = b3.getPixel32(0, 5) >>> 0, right = b3.getPixel32(19, 5) >>> 0;
  check(`${L} linear gradient fill red -> blue`, ((left >>> 16) & 0xff) > 230 && (right & 0xff) > 230, `${hex(left)} .. ${hex(right)}`);
}

function decalFlow(cfg: Config): void {
  // The CWorld decal pipeline with mixed scales: 2x (or 1x) floor, 1x alpha-only mask, masked merge copy.
  const L = cfg.label;
  const floor = new BitmapData(80, 60, false, 0xff406040);
  const piece = new RectDrawable(30, 20, 'rgb(120,120,120)');
  floor.draw(piece, new Matrix(1, 0, 0, 1, 10, 10));
  const mask = new BitmapData(80, 60, true, 0, { scale: 1, alphaOnly: true });
  mask.draw(piece, new Matrix(1, 0, 0, 1, 10, 10));
  const inv = Array.from({ length: 256 }, (_, i) => ((255 - i) << 24) | 0);
  mask.paletteMap(mask, mask.rectangle, new Point(0, 0), null, null, null, inv);
  const decal = new BitmapData(20, 20, true, 0);
  decal.fillRect(new Rectangle(2, 2, 16, 16), 0xffaa0000);
  const p = new Point(30, 20);
  floor.copyPixels(decal, decal.rectangle, p, mask, p, true);
  expectPixel(`${L} decal blocked on the piece`, floor, 35, 25, 0xff787878, 0);
  expectPixel(`${L} decal drawn on empty floor`, floor, 45, 25, 0xffaa0000, 0);
  expectPixel(`${L} decal: its transparent pixels leave the floor`, floor, 49, 39, 0xff406040, 0);
}

function drawToChecks(cfg: Config): void {
  const L = cfg.label;
  const b = new BitmapData(70, 50, true, 0);
  b.fillRect(new Rectangle(0, 0, 70, 50), 0xff102030);
  b.fillRect(new Rectangle(30, 20, 10, 10), 0xffffffff);
  const c = document.createElement('canvas');
  c.width = 140; c.height = 100;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  b.drawTo(ctx, 25, 15, 20, 20, 0, 0);
  const at = (x: number, y: number): number => { const d = ctx.getImageData(x, y, 1, 1).data; return ((d[3]! << 24) | (d[0]! << 16) | (d[1]! << 8) | d[2]!) >>> 0; };
  check(`${L} drawTo sub-rect (white square)`, at(15, 15) === 0xffffffff, hex(at(15, 15)));
  check(`${L} drawTo sub-rect (background)`, at(5, 5) === 0xff102030, hex(at(5, 5)));
  check(`${L} drawTo clipped to sub-rect`, at(45, 45) === 0, hex(at(45, 45)));
  // seams: a uniform bitmap drawn through drawTo must be uniform (no gaps between tiles)
  let gaps = 0;
  const all = ctx.getImageData(0, 0, 40, 40).data;
  for (let i = 3; i < all.length; i += 4) if (all[i] !== 255) gaps++;
  check(`${L} drawTo has no seams`, gaps === 0, `${gaps} non-opaque px`);
}

// ------------------------------------------------------------------------------------------------ snapshots & perf

async function snapshots2x(): Promise<void> {
  BitmapData.defaultScale = 2;
  // filter gallery
  const filters: [string, BitmapFilter][] = [
    ['blur', new BlurFilter(6, 6, 2)], ['glow', new GlowFilter(0x000000, 1, 4, 4, 2, 1)],
    ['innerGlow', new GlowFilter(0xffff00, 1, 6, 6, 2, 2, true)], ['dropShadow', new DropShadowFilter(5, 45, 0, 0.34, 5, 5)],
    ['bevel', new BevelFilter(2, 45, 0xffffff, 1, 0, 1, 2, 2, 0.5, 1)],
    ['gradientGlow', new GradientGlowFilter(0, 0, [0xffff00, 0xffffff], [0, 1], [0, 210], 16, 16, 2.4, 1, 'outer')],
  ];
  const sheet = new BitmapData(60 * filters.length, 60, true, 0xff6a6a7a);
  filters.forEach(([, f], i) => {
    const cell = new BitmapData(60, 60, true, 0);
    const g = new Graphics();
    g.beginFill(0xd08030);
    g.moveTo(15, 15); g.lineTo(45, 15); g.lineTo(45, 30); g.curveTo(45, 45, 30, 45); g.lineTo(15, 45);
    g.endFill();
    cell.draw(new GraphicsDrawable(g));
    cell.applyFilter(cell, cell.rectangle, new Point(0, 0), f);
    sheet.copyPixels(cell, cell.rectangle, new Point(i * 60, 0), undefined, undefined, true);
  });
  await snapshot('filters-2x', sheet, 1);

  // a mini "room": tiled floor, cover, decal, character-like polygon with outline glow and shadow
  BitmapData.maxCanvasSize = 256; BitmapData.tileSize = 128;
  const floor = new BitmapData(200, 150, false, 0xff2f3b2f);
  for (let i = 0; i < 6; i++) floor.draw(new RectDrawable(28, 18, `rgb(${90 + i * 20},${90 + i * 10},80)`), new Matrix(1, 0, 0, 1, 10 + i * 32, 20 + (i % 2) * 70));
  const mask = new BitmapData(200, 150, true, 0, { scale: 1, alphaOnly: true });
  for (let i = 0; i < 6; i++) mask.draw(new RectDrawable(28, 18, '#000'), new Matrix(1, 0, 0, 1, 10 + i * 32, 20 + (i % 2) * 70));
  mask.paletteMap(mask, mask.rectangle, new Point(0, 0), null, null, null, Array.from({ length: 256 }, (_, i) => ((255 - i) << 24) | 0));
  const splat = new BitmapData(40, 24, true, 0);
  const sg = new Graphics();
  sg.beginFill(0x880000, 90);
  sg.moveTo(20, 2); sg.curveTo(40, 2, 36, 12); sg.curveTo(38, 22, 20, 22); sg.curveTo(0, 22, 4, 12); sg.curveTo(2, 2, 20, 2);
  sg.endFill();
  splat.draw(new GraphicsDrawable(sg));
  for (let i = 0; i < 8; i++) { const p = new Point(5 + i * 24, 30 + (i % 3) * 30); floor.copyPixels(splat, splat.rectangle, p, mask, p, true); }
  const ch = new BitmapData(40, 50, true, 0);
  const cg = new Graphics();
  const tex = new BitmapData(8, 8, true, 0xff3050c0);
  tex.fillRect(new Rectangle(0, 0, 4, 4), 0xff4060e0);
  cg.lineStyle(0, 0, 0);
  cg.beginBitmapFill(tex, new Matrix(0.8, 0.2, -0.2, 0.8, 0, 0), true, true);
  cg.moveTo(10, 10); cg.lineTo(30, 8); cg.lineTo(32, 40); cg.lineTo(8, 42);
  cg.endFill();
  cg.beginFill(0x000000, 30);
  cg.moveTo(10, 10); cg.lineTo(30, 8); cg.lineTo(20, 25);
  cg.endFill();
  ch.draw(new GraphicsDrawable(cg));
  ch.applyFilter(ch, ch.rectangle, new Point(0, 0), new GlowFilter(0, 1, 4, 4, 2, 1));
  const view = new BitmapData(160, 120, false, 0xff0000ff);
  view.copyPixels(floor, new Rectangle(20, 15, 160, 120), new Point(0, 0), undefined, undefined, false);
  view.copyPixels(ch, ch.rectangle, new Point(60, 40), undefined, undefined, true);
  view.draw(ch, new Matrix(1, 0, 0, 1, 100.4, 40.6), new ColorTransform(1, 1, 1, 0.5));
  view.applyFilter(view, view.rectangle, new Point(0, 0), new ColorMatrixFilter([1, 0, 0, 0, 51, 0, 1, 0, 0, 51, 0, 0, 1, 0, 51, 0, 0, 0, 1, 0]));
  await snapshot('room-2x-tiled-floor', view, 1);
  await snapshot('floor-tiled-with-decals', floor, 1);
  BitmapData.maxCanvasSize = 4096; BitmapData.tileSize = 1024;
}

async function performance2x(): Promise<void> {
  BitmapData.defaultScale = 2;
  BitmapData.maxCanvasSize = 4096; BitmapData.tileSize = 1024;
  const floor = new BitmapData(2784, 2784, false, 0xff304030); // BIG ONE floor (tiled at 2x)
  floor.fillRect(new Rectangle(0, 0, 2784, 2784), 0xff304030);
  floor.draw(new RectDrawable(2700, 2700, '#405040'), new Matrix(1, 0, 0, 1, 40, 40));
  const cover = new BitmapData(2784, 2784, true, 0x0000ff00);
  cover.draw(new RectDrawable(500, 300, 'rgba(0,0,0,0.6)'), new Matrix(1, 0, 0, 1, 1000, 1000));
  const bmDraw = new BitmapData(640, 480, true, 0xff0000ff);
  const sprites: BitmapData[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new BitmapData(48, 56, true, 0);
    s.draw(new RectDrawable(40, 50, `hsl(${i * 40},60%,50%)`), new Matrix(1, 0, 0, 1, 4, 3));
    s.applyFilter(s, s.rectangle, new Point(0, 0), new GlowFilter(0, 1, 4, 4, 2, 1));
    sprites.push(s);
  }
  const sync = (): void => { bmDraw.getPixel32(0, 0); };
  const N = 60;
  sync();
  const t0 = performance.now();
  for (let f = 0; f < N; f++) {
    const vx = 900 + (f % 30) * 3, vy = 900 + (f % 20) * 2;
    bmDraw.copyPixels(floor, new Rectangle(vx, vy, 640, 480), new Point(0, 0), undefined, undefined, false);
    for (let i = 0; i < 80; i++) {
      const s = sprites[i % 8]!;
      bmDraw.copyPixels(s, s.rectangle, new Point((i * 37 + f) % 600, (i * 53) % 440), undefined, undefined, true);
    }
    for (let i = 0; i < 10; i++) bmDraw.draw(sprites[i % 8]!, new Matrix(1, 0, 0, 1, (i * 61) % 600, (i * 29) % 440), new ColorTransform(1, 1, 1, 0.5));
    bmDraw.copyPixels(cover, new Rectangle(vx, vy, 640, 480), new Point(0, 0), undefined, undefined, true);
  }
  sync();
  perf.frameMs_floorTiled_80copies_10alphaDraws = (performance.now() - t0) / N;
  const t1 = performance.now();
  for (let f = 0; f < 10; f++) bmDraw.applyFilter(bmDraw, bmDraw.rectangle, new Point(0, 0), new ColorMatrixFilter([1, 0, 0, 0, 51, 0, 1, 0, 0, 51, 0, 0, 1, 0, 51, 0, 0, 0, 1, 0]));
  sync();
  perf.brightnessFilter_transparent_gpu_ms = (performance.now() - t1) / 10;
  const t1b = performance.now();
  for (let f = 0; f < 10; f++) bmDraw.applyFilter(bmDraw, bmDraw.rectangle, new Point(0, 0), new ColorMatrixFilter([0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0]));
  sync();
  perf.grayscaleFilter_640x480_cpu_ms = (performance.now() - t1b) / 10;
  const opaque = new BitmapData(640, 480, false, 0xff0000ff);
  opaque.getPixel32(0, 0);
  const t2 = performance.now();
  for (let f = 0; f < 10; f++) opaque.applyFilter(opaque, opaque.rectangle, new Point(0, 0), new ColorMatrixFilter([1, 0, 0, 0, 51, 0, 1, 0, 0, 51, 0, 0, 1, 0, 51, 0, 0, 0, 1, 0]));
  opaque.getPixel32(0, 0);
  perf.brightnessFilter_opaque_gpu_ms = (performance.now() - t2) / 10;
  const t3 = performance.now();
  const ch = new BitmapData(60, 70, true, 0);
  for (let f = 0; f < 20; f++) {
    ch.fillRect(ch.rectangle, 0);
    ch.draw(new RectDrawable(40, 50, '#888'), new Matrix(1, 0, 0, 1, 10, 10));
    ch.applyFilter(ch, ch.rectangle, new Point(0, 0), new GlowFilter(0, 1, 4, 4, 2, 1));
  }
  ch.getPixel32(0, 0);
  perf.xsiFrameGlow_60x70_ms = (performance.now() - t3) / 20;
  perf.floorTilesAllocated = floor.allocatedTiles;
  perf.coverTilesAllocated = cover.allocatedTiles;
  floor.dispose(); cover.dispose();
}

// ------------------------------------------------------------------------------------------------ run

async function main(): Promise<void> {
  try {
    for (const cfg of CONFIGS) {
      withConfig(cfg, () => {
        basics(cfg);
        copyPixelsChecks(cfg);
        drawChecks(cfg);
        paletteChecks(cfg);
        filterChecks(cfg);
        graphicsChecks(cfg);
        decalFlow(cfg);
        drawToChecks(cfg);
      });
    }
    await snapshots2x();
    await performance2x();
  } catch (e) {
    check('uncaught exception', false, String((e as Error)?.stack ?? e));
  }
  const w = window as unknown as Record<string, unknown>;
  w.__engineResults = results;
  w.__engineSnapshots = snapshots;
  w.__enginePerf = perf;
  w.__engineDone = true;
  logEl.innerHTML += `\n${results.filter((r) => r.pass).length}/${results.length} passed\n${JSON.stringify(perf, null, 1)}\n`;
}

void main();
