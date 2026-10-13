// Lane Q: shared soak routine for the sim tests. Boots a room through the harness, runs bots for N world ticks and
// records everything the tests assert on: engine script errors, world invariants, growth statistics (things, effects,
// shots, corpses), the zombie/devil peaks, the level/multiplier progression and the order in which the multiplier
// upgrades became active.
import {
  createHeadlessGame, InvariantChecker, thingList, thingStats, type HeadlessGame, type HeadlessGameOptions, type InvariantIssue,
  type Snapshot,
} from './harness.ts';
import { Bot, runBots, type BotOptions } from './bots.ts';

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
}

export function defaultBots(mode: string, opts: BotOptions[] | undefined): Bot[] {
  if (opts) return opts.map((o, i) => new Bot(i, o));
  if (mode === 'Single') return [new Bot(0, { cycleEvery: 90, digits: true })];
  return [new Bot(0, { cycleEvery: 90 }), new Bot(1, { cycleEvery: 110 })];
}

function activeEntries(u: any): any[] {
  return (u?.mMultiplierList ?? []).filter((e: any) => e.mActive === true);
}

export function soak(opts: SoakOptions): SoakReport {
  const game = createHeadlessGame(opts);
  const bots = defaultBots(game.mode, opts.bots);
  const checker = new InvariantChecker();
  const every = opts.snapshotEvery ?? 250;
  const start = game.snapshot();
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
  const done = runBots(game, bots, opts.ticks, (t) => {
    const w = game.world();
    checker.check(w);
    const alive = new Set<any>();
    for (const th of thingList(w)) {
      const c: string = th._CLASSID_;
      const transient = c.startsWith('CThing_Effect') || c.startsWith('CThing_Shot')
        || ((c === 'CThing_Creature_Zombie' || c === 'CThing_Creature_Devil') && th.mFlags & DEAD);
      if (!transient) continue;
      alive.add(th);
      if (!born.has(th)) born.set(th, t);
      const age = t - born.get(th)!;
      if (!(age <= (maxAge[c] ?? -1))) maxAge[c] = age;
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
  });
  const end = game.snapshot();
  return {
    game, ticks: done, errors: game.errors, issues: checker.issues, start, end, snapshots, max, thingSeries,
    activations, initialActive, peakMultiplier, levelUps, shots: bots.reduce((n, b) => n + b.shots, 0), maxAge,
  };
}

/** One-line summary for test logs. */
export function summary(r: SoakReport): string {
  const e = r.end;
  return `${e.mode} room ${e.room}: ${r.ticks} ticks, state ${e.state}, level ${e.level} (max ${r.max.level}), x${e.multiplier} (peak ${r.peakMultiplier}), score ${e.score}, ` +
    `things ${e.things} (max ${r.max.things}, effects ${r.max.effects}, shots ${r.max.shots}, corpses ${r.max.corpses}), ` +
    `zombies max ${r.max.zombies}, devils max ${r.max.devils}, deaths ${e.deaths.join('/')}, errors ${r.errors.length}, issues ${r.issues.length}`;
}
