// flash.geom semantics. Expected values are Flash Player 8+ trace output (Ruffle AVM1 test corpus:
// tests/swfs/avm1/{matrix,point,rectangle,color_transform}/output.txt), printed with AVM1 number formatting.
import { describe, expect, it } from 'vitest';
import { ColorTransform, Matrix, Point, Rectangle } from '../../../src/engine/flash/geom.ts';

const M = (a: number, b: number, c: number, d: number, tx: number, ty: number): Matrix => new Matrix(a, b, c, d, tx, ty);

describe('Matrix', () => {
  it('constructs identity by default', () => {
    expect(new Matrix().toString()).toBe('(a=1, b=0, c=0, d=1, tx=0, ty=0)');
  });

  it('concat matches Flash (with and without skew)', () => {
    const cases: [Matrix, Matrix, string][] = [
      [M(1, 0, 0, 1, 0, 0), M(11, 13, 17, 19, 23, 29), '(a=11, b=13, c=17, d=19, tx=23, ty=29)'],
      [M(11, 13, 17, 19, 23, 29), M(3, 5, 0, 5, 0, 5), '(a=33, b=120, c=51, d=180, tx=69, ty=265)'],
      [M(2, 0, 0, 3, 5, 7), M(11, 0, 0, 13, 17, 19), '(a=22, b=0, c=0, d=39, tx=72, ty=110)'],
      [M(2, 0, 0, 3, 5, 7), M(11, 1, 0, 13, 17, 19), '(a=22, b=2, c=0, d=39, tx=72, ty=115)'],
      [M(2, 0, 1, 3, 5, 7), M(11, 0, 0, 13, 17, 19), '(a=22, b=0, c=11, d=39, tx=72, ty=110)'],
      [M(2, NaN, 0, 3, 5, 7), M(11, 0, 0, 13, 17, 19), '(a=NaN, b=NaN, c=0, d=39, tx=72, ty=110)'],
    ];
    for (const [a, b, want] of cases) {
      a.concat(b);
      expect(a.toString()).toBe(want);
    }
  });

  it('invert matches Flash, including the axis-aligned and singular quirks', () => {
    const cases: [Matrix, string][] = [
      [M(2, 3, 5, 7, 9, 11), '(a=-7, b=3, c=5, d=-2, tx=8, ty=-5)'],
      [M(2, 0, 0, 4, 8, 16), '(a=0.5, b=0, c=0, d=0.25, tx=-4, ty=-4)'],
      [M(0, 0, 0, 4, 8, 16), '(a=Infinity, b=0, c=0, d=0.25, tx=-Infinity, ty=-4)'],
      [M(0, 0, 0, 0, 8, 16), '(a=Infinity, b=0, c=0, d=Infinity, tx=-Infinity, ty=-Infinity)'],
      [M(1, 2, 2, 4, 8, 16), '(a=1, b=0, c=0, d=1, tx=0, ty=0)'],
      [M(0, 1, 1, 0, 8, 16), '(a=0, b=1, c=1, d=0, tx=-16, ty=-8)'],
      [M(NaN, 0, 0, 2, 3, 4), '(a=NaN, b=0, c=0, d=0.5, tx=NaN, ty=-2)'],
      [M(NaN, 1, 1, 2, 3, 4), '(a=NaN, b=NaN, c=NaN, d=NaN, tx=NaN, ty=NaN)'],
    ];
    for (const [m, want] of cases) {
      m.invert();
      expect(m.toString()).toBe(want);
    }
  });

  it('rotate / scale / createBox / createGradientBox match Flash', () => {
    let m = M(1, 2, 3, 4, 5, 6);
    m.rotate(1);
    expect(m.toString()).toBe('(a=-1.14263966374765, b=1.92207559654418, c=-1.74497702162717, d=4.68562217789625, tx=-2.34731437950668, ty=7.44916875924832)');
    m = M(1, 2, 3, 4, 5, 6);
    m.rotate(Math.PI / 2);
    expect(m.toString()).toBe('(a=-2, b=1, c=-4, d=3, tx=-6, ty=5)');
    m = M(2, 0, 0, 2, 100, 100);
    m.scale(3, 5);
    expect(m.toString()).toBe('(a=6, b=0, c=0, d=10, tx=300, ty=500)');
    m = M(1, 2, 3, 4, 5, 6);
    m.scale(3, 5);
    expect(m.toString()).toBe('(a=3, b=10, c=9, d=20, tx=15, ty=30)');
    m = new Matrix();
    m.createBox(2, 3, Math.PI / 2);
    expect(m.toString()).toBe('(a=1.22464679914735e-16, b=3, c=-2, d=1.83697019872103e-16, tx=0, ty=0)');
    m.createBox(2, 3, 0, 4, 5);
    expect(m.toString()).toBe('(a=2, b=0, c=0, d=3, tx=4, ty=5)');
    m.createGradientBox(200, 300, 0, 10, 20);
    expect(m.toString()).toBe('(a=0.1220703125, b=0, c=0, d=0.18310546875, tx=110, ty=170)');
    m.createGradientBox(200, 300, Math.PI / 2);
    expect(m.toString()).toBe('(a=7.47465087370211e-18, b=0.18310546875, c=-0.1220703125, d=1.12119763105532e-17, tx=100, ty=150)');
  });

  it('transformPoint / deltaTransformPoint / translate', () => {
    const m = M(1, 2, 3, 4, 5, 6);
    expect(m.transformPoint(new Point(10, 20)).toString()).toBe('(x=75, y=106)');
    expect(m.deltaTransformPoint(new Point(10, 20)).toString()).toBe('(x=70, y=100)');
    m.translate(1, -1);
    expect([m.tx, m.ty]).toEqual([6, 5]);
  });

  it('DeathMatch split-screen matrix (CWorld.InitDrawPlanes) maps view origin to the screen offset', () => {
    const scalar = 640 / 2 / 480;
    const m = new Matrix();
    m.scale(scalar, scalar);
    m.tx = 0 - 1; // left view: offset x - 1 (original quirk)
    m.ty = (480 - 480 * scalar) / 2;
    const p = m.transformPoint(new Point(480, 480));
    expect(p.x).toBeCloseTo(319, 10);
    expect(p.y).toBeCloseTo(400, 10);
  });
});

describe('Rectangle', () => {
  it('inflate keeps the quirk of growing both sides (CDrawPrimitive.inflate(1,1))', () => {
    const r = new Rectangle(10, 20, 30, 40);
    r.inflate(2, 2);
    expect(r.toString()).toBe('(x=8, y=18, w=34, h=44)');
    r.inflatePoint(new Point(-1, 1));
    expect(r.toString()).toBe('(x=9, y=17, w=32, h=46)');
  });

  it('edges, intersection, union, contains', () => {
    const r = new Rectangle(0, 0, 10, 10);
    r.left = 2;
    expect(r.toString()).toBe('(x=2, y=0, w=8, h=10)');
    r.bottom = 5;
    expect(r.height).toBe(5);
    const a = new Rectangle(0, 0, 10, 10), b = new Rectangle(5, 5, 10, 10);
    expect(a.intersection(b).toString()).toBe('(x=5, y=5, w=5, h=5)');
    expect(a.union(b).toString()).toBe('(x=0, y=0, w=15, h=15)');
    expect(a.intersection(new Rectangle(20, 20, 1, 1)).toString()).toBe('(x=0, y=0, w=0, h=0)');
    expect(a.intersects(b)).toBe(true);
    expect(a.contains(9.99, 0)).toBe(true);
    expect(a.contains(10, 0)).toBe(false);
    expect(a.containsRectangle(new Rectangle(1, 1, 9, 9))).toBe(true);
    expect(a.containsRectangle(new Rectangle(1, 1, 10, 9))).toBe(false);
    // an empty rectangle is not contained (Flash checks rect.x < right and rectRight > x)
    expect(a.containsRectangle(new Rectangle(10, 10, 0, 0))).toBe(false);
    expect(new Rectangle(0, 0, NaN, 5).isEmpty()).toBe(true);
    expect(new Rectangle(0, 0, -1, 5).union(b).toString()).toBe('(x=5, y=5, w=10, h=10)');
  });
});

describe('Point', () => {
  it('interpolate / distance / polar / normalize', () => {
    expect(Point.interpolate(new Point(-100, -200), new Point(100, 200), 0.5).toString()).toBe('(x=0, y=0)');
    expect(Point.interpolate(new Point(-100, -200), new Point(100, 200), 2).toString()).toBe('(x=-300, y=-600)');
    expect(Point.distance(new Point(-100, 200), new Point(100, 200))).toBe(200);
    const p = new Point(3, 4);
    p.normalize(10);
    expect(p.toString()).toBe('(x=6, y=8)');
    const z = new Point();
    z.normalize(10);
    expect(z.toString()).toBe('(x=0, y=0)');
    const n = new Point(NaN, 1);
    n.normalize(1); // Flash proceeds on a NaN length
    expect(Number.isNaN(n.y)).toBe(true);
    const q = Point.polar(2, Math.PI);
    expect(q.x).toBe(-2);
    const r = new Point(3, 4);
    expect(r.add(new Point(1, 1)).subtract(new Point(1, 1)).equals(r)).toBe(true);
  });
});

describe('ColorTransform', () => {
  it('concat applies the argument first (Flash Player behaviour)', () => {
    const parent = new ColorTransform(0.5, 0.5, 0.5, 0.5, 10, 20, 30, 40);
    const child = new ColorTransform(2, 1, 1, 1, 100, 0, 0, 0);
    parent.concat(child);
    // offset = child.offset * parent.mult + parent.offset ; mult = child.mult * parent.mult
    expect(parent.toString()).toBe('(redMultiplier=1, greenMultiplier=0.5, blueMultiplier=0.5, alphaMultiplier=0.5, redOffset=60, greenOffset=20, blueOffset=30, alphaOffset=40)');
  });

  it('rgb getter / setter', () => {
    const ct = new ColorTransform(1, 1, 1, 1, 255, 25, 0, 0);
    expect(ct.rgb).toBe(16718080);
    ct.rgb = 0xff0000;
    expect(ct.toString()).toBe('(redMultiplier=0, greenMultiplier=0, blueMultiplier=0, alphaMultiplier=1, redOffset=255, greenOffset=0, blueOffset=0, alphaOffset=0)');
    expect(new ColorTransform(1, 1, 1, 1, 0, 0, 0, 0).isIdentity()).toBe(true);
    expect(new ColorTransform(1, 1, 1, 0.5).isAlphaOnly()).toBe(true);
  });
});
