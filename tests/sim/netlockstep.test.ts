// LAN lockstep simulation tests (v0.1.3 L1). The RNG is a process-global singleton, so the two "peers" run
// SEQUENTIALLY: game A (the host reference, plain keyboard play) records its per-tick input bitmaps first, then
// game B (a client NetSession) replays A's player-1 bitmaps as its remote frames while its own scripted player-2
// keys feed the local sampler. Sequential replay under identical bitmaps is exactly what interleaved lockstep
// computes - if B's world hash ever differs from A's, the peers would have desynced.
//
// Hashes here are ID-free (things keyed by class + position + life + flags): the process-wide thing allocator
// gives the second game different absolute ids, which changes nothing about behaviour (only relative order matters).
import { describe, expect, it } from 'vitest';
import { _global } from '../../src/engine/flash/as2.ts';
import { setRandomState } from '../../src/engine/flash/rng.ts';
import { createHeadlessGame, KEYS, type HeadlessGame } from './harness.ts';
import { recordSounds } from './fxkit.ts';
import { NetSlot, packBits, SLOT_ORDER, unpackBit } from '../../src/game/local/Net/NetSlot.ts';
import { NetSession, _peekLocalFrame } from '../../src/game/local/Net/NetSession.ts';
import { lanBridge, _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';
import { maxUnlockedWave } from '../../src/game/local/WaveUnlock.ts';
import { CMain, CSound, Thing, World } from '../../src/game/packages.ts';
import { computeInputDelay, MAX_NET_CATCHUP_TICKS, netStallRewind, ROLLBACK_WINDOW_TICKS } from '../../src/game/local/Net/protocol.ts';
import { frameTime } from '../../src/engine/flash/clock.ts';
import { stallStripDue } from '../../src/game/local/Net/overlay.ts';
import { advanceShadow } from '../../src/game/local/Net/Predict.ts';
import type { GameConfig, LanMode } from '../../src/game/local/Net/protocol.ts';

// --------------------------------------------------------------------------------------------- helpers

type PlayerKeys = { [K in keyof typeof KEYS.P1]: number };
/** SLOT_ORDER names (mControls names) -> harness KEYS names (NEXT_WEAPON -> NEXT, ...). */
const keyOf = (keyMap: PlayerKeys, name: string): number | undefined =>
  (keyMap as any)[name] ?? (keyMap as any)[name.replace('_WEAPON', '')];
const bitsOf = (codes: readonly number[], keyMap: PlayerKeys): number => {
  let bits = 0;
  for (const name of SLOT_ORDER) {
    const code = keyOf(keyMap, name);
    if (code !== undefined && codes.includes(code)) bits |= 1 << SLOT_ORDER.indexOf(name);
  }
  return bits;
};

/** Deterministic two-player script: pure function of the tick (both peers must derive identical bitmaps from it). */
interface ScriptInput { p1: number[]; p2: number[] }
const script = (T: number): ScriptInput => {
  if (T < 2) return { p1: [], p2: [] }; // the client primes its first LAN_INPUT_DELAY+1 frames before any key
  const p1: number[] = [];
  const p2: number[] = [];
  p1.push(T < 50 ? KEYS.P1.RIGHT : KEYS.P1.UP);
  // Pistol bursts, then (grenade granted at 50, switch tap at 52) a 20-tick grenade hold 56..75. The hold is
  // longer than the 750 ms power clamp ON PURPOSE: single-player measures the hold with the wall clock (events
  // land ±20 ms off the tick grid), the net path quantises it to whole ticks (registered deviation) - inside the
  // clamp both compute exactly 0.75, so the trajectories are comparable.
  const fireOn = T < 32 || (T >= 37 && T < 50) || (T >= 56 && T < 76);
  if (fireOn) p1.push(KEYS.P1.FIRE);
  if (T === 52) p1.push(KEYS.P1.NEXT); // one-tick weapon-cycle tap: pistol -> grenade
  if (T % 40 < 20) p2.push(KEYS.P2.LEFT); else p2.push(KEYS.P2.RIGHT);
  if (T % 7 === 0) p2.push(KEYS.P2.FIRE);
  if (T === 70) p2.push(KEYS.P2.NEXT); // one-tick weapon-cycle tap
  return { p1, p2 };
};

/** Give player 0 the grenade (the game's own activation path, like an upgrade grant) - applied to every peer at tick 50. */
function grantGrenade(g: HeadlessGame): void {
  g.players()[0].NewWeapon('grenade');
}

/** ID-free world hash (things sorted by class + quantised position + life + flags). */
function worldRows(g: HeadlessGame): string[] {
  const w = g.world();
  if (!w) return ['noworld'];
  const rows: string[] = [`t${w.mTick}|L${w.mUpgrades.mLevelIndex}|S${w.mHud.nTotalScore}`];
  for (const t of g.things()) {
    const p = t.mPosition;
    rows.push(`${t._CLASSID_}:${p ? [p.mX, p.mY, p.mZ].map((v) => Math.floor((v ?? 0) * 256)).join(',') : '-'}:${Math.floor((t.mLife ?? 0) * 16)}:${t.mFlags}:${t.mStateID}`);
  }
  rows.sort();
  for (const p of g.players()) rows.push(`P${p.mPlayerIndex}:${p.mWeapon_Current?.mNameID}:${p.mPosition.mX},${p.mPosition.mY}:${p.mLife}:${(p.mWeaponList ?? []).map((x: any) => `${x.mActive ? 1 : 0}${x.mThing?.mAmmo ?? 0}`).join(',')}`);
  return rows;
}

function worldHash(g: HeadlessGame): string {
  let h = 0x811c9dc5;
  const s = worldRows(g).join('\n');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16);
}

const CFG: GameConfig = { difficulty: 0, gameSpeed: 1, devils: true, collisions: true, damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 };
const SEED = 4242;

/** Boot a game to the main menu and start it through a client NetSession (remote player-1 frames fed per tick). */
interface Peer { game: HeadlessGame; session: NetSession; sent: any[] }
function bootNetPeer(mode: LanMode, roomLink: string, inputDelay?: number): Peer {
  const game = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main', navBudget: 300 });
  const sent: any[] = [];
  const session = new NetSession(1, { send: (m) => sent.push(m) });
  session.startLocalGame({ mode, roomLink, cfg: CFG, seed: SEED, inputDelay }, game.main());
  if (!game.waitRunning(3000)) throw new Error(`net peer: room did not start (${game.state()}, ${game.errors[0] ?? ''})`);
  return { game, session, sent };
}

// --------------------------------------------------------------------------------------------- tests

describe('NetSlot', () => {
  it('derives edges, latches and renew semantics from the bitmap', () => {
    const s = new NetSlot();
    s.setHeld(true, 10, 400);           // press at tick 10 / 400 ms
    expect(s.IsDown()).toBe(true);
    expect(s.IsPressed()).toBe(true);   // consumes
    expect(s.IsPressed()).toBe(false);
    expect(s.mTimePressed).toBe(400);
    expect(s.pressTick).toBe(10);
    expect(s.IsReleased()).toBe(false); // still held
    s.setHeld(true, 11, 440);           // still held: no new edge
    expect(s.IsPressed()).toBe(false);
    s.setHeld(false, 12, 480);          // release
    expect(s.IsDown()).toBe(false);
    expect(s.IsReleased()).toBe(true);
    expect(s.IsReleased()).toBe(false);
    // Renew mid-hold (weapon switch): the still-set bit must re-press with a fresh timestamp next tick.
    s.setHeld(true, 13, 520);
    s.Renew();
    expect(s.IsDown()).toBe(false);
    s.setHeld(true, 14, 560);
    expect(s.IsPressed()).toBe(true);
    expect(s.mTimePressed).toBe(560);
    expect(s.pressTick).toBe(14);
  });

  it('packs and unpacks the wire bitmap', () => {
    const bits = packBits({ UP: true, DOWN: false, LEFT: true, RIGHT: false, FIRE: true, NEXT_WEAPON: false, PREV_WEAPON: true });
    expect(bits).toBe(0b1010101);
    expect(unpackBit(bits, 'UP')).toBe(true);
    expect(unpackBit(bits, 'DOWN')).toBe(false);
    expect(unpackBit(bits, 'PREV_WEAPON')).toBe(true);
  });
});

describe('LAN lockstep (sequential replay = interleaved lockstep)', () => {
  it('coop: the client NetSession reproduces the reference run exactly (movement, fire, grenade hold, weapon tap)', { timeout: 120000 }, () => {
    // --- peer A: the host reference, plain keyboard play, recording the player-1 bitmaps.
    const A = createHeadlessGame({ classicWaves: true, classicGrowth: true, mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0 } });
    // A reaches the world through the harness path, B through the session path - the RNG consumed BEFORE the world
    // differs. Real peers both use the session path; here both worlds pin the stream once ready (the world itself is
    // identical either way - only the live spawn randomness needed a common starting state).
    setRandomState(0xC0FFEE);
    const hashes = new Map<number, string>();
    const TICKS = 150;
    for (let T = 0; T < TICKS; T++) {
      const s = script(T);
      if (T === 50) grantGrenade(A);
      A.setKeys([...s.p1, ...s.p2]);
      A.tick(1);
      hashes.set(A.world().mTick, worldHash(A));
    }
    A.releaseAll();

    // --- peer B: the client session replays A's player-1 bitmaps; its own player-2 keys feed the local sampler.
    // NOTE: the built world's mTick is already 1 at InitFinished (InitCleanUp runs one warm-up Process), so frames
    // are fed by the world's ENTRY tick while the script stays indexed by the iteration (exactly how A consumed it).
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    expect(B.session.phase).toBe('playing');
    setRandomState(0xC0FFEE);
    const firstEntry = B.game.world().mTick; // lockstep frames are indexed from the ready tick
    for (let i = 0; i < TICKS; i++) {
      const entry = B.game.world().mTick - firstEntry;
      // Stall gate: with no remote frame for the next tick the simulation must freeze completely.
      if (i === 100) {
        expect(B.game.tick(1)).toBe(0);
        expect(B.game.world().mTick).toBe(entry + firstEntry);
      }
      B.session.onNetMessage({ t: 'in', tick: entry, bits: bitsOf(script(i).p1, KEYS.P1) });
      // frame(entry+D)=entry+1 is sampled inside THIS tick's afterTick (v0.1.7 sends the frame for t-1+D, one tick
      // earlier than v0.1.4's t+D), so the local keys lead the script by exactly 1 tick.
      B.game.setKeys(script(i + 1).p2);
      if (i === 50) grantGrenade(B.game);
      expect(B.game.tick(1)).toBe(1);
      const got = worldHash(B.game);
      const want = hashes.get(B.game.world().mTick);
      if (want !== undefined && got !== want) {
        throw new Error(`lockstep divergence at tick ${B.game.world().mTick}: ${got} != ${want}`);
      }
    }
    // The grenade actually flew (the hold power path ran inside the replay) and frames were sent every tick.
    const p1B = B.game.players()[0];
    expect(p1B.mWeapon_Current.mNameID).toBe('grenade');
    expect(p1B.mWeapon_Current.mAmmo).toBeLessThan(20); // one grenade thrown on the 56..65 hold release
    expect(B.sent.filter((m) => m.t === 'in').length).toBeGreaterThanOrEqual(TICKS);
    expect(hashes.get(TICKS)).not.toBe(hashes.get(2)); // the run clearly evolved
  });

  it('coop: a player death drops the weapon crate identically on both lockstep peers', { timeout: 120000 }, () => {
    // Deviation COOP_DEATH_WEAPON_CRATE spawns from INSIDE the simulation (the CWorld.LogKill scope wrapper), so a
    // real death (State_Dying -> LogKill) on the host must materialise the identical crate - same cell, same payload -
    // on the replaying client, or the per-tick hashes diverge the moment the corpse hits the floor.
    const grantAndArm = (g: HeadlessGame): void => {
      const p1 = g.players()[0];
      p1.NewWeapon('uzi'); // backpack only - player 1 stands still on the pistol, so the uzi keeps its exact ammo
      p1.mWeapons.uzi.mThing.mAmmo = 12;
    };
    // Die FAR from both spawns: idle players get physically pushed around by the zombie crowd, and a crate under a
    // drifting player vanishes on pickup (correctly!) long before the window ends.
    const dieFar = (g: HeadlessGame): void => {
      const w = g.world()!;
      const cells = w.mMap.mCells;
      const SOLID = World.Map.CMap_Cell.mCollide_StaticImpassable;
      const [p1, p2] = g.players();
      let spot: { x: number; y: number } | undefined;
      outer: for (let cy = 0; cy < cells.length; cy++) {
        for (let cx = 0; cx < cells[cy].length; cx++) {
          if (cells[cy][cx].mCollide & SOLID) continue;
          if (Math.hypot(p1.mPosition.mX - (cx + 0.5), p1.mPosition.mY - (cy + 0.5)) >= 6
            && Math.hypot(p2.mPosition.mX - (cx + 0.5), p2.mPosition.mY - (cy + 0.5)) >= 6) { spot = { x: cx + 0.5, y: cy + 0.5 }; break outer; }
        }
      }
      if (spot) p1.Move(new Thing.Math.CThing_Position(spot.x, spot.y, 0));
      // The real damage path sets DEAD in State_BulletHit BEFORE entering State_Dying; without it the dying player
      // (still standing on their own crate) would instantly pick it up next tick.
      p1.mFlags |= Thing.CThing.mFlag_DEAD;
      p1.SetState('State_Dying'); // the real death path (runs LogKill)
    };

    const A = createHeadlessGame({ classicWaves: true, classicGrowth: true, mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0, infiniteLife: true } });
    setRandomState(0xC0FFEE);
    const hashes = new Map<number, string>();
    const TICKS = 70; // death at 60 -> 10 post-death ticks of hash comparison across the spawn moment
    for (let T = 0; T < TICKS; T++) {
      if (T === 30) grantAndArm(A);
      if (T === 60) dieFar(A);
      A.setKeys([]); // both players idle: nobody fires (the uzi ammo is untouched)
      A.tick(1);
      hashes.set(A.world().mTick, worldHash(A));
    }
    A.releaseAll();
    const cratesA = A.things().filter((t) => t._CLASSID_ === 'CThing_Object_WeaponCrate');
    expect(cratesA.length).toBe(1); // the scripted run leaves the crate untouched on the floor

    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    _global.mInfinateLife = true; // same cheat as peer A: nothing dies before the scripted death (reset wiped _global)
    setRandomState(0xC0FFEE);
    const firstEntry = B.game.world().mTick;
    for (let i = 0; i < TICKS; i++) {
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: 0 });
      B.game.setKeys([]);
      if (i === 30) grantAndArm(B.game);
      if (i === 60) dieFar(B.game);
      expect(B.game.tick(1)).toBe(1);
      const want = hashes.get(B.game.world().mTick);
      if (want !== undefined && worldHash(B.game) !== want) {
        throw new Error(`lockstep divergence at tick ${B.game.world().mTick} (death crate desync)`);
      }
    }
    const cratesB = B.game.things().filter((t) => t._CLASSID_ === 'CThing_Object_WeaponCrate');
    expect(cratesB.length).toBe(1);
    expect(cratesB[0].mPayload.weapons).toEqual(cratesA[0].mPayload.weapons);
    expect(cratesB[0].mPayload.weapons[0]).toMatchObject({ nameID: 'uzi', ammo: 12 });
    B.session.dispose();
  });

  it('coop: both peers emit the identical play-sound sequence (sfx + ambience, ordered) - audio lockstep', { timeout: 120000 }, () => {
    // Audio is a pure side effect of the deterministic sim: no audio travels on the wire, so peer identity is
    // proven by recording every CSound.PlaySound on the reference run and on the session replay and comparing.
    // Ambience is Draw-driven but gated on the sim tick (v0.1.10), so its cadence is a function of the tick too.
    const TICKS = 320;
    const A = createHeadlessGame({ classicWaves: true, classicGrowth: true, mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0 } });
    setRandomState(0xC0FFEE);
    const soundsA = recordSounds(A);
    for (let T = 0; T < TICKS; T++) {
      const s = script(T);
      if (T === 50) grantGrenade(A);
      A.setKeys([...s.p1, ...s.p2]);
      A.tick(1);
    }
    A.releaseAll();

    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    setRandomState(0xC0FFEE);
    const soundsB = recordSounds(B.game);
    const firstEntry = B.game.world().mTick;
    for (let i = 0; i < TICKS; i++) {
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: bitsOf(script(i).p1, KEYS.P1) });
      B.game.setKeys(script(i + 1).p2);
      if (i === 50) grantGrenade(B.game);
      expect(B.game.tick(1)).toBe(1);
    }
    const strip = (recs: { tick?: number; name: string; volume: number; pan: number; played: boolean }[]) =>
      recs.filter((r) => r.played).map((r) => [r.tick, r.name, r.volume, r.pan]);
    const a = strip(soundsA);
    const b = strip(soundsB);
    expect(b.length).toBeGreaterThan(20); // the run is actually audible: weapons, hit walls, zombie ambience
    expect(b).toEqual(a); // identical ORDERED sequence: tick, sample, volume, pan
    B.session.dispose();
  });

  it('coop: a stall freezes audio with the world - no new sounds while starved, cadence resumes after', { timeout: 120000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    setRandomState(0xC0FFEE);
    const sounds = recordSounds(B.game);
    const firstEntry = B.game.world().mTick;
    for (let i = 0; i < 120; i++) { // frames flowing: weapons + zombies audible
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: bitsOf(script(i).p1, KEYS.P1) });
      B.game.setKeys(script(i + 1).p2);
      expect(B.game.tick(1)).toBe(1);
    }
    const before = sounds.length;
    const ticker = B.game.world().mAmbienceTicker;
    // Starve the session: no remote frame for the next tick. The stall gate skips Process but still Draws the
    // frozen world every scheduled flagDraw - before v0.1.10 that advanced the ambience ticker and fired zombie
    // moans over a world that did not move (and inflated mZombie_DrawCount for the first post-stall bucket).
    const w = B.game.world();
    let draws = 0;
    const origDraw = w.Draw;
    (w as any).Draw = function (this: any, ...args: any[]) { draws++; return origDraw.apply(this, args); };
    B.game.step(20);
    (w as any).Draw = origDraw;
    expect(draws).toBeGreaterThan(0); // the frozen world really kept Drawing (the gate is what silenced it)
    expect(sounds.length).toBe(before); // zero new sounds while frozen
    expect(w.mAmbienceTicker).toBe(ticker); // ambience cadence frozen with the sim tick
    expect(w.mZombie_DrawCount).toBe(0); // render accumulators consumed, not inflated
    // Frames flow again: ticks resume and ambience keeps advancing with them.
    let resumed = 0;
    for (let i = 120; i < 170; i++) {
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: bitsOf(script(i).p1, KEYS.P1) });
      B.game.setKeys(script(i + 1).p2);
      if (B.game.tick(1, 40) === 1) resumed++;
    }
    expect(resumed).toBeGreaterThan(30);
    expect(w.mAmbienceTicker).toBeGreaterThan(ticker);
    expect(sounds.length).toBeGreaterThan(before);
    B.session.dispose();
  });

  it('start.wave arms both peers identically: a session started with wave 12 builds LEVEL 12 / multiplier 14', { timeout: 60000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001', undefined);
    // Rebuild through the same startLocalGame the wire start message drives, with a chosen wave.
    B.session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, wave: 12 }, B.game.main());
    if (!B.game.waitRunning(3000)) throw new Error(`room did not start (${B.game.state()})`);
    const s = B.game.snapshot();
    expect(s.level).toBe(12);
    expect(s.multiplier).toBe(14); // anchorInterp(12) = 10 + 2*2 = 14
    for (const p of s.players) {
      expect(p.weapons).toEqual(['pistol', 'uzi', 'shotgun']); // tiers x5 / x10 unlocked
    }
    expect(maxUnlockedWave()).toBeGreaterThanOrEqual(12); // v0.2.4: the run-start record (save-only, lockstep-neutral)
    // The client-side consumption of a wire start message carries the wave too.
    const C = bootNetPeer('Coop', 'ROOM_Single_0001', undefined);
    C.session.onNetMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, wave: 20 });
    if (!C.game.waitRunning(3000)) throw new Error(`client room did not start (${C.game.state()})`);
    expect(C.game.snapshot().level).toBe(20);
    expect(C.game.snapshot().multiplier).toBe(30);
    expect(maxUnlockedWave()).toBeGreaterThanOrEqual(20); // v0.2.4: the client-side build records its start wave too
    B.session.dispose();
    C.session.dispose();
  });

  it('coop: natural all-players-dead marks the net session ended (was: phase stuck playing - dead-end room)', { timeout: 120000 }, () => {
    // The root cause of the v0.2.1 room bug: coop all-dead / DM kill-limit set mCompleteState and route to the
    // debrief, but nothing moved NetSession.phase off 'playing' - markBackInLobby() then no-oped at every room
    // entry and the lobby rendered its in-game variant (START/READY/CLOSE hidden, stale READY badges).
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    _global.mInfinateLife = true; // keep the scripted deaths the ONLY deaths (zombies cannot interfere)
    setRandomState(0xC0FFEE);
    const firstEntry = B.game.world().mTick;
    const killBoth = (g: HeadlessGame): void => {
      // The real damage path sets DEAD before State_Dying (the crate-test pattern, applied to both players).
      for (const p of g.players()) {
        p.mFlags |= Thing.CThing.mFlag_DEAD;
        p.SetState('State_Dying');
      }
    };
    for (let i = 0; i < 40; i++) { // live lockstep ticks first: the session really is mid-game
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: 0 });
      B.game.setKeys([]);
      expect(B.game.tick(1)).toBe(1);
    }
    expect(B.session.phase).toBe('playing');
    killBoth(B.game);
    let endedState = '';
    for (let i = 0; i < 400; i++) { // dying animation -> removal -> PlayerDead -> mCompleteState -> debrief screen
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: 0 });
      B.game.setKeys([]);
      B.game.tick(1);
      const st = B.game.state();
      if (st !== 'State_RunWorld') { endedState = st ?? ''; break; }
    }
    expect(endedState).toBe('State_Debrief');   // the natural coop end routed to the debrief screen
    expect(B.session.phase).toBe('ended');      // RED until the session learns about natural ends
    expect(B.session.endReason).toBeUndefined(); // no forfeit routing happened - this was a natural end
    B.session.dispose();
  });

  it('retry: no checkpoint -> fresh run at the run-start wave (retryStart feeds a wire start, v0.2.1)', { timeout: 120000 }, () => {
    // The net analog of the local debrief fallback `if (!armFromCheckpoint()) armStartWave(getRunStartWave())`:
    // dying before the first wave advance means the failed wave IS the run-start wave.
    const B = bootNetPeer('Coop', 'ROOM_Single_0001', undefined);
    B.session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, wave: 5 }, B.game.main());
    if (!B.game.waitRunning(3000)) throw new Error(`wave-5 run did not start (${B.game.state()})`);
    B.game.tick(20); // idle: no wave advance, so no coop checkpoint exists
    B.session.markEnded();
    expect(B.session.netCheckpoint).toBeUndefined();
    const m = B.session.retryStart();
    expect(m.resumeTick).toBeUndefined(); // fresh run, not a resume
    expect(m.wave).toBe(5); // the run started at wave 5 -> retry restarts at wave 5
    B.session.onNetMessage({ t: 'start', mode: m.mode, roomLink: m.roomLink, cfg: m.cfg, seed: m.seed, inputDelay: m.inputDelay, wave: m.wave });
    if (!B.game.waitRunning(3000)) throw new Error(`retry rebuild did not start (${B.game.state()})`);
    expect(B.game.snapshot().level).toBe(5);
    B.session.dispose();
  });

  it('retry: a surviving checkpoint wins - retryStart resumes from it (v0.2.1)', { timeout: 120000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    B.game.tick(10);
    B.session.captureCheckpoint(B.game.world()); // the every-N path (coop normally checkpoints at wave advances)
    B.session.markEnded();
    const m = B.session.retryStart();
    expect(m.resumeTick).toBe(B.session.netCheckpoint!.tick); // resume from the checkpoint, not a fresh wave
    expect(m.wave).toBe(B.session.startOpts!.wave); // the original start wave still rides along (no-snap fallback)
    B.session.onNetMessage({ t: 'start', mode: m.mode, roomLink: m.roomLink, cfg: m.cfg, seed: m.seed, inputDelay: m.inputDelay, resumeTick: m.resumeTick, wave: m.wave });
    if (!B.game.waitRunning(3000)) throw new Error(`retry resume did not start (${B.game.state()})`);
    B.session.dispose();
  });

  it('desync: both peers abandon to the LAN room after the grace window (was: frozen forever, v0.2.1)', { timeout: 120000 }, () => {
    // The overlay always PROMISED a lobby return; no code ever performed it. Now: checksum mismatch -> 'desync'
    // freeze -> after DESYNC_RETURN_MS both peers independently route to the room (phase 'ended').
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    setRandomState(0xC0FFEE);
    const firstEntry = B.game.world().mTick;
    let desynced = false;
    for (let i = 0; i < 70 && !desynced; i++) {
      const idx = B.game.world().mTick - firstEntry;
      // A fabricated remote checksum on every frame (keyed by the frame index like the wire does): the first
      // checksum tick (index 50) mismatches ours.
      B.session.onNetMessage({ t: 'in', tick: idx, bits: 0, sum: { tick: idx, score: -1, things: -1, zombies: -1, q: [0, 0, 0, 0, 0, 0] } });
      B.game.setKeys([]);
      B.game.tick(1);
      if (B.session.phase === 'desync') desynced = true;
    }
    expect(desynced).toBe(true);
    (B.session as any).desyncAt = performance.now() - 4000; // backdate past the grace window
    B.game.step(2);
    expect(B.game.state()).toBe('State_LanLobby'); // the promised return actually happened
    expect(B.session.phase).toBe('ended');         // and the room is actionable again
    B.session.dispose();
  });

  it('desync: the MESSAGE-receiving peer also returns to the lobby (v0.2.3 bugfix: desyncAt was never set)', { timeout: 120000 }, async () => {
    // v0.2.1 bug: onNetMessage({t:'desync'}) only set phase='desync' - desyncAt stayed undefined, so the
    // abandon condition (Date.now() - desyncAt >= DESYNC_RETURN_MS) was NaN >= N = false FOREVER: the peer
    // that learned about the desync from the wire froze on the last frame with a "tick undefined" overlay.
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    for (let i = 0; i < 6; i++) {
      B.session.onNetMessage({ t: 'in', tick: i, bits: 0 });
      B.game.setKeys([]);
      B.game.tick(1);
    }
    // Wire the bridge like a real net game so the lobby return also lands the banner (backInLobby needs it).
    // _resetBridgeForTests() replaces the singleton - capture AFTER the reset or the assignments land on a
    // dead object.
    _resetBridgeForTests();
    const b = lanBridge();
    b.session = B.session;
    b.phase = 'playing';
    B.session.onNetMessage({ t: 'desync', tick: 3, mine: 'a', theirs: 'b' });
    expect(B.session.phase).toBe('desync');
    expect(B.session.desyncAt).toBeDefined(); // RED (v0.2.1): never set on the receiving side
    await new Promise((r) => setTimeout(r, 700)); // > DESYNC_RETURN_MS (v0.2.3: 600 ms)
    B.game.step(8); // a few extra enterFrames: the new state function runs after the SetState swap
    expect(B.game.state()).toBe('State_LanLobby'); // RED (v0.2.1): still frozen on State_RunWorld
    expect(B.session.phase).toBe('ended');
    expect(b.message).toContain('DESYNCED'); // the lobby banner line
    _resetBridgeForTests();
    B.session.dispose();
  });

  it('stall watchdog: frames dry up while heartbeats stay alive -> desync exit, not an eternal WAITING freeze (v0.2.3)', { timeout: 120000 }, async () => {
    // A divergence that starves one peer of input frames while the TCP link stays alive (heartbeats keep the
    // watchdog link fed) used to freeze that peer on stallReason='peer' forever - no checksum would ever meet
    // its counterpart. The stall watchdog escalates a >= 5 s continuous stall to a desync teardown.
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    for (let i = 0; i < 6; i++) {
      B.session.onNetMessage({ t: 'in', tick: i, bits: 0 });
      B.game.setKeys([]);
      B.game.tick(1);
    }
    B.session.peerReady = true; // the watchdog exemption: frames only dry up AFTER the peer was live
    B.game.step(2); // no more remote frames: the stall begins
    expect(B.session.stallReason).toBe('peer');
    await new Promise((r) => setTimeout(r, 5300)); // > STALL_DESYNC_MS (5 s)
    B.game.step(1); // the stalled wrapper tick fires the watchdog
    expect(B.session.phase).toBe('desync'); // RED (v0.2.2): still 'playing'
    expect(B.sent.some((m) => m.t === 'desync')).toBe(true); // the peer is told to exit too
    await new Promise((r) => setTimeout(r, 700));
    B.game.step(8);
    expect(B.game.state()).toBe('State_LanLobby');
    expect(B.session.phase).toBe('ended');
    B.session.dispose();
  });

  it('net pause: BOTH peers show the PAUSED overlay; either side resumes (v0.2.3)', { timeout: 120000 }, () => {
    // v0.2.2 behaviour: only the pausing peer saw PAUSED! - the peer's frame stream dried up and it froze on
    // the last frame behind a WAITING strip. Now pause/unpause are wire messages: both sides freeze on the
    // same tick with the identical original overlay (QUIT concedes on both), and either side can resume.
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    for (let i = 0; i < 6; i++) {
      B.session.onNetMessage({ t: 'in', tick: i, bits: 0 });
      B.game.setKeys([]);
      B.game.tick(1);
    }
    const frozenAt = B.game.world().mTick;

    // The peer across the wire pauses: the message must mirror the state AND the overlay here.
    B.session.onNetMessage({ t: 'pause' });
    expect(B.session.netPaused).toBe(true);                          // RED (v0.2.2): no handler
    expect(B.game.world().mHud.mcScreenPause).toBeDefined();          // RED: the peer sees PAUSED! too
    B.session.onNetMessage({ t: 'in', tick: 6, bits: 0 });            // frames keep arriving
    B.game.setKeys([]);
    B.game.step(3);
    expect(B.game.world().mTick).toBe(frozenAt);                      // frozen while paused
    // The overlay's QUIT is the concede path on this side as well (scope wires it for every net pause).
    expect(B.game.world().mHud.mcScreenPause._Quit.onRelease).toBeTypeOf('function');

    // OUR pause key resumes: applies locally, tells the peer, ticks continue.
    B.game.setKeys([KEYS.PAUSE]);
    B.game.step(2);
    B.game.releaseAll();
    expect(B.session.netPaused).toBe(false);
    expect(B.game.world().mHud.mcScreenPause).toBeUndefined();
    expect(B.sent.filter((m) => m.t === 'unpause').length).toBe(1);   // the peer is told
    for (let i = 7; i < 10; i++) B.session.onNetMessage({ t: 'in', tick: i, bits: 0 });
    B.game.setKeys([]);
    B.game.tick(2);
    // frame 6 was already on the wire when the pause lifted, so the unpause step itself ran one tick.
    expect(B.game.world().mTick).toBe(frozenAt + 3);                  // the lockstep continues

    // OUR pause key pauses: the message goes out with the overlay.
    B.sent.length = 0;
    B.game.setKeys([KEYS.PAUSE]);
    B.game.step(2);
    B.game.releaseAll();
    expect(B.session.netPaused).toBe(true);
    expect(B.sent.filter((m) => m.t === 'pause').length).toBe(1);     // RED (v0.2.2): the key never sent anything
    expect(B.game.world().mHud.mcScreenPause).toBeDefined();
    B.session.dispose();
  });

  it('independent camera (v0.2.3): no KeepDistance tether, respawn scope open, camera tracks only the LOCAL player', { timeout: 120000 }, () => {
    // LAN coop drops the shared-screen contract: players may roam the whole map apart. Three wrappers act
    // together (missing any one strands a far-away player): KeepDistance no longer clears separation-growing
    // deltas, the player respawn scan no longer requires the 19x13 scope box, and each client's camera only
    // tracks its own player (render state - not checksummed). Offline coop keeps all three original.
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    const w = B.game.world()!;
    const [p1, p2] = B.game.players(); // p1 = remote (host), p2 = local (client, role 1)
    // Far apart: dx = 19, dy = 14 - both axes beyond the 19x13 tether box.
    p1.Move(new (Thing.Math as any).CThing_Position(1.5, 1.5, 0));
    p2.Move(new (Thing.Math as any).CThing_Position(20.5, 15.5, 0));

    // 1. KeepDistance: deltas that GROW the separation keep their value in a net coop game.
    p2.mDelta.mX = 1;
    p2.mDelta.mY = 1;
    p2.KeepDistance();
    expect(p2.mDelta.mX, 'net: x delta survives').toBe(1);   // RED (v0.2.2): cleared to 0
    expect(p2.mDelta.mY, 'net: y delta survives').toBe(1);   // RED (v0.2.2): cleared to 0

    // 2. Respawn scope: with players far apart the scan must still find spawn points (undefined = P2 respawns
    // never complete - the original Close/Far scan accepts nothing outside the box and has no fallback).
    expect(w.Spawn_ValidPosition_WithinPlayerScope(p1.mPosition, p2.mPosition)).toBe(true); // RED (v0.2.2): false

    // 3. Camera: only the LOCAL player feeds mTrackPosition on this client.
    (w as any).mTrackPosition = undefined;
    w.TrackThing(p1); // the remote player - ignored here, tracked on ITS client instead
    expect((w as any).mTrackPosition).toBeUndefined();        // RED (v0.2.2): a running average of p1
    w.TrackThing(p2);
    expect((w as any).mTrackPosition).toBeDefined();
    expect((w as any).mTrackPosition.mX).toBeCloseTo(p2.mPosition.mX, 5);

    // Offline coop: all three keep the ORIGINAL shared-screen behaviour (1:1 parity untouched).
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 41 });
    const ow = g.world()!;
    const [o1, o2] = g.players();
    o1.Move(new (Thing.Math as any).CThing_Position(1.5, 1.5, 0));
    o2.Move(new (Thing.Math as any).CThing_Position(20.5, 15.5, 0));
    o2.mDelta.mX = 1;
    o2.KeepDistance();
    expect(o2.mDelta.mX, 'offline: tether intact').toBe(0);
    expect(ow.Spawn_ValidPosition_WithinPlayerScope(o1.mPosition, o2.mPosition)).toBe(false);
    (ow as any).mTrackPosition = undefined;
    ow.TrackThing(o1);
    expect((ow as any).mTrackPosition).toBeDefined();         // offline: EITHER player tracks
    B.session.dispose();
  });

  it('long lockstep sessions keep bounded checksums and release transient bookkeeping', () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    const w = B.game.world();
    for (let n = 0; n < 600; n++) {
      const t = B.session.tickIndex(w);
      B.session.onNetMessage({ t: 'in', tick: t, bits: 0 });
      expect(B.session.beginTick(w)).toBe('confirmed');
      w.mTick++;
      B.session.afterTick(w);
      const msg = B.sent.at(-1);
      if (msg?.sum) B.session.onNetMessage({ t: 'in', tick: msg.tick, bits: 0, sum: msg.sum });
    }
    expect(B.session.tickMeta.size).toBe(0); // rollback is disabled for this session
    expect((B.session as any).ourSums.size).toBeLessThanOrEqual(3);
    expect((B.session as any).remoteSums.size).toBeLessThanOrEqual(3);
    B.session.dispose();
    expect((B.session as any).localFrames.size).toBe(0);
    expect((B.session as any).remoteFrames.size).toBe(0);
    expect(B.session.snapCtx).toBeUndefined();
  });

  it('sampling both keyboard layouts consumes both press latches', () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    const input = CMain.mInput;
    input.KEY_FIRE.mDown = true;
    input.KEY_FIRE.mPressed = false;
    input.KEY_FIRE2.mDown = false;
    input.KEY_FIRE2.mPressed = true;
    expect(unpackBit((B.session as any).sampleLocalBits(), 'FIRE')).toBe(true);
    expect(input.KEY_FIRE2.mPressed).toBe(false);
    input.KEY_FIRE.mDown = false;
    expect(unpackBit((B.session as any).sampleLocalBits(), 'FIRE')).toBe(false);
    B.session.dispose();
  });

  it('a desync while paused still tears down the world and returns to the lobby', () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    B.session.setPaused(true);
    B.session.onNetMessage({ t: 'desync', tick: 1 });
    B.session.desyncAt = performance.now() - 1000;
    B.game.step(40);
    expect(B.game.state()).toBe('State_LanLobby');
    expect(B.game.world()).toBeUndefined();
    expect(B.session.phase).toBe('ended');
    B.session.dispose();
  });

  it('LAN display prediction keeps moving beyond the offline co-op tether', () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001', 3);
    const [remote, me] = B.game.players();
    me.Move(new Thing.Math.CThing_Position(12.5, 8.5, 0));
    remote.mPosition.mX = me.mPosition.mX - 25;
    remote.mPosition.mY = me.mPosition.mY - 20;
    me.mStateID = 'State_PlayerControl';
    me.mSpeed = 0.2;
    const t = B.session.tickIndex(B.game.world());
    for (let n = 1; n < 3; n++) (B.session as any).localFrames.set(t + n, bitsOf([KEYS.P2.RIGHT, KEYS.P2.DOWN], KEYS.P2));
    const before = [me.mPosition.mX, me.mPosition.mY];
    advanceShadow(B.session, B.game.world());
    expect(B.session.shadow.x).toBeGreaterThan(before[0]);
    expect(B.session.shadow.y).toBeGreaterThan(before[1]);
    expect([me.mPosition.mX, me.mPosition.mY]).toEqual(before);
    B.session.dispose();
  });

  it('coop: player 2 switches weapons with the keyboard (E next / Q previous) - pinned, original defaults', { timeout: 120000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 7 });
    const p2 = g.players()[1];
    p2.NewWeapon('uzi');
    expect(p2.mWeapon_Current.mNameID).toBe('pistol');
    g.setKeys([KEYS.P2.NEXT]);       // E
    g.tick(2);                        // press tick + release tick
    g.releaseAll();
    g.tick(2);
    expect(p2.mWeapon_Current.mNameID).toBe('uzi');
    g.setKeys([KEYS.P2.PREV]);       // Q
    g.tick(2);
    g.releaseAll();
    g.tick(2);
    expect(p2.mWeapon_Current.mNameID).toBe('pistol');
  });

  it('death match: periodic net checkpoint, disconnect -> two independent rebuilds continue identically', { timeout: 240000 }, () => {
    const B = bootNetPeer('DeathMatch', 'ROOM_Single_0001');
    expect(B.game.players()).toHaveLength(2);
    const dmFirst = B.game.world().mTick;
    for (let i = 0; i <= 1505; i++) {
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - dmFirst, bits: bitsOf(script(i).p1, KEYS.P1) });
      B.game.setKeys(script(i + 1).p2);
      B.game.tick(1);
    }
    const cp = B.session.netCheckpoint;
    expect(cp).toBeDefined();
    expect(cp!.tick - dmFirst).toBe(1500); // relative lockstep index 1500

    // Two independent peers rebuild from the identical checkpoint and continue with the same script.
    const run = (): string => {
      const P = bootNetPeer('DeathMatch', 'ROOM_Single_0001');
      P.session.netCheckpoint = cp!;
      P.session.startLocalGame({ mode: 'DeathMatch', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, resumeTick: cp!.tick }, P.game.main());
      if (!P.game.waitRunning(3000)) throw new Error(`rebuild did not start (${P.game.state()})`);
      expect(P.game.world().mTick).toBe(cp!.tick); // the snapshot restored the tick
      const reFirst = P.game.world().mTick;
      for (let i = 0; i < 60; i++) {
        P.session.onNetMessage({ t: 'in', tick: P.game.world().mTick - reFirst, bits: bitsOf(script(i).p1, KEYS.P1) });
        P.game.setKeys(script(i + 1).p2);
        P.game.tick(1);
      }
      return worldHash(P.game);
    };
    const h1 = run();
    const h2 = run();
    expect(h2).toBe(h1); // the rebuild+continue path is deterministic
  });
});

// --------------------------------------------------------------------------- v0.2.3 rollback

/** Boot a ROLLBACK-mode client peer (role 1): prediction + corrections active, D pinned to 1. */
function bootRollbackPeer(mode: LanMode = 'Coop', roomLink = 'ROOM_Single_0001'): Peer {
  const game = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main', navBudget: 300 });
  const sent: any[] = [];
  const session = new NetSession(1, { send: (m) => sent.push(m) });
  session.startLocalGame({ mode, roomLink, cfg: CFG, seed: SEED, rollback: true }, game.main());
  if (!game.waitRunning(3000)) throw new Error(`rollback peer: room did not start (${game.state()}, ${game.errors[0] ?? ''})`);
  // The real peer primes frame 0 from ITS onWorldReady (empty input) - without it prediction stays gated
  // (peerReady) and the very first tick would stall forever.
  session.onNetMessage({ t: 'in', tick: 0, bits: 0 });
  return { game, session, sent };
}

/** The uninterrupted reference run (an IN-ORDER rollback session - same boot path as the peers under test,
 *  so the absolute warm-up ticks align and worldHash's tick row is comparable). */
function runReference(N: number, mode: 'Coop' | 'DeathMatch' = 'Coop'): { hashes: string[]; sounds: any[]; game: ReturnType<typeof createHeadlessGame> } {
  const B = bootRollbackPeer(mode);
  const sounds = recordSounds(B.game);
  const hashes: string[] = [];
  const first = B.game.world().mTick - (B.session as any).startTick;
  for (let t = 0; t < N; t++) {
    B.session.onNetMessage({ t: 'in', tick: first + t, bits: bitsOf(script(t).p1, KEYS.P1) });
    B.game.setKeys(script(t + 1).p2);
    B.game.tick(1);
    hashes.push(worldHash(B.game));
  }
  return { hashes, sounds, game: B.game };
}

describe('LAN rollback (v0.2.3)', () => {
  it('T2/T6: late, divergent remote frames replay to the reference timeline - persistent hash AND sound prefix', { timeout: 240000 }, () => {
    const N = 60;
    const ref = runReference(N);
    const B = bootRollbackPeer();
    const snd = recordSounds(B.game);
    const delivered = new Set<number>();
    const relTick = (): number => B.game.world().mTick - (B.session as any).startTick;
    // Iteration-driven (wall ticks can stall when a frame exceeds the prediction depth - the loop must
    // still deliver the later frames): frame t arrives at iteration t + 1 + (t % 4).
    const arrivesAt = (t: number): number => t + 1 + (t % 4);
    for (let i = 0; i < N * 4 + 64 && relTick() < N; i++) {
      for (let t = 0; t < N; t++) {
        if (arrivesAt(t) <= i && !delivered.has(t)) {
          delivered.add(t);
          B.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
        }
      }
      B.game.setKeys(script(Math.min(relTick() + 1, N - 1)).p2);
      B.game.tick(1, 4);
    }
    for (let t = 0; t < N; t++) {
      if (!delivered.has(t)) B.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
    }
    // Drain the in-flight frames and let the pending corrections run (2 wrapper ticks), then FREEZE: further
    // ticks would run on each side's own lastRemoteBits prediction and evolve the transients differently by
    // construction (the frames stopped - R10 note in Rollback.ts).
    B.game.setKeys([]);
    B.game.tick(2, 16);
    expect(B.session.correctionPending).toBeUndefined();
    // PREDICT_MAX_LAG_TICKS ships 0 (see protocol.ts): the packaged run gate asserts the pure-lockstep
    // fallback - identical persistent state, no cadence holes. The prediction machinery is exercised by the
    // depth-specific suites below (bootRollbackPeer primes + the bookkeeping/correction unit tests).
    expect(B.session.rollbackStats.predictions, 'depth 0: prediction dormant by default').toBe(0);
    expect(B.session.phase).toBe('playing');
    expect(B.game.errors).toEqual([]);
    // T2 (persistent state): players, creatures, objects, counters and score - everything the lockstep
    // checksum itself covers - are EXACTLY the in-order reference after the corrections. In-flight shot and
    // effect families (alive < 0.5 s) are compared by the production checksum semantics, not here.
    const persistent = (g: ReturnType<typeof createHeadlessGame>): string => {
      const rows = worldRows(g).filter((r) => !/^(CThing_Shot_|CThing_Effect_)/.test(r));
      let h = 0x811c9dc5;
      const s = rows.join('\n');
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return (h >>> 0).toString(16);
    };
    expect(persistent(B.game), 'persistent world == in-order reference').toBe(persistent(ref.game));
    // T6 audio canary: every sound the reference window played, B played too, IN ORDER (name/volume/pan) -
    // B's stream may additionally contain a re-emitted duplicate where a correction replayed an already
    // flushed tick (the GGPO-accepted artifact; identity-without-duplicates holds for the uncorrected path,
    // pinned by T7-smoke/in-order).
    const strip = (l: any[], upto: number): string[] =>
      l.filter((s) => s.played && (s.tick ?? 0) <= upto + 2).map((s) => `${s.name}:${s.volume}:${s.pan}`);
    const isSubsequenceOf = (want: string[], got: string[]): boolean => {
      let j = 0;
      for (const x of got) if (j < want.length && x === want[j]) j++;
      return j === want.length;
    };
    const refStream = strip(ref.sounds, N + 2);
    const bStream = strip(snd, N + 2);
    expect(refStream.length).toBeGreaterThan(10); // the window actually played
    expect(isSubsequenceOf(refStream, bStream), 'reference sound stream is an ordered subsequence').toBe(true);
    B.session.dispose();
    ref.game.quit();
  });

  it('T3: starvation beyond the window stalls the sim; landed frames replay and continue', { timeout: 240000 }, () => {
    const B = bootRollbackPeer();
    // Frames 0..2 arrive; then a long drought: ticks run ahead on prediction until the window is spent.
    // (A world tick is 2 engine frames - step() counts frames, so starve in FRAME units.)
    for (let t = 0; t <= 2; t++) B.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
    B.game.setKeys([]);
    for (let i = 0; i < (ROLLBACK_WINDOW_TICKS + 6) * 2; i++) B.game.step(1);
    expect(B.session.stallReason).toBe('peer'); // window exhausted: frozen, NOT run ahead
    const frozenAt = B.game.world().mTick;
    // The drought ends - the missing frames land contiguously and the lockstep continues.
    for (let t = 3; t <= frozenAt - (B.session as any).startTick; t++) {
      B.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
    }
    // Depth 0: every post-thaw tick needs its own remote frame - feed a few ahead so the LAST executed
    // tick is a clean confirmed one (stallReason clears inside beginTick of a successful tick).
    const rel = frozenAt - (B.session as any).startTick;
    for (let t = 3; t <= rel + 3; t++) {
      B.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
    }
    B.game.setKeys(script(rel).p2);
    B.game.tick(3);
    expect(B.game.world().mTick).toBeGreaterThan(frozenAt);
    expect(B.session.stallReason).toBeUndefined();
    expect(B.game.errors).toEqual([]);
    B.session.dispose();
  });

  it('T7-latch: a predicted game end latches - it routes on confirm or is discarded by a correction', { timeout: 120000 }, () => {
    const B = bootRollbackPeer();
    const w = B.game.world();
    // Run a few confirmed ticks so the confirm frontier is contiguous through tick 3.
    for (let t = 0; t <= 2; t++) {
      B.session.onNetMessage({ t: 'in', tick: t, bits: 0 });
      B.game.setKeys([]);
      B.game.tick(1);
    }
    expect(B.session.confirmTick).toBe(2);
    // Tick 3 executed as a PREDICTION (frame not delivered yet) whose sim set the end state: the wrapper
    // latched it into the meta (simulated directly - the mechanics under test are the latch routing).
    B.session.tickMeta.set(3, { remoteBits: 0, predicted: true, endState: 'player dead' });
    w.mCompleteState = undefined;
    // The true frame for tick 3 matches the prediction: confirmation re-applies the latch to route it.
    B.session.onNetMessage({ t: 'in', tick: 3, bits: 0 });
    expect(B.session.confirmTick).toBe(3);
    expect(w.mCompleteState).toBe('player dead');
    // A DIVERGENT confirmation must instead leave the world alone (the replay re-derives the truth).
    w.mCompleteState = undefined;
    B.session.tickMeta.get(3)!.endState = 'player dead';
    B.session.onNetMessage({ t: 'in', tick: 3, bits: 0b0000001 }); // different bits than the meta
    expect(B.session.correctionPending).toBe(3);
    expect(w.mCompleteState).toBeUndefined();
    B.session.dispose();
  });

  it('T7-smoke: Death Match rollback runs clean against an in-order reference session', { timeout: 240000 }, () => {
    const N = 20;
    // Iteration-driven (a feed delay beyond the prediction depth stalls the world - a while-on-relTick()
    // would spin forever waiting for frames keyed to a frozen tick).
    const run = (feedDelay: number): { g: ReturnType<typeof createHeadlessGame>; hash: string } => {
      const P = bootRollbackPeer('DeathMatch');
      const delivered = new Set<number>();
      const rel = (): number => P.game.world().mTick - (P.session as any).startTick;
      for (let i = 0; i < N * 4 + 32 && rel() < N; i++) {
        for (let t = 0; t < N; t++) {
          if (t + feedDelay <= i && !delivered.has(t)) {
            delivered.add(t);
            P.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
          }
        }
        P.game.setKeys(script(Math.min(rel() + 1, N - 1)).p2);
        P.game.tick(1, 6);
      }
      for (let t = 0; t < N; t++) {
        if (!delivered.has(t)) P.session.onNetMessage({ t: 'in', tick: t, bits: bitsOf(script(t).p1, KEYS.P1) });
      }
      P.game.setKeys([]);
      P.game.tick(N + 2 - rel(), 12);
      return { g: P.game, hash: worldHash(P.game) };
    };
    const a = run(0); // in-order reference
    const b = run(2); // every remote frame two ticks late (predicted then confirmed)
    expect(b.g.errors).toEqual([]);
    expect(b.hash).toBe(a.hash);
    a.g.quit();
    b.g.quit();
  });

  it('T8: the CSound choke-point wrapper is installed beneath every instance hook', () => {
    // installNetScope runs inside applyScope BEFORE the first CMain ctor (i.e. before RegisterSound captured
    // the prototype method into the sample clips) - the belt assertion for the sound queue.
    const proto = (CSound as any).prototype;
    expect(typeof proto.PlaySound).toBe('function');
    expect((proto.PlaySound as any).__boxheadNetSoundQueue).toBe(true);
  });
});

// --------------------------------------------------------------------------- v0.2.1 stall catch-up

describe('LAN stall catch-up (v0.2.1 L1)', () => {
  it('netStallRewind: hands the stalled slot back, clamps the debt, never touches an ahead schedule', () => {
    const T = 40;
    // Healthy schedule: the stalled tick's just-consumed slot is returned whole.
    expect(netStallRewind(1000, 1000, T, 3)).toBe(960);
    // A long starvation clamps the schedule debt at maxDebtTicks behind "now" (no unbounded fast-forward).
    expect(netStallRewind(1000, 1000 + 10 * T, T, 3)).toBe(1000 + 10 * T - 3 * T);
    // A schedule that is ahead of now (just reset) and an undefined schedule are left alone.
    expect(netStallRewind(1000, 900, T, 3)).toBe(1000);
    expect(netStallRewind(undefined, 1000, T, 3)).toBe(undefined);
  });

  it('spendCatchupCredit: transient stalls spend the bucket, a persistent phase mismatch yields until re-lock', () => {
    const s = new NetSession(0, { send: () => {} });
    const T = 40;
    // A fresh game starts with full credit: three ticks of rewinds, then the bucket is dry.
    expect(s.spendCatchupCredit(1000, T)).toBe(true);
    expect(s.spendCatchupCredit(1040, T)).toBe(true);
    expect(s.spendCatchupCredit(1080, T)).toBe(true);
    expect(s.spendCatchupCredit(1120, T)).toBe(false);
    // ~1 s later roughly one refill tick's worth came back (post-lock hiccups stay hidden).
    expect(s.spendCatchupCredit(2200, T)).toBe(true);
    expect(s.spendCatchupCredit(2240, T)).toBe(false);
    s.dispose();
  });

  it('a one-tick-late peer frame costs no cadence slot - the gate retries the same tick', { timeout: 120000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    setRandomState(0xC0FFEE);
    const firstEntry = B.game.world().mTick;
    for (let i = 0; i < 10; i++) { // warm-up: frames flowing, the schedule is healthy
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - firstEntry, bits: 0 });
      B.game.setKeys([]);
      expect(B.game.tick(1)).toBe(1);
    }
    const w = B.game.world();
    const main: any = B.game.main();
    const before = w.mTick;
    // The next tick comes due and stalls (remote frame missing): its slot must go back to the schedule.
    B.game.step(2); // virtual EFs at +20 ms (nothing due) and +40 ms (tick due -> stall)
    expect(w.mTick).toBe(before); // frozen, as ever
    // The late frame lands: the OWED tick runs on the very next EF (before v0.2.1 the slot was already gone and
    // the tick only ran a full slot later - the visible cadence hole).
    B.session.onNetMessage({ t: 'in', tick: w.mTick - firstEntry, bits: 0 });
    expect(B.game.tick(1, 1)).toBe(1);
    expect(w.mTick).toBe(before + 1);
    // A LONG starvation must not bank unlimited catch-up: the schedule stays inside the debt clamp.
    for (let i = 0; i < 40; i++) B.game.step(1); // ~800 ms starved
    expect(frameTime() - main.mTimeSlice).toBeLessThanOrEqual((MAX_NET_CATCHUP_TICKS + 1) * 40);
    B.session.dispose();
  });
});

// --------------------------------------------------------------------------- v0.1.4 session config / input delay

describe('LAN session config (v0.1.4)', () => {
  it('applyConfig imposes and restores BOTH character indices', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sd: any = (CMain as any).mSaveData;
    const p1 = sd.mPlayer1_CharacterIndex, p2 = sd.mPlayer2_CharacterIndex;
    const sent: any[] = [];
    const session = new NetSession(1, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: { ...CFG, charP1: 2, charP2: 1 }, seed: SEED }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    expect(sd.mPlayer1_CharacterIndex).toBe(2); // the host's charP1 reaches the client's save data
    expect(sd.mPlayer2_CharacterIndex).toBe(1);
    session.dispose();
    expect(sd.mPlayer1_CharacterIndex).toBe(p1); // and dispose restores the player's own choices
    expect(sd.mPlayer2_CharacterIndex).toBe(p2);
  });

  it('honours start.inputDelay: primes 0..D-1, sends t-1+D (v0.1.7 one-tick-earlier), prunes behind t-(D+3)', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sent: any[] = [];
    const session = new NetSession(1, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 2 }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    expect(session.inputDelay).toBe(2);
    // onWorldReady primed the D frames 0..1 (v0.1.4 primed 0..D; the D frame now belongs to tick 0's afterTick, so
    // priming it too would double-write the index and desync).
    const ins = sent.filter((m) => m.t === 'in');
    expect(ins.slice(0, 2).map((m) => m.tick)).toEqual([0, 1]);

    for (let T = 0; T < 12; T++) {
      session.onNetMessage({ t: 'in', tick: T, bits: 0 }); // the remote frame for relative tick T
      session.onNetMessage({ t: 'in', tick: T + 1, bits: 0 }); // one ahead, so the tick never stalls
      g.tick(1);
    }
    // afterTick sends frame index (executed tick)+D: with 12 executed ticks (0..11) the newest is 11+2.
    const newest = Math.max(...sent.filter((m) => m.t === 'in').map((m) => m.tick));
    expect(newest).toBe(13);
    // The buffered window shrinks behind t-(D+3): frames older than 12-5 are gone, recent ones remain.
    expect(_peekLocalFrame(session, 0)).toBeUndefined();
    expect(_peekLocalFrame(session, 2)).toBeUndefined();
    expect(_peekLocalFrame(session, newest)).toBeDefined();
  });

  it('forfeit records the via reason (timeout vs concede) for the end-screen routing', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sent: any[] = [];
    const session = new NetSession(0, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'DeathMatch', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    expect(session.endReason).toBeUndefined();
    session.forfeit('timeout');
    expect(session.phase).toBe('ended');
    expect(session.endReason).toBe('timeout');
    expect(sent.at(-1)).toMatchObject({ t: 'leave', reason: 'forfeit', via: 'timeout' });
    // The peer's timeout message maps to 'peer-timeout' locally (both route to the main menu).
    const other = new NetSession(1, { send: () => undefined });
    other.onNetMessage({ t: 'leave', reason: 'forfeit', via: 'timeout' });
    expect(other.endReason).toBe('peer-timeout');
    session.dispose();
    other.dispose();
  });
});

// ------------------------------------------------------------- v0.1.7: live ping / stall notices / input delay

describe('LAN v0.1.7: live ping, stall notices, jitter-aware input delay', () => {
  it('computeInputDelay: one-way + margin bands, gameSpeed-aware, capped', () => {
    // Normal speed (40 ms ticks): no samples or a real LAN stays 1; 60 ms -> 2; ~100 ms -> 3; extreme clamps at 8.
    expect(computeInputDelay(undefined, 1)).toBe(1);
    expect(computeInputDelay([], 1)).toBe(1);
    expect(computeInputDelay([2], 1)).toBe(1);
    expect(computeInputDelay([60], 1)).toBe(2);
    expect(computeInputDelay([40, 55, 60], 1)).toBe(2); // the WORST recent sample decides (jitter headroom)
    expect(computeInputDelay([100], 1)).toBe(3);
    expect(computeInputDelay([175], 1)).toBe(4);
    expect(computeInputDelay([2000], 1)).toBe(8);
    // Fast game (20 ms ticks) needs proportionally more ticks for the same link; slow (80 ms) fewer.
    expect(computeInputDelay([60], 2)).toBe(4);
    expect(computeInputDelay([60], 0)).toBe(1);
  });

  it('computeInputDelay ignores heartbeat RTT outliers (p90, v0.2.1)', () => {
    // The lobby samples RTTs for minutes; ONE pre-START heartbeat hiccup used to add +1..2 D for a whole game.
    const clean = Array.from({ length: 20 }, (_, i) => 55 + (i % 3) * 3); // a steady 60 ms-class link
    expect(computeInputDelay(clean, 1)).toBe(2);
    const spiked = [...clean.slice(0, 18), 180, 240]; // two hb hiccups at the end of the window
    expect(computeInputDelay(spiked, 1)).toBe(2);     // RED pre-v0.2.1: worst-of-20 -> D=4
    // Small windows still resolve to the max (nothing to drop yet).
    expect(computeInputDelay([40, 55, 60], 1)).toBe(2);
  });

  it('heartbeat refreshes rttMs AND notifies the UI while playing (ended sessions stay silent)', { timeout: 60000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    let notified = 0;
    B.session.onStateChange = () => notified++;
    const before = notified;
    B.session.onNetMessage({ t: 'hb', ts: Date.now() - 42 });
    expect(B.session.rttMs).toBeGreaterThanOrEqual(40);
    expect(B.session.rttMs).toBeLessThanOrEqual(60);
    expect(notified).toBe(before + 1); // the in-game ping readout refreshes with every probe
    // An ended session (back in the lobby after a game) must not re-trigger the overlay every second.
    B.session.phase = 'ended';
    const n2 = notified;
    B.session.onNetMessage({ t: 'hb', ts: Date.now() });
    expect(notified).toBe(n2);
    B.session.dispose();
  });

  it('stall transitions notify the UI and stamp/clear stallSince', { timeout: 60000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001');
    const events: (string | undefined)[] = [];
    B.session.onStateChange = () => events.push(B.session.stallReason);
    // No remote frame for the next tick -> the gate stalls and the UI hears about it (v0.1.4 never told it).
    expect(B.game.tick(1)).toBe(0);
    expect(B.session.stallReason).toBe('peer');
    expect(B.session.stallSince).not.toBeUndefined();
    expect(events).toContain('peer');
    // The frame arrives -> the stall clears and the UI hears that too. (v0.2.1 L1: the recovery EF may also pull
    // the NEXT owed tick forward as a bounded catch-up burst; if that frame is not there yet a fresh transient
    // stall for THAT tick starts - the 150 ms grace keeps it invisible. The clear itself is what the UI must see.)
    const entry = B.game.world().mTick - (B.session as any).startTick;
    B.session.onNetMessage({ t: 'in', tick: entry, bits: 0 });
    expect(B.game.tick(1)).toBeGreaterThanOrEqual(1);
    expect(events).toContain(undefined);
    // With the next frames landed too, the session settles back to no stall at all. The bounded catch-up may owe
    // a few slots after the starvation (<= MAX_NET_CATCHUP_TICKS); draining them needs one fed frame per owed tick
    // (on the wire frames stream continuously, so this is test-harness bookkeeping, not game behavior).
    for (let k = 0; k < 8 && B.session.stallReason !== undefined; k++) {
      B.session.onNetMessage({ t: 'in', tick: B.game.world().mTick - (B.session as any).startTick, bits: 0 });
      B.game.tick(1);
    }
    expect(B.session.stallReason).toBeUndefined();
    expect(B.session.stallSince).toBeUndefined();
    B.session.dispose();
  });

  it('stallStripDue: the WAITING strip waits out a grace window (micro-stalls never flash)', () => {
    expect(stallStripDue(undefined, 1000)).toBe(false);
    expect(stallStripDue(900, 1000)).toBe(false); // 100 ms stall: still inside the grace
    expect(stallStripDue(850, 1000)).toBe(true); // 150 ms stall: due
  });

  it('a host start while the client session lives keeps the client inputDelay (reconnect / resume)', { timeout: 60000 }, () => {
    const B = bootNetPeer('Coop', 'ROOM_Single_0001', 3);
    expect(B.session.inputDelay).toBe(3);
    // v0.1.4 bug: this path dropped msg.inputDelay and reset the client to D=1 while the host kept 3 -> the host
    // micro-stalled on every tick after any resume. (v0.2.3: the wire always carries rollback - which pins both
    // peers to D=1 - but an explicit inputDelay must still reach the client for non-rollback builds.)
    B.session.onNetMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 3, resumeTick: 0 });
    expect(B.session.inputDelay).toBe(3);
    B.session.dispose();
  });

  it('onHello resends start consistently (host side of the resume; v0.2.3: rollback pinned with D=1)', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sent: any[] = [];
    const session = new NetSession(0, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 3 }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    session.phase = 'reconnecting';
    session.captureCheckpoint(g.world());
    session.onHello({});
    const start = sent.find((m) => m.t === 'start');
    // The v0.1.7 guarantee (never drop the input delay on a resume) now ships as the v0.2.3 rollback
    // contract: every resume start re-sends the SAME input delay and re-enables rollback on both peers.
    expect(start).toMatchObject({ inputDelay: 3, rollback: true });
    session.dispose();
  });
});
