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
import { CMain, Thing, World } from '../../src/game/packages.ts';
import { computeInputDelay } from '../../src/game/local/Net/protocol.ts';
import { stallStripDue } from '../../src/game/local/Net/overlay.ts';
import type { GameConfig, LanMode } from '../../src/game/local/Net/protocol.ts';

// --------------------------------------------------------------------------------------------- helpers

type PlayerKeys = typeof KEYS.P1;
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
    const A = createHeadlessGame({ mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0 } });
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

    const A = createHeadlessGame({ mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0, infiniteLife: true } });
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
    const A = createHeadlessGame({ mode: 'Coop', room: 1, seed: SEED, difficulty: 0, options: { gameSpeed: 1, devils: 1, collisions: 1, damage: 1, detail: true, p2Character: 0 } });
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
    // The client-side consumption of a wire start message carries the wave too.
    const C = bootNetPeer('Coop', 'ROOM_Single_0001', undefined);
    C.session.onNetMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, wave: 20 });
    if (!C.game.waitRunning(3000)) throw new Error(`client room did not start (${C.game.state()})`);
    expect(C.game.snapshot().level).toBe(20);
    expect(C.game.snapshot().multiplier).toBe(30);
    B.session.dispose();
    C.session.dispose();
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

    const first = g.world().mTick;
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
    // The frame arrives -> the stall clears and the UI hears that too.
    const entry = B.game.world().mTick - (B.session as any).startTick;
    B.session.onNetMessage({ t: 'in', tick: entry, bits: 0 });
    expect(B.game.tick(1)).toBe(1);
    expect(B.session.stallReason).toBeUndefined();
    expect(B.session.stallSince).toBeUndefined();
    expect(events[events.length - 1]).toBeUndefined();
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
    // micro-stalled on every tick after any resume.
    B.session.onNetMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 3, resumeTick: 0 });
    expect(B.session.inputDelay).toBe(3);
    B.session.dispose();
  });

  it('onHello resends start WITH inputDelay (host side of the resume)', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sent: any[] = [];
    const session = new NetSession(0, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 3 }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    session.phase = 'reconnecting';
    session.captureCheckpoint(g.world());
    session.onHello({});
    const start = sent.find((m) => m.t === 'start');
    expect(start).toMatchObject({ inputDelay: 3 });
    session.dispose();
  });
});
