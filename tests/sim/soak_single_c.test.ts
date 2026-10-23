// Lane Q: Single-player soak of rooms 13, 14, 15, 16, 17, 18 at difficulty 1 (Intermediate: level 10, x10): a weapon-cycling bot (digit keys) plays 1500 world
// ticks per room with the original infinite-life switch, so every room runs the full time. Asserts: no engine
// errors, world invariants, bounded thing counts / lifetimes, spawn caps, level steps, upgrade + weapon unlock order.
import { describe, expect, it } from 'vitest';
import { soak, summary } from './soak.ts';
import { expectHealthySoak } from './soakSuite.ts';

const ROOMS = [13, 14, 15, 16, 17, 18];
const MIN_LEVEL: Record<number, number> = {};

describe('Single soak, difficulty 1 (Intermediate: level 10, x10)', () => {
  for (const room of ROOMS) {
    it(`room ${room}`, () => {
      const r = soak({ classicFeatures:['difficulty-waves-v1'], mode: 'Single', room, seed: 1000 + room, difficulty: 1, ticks: 1500, options: { infiniteLife: true }, bots:[{cycleEvery:90,digits:true,detourBlockedStrafe:true}] });
      expect(r.ticks, summary(r)).toBe(1500);
      expectHealthySoak(r, { running: true, minLevel: MIN_LEVEL[room] });
    });
  }
});
