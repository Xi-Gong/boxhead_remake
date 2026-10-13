// BitmapData bookkeeping on the NullBacking (headless simulations). Pixel behaviour is covered by the browser
// check (tests/browser/run-engine.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BitmapData, type IDrawable } from '../../../src/engine/flash/BitmapData.ts';
import { ColorTransform, Matrix, Point, Rectangle } from '../../../src/engine/flash/geom.ts';
import { BlurFilter, ColorMatrixFilter, GlowFilter } from '../../../src/engine/flash/filters.ts';

beforeAll(() => { BitmapData.headless = true; });
afterAll(() => { BitmapData.headless = false; });

describe('BitmapData (NullBacking)', () => {
  it('sizes, defaults and the 2880 limit', () => {
    const b = new BitmapData(640, 480);
    expect(b.backingKind).toBe('null');
    expect([b.width, b.height, b.transparent]).toEqual([640, 480, true]);
    expect(b.rectangle.toString()).toBe('(x=0, y=0, w=640, h=480)');
    expect(b.scale).toBe(BitmapData.defaultScale);
    expect(new BitmapData(10.9, 3.2).width).toBe(10);
    const big = new BitmapData(2880, 2880, false);
    expect(big.valid).toBe(true);
    expect(big.transparent).toBe(false);
    for (const [w, h] of [[0, 10], [10, 0], [2881, 10], [10, 2881], [-5, 10]]) {
      const bad = new BitmapData(w!, h!);
      expect(bad.valid).toBe(false);
      expect([bad.width, bad.height]).toEqual([-1, -1]);
    }
  });

  it('per-instance scale option and device size (BIG ONE 87x32 px at 2x)', () => {
    const floor = new BitmapData(2784, 2784, false, 0xffff0000, { scale: 2 });
    expect([floor.deviceWidth, floor.deviceHeight]).toEqual([5568, 5568]);
    const mask = new BitmapData(2784, 2784, true, 0, { scale: 1, alphaOnly: true });
    expect([mask.deviceWidth, mask.alphaOnly]).toEqual([2784, true]);
  });

  it('version increments on every (valid, non-empty) mutation only', () => {
    const b = new BitmapData(100, 100, true, 0);
    const src = new BitmapData(10, 10, true, 0xff00ff00);
    let v = b.version;
    b.fillRect(new Rectangle(0, 0, 10, 10), 0xffffffff);
    expect(b.version).toBe(++v);
    b.fillRect(new Rectangle(200, 200, 10, 10), 0xffffffff); // outside: no-op
    b.fillRect(new Rectangle(0, 0, 0, 10), 0xffffffff); // empty
    expect(b.version).toBe(v);
    b.copyPixels(src, src.rectangle, new Point(5, 5));
    expect(b.version).toBe(++v);
    b.copyPixels(src, src.rectangle, new Point(500, 5)); // clipped away
    expect(b.version).toBe(v);
    b.copyPixels(src, src.rectangle, new Point(0, 0), src, new Point(0, 0), true);
    expect(b.version).toBe(++v);
    b.draw(src, new Matrix(1, 0, 0, 1, 3.5, 2), new ColorTransform(1, 1, 1, 0.5));
    expect(b.version).toBe(++v);
    b.draw(src, new Matrix(1, 0, 0, 1, 300, 0)); // entirely outside
    expect(b.version).toBe(v);
    b.paletteMap(b, b.rectangle, new Point(0, 0), null, null, null, [0]);
    expect(b.version).toBe(++v);
    b.colorTransform(b.rectangle, new ColorTransform(1, 1, 1, 2)); // Flash: alpha multiplier >= 1 only -> no-op
    expect(b.version).toBe(v);
    b.colorTransform(b.rectangle, new ColorTransform(0.5));
    expect(b.version).toBe(++v);
    b.setPixel32(1, 1, 0xff000000);
    expect(b.version).toBe(++v);
    b.setPixel32(-1, 1, 0xff000000);
    expect(b.version).toBe(v);
  });

  it('draw(IDrawable) culls by renderBounds (or contentBounds + margin) and the clip rectangle', () => {
    const b = new BitmapData(100, 100);
    let calls = 0;
    const d: IDrawable = { renderContent: () => { calls++; }, contentBounds: () => new Rectangle(0, 0, 10, 10) };
    let v = b.version;
    b.draw(d, new Matrix(1, 0, 0, 1, 50, 50));
    expect(b.version).toBe(++v);
    b.draw(d, new Matrix(1, 0, 0, 1, 500, 50));
    expect(b.version).toBe(v);
    // without renderBounds() a margin (filter spill of children) is assumed around contentBounds()
    b.draw(d, undefined, undefined, 'normal', new Rectangle(60, 60, 10, 10));
    expect(b.version).toBe(++v);
    const tight: IDrawable = { ...d, renderBounds: () => new Rectangle(0, 0, 12, 12) };
    b.draw(tight, undefined, undefined, 'normal', new Rectangle(60, 60, 10, 10));
    expect(b.version).toBe(v);
    b.draw(d, new Matrix(NaN, 0, 0, 1, 0, 0)); // non-finite matrix: nothing drawn
    expect(b.version).toBe(v);
    expect(calls).toBe(0); // NullBacking never renders
    const empty: IDrawable = { renderContent: () => {}, contentBounds: () => new Rectangle(0, 0, 0, 0) };
    b.draw(empty);
    expect(b.version).toBe(v);
  });

  it('applyFilter return codes and generateFilterRect', () => {
    const b = new BitmapData(50, 50);
    expect(b.applyFilter(b, b.rectangle, new Point(0, 0), new BlurFilter(4, 4, 1))).toBe(0);
    expect(b.applyFilter(b, b.rectangle, new Point(0, 0), new ColorMatrixFilter())).toBe(0);
    expect(b.applyFilter({} as BitmapData, b.rectangle, new Point(0, 0), new BlurFilter())).toBe(-2);
    expect(b.applyFilter(b, b.rectangle, new Point(0, 0), undefined as unknown as BlurFilter)).toBe(-1);
    const gone = new BitmapData(5, 5);
    gone.dispose();
    expect(b.applyFilter(gone, gone.rectangle, new Point(0, 0), new BlurFilter())).toBe(-3);
    expect(b.generateFilterRect(new Rectangle(0, 0, 10, 10), new GlowFilter(0, 1, 4, 4)).toString()).toBe('(x=-2, y=-2, w=14, h=14)');
  });

  it('dispose: width/height -1, everything else a no-op', () => {
    const b = new BitmapData(20, 20);
    b.dispose();
    expect(b.disposed).toBe(true);
    expect([b.width, b.height]).toEqual([-1, -1]);
    const v = b.version;
    b.fillRect(new Rectangle(0, 0, 5, 5), 0xffffffff);
    b.draw(new BitmapData(5, 5));
    expect(b.version).toBe(v);
    expect(b.getPixel32(0, 0)).toBe(-1);
    b.dispose(); // idempotent
  });

  it('clone keeps size, transparency and scale', () => {
    const b = new BitmapData(33, 44, false, 0xff123456, { scale: 1 });
    const c = b.clone();
    expect([c.width, c.height, c.transparent, c.scale]).toEqual([33, 44, false, 1]);
    expect(c).not.toBe(b);
    expect(c.id).not.toBe(b.id);
  });

  it('pixel getters: out of bounds -> 0, opaque bitmaps read alpha FF (signed int)', () => {
    const t = new BitmapData(4, 4, true, 0);
    expect(t.getPixel32(10, 10)).toBe(0);
    expect(t.getPixel(-1, 0)).toBe(0);
    const o = new BitmapData(4, 4, false, 0);
    expect(o.getPixel32(0, 0)).toBe(-16777216); // 0xFF000000 as a signed AVM1 int
  });
});
