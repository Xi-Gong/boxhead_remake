// v0.2.3 spawn-solid audit (plan §D): every room x {Coop, DeathMatch} x several seeds must start both players
// on non-Solid cells. Root cause being guarded: room 11 PATCHY has a Player2 spawn marker inside the
// Slab_Large collision area and the original spawn scan (Spawn_ValidPosition_Close/_Far) never tests Solid
// (faithful port of an original data defect), so the P2 pick is seed-dependent and can embed the player in a
// slab where CMap_Collide.PlayerCollide keeps them frozen. Coop/DM soaks previously covered only 6 rooms each;
// this audit is the always-on gate for all 18.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, InvariantChecker } from './harness.ts';
import { World } from '../../src/game/packages.ts';

const SOLID = World.Map.CMap_Cell.mCollide_Solid;
const SEEDS = [11, 101, 211, 307];

describe('spawn-solid audit (all rooms, both 2P modes)', () => {
  for (const mode of ['Coop', 'DeathMatch'] as const) {
    for (let room = 1; room <= 18; room++) {
      it(`${mode} room ${room}: both players spawn on non-Solid cells (seeds ${SEEDS.join(',')})`, { timeout: 120000 }, () => {
        for (const seed of SEEDS) {
          const g = createHeadlessGame({ mode, room, seed });
          g.tick(2);
          const w = g.world();
          const players = g.players();
          expect(players.length, `${mode} room ${room} seed ${seed}: both players spawned`).toBe(2);
          for (const p of players) {
            const cx = Math.floor(p.mPosition.mX), cy = Math.floor(p.mPosition.mY);
            const collide = w.mMap.mCells[cy][cx].mCollide;
            expect(
              collide & SOLID,
              `${mode} room ${room} seed ${seed}: P${p.mPlayerIndex + 1} spawned in a Solid cell (${cx},${cy}, collide ${collide})`,
            ).toBe(0);
          }
          // Cross-check with the harness invariant (first-seen spawn_solid, players only).
          const issues = new InvariantChecker().check(w).filter((i) => i.kind === 'spawn_solid' && i.cls === 'CThing_Creature_Player');
          expect(issues, `${mode} room ${room} seed ${seed}`).toEqual([]);
          expect(g.errors).toEqual([]);
        }
      });
    }
  }
});
