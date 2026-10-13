import { describe, expect, it } from 'vitest';
import { extractRooms } from '../../../tools/rooms/extractRooms.ts';
import { getBuild } from './helpers.ts';

/** Plan appendix E: room -> [cellsW, cellsH, Zombie, Devil, Player2, Barrel, Wall, Pickup]. */
const TABLE: Record<number, number[]> = {
  1: [22, 17, 4, 4, 7, 12, 0, 2], 2: [25, 21, 32, 4, 7, 12, 0, 4], 3: [34, 38, 16, 3, 13, 6, 12, 7],
  4: [25, 25, 44, 4, 8, 20, 6, 4], 5: [46, 17, 10, 3, 10, 2, 6, 4], 6: [22, 41, 14, 2, 9, 6, 0, 5],
  7: [33, 30, 18, 6, 19, 12, 12, 5], 8: [30, 25, 24, 10, 15, 8, 12, 4], 9: [41, 33, 10, 6, 29, 24, 0, 18],
  10: [58, 17, 18, 4, 16, 6, 0, 8], 11: [41, 33, 29, 13, 21, 6, 0, 5], 12: [40, 33, 46, 6, 28, 0, 0, 5],
  13: [38, 34, 8, 4, 25, 0, 0, 7], 14: [58, 47, 50, 10, 30, 10, 87, 20], 15: [84, 17, 14, 2, 9, 0, 0, 10],
  16: [58, 50, 48, 20, 60, 32, 24, 16], 17: [84, 22, 30, 4, 27, 0, 0, 9], 18: [87, 87, 164, 8, 132, 0, 0, 4],
};

describe('room oracle (from SWF timelines)', () => {
  const rooms = extractRooms(getBuild().lib);

  it('has 18 rooms', () => {
    expect(rooms.map((r) => r.linkage)).toEqual(Array.from({ length: 18 }, (_, i) => `ROOM_Single_${String(i + 1).padStart(4, '0')}`));
  });

  it.each(Object.entries(TABLE))('room %s: size in cells and marker counts match appendix E', (n, row) => {
    const r = rooms[Number(n) - 1];
    const c = r.counts;
    expect([r.size.cells.w, r.size.cells.h, c.Zombie, c.Devil, c.Player2, c.Barrel, c.Wall, c.Pickup]).toEqual(row);
    expect(c.Player1).toBeGreaterThanOrEqual(1);
    expect(r.markers.length).toBe(c.Zombie + c.Devil + c.Player1 + c.Player2 + c.Barrel + c.Wall + c.Pickup);
  });

  it('every piece carries exactly one collision block; game formula agrees with the composed rect', () => {
    for (const r of rooms) {
      expect(r.collision.length, r.linkage).toBe(r.pieces.length);
      for (const [i] of r.pieces.entries()) expect(r.collision.filter((c) => c.piece === i)).toHaveLength(1);
      // (blocks of border walls may extend past the map edge; MarkArea clips them)
      for (const c of r.collision) expect(c.gameCells, `${r.linkage} ${c.path}`).toEqual(c.worldCells);
      for (const p of r.pieces) expect(p.translationOnly).toBe(true);
      expect(r.classMismatches).toEqual([]);
    }
  });

  it('markers lie inside the room, except 6 spawn points just below room 13 (TIGHT 2)', () => {
    const outside: string[] = [];
    for (const r of rooms) for (const m of r.markers) {
      const { x, y } = m.cellFloor;
      if (x < 0 || y < 0 || x >= r.size.cells.w || y >= r.size.cells.h) outside.push(`${r.room}:${m.type}@${x},${y}`);
    }
    expect(outside).toEqual(['13:Zombie@14,34', '13:Zombie@15,34', '13:Devil@15,34', '13:Zombie@34,34', '13:Zombie@35,34', '13:Devil@35,34']);
  });

  it('room 1 (BOXY) details', () => {
    const r = rooms[0];
    expect(r.size.px.w).toBeCloseTo(704, 0);
    expect(r.size.px.h).toBeCloseTo(544, 0);
    expect(r.counts.CollisionSolid).toBe(12);
    expect(r.counts.Piece).toBe(12);
    expect(r.collision[0]).toMatchObject({ path: '@5/@7', worldCells: { xMin: 8, yMin: 1, xMax: 10, yMax: 3 } });
  });
});
