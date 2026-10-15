// Deviations SAVE_QUIT_RESUME / WAVE_CHECKPOINT_RETRY (M1): the run snapshot module itself — capture a played run,
// rebuild the room through the real RETRY path and re-apply the snapshot, then compare every restored field. The
// scope.ts wiring (checkpoint hook, SAVE & QUIT button, CONTINUE) lands in M2/M3 and gets its own tests.
import { describe, expect, it } from 'vitest';
import { getRandomState } from '../../src/engine/flash/rng.ts';
import { SharedObject, type KeyValueStorage } from '../../src/engine/flash/SharedObject.ts';
import { RESUME_VERSION, applyToWorld, capture, clearAll, hasCheckpoint, type RunSnapshot } from '../../src/game/local/Resume.ts';
import { Thing } from '../../src/game/packages.ts';
import { createHeadlessGame, type HeadlessGame } from './harness.ts';
import { Bot, runBots } from './bots.ts';

const ofClass = (g: HeadlessGame, cls: string) => g.things().filter((t) => t._CLASSID_ === cls);
const markers = (g: HeadlessGame, cls: string) =>
  ofClass(g, cls).filter((t) => t.Process != undefined && t.mParent == undefined && !t.mDeleteOnPickup);

describe('resume: capture -> RETRY (fresh world) -> apply', () => {
  it('restores wave / multiplier / combo / score / players / weapons / objects / rng', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 2, seed: 11, difficulty: 0 });
    // Play: the bot clears wave 1 (10 zombies) -> level 2, kills climb the multiplier (uzi at x5, shotgun at x10).
    const bot = new Bot(0);
    let ok = false;
    for (let i = 0; i < 8000 && g.world() != undefined; i++) {
      runBots(g, [bot], 1);
      const w = g.world();
      if (w && w.mUpgrades.mLevelIndex >= 2 && w.mUpgrades.mMultiplierIndex >= 5) { ok = true; break; }
    }
    expect(ok).toBe(true);

    // Deterministic object mutations so the restore covers every object branch.
    const w1 = g.world();
    const p1 = g.players()[0]!;
    const tc = w1.mThing_Collection;
    const A = (a: number) => new Thing.Math.CThing_Angle(a);
    const barrels = markers(g, 'CThing_Object_Barrel');
    const barrelCount0 = barrels.length;
    const destroyedBarrel = barrels[0];
    // Markers can stack several barrels on one cell: destroy the whole stack at that position.
    const destroyedAt = destroyedBarrel
      ? barrels.filter((t) => Math.abs(t.mPosition.mX - destroyedBarrel.mPosition.mX) < 1e-6 && Math.abs(t.mPosition.mY - destroyedBarrel.mPosition.mY) < 1e-6)
      : [];
    for (const b of destroyedAt) b.Delete();
    if (destroyedBarrel) g.tick(2);
    const pickups = markers(g, 'CThing_Object_Pickup');
    const takenPickup = pickups[0];
    if (takenPickup) takenPickup.PickedUp();
    // A placed (weapon-origin) damaged wall and an owner-credited mine at the player's cell.
    const wallAt = p1.mPosition.Clone();
    const wall = tc.AddThing(new Thing.Object.CThing_Object_Wall(wallAt.Clone(), A(0), p1));
    const mine = tc.AddThing(new Thing.Object.CThing_Object_Mine(p1.mPosition.Clone(), A(0), p1, 150));
    g.tick(2); // let the new things run their Process_Init
    wall.mLife = 400; // damaged but standing

    const snap = capture(w1);
    expect(snap.version).toBe(RESUME_VERSION); // v2: the coop death weapon crate joined ObjectState
    expect(snap.roomLibLink).toBe('ROOM_Single_0002');
    expect(snap.score).toBe(w1.mHud.nTotalScore);
    expect(snap.score).toBeGreaterThan(0);
    if (destroyedBarrel) expect(snap.objects.some((o) => o.origin === 'marker' && o.classID === 'CThing_Object_Barrel' && Math.abs(o.x - destroyedBarrel.mPosition.mX) < 1e-6 && Math.abs(o.y - destroyedBarrel.mPosition.mY) < 1e-6)).toBe(false);
    if (takenPickup) {
      const s = snap.objects.find((o) => o.classID === 'CThing_Object_Pickup' && Math.abs(o.x - takenPickup.mPosition.mX) < 1e-6);
      expect(s?.hidden).toBe(true);
      expect(s?.reappearCount).toBe(takenPickup.mReappearCount);
    }
    const wallState = snap.objects.find((o) => o.origin === 'placed' && o.classID === 'CThing_Object_Wall');
    expect(wallState?.life).toBe(400);
    const mineState = snap.objects.find((o) => o.origin === 'placed' && o.classID === 'CThing_Object_Mine');
    expect(mineState?.damage).toBe(150);
    expect(mineState?.owner).toBe(0);

    // Rebuild the room through the real flow: pause -> QUIT -> Debrief -> RETRY. M2 wires RETRY to the checkpoint;
    // drop it so this test exercises the MANUAL apply on a fresh world (as SAVE & QUIT / CONTINUE will).
    clearAll();
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    const w2 = g.world();
    expect(w2).not.toBe(w1);
    expect(w2.mUpgrades.mLevelIndex).toBe(1); // fresh: difficulty 0 base, before the apply

    expect(applyToWorld(w2, snap)).toBe(true);

    // Upgrades / score.
    const u1 = w1.mUpgrades, u2 = w2.mUpgrades;
    expect(u2.mLevelIndex).toBe(u1.mLevelIndex);
    expect(u2.mMultiplierIndex).toBe(u1.mMultiplierIndex);
    expect(u2.mMultiplierTick).toBe(u1.mMultiplierTick);
    expect(u2.mMultiplierTickTotal).toBe(u1.mMultiplierTickTotal);
    expect(u2.mMultipleKillsIndex).toBe(u1.mMultipleKillsIndex);
    expect(u2.mMultipleKillsTick).toBe(u1.mMultipleKillsTick);
    expect(w2.mHud.nTotalScore).toBe(w1.mHud.nTotalScore);
    // Wave pacing counters restored (mid-wave save & quit resumes the remaining budget).
    expect(u2.Level.mSpawnCount_Zombie).toBe(u1.Level.mSpawnCount_Zombie);
    expect(u2.Level.mSpawnCount_Devil).toBe(u1.Level.mSpawnCount_Devil);
    expect(u2.Level.Zombie_Count).toBe(u1.Level.Zombie_Count);
    expect(u2.Level.Zombie_TotalCount).toBe(u1.Level.Zombie_TotalCount);
    expect(u2.Level.mPlayerCount).toBe(u1.Level.mPlayerCount);
    // Earned multiplier tiers must be active again (e.g. everything the run crossed).
    for (const [i, entries] of u1.mMultipliers.entries()) {
      if (!entries) continue;
      for (const e of entries) expect((u2.mMultipliers[i] as any[]).find((x) => x.mName === e.mName)?.mActive, e.mName).toBe(e.mActive);
    }
    // RNG.
    expect(getRandomState()).toBe(snap.rngState);

    // Player: position teleported exactly, state fields, weapons + ammo, current weapon.
    const q1 = w1.mThing_Collection.mPlayerThings, q2 = w2.mThing_Collection.mPlayerThings;
    const players1 = Object.keys(q1).map((k) => q1[k]), players2 = Object.keys(q2).map((k) => q2[k]);
    expect(players2.length).toBe(players1.length);
    const [a, b] = [players1[0], players2[0]];
    expect(b.mPosition.mX).toBe(a.mPosition.mX);
    expect(b.mPosition.mY).toBe(a.mPosition.mY);
    expect(b.mPosition.mZ).toBe(a.mPosition.mZ);
    expect(b.mAngle.mAngle).toBe(a.mAngle.mAngle);
    expect(b.mLife).toBe(a.mLife);
    expect(b.mFlags).toBe(a.mFlags);
    expect(b.mStateID).toBe(a.mStateID);
    expect(b.mStateCount).toBe(a.mStateCount);
    expect(b.mWeapon_Current.mNameID).toBe(a.mWeapon_Current.mNameID);
    for (const name of Object.keys(a.mWeapons)) {
      const wa = a.mWeapons[name]!, wb = b.mWeapons[name]!;
      expect(wb.mActive, name).toBe(wa.mActive);
      if (wa.mThing) {
        expect(wb.mThing, name).toBeDefined();
        expect(wb.mThing.mAmmo, name).toBe(wa.mThing.mAmmo);
        expect(wb.mThing.mTotalAmmo, name).toBe(wa.mThing.mTotalAmmo);
      }
    }
    // Wave counters restart fresh (the wave restarts).
    expect(u2.Level.mZombieCount).toBe(0);

    // Objects.
    if (destroyedBarrel) {
      const barrels2 = markers(g, 'CThing_Object_Barrel');
      expect(barrels2.some((t) => Math.abs(t.mPosition.mX - destroyedBarrel.mPosition.mX) < 1e-6 && Math.abs(t.mPosition.mY - destroyedBarrel.mPosition.mY) < 1e-6)).toBe(false);
      expect(barrels2.length).toBe(barrelCount0 - destroyedAt.length);
    }
    if (takenPickup) {
      const pk = ofClass(g, 'CThing_Object_Pickup').find((t) => Math.abs(t.mPosition.mX - takenPickup.mPosition.mX) < 1e-6 && t.mParent == undefined);
      expect(pk).toBeDefined();
      expect(pk.Process).toBe(pk.Process_Count);
      expect(pk.mReappearCount).toBe(snap.objects.find((o) => o.classID === 'CThing_Object_Pickup' && Math.abs(o.x - takenPickup.mPosition.mX) < 1e-6)?.reappearCount);
    }
    const wall2 = ofClass(g, 'CThing_Object_Wall').find((t) => Math.abs(t.mPosition.mX - wall.mPosition.mX) < 1e-6 && Math.abs(t.mPosition.mY - wall.mPosition.mY) < 1e-6);
    expect(wall2).toBeDefined();
    expect(wall2.mLife).toBe(400);
    const mine2 = ofClass(g, 'CThing_Object_Mine').find((t) => Math.abs(t.mPosition.mX - mine.mPosition.mX) < 1e-6 && Math.abs(t.mPosition.mY - mine.mPosition.mY) < 1e-6);
    expect(mine2).toBeDefined();
    expect(mine2.mDamage).toBe(150);
    expect(mine2.mParent).toBe(players2[0]); // kill credit follows the restored player

    // The restored world keeps running without errors.
    runBots(g, [new Bot(0)], 100);
    expect(g.errors).toEqual([]);
  });

  it('rejects version / room mismatches without touching the world', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 2, seed: 12, difficulty: 0 });
    g.step(20);
    const snap = capture(g.world());
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    const w2 = g.world();
    const badVersion: RunSnapshot = { ...snap, version: 99 };
    const badRoom: RunSnapshot = { ...snap, roomLibLink: 'ROOM_Single_0009' };
    const badMode: RunSnapshot = { ...snap, gameMode: 'Coop' };
    expect(applyToWorld(w2, badVersion)).toBe(false);
    expect(applyToWorld(w2, badRoom)).toBe(false);
    expect(applyToWorld(w2, badMode)).toBe(false);
    expect(w2.mUpgrades.mLevelIndex).toBe(1); // untouched
    expect(g.errors).toEqual([]);
  });
});

describe('resume: death -> RETRY uses the wave checkpoint (scope wiring)', () => {
  it('restores the wave-start state and the checkpoint survives the restore', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 51, difficulty: 0 });
    // Earn a checkpoint: the bot clears wave 1 -> the __set__mLevel wrapper captures the wave-start state.
    const bot = new Bot(0);
    for (let i = 0; i < 8000 && !hasCheckpoint(); i++) runBots(g, [bot], 1);
    expect(hasCheckpoint()).toBe(true);
    const cpWave = g.world().mUpgrades.mLevelIndex;
    const cpScore = g.world().mHud.nTotalScore;
    // Die: stand still and let the zombies eat.
    let gone = false;
    for (let i = 0; i < 8000 && !gone; i++) {
      runBots(g, [new Bot(0, { passive: true })], 1);
      gone = g.world() == undefined || !!(g.players()[0] && (g.players()[0].mFlags & Thing.CThing.mFlag_DEAD));
      if (gone && g.world() != undefined) gone = false; // dying takes a while longer (State_Dying/Dead -> debrief)
    }
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    // RETRY is now wired to the checkpoint (WAVE_CHECKPOINT_RETRY).
    g.retry();
    expect(g.waitRunning()).toBe(true);
    const w = g.world();
    expect(w.mUpgrades.mLevelIndex).toBe(cpWave);
    expect(w.mHud.nTotalScore).toBe(cpScore);
    expect(w.mUpgrades.Level.mZombieCount).toBe(0); // the wave restarted fresh
    // The restore's own fast-forward must not have overwritten the checkpoint (suppression guard).
    expect(hasCheckpoint()).toBe(true);
    // And a second death -> RETRY restores the same wave-start state again.
    let gone2 = false;
    for (let i = 0; i < 8000 && !gone2; i++) {
      runBots(g, [new Bot(0, { passive: true })], 1);
      gone2 = g.world() == undefined || !!(g.players()[0] && (g.players()[0].mFlags & Thing.CThing.mFlag_DEAD));
      if (gone2 && g.world() != undefined) gone2 = false;
    }
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    expect(g.world().mUpgrades.mLevelIndex).toBe(cpWave);
    expect(g.world().mHud.nTotalScore).toBe(cpScore);
    expect(g.errors).toEqual([]);
  });
});

describe('resume: SAVE & QUIT -> restart -> CONTINUE (scope wiring)', () => {
  class MapStorage implements KeyValueStorage {
    readonly map = new Map<string, string>();
    getItem(k: string): string | null { return this.map.get(k) ?? null; }
    setItem(k: string, v: string): void { this.map.set(k, v); }
    removeItem(k: string): void { this.map.delete(k); }
    json(): Record<string, any> { return JSON.parse(this.map.get('SO:BXHD_2PLAY_6') ?? '{}'); }
  }

  it('stores the run, offers CONTINUE after a restart, restores it, and drops it on death', () => {
    const store = new MapStorage();
    SharedObject._setStorage(store);
    try {
      // Session 1: clear wave 1, then SAVE & QUIT from the pause screen.
      const g1 = createHeadlessGame({ mode: 'Single', room: 2, seed: 61, difficulty: 0 });
      const bot = new Bot(0);
      for (let i = 0; i < 8000 && g1.world().mUpgrades.mLevelIndex < 2; i++) runBots(g1, [bot], 1);
      expect(g1.world().mUpgrades.mLevelIndex).toBe(2);
      const w1 = g1.world();
      const score = w1.mHud.nTotalScore;
      const px = g1.players()[0]!.mPosition.mX, py = g1.players()[0]!.mPosition.mY;
      g1.saveQuit();
      expect(g1.waitScreen('State_Main', 'Screen_Main')).toBe(true);
      expect(g1.main().mcWorld).toBeUndefined(); // the run is parked, not debriefed
      expect(g1.hasStoredResume()).toBe(true);
      expect(store.json().mResumeData.wave).toBe(2);
      expect(store.json().mResumeData.roomLibLink).toBe('ROOM_Single_0002');

      // Session 2 (a restarted app: same storage, everything else rebuilt): the menu offers CONTINUE.
      const g2 = createHeadlessGame({ mode: 'Single', room: 2, seed: 61, menuOnly: 'Main' });
      const cont = g2.main().mcScreen.mcContinue;
      expect(cont).toBeDefined();
      cont.onRelease.call(cont);
      expect(g2.waitRunning()).toBe(true);
      const w2 = g2.world();
      expect(w2.mWorldLibLink).toBe('ROOM_Single_0002');
      expect(w2.mUpgrades.mLevelIndex).toBe(2);
      expect(w2.mHud.nTotalScore).toBe(score);
      const p2 = g2.players()[0]!;
      expect(Math.abs(p2.mPosition.mX - px)).toBeLessThan(1e-9);
      expect(Math.abs(p2.mPosition.mY - py)).toBeLessThan(1e-9);

      // The continued run's death clears the stored run; a fresh menu shows no CONTINUE.
      let gone = false;
      for (let i = 0; i < 8000 && !gone; i++) {
        runBots(g2, [new Bot(0, { passive: true })], 1);
        gone = g2.world() == undefined || !!(g2.players()[0] && (g2.players()[0].mFlags & Thing.CThing.mFlag_DEAD));
        if (gone && g2.world() != undefined) gone = false;
      }
      expect(g2.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
      expect(g2.hasStoredResume()).toBe(false);
      g2.exit();
      expect(g2.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld')).toBe(true);
      const g3 = createHeadlessGame({ mode: 'Single', room: 2, seed: 61, menuOnly: 'Main' });
      expect(g3.main().mcScreen.mcContinue).toBeUndefined();
      expect(g1.errors).toEqual([]);
      expect(g2.errors).toEqual([]);
      expect(g3.errors).toEqual([]);
    } finally {
      SharedObject._setStorage(undefined);
    }
  });

  it('T4 (v0.2.0): CONTINUE then death before the first advance -> RETRY restarts at the snapshot wave', () => {
    // armFromStored nulls the in-memory checkpoint and the restore fast-forward is suppressed, so dying before the
    // next natural advance left NO checkpoint: RETRY used to restart at the difficulty base (wave 1). v0.2.0 falls
    // back to the run-start wave (the snapshot's wave), as a fresh run (score reset, head-start mechanism).
    const store = new MapStorage();
    SharedObject._setStorage(store);
    try {
      // Session 1: clear wave 1, then SAVE & QUIT (stored wave 2).
      const g1 = createHeadlessGame({ mode: 'Single', room: 2, seed: 64, difficulty: 0 });
      const bot = new Bot(0);
      for (let i = 0; i < 8000 && g1.world().mUpgrades.mLevelIndex < 2; i++) runBots(g1, [bot], 1);
      expect(g1.world().mUpgrades.mLevelIndex).toBe(2);
      g1.saveQuit();
      expect(g1.waitScreen('State_Main', 'Screen_Main')).toBe(true);

      // Session 2: CONTINUE -> restored at wave 2 -> die passively before any advance.
      const g2 = createHeadlessGame({ mode: 'Single', room: 2, seed: 64, menuOnly: 'Main' });
      g2.main().mcScreen.mcContinue.onRelease.call(g2.main().mcScreen.mcContinue);
      expect(g2.waitRunning()).toBe(true);
      expect(g2.world().mUpgrades.mLevelIndex).toBe(2);
      const ticks = runBots(g2, [new Bot(0, { passive: true })], 3000);
      expect(ticks).toBeLessThan(3000);
      expect(g2.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
      expect(hasCheckpoint()).toBe(false); // PIN: the restore suppressed re-capture -> fallback path
      expect(g2.hasStoredResume()).toBe(false); // death cleared the stored run (existing behaviour)

      // RETRY: no checkpoint, no stored run -> the v0.2.0 fallback (run-start wave = snapshot wave 2).
      g2.retry();
      expect(g2.waitRunning()).toBe(true);
      expect(g2.world().mUpgrades.mLevelIndex).toBe(2);
      expect(g2.world().mHud.nTotalScore).toBe(0); // fresh-run semantics: score resets
      expect(g2.world().mUpgrades.Level.mZombieCount).toBe(0); // the wave restarted fresh
      expect(g1.errors).toEqual([]);
      expect(g2.errors).toEqual([]);
    } finally {
      SharedObject._setStorage(undefined);
    }
  });
});

describe('resume: rng continuity', () => {
  const OBJECTS = new Set([
    'CThing_Object_Barrel', 'CThing_Object_Wall', 'CThing_Object_Pickup', 'CThing_Object_Mine', 'CThing_Object_ChargePack',
  ]);
  /** Wave 2 reached and the field is quiet: only players and marker objects remain (tracers / effects / dropped
   * pickups consume RNG while alive and are not restored, so the comparison needs them gone). */
  const quiet = (g: HeadlessGame): boolean => {
    const w = g.world();
    if (!w || w.mUpgrades.mLevelIndex < 2) return false;
    return g.things().every((t) => (OBJECTS.has(t._CLASSID_) ? !t.mDeleteOnPickup : t._CLASSID_ === 'CThing_Creature_Player'));
  };
  const runToQuietBoundary = (seed: number): { g: HeadlessGame; snap: RunSnapshot } => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed, difficulty: 0 });
    const bot = new Bot(0);
    for (let i = 0; i < 8000 && !quiet(g); i++) runBots(g, [bot], 1);
    expect(quiet(g)).toBe(true);
    return { g, snap: capture(g.world()) };
  };
  it('a quiet wave-boundary restore replays the next wave with the captured randomness', () => {
    // NOTE: the RNG is a process-global singleton, so only one game may consume it at a time: run g1's trajectory
    // to completion first, then build the restored game (whose apply resets the RNG to the captured state).
    const traj = (g: HeadlessGame): number[][] => {
      const out: number[][] = [];
      runBots(g, [new Bot(0)], 250, (t) => {
        if ((t + 1) % 50 === 0) {
          const w = g.world();
          out.push([w.mUpgrades.mLevelIndex, w.mHud.nTotalScore, w.mUpgrades.mMultiplierIndex, w.mUpgrades.Level.mZombieCount]);
        }
      });
      return out;
    };
    const { g: g1, snap } = runToQuietBoundary(31);
    const a = traj(g1);
    const g2 = runToQuietBoundary(31).g; // identical world by determinism (RNG back at the capture state)
    // g2: quit -> RETRY. The M2 wiring arms the wave checkpoint and the InitFinished wrapper applies it (reseeds the
    // RNG) — the restore under test is the real wired path.
    g2.quit();
    expect(g2.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g2.retry();
    expect(g2.waitRunning()).toBe(true);
    expect(g2.world().mUpgrades.mLevelIndex).toBe(2); // restored by the wiring
    expect(g2.world().mHud.nTotalScore).toBe(snap.score);
    const b = traj(g2);
    expect(b.length).toBe(a.length);
    expect(b).toEqual(a);
    expect(g1.errors).toEqual([]);
    expect(g2.errors).toEqual([]);
  });
});
