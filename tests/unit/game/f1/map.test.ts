// Lane F1: World/Map ports on small synthetic maps (headless, deterministic).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import './f1Modules.ts';
import { CTHING_FLAGS, installStubs } from './f1Modules.ts';
import { CMain, DrawPrimitive, Thing, World } from '../../../../src/game/packages.ts';
import { Rectangle } from '../../../../src/engine/flash/geom.ts';
import { advanceVirtual, useRealClock, useVirtualClock } from '../../../../src/engine/flash/clock.ts';
import { seedRandom } from '../../../../src/engine/flash/rng.ts';

const P = (x: number, y: number, z = 0): any => new Thing.Math.CThing_Position(x, y, z);

/** A CMap for a W x H cell room (the map only needs world.mArea). */
function makeMap(w: number, h: number): any {
  const world = { mArea: new Rectangle(0, 0, w * 32, h * 32) };
  return new World.Map.CMap(world);
}

let uid = 0;
function thing(x: number, y: number, extra: Record<string, any> = {}): any {
  uid++;
  return {
    sUniqueID: 't' + uid, mID: uid, mPosition: P(x, y), mDelta: P(0, 0), mRadius: 0.25, mRadius_SQR: 0.0625,
    mFlags: CTHING_FLAGS.mFlag_Collidable, mAffectFlags: 1, mHeight: 1, ...extra,
  };
}

beforeAll(() => {
  installStubs();
  seedRandom(99);
});

describe('CMap / CMap_Cell construction', () => {
  it('cells, border flags (EdgeOfMap|Solid), adjacency and the invalid cell', () => {
    const map = makeMap(8, 6);
    const C = World.Map.CMap_Cell;
    expect([map.mSize.x, map.mSize.y]).toEqual([8, 6]);
    expect(map.mCells.length).toBe(6);
    expect(map.mCells[0].length).toBe(8);
    const edge = C.mCollide_EdgeOfMap | C.mCollide_Solid;
    for (let x = 0; x < 8; x++) expect([map.mCells[0][x].mCollide, map.mCells[5][x].mCollide]).toEqual([edge, edge]);
    for (let y = 0; y < 6; y++) expect([map.mCells[y][0].mCollide, map.mCells[y][7].mCollide]).toEqual([edge, edge]);
    expect(map.mCells[2][3].mCollide).toBe(0);
    const c = map.GetCell(3.9, 2.2);
    expect(c).toBe(map.mCells[2][3]);
    expect([c.mPosition.x, c.mPosition.y, c.mCentre.mX, c.mCentre.mY]).toEqual([3, 2, 3.5, 2.5]);
    // ac[d] = neighbour in CThing_Angle direction d (E, SE, S, SW, W, NW, N, NE)
    expect(c.ac.map((n: any) => [n.mPosition.x, n.mPosition.y])).toEqual([[4, 2], [4, 3], [3, 3], [2, 3], [2, 2], [2, 1], [3, 1], [4, 1]]);
    expect([c.mEast, c.mSouth, c.mWest, c.mNorth, c.mNext]).toEqual([c.ac[0], c.ac[2], c.ac[4], c.ac[6], c.ac[0]]);
    const corner = map.mCells[0][0];
    expect(corner.ac[4]).toBe(map.mInvalidCell);
    expect(map.mInvalidCell.mCollide).toBe(C.mCollide_Solid);
    expect(map.GetCell(-1, 0)).toBeUndefined(); // (-1 & 0xFFFFFF) is off the map
    expect([map.mMath._CLASSID_, map.mNavigation._CLASSID_, map.mCollide._CLASSID_, map.mAffect._CLASSID_, map.mMapwho._CLASSID_, map.mDecal._CLASSID_])
      .toEqual(['CMap_Math', 'CMap_Navigation', 'CMap_Collide', 'CMap_Affect', 'CMap_Mapwho', 'CMap_Decal']);
    expect(map.mFirstTime).toBe(true);
  });

  it('MarkArea_PP marks the half-open rectangle [p1, p2) (CWorld_Init_CollisionSolid)', () => {
    const map = makeMap(8, 6);
    const S = World.Map.CMap_Cell.mCollide_Solid;
    map.mCollide.MarkArea_PP(P(2, 2), P(4, 4), S);
    const solid = (x: number, y: number): number => map.mCells[y][x].mCollide & S;
    expect([solid(2, 2), solid(3, 2), solid(2, 3), solid(3, 3)]).toEqual([S, S, S, S]);
    expect([solid(4, 2), solid(2, 4), solid(1, 2), solid(2, 1)]).toEqual([0, 0, 0, 0]);
    // flags are OR-ed in
    map.mCollide.MarkArea_PP(P(2, 2), P(3, 3), World.Map.CMap_Cell.mCollide_Object);
    expect(map.mCells[2][2].mCollide).toBe(S | 128);
    // an area running off the map is clipped silently (AS2 writes to undefined are no-ops)
    expect(() => map.mCollide.MarkArea_PP(P(6, 4), P(10, 8), S)).not.toThrow();
    expect(map.mCells[5][7].mCollide & S).toBe(S);
  });

  it('cell flag helpers: CollideFlagsInDirection / GetClearMoveDirection / ValidMoveDirection', () => {
    const map = makeMap(8, 6);
    const C = World.Map.CMap_Cell;
    const c = map.mCells[2][3];
    map.mCells[2][4].mCollide = C.mCollide_Solid; // east
    expect(c.CollideFlagsInDirection(0)).toBe(C.mCollide_Solid);
    // diagonals also include both orthogonal neighbours
    expect(c.CollideFlagsInDirection(1)).toBe(C.mCollide_Solid);
    expect(c.CollideFlagsInDirection(7)).toBe(C.mCollide_Solid);
    expect(c.CollideFlagsInDirection(2)).toBe(0);
    // d2 = 0 blocked -> tries d2 +/- 2 first in the turn direction from d1
    expect(c.GetClearMoveDirection(0, 2)).toBe(6);
    expect(c.GetClearMoveDirection(0, 6)).toBe(2);
    expect(c.ValidMoveDirection()).toBe(map.mCells[3][3]); // first of E,S,W,N without static flags
  });
});

describe('CMap_Mapwho (bucket moves)', () => {
  it('Add / Move / Delete keep the cell buckets and mCellID in sync', () => {
    const map = makeMap(8, 6);
    const mw = map.mMapwho;
    const t = thing(2.5, 3.5);
    mw.AddThing(t);
    const c23 = map.mCells[3][2];
    expect(c23.mObjects[t.sUniqueID]).toBe(t);
    expect(c23.mChildCount).toBe(1);
    expect(c23.mObjects.length).toBe(0); // string keys only (AS2 Array used as a hash)
    expect([t.mCellID.x, t.mCellID.y]).toEqual([2, 3]);
    expect(t.mCellID).not.toBe(c23.mID); // a clone
    t.mPosition = P(2.9, 3.1);
    expect(mw.MoveThing(t)).toBe(false);
    t.mPosition = P(3.1, 3.5);
    expect(mw.MoveThing(t)).toBe(true);
    expect(c23.mObjects[t.sUniqueID]).toBeUndefined();
    expect(c23.mChildCount).toBe(0);
    const c33 = map.mCells[3][3];
    expect(c33.mObjects[t.sUniqueID]).toBe(t);
    expect(c33.ContainsClassID(undefined)).toBe(t);
    mw.DeleteThing(t);
    expect(c33.mChildCount).toBe(0);
    expect(t.mCellID).toBeUndefined();
    mw.DeleteThing(t); // second delete: no-op
    expect(c33.mChildCount).toBe(0);
  });

  it('MoveThing of a thing without mCellID adds it (first placement)', () => {
    const map = makeMap(8, 6);
    const t = thing(4.2, 1.8);
    expect(map.mMapwho.MoveThing(t)).toBe(true);
    expect(map.mCells[1][4].mObjects[t.sUniqueID]).toBe(t);
  });
});

describe('CMap_Collide', () => {
  function walledMap(): any {
    const map = makeMap(8, 6);
    map.mCollide.MarkArea_PP(P(4, 1), P(5, 5), World.Map.CMap_Cell.mCollide_Solid); // wall column x = 4
    return map;
  }

  it('Collide_Map slides along the wall (x blocked, y kept) and sets mCollideFlag', () => {
    const map = walledMap();
    const col = map.mCollide;
    col.mCollideFlag = false;
    const r = col.Collide_Map(P(3.2, 2.5), P(0.6, 0.3), 0.25);
    expect([r.mX, r.mY]).toEqual([3.2, 2.8]);
    expect(col.mCollideFlag).toBe(true);
    col.mCollideFlag = false;
    const free = col.Collide_Map(P(2.2, 2.5), P(0.3, 0.3), 0.25);
    expect([free.mX, free.mY]).toEqual([2.5, 2.8]);
    expect(col.mCollideFlag).toBe(false);
    // inside an EdgeOfMap cell the position is returned unchanged
    const edge = P(0.5, 0.5);
    expect(col.Collide_Map(edge, P(1, 1), 0.25)).toBe(edge);
    expect(col.QCollide_Map(P(3.8, 2.5), 0.25)).toBe(true);
    expect(col.QCollide_Map(P(3.5, 2.5), 0.25)).toBe(false);
  });

  it('Collide_Mapwho pushes out of collidable things; PlayerCollide combines both', () => {
    const map = walledMap();
    const col = map.mCollide;
    const other = thing(2.5, 2.5, { mRadius: 0.25 });
    map.mMapwho.AddThing(other);
    col.mCollideFlag = false;
    const p = col.Collide_Mapwho(P(2.5, 2.8), 0.25, -1);
    expect(p.mX).toBeCloseTo(2.5, 12);
    expect(p.mY).toBeCloseTo(3.0, 12); // pushed to distance r1 + r2
    expect(col.mCollideFlag).toBe(true);
    expect(other.mCollidedWithID).toBe(other.mID);
    // own ID is ignored
    col.mCollideFlag = false;
    col.Collide_Mapwho(P(2.5, 2.8), 0.25, other.mID);
    expect(col.mCollideFlag).toBe(false);
    // PlayerCollide: moving player towards the wall
    const player = thing(3.2, 4.5, { mDelta: P(0.6, 0), mRadius: 0.3 });
    const out = col.PlayerCollide(player);
    expect(out.mX).toBeCloseTo(3.2, 12); // blocked by the wall (x), radius * 0.85 used for the map test
    (CMain as any).mSaveData.mCollisionsActive = false;
    try {
      const out2 = col.PlayerCollide(thing(1.5, 3.5, { mDelta: P(0.2, 0) }));
      expect(out2.mX).toBeCloseTo(1.7, 12);
    } finally {
      (CMain as any).mSaveData.mCollisionsActive = true;
    }
  });

  it('Collide_Line hits the nearest wall cell edge / a thing (POI moved back by the thing radius)', () => {
    const map = walledMap();
    const col = map.mCollide;
    const shooter = { mID: 1000 };
    const hit = col.Collide_Line(shooter, P(2.6, 2.5), P(6.5, 2.5), 0.1, 1, true);
    expect(hit.mCollideType).toBe('wall');
    expect([hit.mPOI.x, hit.mPOI.y]).toEqual([4, 2.5]);
    expect(col.Collide_Line(shooter, P(2.6, 2.5), P(3.0, 2.5), 0.1, 1, true)).toBeUndefined();
    // same padding quirk at the far end: a segment ending at x = 3.5 already "hits" the wall edge at x = 4
    expect(col.Collide_Line(shooter, P(2.6, 2.5), P(3.5, 2.5), 0.1, 1, true).mPOI.x).toBe(4);
    // Original quirk (kept): the swept area is padded by one cell (GetCellBounds: round(left) - 1) and
    // LineIntersection_Map intersects the INFINITE line with the cell's entry edge, so a solid cell just BEHIND the
    // start point is hit too (here the border column x = 0 behind a shot starting at x = 1.5).
    const behind = col.Collide_Line(shooter, P(1.5, 2.5), P(6.5, 2.5), 0.1, 1, true);
    expect([behind.mCollideType, behind.mPOI.x, behind.mPOI.y]).toEqual(['wall', 0, 2.5]);
    // a thing in front of the wall
    const target = thing(2.5, 2.5, { mRadius: 0.4, mRadius_SQR: 0.16, mAffectFlags: 1 });
    map.mMapwho.AddThing(target);
    const h2 = col.Collide_Line(shooter, P(1.6, 2.5), P(6.5, 2.5), 0.1, 1, false);
    expect(h2.mCollideType).toBe('thing');
    expect(h2.mThing).toBe(target);
    expect(h2.mPOI.x).toBeCloseTo(2.1, 12); // 2.5 - radius 0.4
    expect(h2.mPOI.y).toBeCloseTo(2.5, 12);
    // affect flags not matching -> the thing is ignored, the wall is hit
    const h3 = col.Collide_Line(shooter, P(2.6, 2.5), P(6.5, 2.5), 0.1, 2, false);
    expect(h3.mCollideType).toBe('wall');
  });
});

describe('CMap_Affect', () => {
  it('AffectArea: square (x-r, y-r, 2r, 2r) reaches cells round(x-r)-1 .. round(x+r)', () => {
    const map = makeMap(10, 8);
    const hits: number[] = [];
    const mk = (cx: number, cy: number): any => {
      const t = thing(cx + 0.5, cy + 0.5, { Affect: () => hits.push(t.mID), cell: [cx, cy] });
      map.mMapwho.AddThing(t);
      return t;
    };
    const x = 4.5, y = 3.5, r = 1;
    // expected cell range: x 3..6, y 2..5
    const inside = [mk(3, 2), mk(6, 5), mk(4, 3), mk(6, 2)];
    const outside = [mk(2, 3), mk(7, 3), mk(4, 1), mk(4, 6)];
    const tAffect = { mType: 1, mAffector: { mID: -5 } };
    map.mAffect.AffectArea(new Rectangle(x - r, y - r, r * 2, r * 2), tAffect);
    expect(hits.sort((a, b) => a - b)).toEqual(inside.map((t) => t.mID).sort((a, b) => a - b));
    for (const t of outside) expect(hits).not.toContain(t.mID);
    // generic rule check against GetCellBounds
    const b = map.GetCellBounds(new Rectangle(x - r, y - r, 2 * r, 2 * r));
    expect([b.left, b.right, b.top, b.bottom]).toEqual([Math.round(x - r) - 1, Math.round(x + r), Math.round(y - r) - 1, Math.round(y + r)]);
    // the affector itself and things without matching flags are skipped
    hits.length = 0;
    map.mAffect.AffectArea(new Rectangle(x - r, y - r, r * 2, r * 2), { mType: 1, mAffector: { mID: inside[2].mID } });
    expect(hits).not.toContain(inside[2].mID);
    hits.length = 0;
    map.mAffect.AffectArea(new Rectangle(x - r, y - r, r * 2, r * 2), { mType: 2, mAffector: { mID: -5 } });
    expect(hits).toEqual([]);
  });

  it('GetCellList_Area clamps to the map and returns [] for a NaN area', () => {
    const map = makeMap(5, 5);
    expect(map.GetCellList_Area(new Rectangle(NaN, 0, 1, 1))).toEqual([]);
    expect(map.GetCellList_Area(new Rectangle(-3, -3, 2, 2)).length).toBe(0); // right = round(-1) < left = 0
    expect(map.GetCellList_Area(new Rectangle(-0.4, -0.4, 0.5, 0.5)).length).toBe(1); // only (0,0)
    expect(map.GetCellList_Area(new Rectangle(1.2, 1.2, 1, 1), true).map((c: any) => [c.mPosition.x, c.mPosition.y]))
      .toEqual([[1, 1], [2, 1], [1, 2], [2, 2]]);
  });
});

describe('CMap.Draw (y-sorted drawing of mapwho buckets)', () => {
  it('draws things in screen-row order and flags them as drawn', () => {
    const map = makeMap(8, 6);
    const order: string[] = [];
    const mk = (name: string, x: number, y: number, floor = false): any => {
      const t = thing(x, y, { mP: P(x, y), mFlags: floor ? CTHING_FLAGS.mFlag_SortFloor : 0, Draw: () => order.push(name) });
      map.mMapwho.AddThing(t);
      return t;
    };
    const a = mk('a', 2.5, 3.9);
    const b = mk('b', 4.5, 2.1);
    const c = mk('c', 3.5, 3.95, true); // floor things sort at the top of their cell row (int(y) * 32)
    map.Draw(new Rectangle(0, 0, 8 * 32, 6 * 32));
    expect(order).toEqual(['b', 'c', 'a']);
    for (const t of [a, b, c]) expect(t.mFlags & CTHING_FLAGS.mFlag_Drawn).toBe(CTHING_FLAGS.mFlag_Drawn);
  });
});

describe('Navigation flow field (CMap_Cell.Nav_*)', () => {
  // 10 x 8 room with an interior wall (x = 5, y = 1..5) and an object cell
  function navMap(): any {
    const map = makeMap(10, 8);
    map.mCollide.MarkArea_PP(P(5, 1), P(6, 6), World.Map.CMap_Cell.mCollide_Solid);
    map.mCells[6][3].mCollide |= World.Map.CMap_Cell.mCollide_Object; // Navigation flag includes objects
    map.mCells[2][7].mCollide |= World.Map.CMap_Cell.mCollide_Creature; // creatures do NOT block the flow field
    return map;
  }
  /**
   * Independent 4-neighbour BFS (skipping Solid|Ledge|Object cells), mapped to the original's numbering: NF_4 stamps
   * a layer with nSDist BEFORE nSDist++ ([BC] Nav_Update @162990), so the start cell AND its first ring get 0, the
   * second ring 1, ... => nDist = max(0, bfs - 1).
   */
  function bfs(map: any, sx: number, sy: number): number[][] {
    const N = World.Map.CMap_Cell.mCollide_Navigation;
    const d = map.mCells.map((row: any[]) => row.map(() => -1));
    const q: [number, number][] = [[sx, sy]];
    d[sy][sx] = 0;
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const c = map.mCells[ny]?.[nx];
        if (!c || c.mCollide & N || d[ny][nx] >= 0) continue;
        d[ny][nx] = d[y][x] + 1;
        q.push([nx, ny]);
      }
    }
    return d.map((row: number[]) => row.map((v) => (v < 0 ? -1 : Math.max(0, v - 1))));
  }
  function runUntilFinished(_map: any, cells: any[], maxCalls = 100): number {
    const C = World.Map.CMap_Cell;
    let calls = 0;
    do {
      C.Nav_Update(cells);
      calls++;
      advanceVirtual(20);
    } while (C.nState != 'finished' && calls < maxCalls);
    return calls;
  }
  function dists(map: any): number[][] {
    const C = World.Map.CMap_Cell;
    return map.mCells.map((row: any[]) => row.map((c: any) => (c.nID == C.nSID ? c.nDist : -1)));
  }

  beforeEach(() => {
    useVirtualClock(10000);
    World.Map.CMap_Cell.Nav_Reset();
  });
  afterEach(() => {
    World.Map.CMap_Cell.mNavBudgetMode = undefined;
  });
  afterAll(() => useRealClock());

  it('BFS distances from the player cell (5 layers in the first call, then resumed), stamped with getTimer()', () => {
    const map = navMap();
    const C = World.Map.CMap_Cell;
    const start = map.mCells[2][2];
    C.Nav_Update([start]);
    expect(C.nSID).toBe(10000); // stamp = getTimer() of the restart
    expect(C.nState).toBe('resume');
    expect(C.nSDist).toBe(5); // "restart" expands at most 5 layers
    const calls = runUntilFinished(map, [start]);
    expect(C.nState).toBe('finished');
    expect(calls).toBeGreaterThan(1);
    expect(dists(map)).toEqual(bfs(map, 2, 2));
    expect(map.mCells[2][7].nDist).toBeGreaterThan(0); // creature cell is part of the field
    expect(map.mCells[6][3].nID).not.toBe(C.nSID); // object cell skipped
  });

  it('deterministic cells-per-call budget (test hook) gives the same field over more calls', () => {
    const map = navMap();
    const C = World.Map.CMap_Cell;
    C.mNavBudgetMode = 1;
    const states: string[] = [];
    let calls = 0;
    do {
      C.Nav_Update([map.mCells[6][1]]);
      states.push(C.nState);
      calls++;
    } while (C.nState != 'finished' && calls < 200);
    expect(C.nState).toBe('finished');
    expect(states).toContain('continue');
    expect(dists(map)).toEqual(bfs(map, 1, 6));
  });

  it('Nav_Direction follows decreasing nDist while fresh, falls back to NavReal_Dir after 2000 ms', () => {
    const map = navMap();
    const C = World.Map.CMap_Cell;
    const start = map.mCells[2][2];
    runUntilFinished(map, [start]);
    const NM = C.mCollide_NonMovable;
    const c = map.mCells[2][4]; // two cells east of the player
    expect(c.Nav_Direction(0, 4, NM, false)).toBe(4); // tDir west has a smaller distance
    expect(c.Nav_Direction(4, 0, NM, false)).toBe(4); // cDir also tried
    const behind = map.mCells[4][6]; // east of the wall
    expect(behind.Nav_Direction(2, 2, NM, false)).toBe(2); // south goes around the wall
    // stale field: nSTimer - nID >= 2000 -> greedy NavReal_Dir towards tDir
    advanceVirtual(2500);
    C.Nav_Update([start]); // state 'finished': only refreshes nSTimer
    expect(C.nState).toBe('finished');
    seedRandom(5);
    const stale = behind.Nav_Direction(4, 4, NM, false);
    seedRandom(5);
    expect(stale).toBe(behind.NavReal_Dir(4, 4, NM));
    expect([2, 6]).toContain(stale); // west blocked -> +/-2 (random turn side when cDir == tDir)
    // Nav_Restart: finished -> restart (and bumps nSID)
    const sid = C.nSID;
    C.Nav_Restart();
    expect(C.nState).toBe('restart');
    expect(C.nSID).toBe(sid + 1);
  });
});

describe('Decal helpers (pure)', () => {
  it('CDrawPrimitive.InvertAlpha maps alpha a -> 255 - a through paletteMap', () => {
    let args: any[] = [];
    const bm = { rectangle: new Rectangle(0, 0, 4, 4), paletteMap: (...a: any[]) => { args = a; } };
    DrawPrimitive.CDrawPrimitive.InvertAlpha(bm);
    expect(args[0]).toBe(bm);
    expect(args[1]).toBe(bm.rectangle);
    expect([args[2].x, args[2].y]).toEqual([0, 0]);
    expect([args[3], args[4], args[5]]).toEqual([null, null, null]);
    const alpha = args[6];
    expect(alpha.length).toBe(256);
    for (let a = 0; a < 256; a++) expect(alpha[a] >>> 24).toBe(255 - a);
    expect(alpha[0]).toBe(-16777216); // signed int32 like AVM1
    expect(alpha[255]).toBe(0);
  });
});

describe('Nav_Direction full scan (sortOn nDist, RETURNINDEXEDARRAY|NUMERIC|DESCENDING)', () => {
  function openCell(): any {
    useVirtualClock(50000);
    const map = makeMap(5, 5);
    const C = World.Map.CMap_Cell;
    C.nSTimer = 50000; // fresh field
    C.nFullScanCount = 0; // static counter is reset per Nav_Update in the game; isolate tests
    const c = map.mCells[2][2];
    c.nID = 50000;
    c.nDist = 5;
    // neighbours in direction order E, SE, S, SW, W, NW, N, NE
    [7, 6, 9, 3, 8, 4, 10, 2].forEach((d, i) => { c.ac[i].nDist = d; });
    return { map, c };
  }
  afterAll(() => useRealClock());

  it('picks the neighbour with the smallest nDist among the directions allowed by Nav_VD', () => {
    const { c } = openCell();
    const NM = World.Map.CMap_Cell.mCollide_NonMovable;
    // tDir (E = 7) and cDir (S = 9) are not closer -> full scan -> NE (2)
    expect(c.Nav_Direction(2, 0, NM, false)).toBe(7);
    // block the NE neighbour: next best is SW (3)
    c.ac[7].mCollide = World.Map.CMap_Cell.mCollide_Creature;
    expect(c.Nav_Direction(2, 0, NM, false)).toBe(3);
    // blocking S removes SE and SW too (Nav_VD masks), next is NW (4)
    c.ac[2].mCollide = World.Map.CMap_Cell.mCollide_Solid;
    expect(c.Nav_Direction(2, 0, NM, false)).toBe(5);
    // tForceIt == false counts full scans: more than 5 in one Nav_Update -> -1
    const C = World.Map.CMap_Cell;
    C.nFullScanCount = 5;
    expect(c.Nav_Direction(2, 0, NM, false)).toBe(-1);
    expect(c.Nav_Direction(2, 0, NM, true)).toBe(5);
  });

  // TODO(lane C / oracle probe P9): neighbours never reached by the BFS (walls, map border) have nDist === undefined.
  // Flash/Ruffle AVM1 sortOn NUMERIC compares two numbers numerically but falls back to a STRING compare when a key is
  // not a number, so `undefined` ("undefined") sorts after every number (first under DESCENDING) and is never picked
  // before a reached cell. as2.ts sortOn() currently turns undefined into NaN (inconsistent comparator).
  it('undefined nDist neighbours sort as the largest keys (AVM1 NUMERIC compare falls back to strings)', () => {
    const { c } = openCell();
    const NM = World.Map.CMap_Cell.mCollide_NonMovable;
    c.ac[7].nDist = undefined; // NE unknown
    c.ac[5].nDist = undefined; // NW unknown
    expect(c.Nav_Direction(2, 0, NM, false)).toBe(3); // SW (3) is the smallest defined
  });
});
