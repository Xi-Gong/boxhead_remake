// LAN lockstep simulation tests (v0.1.3 L1). The RNG is a process-global singleton, so the two "peers" run
// SEQUENTIALLY: game A (the host reference, plain keyboard play) records its per-tick input bitmaps first, then
// game B (a client NetSession) replays A's player-1 bitmaps as its remote frames while its own scripted player-2
// keys feed the local sampler. Sequential replay under identical bitmaps is exactly what interleaved lockstep
// computes - if B's world hash ever differs from A's, the peers would have desynced.
//
// Hashes here are ID-free (things keyed by class + position + life + flags): the process-wide thing allocator
// gives the second game different absolute ids, which changes nothing about behaviour (only relative order matters).
import { describe, expect, it } from 'vitest';
import { setRandomState } from '../../src/engine/flash/rng.ts';
import { createHeadlessGame, KEYS, type HeadlessGame } from './harness.ts';
import { NetSlot, packBits, SLOT_ORDER, unpackBit } from '../../src/game/local/Net/NetSlot.ts';
import { NetSession, _peekLocalFrame } from '../../src/game/local/Net/NetSession.ts';
import { CMain } from '../../src/game/packages.ts';
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
function bootNetPeer(mode: LanMode, roomLink: string): Peer {
  const game = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main', navBudget: 300 });
  const sent: any[] = [];
  const session = new NetSession(1, { send: (m) => sent.push(m) });
  session.startLocalGame({ mode, roomLink, cfg: CFG, seed: SEED }, game.main());
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
      // frame(entry+2) is sampled inside THIS tick's afterTick, so the local keys lead the script by 2 ticks.
      B.game.setKeys(script(i + 2).p2);
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
      B.game.setKeys(script(i + 2).p2);
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
        P.game.setKeys(script(i + 2).p2);
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

  it('honours start.inputDelay: primes 0..D, sends t+D, prunes behind t-(D+3)', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, menuOnly: 'Main' });
    const sent: any[] = [];
    const session = new NetSession(1, { send: (m) => sent.push(m) });
    session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: SEED, inputDelay: 2 }, g.main());
    if (!g.waitRunning(3000)) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
    expect(session.inputDelay).toBe(2);
    // onWorldReady primed the D+1 frames 0..2 (with the default delay it would be 0..1).
    const primed = sent.filter((m) => m.t === 'in' && m.tick <= 2).map((m) => m.tick).sort((a, b) => a - b);
    expect(primed).toEqual([0, 1, 2]);

    const first = g.world().mTick;
    for (let T = 0; T < 12; T++) {
      session.onNetMessage({ t: 'in', tick: T, bits: 0 }); // the remote frame for relative tick T
      session.onNetMessage({ t: 'in', tick: T + 1, bits: 0 }); // one ahead, so the tick never stalls
      g.tick(1);
    }
    // afterTick sends frame index t+D: with 12 executed ticks the newest is around 12+2.
    const newest = Math.max(...sent.filter((m) => m.t === 'in').map((m) => m.tick));
    expect(newest).toBeGreaterThanOrEqual(12);
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
