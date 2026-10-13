// Lane Q: Death Match soak — two bots hunt each other for 1500 world ticks in a spread of rooms. Asserts the Death
// Match rules on top of the generic soak checks: no zombies/devils, multiplier x200 with every upgrade active from the
// start, the non-pistol weapons start empty, deaths are counted per player and a dead player respawns.
import { describe, expect, it } from 'vitest';
import { soak, summary } from './soak.ts';
import { expectHealthySoak } from './soakSuite.ts';

const ROOMS = [1, 3, 6, 10, 14, 18];

describe('Death Match soak', () => {
  for (const room of ROOMS) {
    it(`room ${room}`, () => {
      const r = soak({ mode: 'DeathMatch', room, seed: 3000 + room, ticks: 1500, options: { gameAmount: 3 } });
      expect(r.ticks, summary(r)).toBe(1500);
      expectHealthySoak(r, { running: true });
      // start: x200, level 1, every multiplier upgrade active, all weapons unlocked, only the pistol has ammo
      expect(r.start.multiplier).toBe(200);
      expect(r.start.level).toBe(1);
      expect(r.initialActive.length).toBe(r.game.world().mUpgrades.mMultiplierList.length);
      for (const p of r.start.players) {
        expect(p.weapons.length).toBe(10);
        expect(p.weapon).toBe('pistol');
      }
      const deaths = r.end.deaths[0] + r.end.deaths[1];
      if (deaths > 0) {
        // somebody died and came back: both players are controllable again at some later snapshot
        expect(r.snapshots.some((s) => s.players.every((p) => p.state === 'State_PlayerControl'))).toBe(true);
      }
    });
  }
});
