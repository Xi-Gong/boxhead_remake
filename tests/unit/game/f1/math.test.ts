// Lane F1: scidd math + Thing/Math ports (pure logic).
import { beforeAll, describe, expect, it } from 'vitest';
import './f1Modules.ts';
import { installStubs } from './f1Modules.ts';
import { Thing, World, scidd } from '../../../../src/game/packages.ts';
import { Point } from '../../../../src/engine/flash/geom.ts';
import { seedRandom } from '../../../../src/engine/flash/rng.ts';

const PI = Math.PI;

beforeAll(() => {
  installStubs();
  seedRandom(1234);
});

describe('CThing_Angle', () => {
  it('statics match the AS2 prologue', () => {
    const A = Thing.Math.CThing_Angle;
    expect(A.PI360).toBe(PI * 2);
    expect(A.PI360x100).toBe(PI * 2 * 100);
    expect(A.mRadsToDirection).toBe((PI * 2) / 8);
    expect(A.RadsTo256).toBe(256 / (PI * 2));
    expect(A.mDirection_Angles).toEqual([0, PI * 0.25, PI * 0.5, PI * 0.75, PI, PI * 1.25, PI * 1.5, PI * 1.75]);
    // lazily-created direction deltas: same identity on every access, 8 entries E,SE,S,SW,W,NW,N,NE
    const d = A.mDirection_Deltas;
    expect(A.mDirection_Deltas).toBe(d);
    expect(d.map((p: any) => [p.mX, p.mY])).toEqual([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
    expect(new A(0)._CLASSID_).toBe('CThing_Angle');
  });

  it('quantises to 8 directions (0 = east, clockwise with y down), rounding at the half-sector', () => {
    const A = Thing.Math.CThing_Angle;
    for (let k = 0; k < 8; k++) expect(new A((k * PI) / 4).mDirection).toBe(k);
    const half = PI / 8;
    expect(new A(half - 1e-9).mDirection).toBe(0);
    expect(new A(half + 1e-9).mDirection).toBe(1);
    expect(new A(2 * PI - 1e-9).mDirection).toBe(0); // round(8) & 7
    expect(new A(-PI / 2).mDirection).toBe(6); // north
    expect(A.GetDirection(PI)).toBe(4);
    expect(A.CorrectDirection(-1)).toBe(7);
    expect(new A(0).mDirectionOpposite).toBe(4);
    expect(new A(PI * 0.25).mDirectionOpposite).toBe(5);
    const a = new A(0);
    a.mDirection = 11; // & 7 -> 3
    expect(a.mRadians).toBe(PI * 0.75);
    expect(a.mDirection).toBe(3);
    expect(a.mDirectionDelta).toBe(A.mDirection_Deltas[3]);
    expect(a.mDirectionDeltaOpposite).toBe(A.mDirection_Deltas[7]);
    expect(new A(PI).ToDirectionN(16)).toBe(8);
    expect(new A(PI).mAngle256).toBe(128);
    expect(new A(2 * PI - 1e-9).mAngle256).toBe(255);
  });

  it('mLookup256[n][a] = round(a / (256 / n)) % n for n = 1..32, index 0 never filled', () => {
    const A = Thing.Math.CThing_Angle;
    A.mLookup256 = undefined;
    A.Create_LookupTables();
    const L = A.mLookup256;
    expect(L[0]).toBeUndefined();
    expect(L.length).toBe(33);
    for (let n = 1; n <= 32; n++) {
      expect(L[n].length).toBe(256);
      for (let a = 0; a < 256; a++) {
        expect(L[n][a]).toBe(Math.round(a / (256 / n)) % n);
        expect(L[n][a]).toBe(Math.round((a * n) / 256) % n); // numerically identical (hotspots.md note)
      }
    }
    // spot values: 8 directions, sector boundaries at 16 + 32k
    expect([L[8][0], L[8][15], L[8][16], L[8][47], L[8][48], L[8][255]]).toEqual([0, 0, 1, 1, 2, 0]);
    expect([L[16][7], L[16][8], L[16][128]]).toEqual([0, 1, 8]);
    expect(L[1].every((v: number) => v === 0)).toBe(true);
    // a second call keeps the existing tables
    const keep = A.mLookup256;
    A.Create_LookupTables();
    expect(A.mLookup256).toBe(keep);
  });

  it('Correct / AngleDifference / TurnAngle / TurnDirection', () => {
    const A = Thing.Math.CThing_Angle;
    expect(A.Correct(-PI / 2)).toBeCloseTo(1.5 * PI, 12);
    expect(A.Correct(2 * PI)).toBeCloseTo(0, 9);
    expect(A.Correct(1)).toBe((1 + A.PI360x100) % A.PI360);
    expect(new A(7 * PI).mRadians).toBeCloseTo(PI, 9);
    const a = new A(0.1);
    expect(a.AngleDifference(new A(2 * PI - 0.1))).toBeCloseTo(-0.2, 12);
    expect(new A(2 * PI - 0.1).AngleDifference(new A(0.1))).toBeCloseTo(0.2, 12);
    expect(new A(1).AngleDifference(new A(2))).toBeCloseTo(1, 12);
    // TurnAngle: +1 = turn towards increasing radians (clockwise on screen)
    expect(new A(1).TurnAngle(new A(1))).toBe(0);
    expect(new A(1).TurnAngle(new A(2))).toBe(1);
    expect(new A(2).TurnAngle(new A(1))).toBe(-1);
    expect(new A(0.1).TurnAngle(new A(2 * PI - 0.1))).toBe(-1); // shorter way round
    expect(new A(2 * PI - 0.1).TurnAngle(new A(0.1))).toBe(1);
    // TurnDirection (8 directions)
    expect(new A(0).TurnDirection(2)).toBe(1);
    expect(new A(0).TurnDirection(6)).toBe(-1);
    expect(new A(PI).TurnDirection(4)).toBe(0);
  });

  it('accessors: mAngle/mRotation/mDelta (getter-only properties ignore writes)', () => {
    const A = Thing.Math.CThing_Angle;
    const a = new A(0);
    a.mAngle = -PI;
    expect(a.mAngle).toBeCloseTo(PI, 9);
    a.mRotation = 90;
    expect(a.mRadians).toBeCloseTo(PI / 2, 12);
    expect(a.mRotation).toBeCloseTo(90, 9);
    const d = a.mDelta;
    expect(d.mX).toBeCloseTo(0, 12);
    expect(d.mY).toBeCloseTo(1, 12);
    a.mDelta = new Thing.Math.CThing_Position(-1, 0, 0);
    expect(a.mRadians).toBeCloseTo(PI, 9);
    a.mAngle256 = 5; // empty setter
    expect(a.mAngle256).toBe(128);
    const r = new A(0).RandomDirection();
    expect(r.mDirection % 2).toBe(0);
  });
});

describe('CThing_Position', () => {
  it('CellCentre / mCellCentre / Round / Floor', () => {
    const P = Thing.Math.CThing_Position;
    const p = new P(2.7, 3.1, 5);
    const c = p.mCellCentre;
    expect([c.mX, c.mY, c.mZ]).toEqual([2.5, 3.5, 5]);
    expect([p.mX, p.mY]).toEqual([2.7, 3.1]);
    expect(p.CellCentre()).toBe(p);
    expect([p.mX, p.mY, p.mZ]).toEqual([2.5, 3.5, 5]);
    expect([new P(-0.2, 1.5, 0).CellCentre().mX, new P(-0.2, 1.5, 0).Round().mY]).toEqual([-0.5, 2]);
  });

  it('Distance2D / Distance / Distance2D_SQR / AngleToPosition', () => {
    const P = Thing.Math.CThing_Position;
    const a = new P(1, 1, 0);
    const b = new P(4, 5, 12);
    expect(a.Distance2D(b)).toBe(5);
    expect(a.Distance2D_SQR(b)).toBe(25);
    expect(a.Distance(b)).toBe(13);
    expect(a.Distance_SQR(b)).toBe(169);
    expect(a.AngleToPosition(new P(1, 0, 0))).toBeCloseTo(1.5 * PI, 12); // [0, 2pi)
    expect(a.CAngleToPosition(new P(2, 1, 0)).mDirection).toBe(0);
  });

  it('Normalize / Normalize2D (zero vector unchanged)', () => {
    const P = Thing.Math.CThing_Position;
    const v = new P(3, 4, 0).Normalize(1);
    expect(v.mX).toBeCloseTo(0.6, 15);
    expect(v.mY).toBeCloseTo(0.8, 15);
    const z = new P(0, 0, 0).Normalize(5);
    expect([z.mX, z.mY, z.mZ]).toEqual([0, 0, 0]);
    const w = new P(0, 3, 7).Normalize2D(2);
    expect([w.mX, w.mY, w.mZ]).toEqual([0, 2, 7]);
    expect(new P(3, 4, 12).mLength).toBe(13);
    expect(new P(3, 4, 12).mLength2D).toBe(5);
  });

  it('ConvertScreenToCell / ConvertCellToScreen (PFactor projection)', () => {
    const P = Thing.Math.CThing_Position;
    const p = new P(64, 96, 0).ConvertScreenToCell();
    expect([p.mX, p.mY]).toEqual([2, 3]);
    const keep = P.mPFactor;
    try {
      P.mPFactor = -Math.sin(PI / 4);
      const s = new P(2.5, 3.25, 1).ConvertCellToScreen();
      expect(s.x).toBe(80);
      expect(s.y).toBe(Math.round((3.25 - Math.sin(PI / 4)) * 32));
    } finally {
      P.mPFactor = keep;
    }
  });

  it('Average keeps the original bug (Add() result discarded)', () => {
    const P = Thing.Math.CThing_Position;
    const r = P.Average([new P(2, 4, 6), new P(10, 10, 10)]);
    expect([r.mX, r.mY, r.mZ]).toEqual([1, 2, 3]);
    expect(new P(1, 2, 3).toString()).toBe('CThing_Position:{mX=1, mY=2, mZ=3}');
  });
});

describe('CMath', () => {
  it('Range clamps (NaN -> max, original ternary order)', () => {
    const M = scidd.Math.CMath;
    expect(M.Range(5, 0, 3)).toBe(3);
    expect(M.Range(-1, 0, 3)).toBe(0);
    expect(M.Range(2, 0, 3)).toBe(2);
    expect(M.Range(NaN, 0, 3)).toBe(3);
    expect(M.Never0(0)).toBe(0.000001);
    expect([M.Sign(-2), M.Sign(0), M.Sign(3)]).toEqual([-1, 0, 1]);
    expect(M.Define(undefined, 7)).toBe(7);
    expect(M.Define(0, 7)).toBe(0);
  });

  it('angles, rounding helpers, Tween', () => {
    const M = scidd.Math.CMath;
    expect(M.CorrectAngle(-PI / 2)).toBeCloseTo(1.5 * PI, 12);
    expect(M.CorrectAngle(5 * PI)).toBeCloseTo(PI, 12);
    expect(M.RotationDirection(0.1, 2 * PI - 0.1)).toBeCloseTo(-0.2, 12);
    expect(M.Round(17, 5)).toBe(15);
    expect(M.Floor(19, 5)).toBe(15);
    expect(M.Ceil(16, 5)).toBe(20);
    expect(M.DecimalPlaces(1.25)).toBe(2);
    expect(M.Tween(10, 20, 0.5)).toBe(15);
    expect(M.Tween(0, 1, 0.5, 1, 1)).toBeCloseTo(1 - Math.pow(0.5, 2), 12);
  });

  it('line helpers', () => {
    const M = scidd.Math.CMath;
    const hit = M.LineIntersection(new Point(0, 0), new Point(10, 10), new Point(0, 10), new Point(10, 0));
    expect([hit.x, hit.y]).toEqual([5, 5]);
    expect(M.LineIntersection(new Point(0, 0), new Point(1, 1), new Point(0, 10), new Point(10, 0))).toBeUndefined();
    expect(M.Distance_PointToLine(new Point(5, 3), new Point(0, 0), new Point(10, 0))).toBeCloseTo(3, 12);
    expect(M.Distance_Sqr(new Point(1, 1), new Point(4, 5))).toBe(25);
    expect(M.SideOfLine(new Point(5, 1), new Point(0, 0), new Point(10, 0))).toBe(10);
    expect(M.PointInShape(new Point(1, 1), [new Point(0, 0), new Point(2, 0), new Point(2, 2), new Point(0, 2)])).toBe(true);
    expect(M.PointInShape(new Point(1, 1), [new Point(0, 0), new Point(0, 2), new Point(2, 2), new Point(2, 0)])).toBe(false);
  });
});

describe('CLine (collision maths)', () => {
  const L = (x1: number, y1: number, x2: number, y2: number): any => new scidd.Math.CLine(new Point(x1, y1), new Point(x2, y2));

  it('point-to-segment distance (clamped to the end points) and infinite-line distance', () => {
    const l = L(0, 0, 10, 0);
    expect(l.Distance_PointToLine(new Point(5, 3))).toBeCloseTo(3, 12);
    expect(l.Distance_PointToLine(new Point(-3, 4))).toBeCloseTo(5, 12);
    expect(l.Distance_PointToLine(new Point(13, 4))).toBeCloseTo(5, 12);
    expect(L(0, 0, 10, 0).Distance_PointToLine(new Point(-3, 4), true)).toBeCloseTo(4, 12);
    expect(L(0, 0, 10, 10).QDistance_PointToLine_SQR(new Point(0, 10))).toBeCloseTo(50, 9);
    expect(L(0, 0, 10, 0).IsPointOnLine(new Point(4, 0))).toBe(true);
    expect(L(0, 0, 10, 0).IsPointOnLine(new Point(11, 0))).toBe(false);
  });

  it('segment intersection (Intersects) incl. parallel / degenerate cases', () => {
    const rp = new Point();
    expect(L(0, 0, 10, 10).Intersects(L(0, 10, 10, 0), rp)).toBe(true);
    expect([rp.x, rp.y]).toEqual([5, 5]);
    expect(L(0, 0, 1, 1).Intersects(L(0, 10, 10, 0), new Point())).toBe(false);
    expect(L(0, 0, 10, 0).Intersects(L(0, 1, 10, 1), new Point())).toBe(false); // parallel: NaN path
    const rp2 = new Point();
    expect(L(0, 0, 10, 0).Intersects(L(0, 5, 10, 5), rp2, true)).toBe(false); // infinite, parallel
    expect(L(0, 0, 10, 0).Intersects(L(5, -5, 5, 5), rp2, true)).toBe(true);
    expect([rp2.x, rp2.y]).toEqual([5, 0]);
    expect(L(0, 0, 10, 0).CrossLine(L(5, -5, 5, 5))).toBe(1);
    expect(L(0, 0, 10, 0).CrossLine(L(5, 5, 5, -5))).toBe(-1);
    expect(L(0, 0, 10, 0).QCrossLine(L(5, -5, 5, 5))).toBe(true);
    expect(L(0, 0, 10, 0).Parallel(L(3, 3, 7, 3))).toBe(true);
  });

  it('getter caches keep the AS2 quirks', () => {
    const l = L(0, 0, 0, 10);
    expect(l.mAngle).toBeUndefined(); // inverted cache test in the bytecode
    const n1 = l.mNormal; // first call returns the cache object itself
    expect([n1.x, n1.y]).toEqual([-10, 0]);
    const unit = l.mNormalUnit; // second call: a clone (cache unchanged)
    expect([unit.x, unit.y]).toEqual([-1, 0]);
    n1.normalize(1); // mutating the first result mutates the cache
    expect([l.mNormal.x, l.mNormal.y]).toEqual([-1, 0]);
    expect(l.mLength).toBe(10);
    l.mLength = 99; // empty setter
    expect(l.mLength).toBe(10);
    const r = l.GetRectangle();
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, 0, 10]);
  });
});

describe('CColor (pure helpers)', () => {
  it('RGB packing and brightness', () => {
    const C = scidd.Draw.CColor;
    const c = C.FromRGB(0x336699);
    expect([c.mRed, c.mGreen, c.mBlue, c.mAlpha]).toEqual([0x33, 0x66, 0x99, 255]);
    expect(c.getRGB()).toBe(0x336699);
    c.mBrightness = -0.5;
    expect(c.getRGB()).toBe((25 << 16) | (51 << 8) | 76);
    expect(C.ColorMatrix_Brightness(0.5)[4]).toBe(127.5);
    expect(C.MatrixMulti(C.ColorMatrix_Identity(), C.ColorMatrix_Identity())).toEqual(C.ColorMatrix_Identity());
    expect(new C(0, 0, 0, 255).mAlpha100).toBe(100);
  });

  it('World.Map.CMap_Cell static flag table', () => {
    const C = World.Map.CMap_Cell;
    expect([C.mCollide_Solid, C.mCollide_Ledge, C.mCollide_Creature, C.mCollide_Player, C.mCollide_Object, C.mCollide_EdgeOfMap])
      .toEqual([1, 2, 32, 64, 128, 256]);
    expect(C.mCollide_NonMovable).toBe(1 | 2 | 32 | 64 | 128);
    expect(C.mCollide_NoSpawn).toBe(32 | 128);
    expect(C.mCollide_Navigation).toBe(1 | 2 | 128);
    expect(C.mDirectionM_E).toBe(~(1 | 128 | 2));
    expect(C.mSize.x).toBe(32);
  });
});
