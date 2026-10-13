// Lane Q: Coop soak — two weapon-cycling bots (P1 arrows + '/' + ',' '.', P2 WASD + Space + Q E) play 1500 world
// ticks in a spread of rooms and difficulties with the original infinite-life switch. Same assertions as the Single
// soak plus: both players exist the whole time and stay within the KeepDistance box (19 x 13 cells).
import { describe, expect, it } from 'vitest';
import { soak, summary } from './soak.ts';
import { expectHealthySoak } from './soakSuite.ts';

const CASES: [room: number, difficulty: 0 | 1 | 2 | 3][] = [[1, 0], [5, 2], [9, 1], [11, 0], [13, 3], [17, 2]];

describe('Coop soak', () => {
  for (const [room, difficulty] of CASES) {
    it(`room ${room}, difficulty ${difficulty}`, () => {
      const r = soak({ mode: 'Coop', room, seed: 2000 + room, difficulty, ticks: 1500, options: { infiniteLife: true } });
      expect(r.ticks, summary(r)).toBe(1500);
      expectHealthySoak(r, { running: true });
      for (const s of r.snapshots) {
        expect(s.players.map((p) => p.index)).toEqual([0, 1]);
        const [a, b] = s.players;
        // KeepDistance only blocks moves that increase the distance beyond 19 x 13 (knock-backs may push further)
        expect(Math.abs(a!.x - b!.x), `tick ${s.tick} dx`).toBeLessThan(19 + 2);
        expect(Math.abs(a!.y - b!.y), `tick ${s.tick} dy`).toBeLessThan(13 + 2);
      }
    });
  }
});
