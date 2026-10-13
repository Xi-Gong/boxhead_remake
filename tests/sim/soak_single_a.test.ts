// Lane Q: Single-player soak of rooms 1, 2, 3, 4, 5, 6 at difficulty 0 (Beginner): a weapon-cycling bot (digit keys) plays 1500 world
// ticks per room with the original infinite-life switch, so every room runs the full time. Asserts: no engine
// errors, world invariants, bounded thing counts / lifetimes, spawn caps, level steps, upgrade + weapon unlock order.
import { describe, expect, it } from 'vitest';
import { soak, summary } from './soak.ts';
import { expectHealthySoak } from './soakSuite.ts';

const ROOMS = [1, 2, 3, 4, 5, 6];
const MIN_LEVEL: Record<number, number> = { 1: 2, 3: 2 };

describe('Single soak, difficulty 0 (Beginner)', () => {
  for (const room of ROOMS) {
    it(`room ${room}`, () => {
      const r = soak({ mode: 'Single', room, seed: 1000 + room, difficulty: 0, ticks: 1500, options: { infiniteLife: true } });
      expect(r.ticks, summary(r)).toBe(1500);
      expectHealthySoak(r, { running: true, minLevel: MIN_LEVEL[room] });
    });
  }
});
