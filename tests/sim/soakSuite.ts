// Lane Q: assertions shared by the room soak test files (tests/sim/soak_*.test.ts).
import { expect } from 'vitest';
import type { SoakReport } from './soak.ts';

/** Plan appendix C: new weapons unlock at these multipliers (weapon list order of CThing_Creature_Player). */
export const WEAPON_UNLOCKS: readonly [string, number][] = [
  ['uzi', 5], ['shotgun', 10], ['barrel', 15], ['grenade', 20], ['fakewall', 30], ['mine', 40], ['rocket', 50],
  ['chargepack', 55], ['railgun', 70],
];

/** Plan appendix C: difficulty -> start level / multiplier (Death Match: level 1, x200). */
export const DIFFICULTY_START: readonly [number, number][] = [[1, 1], [10, 10], [20, 30], [35, 50]];

/**
 * Level data quirk of the original (not a port bug): in Coop PATCHY (room 11) one Player2 spawn marker
 * (16.45, 9.54) lies inside the Slab_Large collision area (cells 11..18 x 5..10, piece @48 at 14.9, 7.1), and
 * Spawn_ValidPosition_Close does not test Solid cells, so player 2 can (re)spawn inside the slab, where
 * CMap_Collide.PlayerCollide keeps him (StaticImpassable cell -> no move).
 */
export const KNOWN_SPAWN_SOLID: readonly { mode: string; room: number; x: number; y: number }[] = [
  { mode: 'Coop', room: 11, x: 16.5, y: 9.5 },
  { mode: 'DeathMatch', room: 11, x: 16.5, y: 9.5 },
];

/**
 * Upper bound of the time (world ticks at 25 fps) a transient thing may stay in the collection: effects, shots,
 * corpses (dying + 2 s dead), pickups dropped by kills (10 s).
 */
export const MAX_TRANSIENT_AGE = 300;

export interface SoakExpect {
  /** Room must have reached at least this level. */
  minLevel?: number;
  /** At least one kill (score > 0 outside Death Match). */
  kills?: boolean;
  /** Game must still run at the end (infinite life). */
  running?: boolean;
}

export function expectHealthySoak(r: SoakReport, exp: SoakExpect = {}): void {
  const { mode, room } = r.end;
  const where = `${mode} room ${room}`;
  expect(r.errors, `${where}: engine script errors`).toEqual([]);
  // invariants
  const hard = r.issues.filter((i) => i.kind !== 'spawn_solid');
  expect(hard.slice(0, 5), `${where}: invariant violations`).toEqual([]);
  for (const i of r.issues.filter((x) => x.kind === 'spawn_solid')) {
    const known = KNOWN_SPAWN_SOLID.some((k) => k.mode === mode && k.room === room && i.cls === 'CThing_Creature_Player' && i.detail.startsWith(`(${k.x.toFixed(3)}, ${k.y.toFixed(3)})`));
    expect(known, `${where}: unexpected spawn inside a Solid cell: ${i.cls} ${i.detail}`).toBe(true);
  }
  if (exp.running) expect(r.end.state, `${where}: state`).toBe('State_RunWorld');
  // camera (CWorld.Process_Tracking): controllable players stay inside the 640x480 view (shake offset removed)
  expect(r.offscreen, `${where}: player drawn outside the view (px)`).toBeLessThanOrEqual(0);
  // growth: transient things go away, totals stay bounded
  // (lifetimes in seconds scale with the world tick rate: x2 ticks at the fast game speed)
  const ageLimit = MAX_TRANSIENT_AGE * Math.max(1, r.fps / 25);
  for (const [cls, age] of Object.entries(r.maxAge)) expect(age, `${where}: ${cls} lifetime`).toBeLessThanOrEqual(ageLimit);
  expect(r.max.things, `${where}: things`).toBeLessThan(r.start.things + 400);
  // spawn caps (HIGH quality)
  expect(r.max.zombies, `${where}: zombie cap`).toBeLessThanOrEqual(60);
  expect(r.max.devils, `${where}: devil count`).toBeLessThanOrEqual(5);
  if (mode === 'DeathMatch') {
    expect(r.max.zombies + r.max.devils, `${where}: no monsters in Death Match`).toBe(0);
    expect(r.end.multiplier, `${where}: Death Match multiplier`).toBe(200);
    expect(r.end.level).toBe(1);
  } else {
    if (exp.kills !== false) expect(r.end.score, `${where}: kills`).toBeGreaterThan(0);
    if (exp.minLevel) expect(r.max.level, `${where}: level progression`).toBeGreaterThanOrEqual(exp.minLevel);
    // level-ups are +1 steps
    let prev = r.start.level;
    for (const [, lvl] of r.levelUps) { expect(lvl, `${where}: level step`).toBe(prev + 1); prev = lvl; }
  }
  expectUpgradeOrder(r);
}

/** Multiplier upgrades: exactly the entries up to the peak multiplier are active, activated in multiplier order. */
export function expectUpgradeOrder(r: SoakReport): void {
  const where = `${r.end.mode} room ${r.end.room}`;
  const u = r.game.world()?.mUpgrades;
  if (!u) return;
  if (u.lanGrowth) {
    for (const p of r.end.players) {
      const level = u.lanGrowth.players[p.index].level;
      const want = ['pistol', ...WEAPON_UNLOCKS.filter(([, n]) => n <= level).map(([w]) => w)];
      expect(p.weapons, `${where}: player ${p.index + 1} personal level ${level}`).toEqual(want);
    }
    return;
  }
  const table: any[] = u.mMultiplierList;
  const peak = r.peakMultiplier;
  const expected = table.filter((e) => e.mIndex <= peak).map((e) => e.mIndex);
  expect([...r.initialActive, ...r.activations], `${where}: active upgrades (peak x${peak})`).toEqual(expected);
  for (let i = 1; i < r.activations.length; i++) expect(r.activations[i]!).toBeGreaterThanOrEqual(r.activations[i - 1]!);
  // new weapons of every player follow the documented unlock multipliers
  const want = ['pistol', ...WEAPON_UNLOCKS.filter(([, m]) => m <= peak).map(([w]) => w)];
  for (const p of r.end.players) expect(p.weapons, `${where}: player ${p.index + 1} weapons at peak x${peak}`).toEqual(want);
}
