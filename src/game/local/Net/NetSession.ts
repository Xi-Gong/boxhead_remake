// LAN lockstep session (deviation LAN_MULTIPLAYER, v0.1.3). One per machine while a net game runs. The transport
// (electron main process / tests) is behind the NetLink interface; inbound messages arrive through onNetMessage /
// onPeerEvent.
//
// LOCKSTEP (input delay: LAN_INPUT_DELAY = 1 tick by default; the host raises it for high-RTT virtual-LAN links
// via start.inputDelay, v0.1.4):
//   - every executed tick T, right before it runs, BOTH players' NetSlots are set from the bitmaps sampled for T
//     (our own frame was sampled LAN_INPUT_DELAY ticks earlier and sent; the peer's frame arrived over the wire);
//   - right after tick T ran we sample the CURRENT local input state and send it as the frame for T + 1 + D, so it
//     arrives long before that tick needs it (LAN RTT << one 40 ms tick);
//   - a tick only runs when both frames are present - otherwise the wrapper skips the simulation entirely (canvas
//     keeps the last frame) and shows the waiting overlay. PAUSE falls out for free: the pausing peer stops
//     sampling/sending, the peer's frame stream dries up and it freezes with "peer paused".
//
// DETERMINISM: the virtual input clock advances 1000 / CMain.mFPS per executed tick (all NetSlot timestamps derive
// from it, so the grenade hold power - the one wall-clock value the sim consumes - becomes tick-quantised and
// identical on both peers, together with the Grenade.Fire wrapper). The nav BFS runs with a deterministic cell
// budget while a session is active, and StartGame pins the RNG seed on both sides.
//
// CHECKPOINTS: coop captures at every wave advance (the field is then empty - the __set__mLevel hook), Death Match
// every 1500 ticks. Both peers capture the identical snapshot at the identical tick, so a resume needs no transfer:
// the reconnect handshake only agrees on the tick (min of both latests), then both rebuild the world and re-arm the
// same snapshot. Accepted losses are the v0.1.2 snapshot semantics (mid-wave creatures / shots / effects, decals).
//
// LINK LOSS: the transport declares the link dead after ~3.5 s of heartbeat silence -> phase 'reconnecting', the
// sim freezes, a 30 s countdown runs (the client keeps retrying with the same session id). Back in time: resume
// from the checkpoint. Not back in time: forfeit - Death Match forces 'playerN wins' (both peers see the correct
// winner screen), Coop forces 'player dead' - and both return to the lobby where the checkpoint survives for a
// later continuation.
import { getRandomState, setRandomState } from '../../../engine/flash/rng.ts';
import { CMain, Thing, World } from '../../packages.ts';
import { armSnapshot, capture, type RunSnapshot } from '../Resume.ts';
import { NetSlot, packBits, unpackBit, SLOT_ORDER, type SlotBitName } from './NetSlot.ts';
import {
  LAN_CHECKSUM_EVERY, LAN_INPUT_DELAY, type GameConfig, type LanChecksum, type LanMessage, type LanMode, type LanRole,
} from './protocol.ts';

/** Outbound side of the transport (the Electron bridge or a test pipe). */
export interface NetLink {
  send(msg: LanMessage): void;
}

export type NetPhase = 'idle' | 'starting' | 'playing' | 'reconnecting' | 'desync' | 'ended';

/** The one live net session (null outside a net game). scope.ts guards read this. */
let active: NetSession | null = null;
export function netActive(): boolean { return active != null; }
export function netSession(): NetSession | null { return active; }
export function _resetNetForTests(): void { active?.dispose(); active = null; }

const DM_CHECKPOINT_EVERY = 1500;
const RECONNECT_WINDOW_MS = 30000;

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface NetCheckpoint {
  tick: number;
  digest: string;
  snap: RunSnapshot;
}

export interface NetStart {
  mode: LanMode;
  roomLink: string;
  cfg: GameConfig;
  seed: number;
  /** Lockstep input delay in ticks for this game (host picks it from the measured RTT; default LAN_INPUT_DELAY). */
  inputDelay?: number;
  /** Resume from the net checkpoint at this tick (reconnect / continuation); undefined = fresh. */
  resumeTick?: number;
}

export class NetSession {
  readonly role: LanRole; // 0 = host = player 1, 1 = client = player 2
  private readonly link: NetLink;
  phase: NetPhase = 'idle';
  mode: LanMode = 'Coop';
  /** The start parameters of the current/last game (the bridge reuses the seed for a 续局 continuation). */
  startOpts: NetStart | undefined;
  /**
   * Why the last game ended. Forfeit routing (v0.1.4): 'timeout'/'peer-timeout' (the 30 s reconnect window ran
   * out) end at the MAIN MENU on both peers; a 'concede' (pause-screen QUIT) keeps the regular Debrief/Winner.
   */
  endReason: 'timeout' | 'concede' | 'peer-timeout' | 'peer-concede' | undefined;
  /** Lockstep input delay in ticks for this game (host-set from the measured link RTT; see afterTick). */
  inputDelay: number = LAN_INPUT_DELAY;
  private world: any = undefined;
  netPaused = false;
  stallReason: 'peer' | 'local' | 'waiting' | undefined;
  rttMs: number | undefined;
  desyncTick: number | undefined;
  /** Latest in-session net checkpoint (identical on both peers; memory only). */
  netCheckpoint: NetCheckpoint | undefined;
  private startTick = 0;
  private virtualTimeMs = 0;
  private readonly localFrames = new Map<number, number>();
  private readonly remoteFrames = new Map<number, number>();
  private readonly ourSums = new Map<number, string>();
  private readonly remoteSums = new Map<number, string>();
  private readonly slots: [Record<string, NetSlot>, Record<string, NetSlot>] = [makeSlots(), makeSlots()];
  private deadline = 0;
  private prevNavBudget: number | undefined;
  private savedCfg: Record<string, any> | undefined;
  /** UI hook: phase / stall / countdown changes. */
  onStateChange: (() => void) | undefined;

  constructor(role: LanRole, link: NetLink) {
    this.role = role;
    this.link = link;
    active = this;
  }

  // ---------------------------------------------------------------------------------------------- inbound (bridge/test)

  onNetMessage(msg: LanMessage): void {
    if (msg.t === 'in') {
      this.remoteFrames.set(msg.tick, msg.bits);
      if (msg.sum) {
        const key = JSON.stringify(msg.sum);
        this.remoteSums.set(msg.sum.tick, key);
        this.compareSum(msg.sum.tick);
      }
      return;
    }
    if (msg.t === 'hb') {
      this.rttMs = Date.now() - msg.ts;
      return;
    }
    if (msg.t === 'start' && this.role === 1) {
      // A restarted client adopts the host's checkpoint snapshot (its own in-memory copy died with the process).
      if (msg.resumeTick !== undefined && msg.snap && !this.netCheckpoint) {
        this.netCheckpoint = { tick: msg.resumeTick, snap: msg.snap as RunSnapshot, digest: '' };
      }
      // Host-driven game start / resume (the client applies everything through the same path as the host).
      this.startLocalGame({
        mode: msg.mode, roomLink: msg.roomLink, cfg: msg.cfg, seed: msg.seed, resumeTick: msg.resumeTick,
      }, CMain._this);
      return;
    }
    if (msg.t === 'leave') {
      if (msg.reason === 'forfeit') {
        // The opponent conceded (or their reconnect window timed out): we win (Death Match) / the run ends (Coop).
        this.peerForfeit(msg.via ?? 'concede');
      } else if (this.phase === 'playing') {
        this.phase = 'ended';
      }
      this.onStateChange?.();
      return;
    }
    if (msg.t === 'desync') {
      this.phase = 'desync';
      this.onStateChange?.();
    }
  }

  /** Transport peer-link event: connected(false) while playing => freeze and start the 30 s reconnect window. */
  onPeerEvent(e: { connected: boolean; reason?: string }): void {
    if (!e.connected) {
      if (this.phase === 'playing' || this.phase === 'starting') {
        this.phase = 'reconnecting';
        this.deadline = Date.now() + RECONNECT_WINDOW_MS;
        this.onStateChange?.();
      }
      return;
    }
    // The link is back; the host drives what happens next (resume `start` message or back to the lobby).
    this.onStateChange?.();
  }

  /**
   * The host received (another) hello - forwarded here by the bridge. During a game interruption this resumes from
   * the checkpoint. Both peers capture identical checkpoints at identical ticks, so the host's latest IS the
   * common latest; the client's capTick is only a sanity check (a mismatch means desync, not an older resume).
   */
  onHello(hello: { sid?: string; capTick?: number }): void {
    if (this.role !== 0) return;
    if (this.phase === 'reconnecting' && this.netCheckpoint) {
      const start: NetStart = { ...this.startOpts!, resumeTick: this.netCheckpoint.tick };
      // A client that restarted (no checkpoint of its own, capTick absent) receives the snapshot itself.
      const snap = hello.capTick == null || hello.capTick < this.netCheckpoint.tick ? this.netCheckpoint.snap : undefined;
      this.link.send({ t: 'start', mode: start.mode, roomLink: start.roomLink, cfg: start.cfg, seed: start.seed, resumeTick: start.resumeTick, snap });
      this.startLocalGame(start, CMain._this); // the host rebuilds through the same path
    }
  }

  reconnectSecondsLeft(): number {
    return this.phase === 'reconnecting' ? Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)) : 0;
  }

  // ---------------------------------------------------------------------------------------------- game start

  /**
   * Apply the session config and build the world through the game's own State_LoadWorld path (the State_Continue
   * precedent). Saves the client's own option values first (direct field writes, never flushed) and restores them
   * in dispose(); the static CThing_Creature.mDamageActive normally set by the SelectWorld screen is set here.
   */
  startLocalGame(start: NetStart, main: any): void {
    if (!main) return;
    this.startOpts = start;
    this.mode = start.mode;
    this.endReason = undefined;
    this.inputDelay = start.inputDelay ?? LAN_INPUT_DELAY;
    this.applyConfig(start.cfg);
    World.CWorld.mGameMode = start.mode;
    // A reconnect resume replaces a live (frozen) world: dispose it outright (DeleteWorld's body, without its
    // screen-transition guard - State_LoadWorld re-runs the loading screen like a fresh boot either way).
    if (main.mcWorld) {
      main.mcWorld.Dispose?.();
      main.mcWorld.removeMovieClip?.();
      delete main.mcWorld;
      this.world = undefined;
    }
    // Drop every frame of the previous game NOW: the peer's priming frames for THIS game already arrive while our
    // world builds (whichever peer is ready first), so onWorldReady must never clear them again.
    this.localFrames.clear();
    this.remoteFrames.clear();
    this.ourSums.clear();
    this.remoteSums.clear();
    main.mWorldLibLink = start.roomLink;
    main.mReturn_SelectWorld = 'State_LanLobby'; // registered by the lobby (L2); net ends never route there before it exists
    this.phase = 'starting';
    this.netPaused = false;
    if (start.resumeTick !== undefined && this.netCheckpoint) {
      // Resume: rebuild deterministically from the same seed, then re-apply OUR checkpoint (both peers hold a
      // state-identical copy even though their absolute mTick values may differ by the build-time warm-up ticks).
      armSnapshot(this.netCheckpoint.snap);
    }
    setRandomState(start.seed);
    main.SetState('State_LoadWorld');
    this.onStateChange?.();
  }

  /** Determinism + config switches for the session duration. */
  private applyConfig(cfg: GameConfig): void {
    const sd: any = CMain.mSaveData;
    const C = World.Map.CMap_Cell as any;
    if (!this.savedCfg) {
      this.savedCfg = {
        mDifficulty: sd.mDifficulty, mGameSpeed: sd.mGameSpeed, mDevilsActive: sd.mDevilsActive,
        mCollisionsActive: sd.mCollisionsActive, mDamageActive: sd.mDamageActive, mGameAmount: sd.mGameAmount,
        mDetail: sd.mDetail, mPlayer1_CharacterIndex: sd.mPlayer1_CharacterIndex,
        mPlayer2_CharacterIndex: sd.mPlayer2_CharacterIndex,
      };
      // Deterministic nav budget for the session (deviation NAV_BUDGET_TEST_HOOK, production use in net games).
      this.prevNavBudget = C.mNavBudgetMode;
      C.mNavBudgetMode = 1_000_000;
    }
    sd.mDifficulty = cfg.difficulty;
    sd.mGameSpeed = cfg.gameSpeed;
    sd.mDevilsActive = cfg.devils;
    sd.mCollisionsActive = cfg.collisions;
    sd.mDamageActive = cfg.damage;
    sd.mGameAmount = cfg.gameAmount;
    sd.mDetail = cfg.detail;
    sd.mPlayer1_CharacterIndex = cfg.charP1; // v0.1.4: BOTH characters come from the host's setup screen
    sd.mPlayer2_CharacterIndex = cfg.charP2;
    Thing.Creature.CThing_Creature.mDamageActive = this.mode !== 'DeathMatch' ? cfg.damage : true;
  }

  /** CWorld.InitFinished wrapper: the world is built (and a pending snapshot applied) - enter lockstep. */
  onWorldReady(world: any): void {
    this.world = world;
    this.phase = 'playing';
    // Lockstep frames are indexed RELATIVE to this world's ready tick: the number of warm-up Process calls during
    // the build differs per machine (1-3 in the real app), so absolute CWorld.mTick would never line up between the
    // peers. mTick itself is unread by game logic - only the relative index matters.
    this.startTick = world.mTick;
    this.virtualTimeMs = 0;
    this.localFrames.clear();
    // Prime the input-delay window so the very first tick can run. (remoteFrames is NOT cleared here: the peer's
    // primes for this game may have arrived during our build.)
    for (let s = 0; s <= this.inputDelay; s++) {
      const bits = this.sampleLocalBits();
      this.localFrames.set(s, bits);
      this.link.send({ t: 'in', tick: s, bits });
    }
    this.onStateChange?.();
  }

  // ---------------------------------------------------------------------------------------------- lockstep driving

  holdsWorld(w: any): boolean {
    return active === this && this.world === w && (this.phase === 'playing' || this.phase === 'reconnecting' || this.phase === 'desync');
  }

  /** True = run the tick (frames for it are present and applied to the NetSlots); false = stall (skip Process). */
  tryBeginTick(world: any): boolean {
    if (this.phase === 'reconnecting' || this.phase === 'desync') {
      this.stallReason = this.phase === 'desync' ? 'waiting' : 'peer';
      return false;
    }
    const t = world.mTick - this.startTick;
    const mine = this.localFrames.get(t);
    const theirs = this.remoteFrames.get(t);
    if (mine === undefined || theirs === undefined) {
      this.stallReason = theirs === undefined ? 'peer' : 'local';
      return false;
    }
    this.applyPlayer(this.role, mine, t);
    this.applyPlayer((1 - this.role) as LanRole, theirs, t);
    this.stallReason = undefined;
    return true;
  }

  /** After the tick ran (world.mTick already advanced): advance the virtual clock, sample + send, checkpoint. */
  afterTick(world: any): void {
    const t = world.mTick - this.startTick;
    this.virtualTimeMs += 1000 / CMain.mFPS;
    const s = t + this.inputDelay;
    const bits = this.sampleLocalBits();
    this.localFrames.set(s, bits);
    let sum: LanChecksum | undefined;
    if (t > 0 && t % LAN_CHECKSUM_EVERY === 0) {
      sum = this.checksum(world, t);
      this.ourSums.set(t, JSON.stringify(sum));
      this.compareSum(t);
    }
    this.link.send({ t: 'in', tick: s, bits, sum });
    if (this.mode === 'DeathMatch' && t > 0 && t % DM_CHECKPOINT_EVERY === 0) this.captureCheckpoint(world);
    // Keep a small window of frames buffered (scales with the input delay).
    const prune = t - (this.inputDelay + 3);
    for (const k of this.localFrames.keys()) if (k < prune) this.localFrames.delete(k);
    for (const k of this.remoteFrames.keys()) if (k < prune) this.remoteFrames.delete(k);
  }

  /** The __set__mLevel hook calls this on every wave advance (the field is empty then - a clean checkpoint). */
  onWaveAdvanced(world: any): void {
    if (this.holdsWorld(world) && this.mode === 'Coop') this.captureCheckpoint(world);
  }

  captureCheckpoint(world: any): void {
    const snap = capture(world);
    this.netCheckpoint = { tick: world.mTick, snap, digest: fnv(JSON.stringify(snap)) };
  }

  /** Forfeit after the 30 s window (timeout) or a conceded quit: force the same end state on both peers. */
  forfeit(via: 'timeout' | 'concede' = 'concede'): void {
    this.endReason = via;
    this.endWorld(this.role === 0 ? 'player2 wins' : 'player1 wins');
    this.link.send({ t: 'leave', reason: 'forfeit', via });
  }

  /** The peer forfeited / left for good while we survived: we win (Death Match) / the run ends (Coop). */
  peerForfeit(via: 'timeout' | 'concede' = 'concede'): void {
    this.endReason = via === 'timeout' ? 'peer-timeout' : 'peer-concede';
    this.endWorld(this.role === 0 ? 'player1 wins' : 'player2 wins');
  }

  private endWorld(dmWinnerState: string): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const w = this.world;
    if (w && !w.mCompleteState) w.mCompleteState = this.mode === 'DeathMatch' ? dmWinnerState : 'player dead';
    this.onStateChange?.();
  }

  dispose(): void {
    if (active === this) active = null;
    this.phase = 'ended';
    this.world = undefined;
    if (this.savedCfg) {
      const C = World.Map.CMap_Cell as any;
      C.mNavBudgetMode = this.prevNavBudget;
      if (CMain.mSaveData) for (const k of Object.keys(this.savedCfg)) (CMain.mSaveData as any)[k] = this.savedCfg[k];
      this.savedCfg = undefined;
    }
    this.onStateChange?.();
  }

  // ---------------------------------------------------------------------------------------------- internals

  private applyPlayer(role: LanRole, bits: number, tick: number): void {
    const table = this.slots[role];
    for (const name of SLOT_ORDER) table[name].setHeld(unpackBit(bits, name as SlotBitName), tick, this.virtualTimeMs);
  }

  /**
   * Sample the LOCAL player's input from the real slots: each control is the OR of the P1 and P2 slot of that
   * control (either key set / either gamepad drives the local player on any machine), and a still-unconsumed press
   * latch counts as held (a tap shorter than one tick must not vanish) while being consumed here.
   */
  private sampleLocalBits(): number {
    const input = CMain.mInput as Record<string, any> | undefined;
    if (!input) return 0;
    const held: Record<string, boolean> = {};
    const consume = (slot: any): boolean => {
      if (!slot) return false;
      const latch = slot.mPressed === true;
      if (latch) slot.IsPressed(); // consume: the next sample reports only fresh presses
      return slot.mDown === true || latch;
    };
    for (const name of SLOT_ORDER) {
      held[name] = consume(input['KEY_' + name]) || consume(input['KEY_' + name + '2']);
    }
    return packBits(held as Record<SlotBitName, boolean>);
  }

  slot(playerIndex: number, name: string): NetSlot {
    return this.slots[playerIndex]?.[name];
  }

  /** The NetScope wrappers read this for the grenade hold power (virtual "now" of the input clock). */
  virtualNow(): number { return this.virtualTimeMs; }

  private checksum(world: any, tick: number): LanChecksum {
    const tc = world.mThing_Collection;
    const players = (Object.keys(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).filter((p: any) => p != undefined) as any[])
      .sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    const q = (v: any): number => Math.floor((v ?? 0) * 16);
    let zombies = 0;
    let things = 0;
    for (const k of Object.keys(tc.mThings)) {
      const t = tc.mThings[k];
      if (t == undefined) continue;
      things++;
      if (t._CLASSID_ === 'CThing_Creature_Zombie') zombies++;
    }
    return {
      tick,
      score: world.mHud.nTotalScore,
      things,
      zombies,
      q: [
        q(players[0]?.mPosition.mX), q(players[0]?.mPosition.mY), q(players[0]?.mLife),
        q(players[1]?.mPosition.mX), q(players[1]?.mPosition.mY), q(players[1]?.mLife),
      ],
    };
  }

  private compareSum(tick: number): void {
    const ours = this.ourSums.get(tick);
    const theirs = this.remoteSums.get(tick);
    if (ours === undefined || theirs === undefined || ours === theirs) return;
    this.desyncTick = tick;
    this.phase = 'desync';
    this.link.send({ t: 'desync', tick, mine: ours, theirs });
    this.onStateChange?.();
  }
}

function makeSlots(): Record<string, NetSlot> {
  const o: Record<string, NetSlot> = {};
  for (const name of SLOT_ORDER) o[name] = new NetSlot();
  return o;
}

/** Test/introspection helper: the frame the session last sampled for a tick. */
export function _peekLocalFrame(session: NetSession, tick: number): number | undefined {
  return (session as any).localFrames.get(tick) as number | undefined;
}
