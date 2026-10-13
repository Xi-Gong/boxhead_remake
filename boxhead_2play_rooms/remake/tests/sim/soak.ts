// Lane Q: shared soak routine for the sim tests. Boots a room through the harness, runs bots for N world ticks and
// records everything the tests assert on: engine script errors, world invariants, growth statistics (things, effects,
// shots, corpses), the zombie/devil peaks, the level/multiplier progression and the order in which the multiplier
// upgrades became active.
import {
  createHeadlessGame, InvariantChecker, thingList, thingStats, type HeadlessGame, type HeadlessGameOptions, type InvariantIssue,
  type Snapshot,
} from './harness.ts';
import { Bot, runBots, type BotOptions } from './bots.ts';
import { CMain } from '../../src/game/packages.ts';

export interface SoakOptions extends HeadlessGameOptions {
  ticks: number;
  /** Bot options per player (default: cycling weapons; digits in Single). */
  bots?: BotOptions[];
  /** Take a snapshot every N ticks (default 250). */
  snapshotEvery?: number;
}

export interface SoakReport {
  game: HeadlessGame;
  ticks: number;
  errors: string[];
  issues: InvariantIssue[];
  start: Snapshot;
  end: Snapshot;
  snapshots: Snapshot[];
  max: { things: number; effects: number; shots: number; corpses: number; creatures: number; zombies: number; devils: number; multiplier: number; level: number };
  /** Things count per snapshot (growth check). */
  thingSeries: number[];
  /** mIndex of multiplier upgrades in the order they became active (polled per tick). */
  activations: number[];
  /** Multiplier upgrades active at the start (difficulty / Death Match). */
  initialActive: number[];
  /** Highest multiplier seen at the end of a tick. */
  peakMultiplier: number;
  /** Every tick at which mLevelIndex changed: [tick, level]. */
  levelUps: [number, number][];
  shots: number;
  /**
   * Longest time (ticks) a transient thing stayed in the collection, per class: effects and shots since they were
   * first seen, zombies / devils since they died (corpse). Things still present at the end count too.
   */
  maxAge: Record<string, number>;
  /** World ticks per second of this game (CMain.mFPS while it ran: 12.5 / 25 / 50). */
  fps: number;
  /** Single / Coop: how far (px) a controllable player was ever drawn outside the 640x480 view (camera check). */
  offscreen: number;
}

export function defaultBots(mode: string, opts: BotOptions[] | undefined): Bot[] {
  if (opts) return opts.map((o, i) => new Bot(i, o));
  if (mode === 'Single') return [new Bot(0, { cycleEvery: 90, digits: true })];
  return [new Bot(0, { cycleEvery: 90 }), new Bot(1, { cycleEvery: 110 })];
}

function activeEntries(u: any): any[] {
  return (u?.mMultiplierList ?? []).filter((e: any) => e.mActive === true);
}

/** Run a soak synchronously. */
export function soak(opts: SoakOptions): SoakReport {
  const it = soakSteps(opts);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/**
 * Same as soak(), yielding to the event loop every chunk of ticks (long runs: keeps the vitest worker's RPC alive —
 * a worker blocked for minutes fails the run with "Timeout calling onTaskUpdate").
 */
export async function soakAsync(opts: SoakOptions): Promise<SoakReport> {
  const it = soakSteps(opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise((res) => setImmediate(res));
  }
}

const CHUNK = 250;

function* soakSteps(opts: SoakOptions): Generator<void, SoakReport, void> {
  const game = createHeadlessGame(opts);
  const bots = defaultBots(game.mode, opts.bots);
  const checker = new InvariantChecker();
  const every = opts.snapshotEvery ?? 250;
  const start = game.snapshot();
  const fps = (CMain as any).mFPS as number;
  const snapshots: Snapshot[] = [start];
  const thingSeries: number[] = [start.things];
  const max = { things: 0, effects: 0, shots: 0, corpses: 0, creatures: 0, zombies: 0, devils: 0, multiplier: start.multiplier, level: start.level };
  const world0 = game.world();
  const seen = new Set<any>(activeEntries(world0.mUpgrades));
  const initialActive = [...seen].map((e) => e.mIndex);
  const activations: number[] = [];
  const levelUps: [number, number][] = [];
  let lastLevel = start.level;
  let peakMultiplier = start.multiplier;
  checker.check(world0);
  const born = new Map<any, number>();
  const maxAge: Record<string, number> = {};
  const DEAD = 32; // Thing.CThing.mFlag_DEAD
  let t = -1;
  let offscreen = 0;
  const onTick = (): void => {
    t++;
    const w = game.world();
    checker.check(w);
    if (game.mode !== 'DeathMatch') {
      for (const p of game.players()) {
        if (p.mStateID !== 'State_PlayerControl') continue;
        // screen position in the camera rectangle before the screen shake offset (explosions shake the view by up
        // to ~32 px; Draw_PlayerPlane adds mShake to mDrawPosition)
        const sp = w.GetScreenPosition(p.mPosition);
        const x = sp.x + w.mShake.x, y = sp.y + w.mShake.y;
        offscreen = Math.max(offscreen, -x, x - w.mScreenSize.x, -y, y - w.mScreenSize.y);
      }
    }
    const alive = new Set<any>();
    for (const th of thingList(w)) {
      const c: string = th._CLASSID_;
      const dropped = c === 'CThing_Object_Pickup' && th.mDeleteOnPickup;
      const transient = dropped || c.startsWith('CThing_Effect') || c.startsWith('CThing_Shot')
        || ((c === 'CThing_Creature_Zombie' || c === 'CThing_Creature_Devil') && th.mFlags & DEAD);
      if (!transient) continue;
      const key = dropped ? 'CThing_Object_Pickup(dropped)' : c;
      alive.add(th);
      if (!born.has(th)) born.set(th, t);
      const age = t - born.get(th)!;
      if (!(age <= (maxAge[key] ?? -1))) maxAge[key] = age;
    }
    for (const th of [...born.keys()]) if (!alive.has(th)) born.delete(th);
    const st = thingStats(w);
    const u = w.mUpgrades;
    max.things = Math.max(max.things, st.things);
    max.effects = Math.max(max.effects, st.effects);
    max.shots = Math.max(max.shots, st.shots);
    max.corpses = Math.max(max.corpses, st.corpses);
    max.creatures = Math.max(max.creatures, st.creatures);
    max.zombies = Math.max(max.zombies, u.Level.mZombieCount);
    max.devils = Math.max(max.devils, u.Level.mDevilCount);
    max.multiplier = Math.max(max.multiplier, u.mMultiplierIndex);
    max.level = Math.max(max.level, u.mLevelIndex);
    peakMultiplier = Math.max(peakMultiplier, u.mMultiplierIndex);
    if (u.mLevelIndex !== lastLevel) { levelUps.push([w.mTick, u.mLevelIndex]); lastLevel = u.mLevelIndex; }
    const fresh = activeEntries(u).filter((e) => !seen.has(e)).sort((a, b) => a.mIndex - b.mIndex);
    for (const e of fresh) { seen.add(e); activations.push(e.mIndex); }
    if ((t + 1) % every === 0) {
      const s = game.snapshot();
      snapshots.push(s);
      thingSeries.push(s.things);
    }
  };
  let done = 0;
  while (done < opts.ticks) {
    const want = Math.min(CHUNK, opts.ticks - done);
    const n = runBots(game, bots, want, onTick);
    done += n;
    if (n < want) break;
    yield;
  }
  const end = game.snapshot();
  return {
    game, ticks: done, errors: game.errors, issues: checker.issues, start, end, snapshots, max, thingSeries,
    activations, initialActive, peakMultiplier, levelUps, shots: bots.reduce((n, b) => n + b.shots, 0), maxAge, fps, offscreen,
  };
}

/** One-line summary for test logs. */
export function summary(r: SoakReport): string {
  const e = r.end;
  return `${e.mode} room ${e.room}: ${r.ticks} ticks, state ${e.state}, level ${e.level} (max ${r.max.level}), x${e.multiplier} (peak ${r.peakMultiplier}), score ${e.score}, ` +
    `things ${e.things} (max ${r.max.things}, effects ${r.max.effects}, shots ${r.max.shots}, corpses ${r.max.corpses}), ` +
    `zombies max ${r.max.zombies}, devils max ${r.max.devils}, deaths ${e.deaths.join('/')}, errors ${r.errors.length}, issues ${r.issues.length}`;
}
