// LAN lockstep session (deviation LAN_MULTIPLAYER, v0.1.3). One per machine while a net game runs. The transport
// (electron main process / tests) is behind the NetLink interface; inbound messages arrive through onNetMessage /
// onPeerEvent.
//
// LOCKSTEP (input delay: LAN_INPUT_DELAY = 1 tick by default; the host raises it for high-RTT virtual-LAN links
// via start.inputDelay, v0.1.4):
//   - every executed tick T, right before it runs, BOTH players' NetSlots are set from the bitmaps sampled for T
//     (our own frame was sampled D ticks earlier and sent; the peer's frame arrived over the wire);
//   - right after tick T ran we sample the CURRENT local input state and send it as the frame for T + D (v0.1.7:
//     one tick earlier than v0.1.4's T + 1 + D - the peer only needs it D ticks / D*40 ms after the send, which
//     covers the one-way wire time; both peers shift identically, so the simulation itself is unchanged);
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
import { setRandomState } from '../../../engine/flash/rng.ts';
import { CMain, Thing, World } from '../../packages.ts';
import { armSnapshot, capture, type RunSnapshot } from '../Resume.ts';
import { armStartWave, getRunStartWave } from '../StartWave.ts';
import { NetSlot, packBits, unpackBit, SLOT_ORDER, type SlotBitName } from './NetSlot.ts';
import { advanceShadow, newShadow, type ShadowState } from './Predict.ts';
import {
  LAN_CHECKSUM_EVERY, LAN_INPUT_DELAY, PREDICT_MAX_LAG_TICKS, ROLLBACK_WINDOW_TICKS, type GameConfig, type LanChecksum, type LanMessage, type LanMode, type LanRole,
} from './protocol.ts';
import { mayPredict, onRemoteFrame as rollbackOnRemoteFrame, predictedRemoteBits, pushSlot as rollbackPushSlot, resetRollback } from './Rollback.ts';
import { captureWorldSnap, makeSnapCtx } from './WorldSnap.ts';
import { simulationDigest } from './StateDigest.ts';
import { recordWaveReached } from '../WaveUnlock.ts';
import { EventJournal } from './Events.ts';
import { NetPresentation } from './Presentation.ts';

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
/**
 * v0.2.1: how long a checksum-desync freeze shows its overlay before BOTH peers abandon to the LAN room.
 * v0.2.3: 3000 -> 600 - the user verdict was "desync must return to the lobby IMMEDIATELY, never freeze on the
 * last frame"; 600 ms is enough to read the red strip, and both peers leave at (almost) the same moment.
 */
export const DESYNC_RETURN_MS = 600;
/**
 * v0.2.3 stall watchdog: a CONTINUOUS stall this long in the playing phase escalates to a desync teardown.
 * Without it, a divergence that starves one peer of input frames while the TCP link stays alive (heartbeats
 * keep LinkWatchdog fed) froze that peer on the WAITING strip forever - no checksum pair would ever meet.
 */
export const STALL_DESYNC_MS = 5000;
/**
 * v0.2.1 L1 stall-catch-up token bucket: schedule credit in ms. Transient late frames spend it (their slot is
 * rewound and invisibly retried); a PERSISTENT phase mismatch drains it, after which stalls yield their slots
 * and the schedule slips until the peers re-lock - the pre-v0.2.1 skips were the lockstep's only phase
 * correction, and without this the rewind would keep an unlucky-phase peer micro-stalling forever. Refills
 * slowly so post-lock hiccups (about one per second) stay invisible.
 */
export const CATCHUP_CREDIT_MAX_MS = 120;
export const CATCHUP_REFILL_MS_PER_S = 40;

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
  /** START_WAVE_SELECTOR (v0.1.9): chosen starting wave (default 1 = original); applied before tick 0 on BOTH peers. */
  wave?: number;
  /** v0.2.3: prediction+rollback mode (see Rollback.ts); pins inputDelay to LAN_INPUT_DELAY. */
  rollback?: boolean;
  netcode?: 'rollback-v2';
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
  /** v0.2.1 observability: how many stall EPISODES this game has had (entering a reason from none). */
  stallCount = 0;
  private catchupCreditMs = CATCHUP_CREDIT_MAX_MS;
  private catchupRefillAt = 0;
  /** v0.2.1 L3 (restored): the local player's display prediction; invalid until the first afterTick. */
  shadow: ShadowState = newShadow();
  /** Date.now() when the current stall began (the overlay's WAITING strip waits out a grace window; v0.1.7). */
  stallSince: number | undefined;
  rttMs: number | undefined;
  desyncTick: number | undefined;
  /** When the desync freeze started (DESYNC_RETURN_MS later both peers abandon to the room; v0.2.1). */
  desyncAt: number | undefined;
  /** v0.2.3: this session ended through a desync (bridge banner "returned to lobby" until the next game). */
  desynced = false;
  /** v0.2.3 observability: the diverging checksum pair (ours / theirs) - the playtests print it. */
  desyncDetail: { tick: number; mine: string; theirs: string } | undefined;
  /** Latest in-session net checkpoint (identical on both peers; memory only). */
  netCheckpoint: NetCheckpoint | undefined;
  // ---- v0.2.3 rollback state (Rollback.ts owns the algorithms; dark unless this.rollback) ----
  /** Prediction+rollback enabled for this game (start.rollback from the host). */
  rollback = false;
  confirmedThrough = -1;
  events = new EventJournal();
  presentation = new NetPresentation();
  soundOwner = -1;
  presentingSound = false;
  get rollbackV2(): boolean { return this.startOpts?.netcode === 'rollback-v2'; }
  get predictionLimit(): number { return this.rollbackV2 ? Math.ceil(240 * CMain.mFPS / 1000) : PREDICT_MAX_LAG_TICKS; }
  /** Per executed tick: remote bits used / predicted / checksum / latched end state (Rollback.TickMeta). */
  tickMeta = new Map<number, any>();
  /** The W+1 ring of per-tick WorldSnap slots (Rollback.pushSlot). */
  ring: any[] = [];
  /** Highest CONTIGUOUS confirmed remote tick (all frames <= it are final). */
  confirmTick = -1;
  /** First executed tick whose prediction differed from the arriving truth (correction due). */
  correctionPending: number | undefined;
  lastRemoteBits = 0;
  /** Sounds queued during predicted/replayed ticks (flushed on confirm, dropped on rollback). */
  pendingSounds = new Map<number, any[]>();
  /** Set around world.Process() of predicted/replayed ticks - the CSound choke point queues while set. */
  soundRecordingTick: number | undefined;
  /**
   * v0.2.3: the peer's first frame of THIS game arrived (its world is ready and its frame numbering is
   * aligned with ours). Prediction must not run before this: while the peer's world still builds, its
   * future frames are numbered from ITS startTick - predicting "empty input" over that gap executes ticks
   * the peer will later number differently, permanently skewing the relative indices by the build gap
   * (found by the packaged net playtest: the host stalled 8 ticks = exactly the window).
   */
  peerReady = false;
  /** Checksums computed on predicted ticks, sent once their tick confirms (confirm-gated wire, §7). */
  pendingSumSends: any[] = [];
  rollbackStats = { predictions: 0, corrections: 0, replayedTicks: 0, maxDepth: 0, captureMs: 0 };
  snapCtx: any = undefined;
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
      if (this.rollback) rollbackOnRemoteFrame(this, msg.tick, msg.bits);
      if (msg.sum) {
        const key = JSON.stringify(msg.sum);
        this.remoteSums.set(msg.sum.tick, key);
        this.compareSum(msg.sum.tick);
      }
      return;
    }
    if (msg.t === 'hb') {
      this.rttMs = Date.now() - msg.ts;
      // Live ping (v0.1.7): the in-game overlay refreshes with every probe. Only while playing - an ended session
      // (back in the lobby after a game) must not re-trigger the overlay strip every second.
      if (this.phase === 'playing') this.onStateChange?.();
      return;
    }
    if (msg.t === 'start' && this.role === 1) {
      // A restarted client adopts the host's checkpoint snapshot (its own in-memory copy died with the process).
      if (msg.resumeTick !== undefined && msg.snap && !this.netCheckpoint) {
        this.netCheckpoint = { tick: msg.resumeTick, snap: msg.snap as RunSnapshot, digest: '' };
      }
      // Host-driven game start / resume (the client applies everything through the same path as the host). The
      // host's inputDelay MUST carry over (v0.1.7 bugfix: dropping it reset a resumed client to D=1 while the
      // host kept its measured D -> the host micro-stalled every tick after any resume).
      this.startLocalGame({
        mode: msg.mode, roomLink: msg.roomLink, cfg: msg.cfg, seed: msg.seed, inputDelay: msg.inputDelay, resumeTick: msg.resumeTick, netcode: msg.netcode,
        wave: msg.wave,
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
      // v0.2.3 bugfix: the peer detected the mismatch and told us. v0.2.1 only set the phase - desyncAt stayed
      // undefined, so the abandon condition in the NetScope wrapper (Date.now() - desyncAt >= DESYNC_RETURN_MS)
      // compared against NaN and THIS side froze on the last frame forever (the "desync hangs the screen" bug).
      this.triggerDesync(msg.tick, msg.mine, msg.theirs);
      return;
    }
    if (msg.t === 'pause') {
      this.setPaused(true, true);
      return;
    }
    if (msg.t === 'unpause') {
      this.setPaused(false, true);
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
      this.link.send({ t: 'start', mode: start.mode, roomLink: start.roomLink, cfg: start.cfg, seed: start.seed, inputDelay: start.inputDelay, resumeTick: start.resumeTick, wave: start.wave, snap, rollback: true, netcode: start.netcode });
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
    this.rollback = start.rollback === true || this.rollbackV2;
    // v0.2.3: rollback rides ON TOP of the adaptive input delay, not instead of it - D carries the steady
    // network latency (see PREDICT_MAX_LAG_TICKS) so prediction stays a jitter-gap filler, not a lifestyle.
    this.inputDelay = this.rollbackV2 ? 0 : start.inputDelay ?? LAN_INPUT_DELAY;
    (main as any).mFrameCap = 1; // v0.2.1 L1: every game starts with the original single-tick cap
    this.stallCount = 0; // v0.2.1 observability: per-game stall episodes
    this.catchupCreditMs = CATCHUP_CREDIT_MAX_MS; // v0.2.1 L1: a fresh game starts with full catch-up credit
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
    this.desynced = false; // a new game clears the lobby banner cause (v0.2.3)
    resetRollback(this); // fresh ring / meta / sound queue for the new game
    this.confirmedThrough = -1;
    this.events = new EventJournal();
    if (start.resumeTick !== undefined && this.netCheckpoint) {
      // Resume: rebuild deterministically from the same seed, then re-apply OUR checkpoint (both peers hold a
      // state-identical copy even though their absolute mTick values may differ by the build-time warm-up ticks).
      armSnapshot(this.netCheckpoint.snap);
    }
    // The chosen start wave replays on the rebuilt world (a resume's snapshot then re-applies on top of it, and
    // snap.wave >= start.wave always); applied identically on both peers before tick 0.
    armStartWave(start.wave ?? 1);
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
    this.shadow = newShadow(); // v0.2.1 L3: every world starts unpredicted
    this.presentation = new NetPresentation();
    this.presentation.capture(world);
    // Lockstep frames are indexed RELATIVE to this world's ready tick: the number of warm-up Process calls during
    // the build differs per machine (1-3 in the real app), so absolute CWorld.mTick would never line up between the
    // peers. mTick itself is unread by game logic - only the relative index matters.
    this.startTick = world.mTick;
    this.virtualTimeMs = 0;
    if (this.rollbackV2) {
      World.Map.CMap_Cell.Nav_Reset();
      World.Map.CMap_Cell.mCurrentSessionID = 0;
      for (const row of world.mMap.mCells) for (const cell of row) {
        cell.nID = -1; cell.nDist = undefined; cell.nVD = undefined; cell.mSessionIDCheck = undefined;
      }
    }
    this.localFrames.clear();
    // Prime the input-delay window so the very first tick can run: frames 0..D-1 (v0.1.7; v0.1.4 primed 0..D).
    // Frame D belongs to tick 0's afterTick - priming it too would double-write the index (we would consume our
    // own sample while the peer consumes the prime -> desync). (remoteFrames is NOT cleared here: the peer's
    // primes for this game may have arrived during our build.)
    for (let s = 0; s < this.inputDelay; s++) {
      const bits = this.sampleLocalBits();
      this.localFrames.set(s, bits);
      this.link.send({ t: 'in', tick: s, bits });
    }
    // v0.2.3: the WorldSnap context for the rollback ring (slots captured so NetSlot state round-trips).
    this.snapCtx = makeSnapCtx(world, this.slots);
    resetRollback(this);
    if (this.rollbackV2) this.submitLocalInput(0);
    if (this.rollbackV2) {
      this.peerReady = this.remoteFrames.size > 0;
      while (this.remoteFrames.has(this.confirmTick + 1)) this.confirmTick++;
    }
    this.onStateChange?.();
  }

  // ---------------------------------------------------------------------------------------------- lockstep driving

  holdsWorld(w: any): boolean {
    return active === this && this.world === w && (this.phase === 'playing' || this.phase === 'reconnecting' || this.phase === 'desync');
  }

  /**
   * v0.2.3 beginTick: resolve a tick's inputs. 'confirmed' = both frames present (the original path);
   * 'predicted' = the remote frame is still in flight - the repeat-last prediction runs the tick (rollback
   * mode only, bounded by ROLLBACK_WINDOW_TICKS); 'stall' = nothing can run (the original behaviour - in
   * rollback mode only when the peer fell behind the window).
   */
  beginTick(world: any): 'confirmed' | 'predicted' | 'stall' {
    if (this.phase === 'reconnecting' || this.phase === 'desync') {
      this.stall(this.phase === 'desync' ? 'waiting' : 'peer');
      return 'stall';
    }
    const t = world.mTick - this.startTick;
    if (this.rollbackV2) this.submitLocalInput(t);
    const mine = this.localFrames.get(t);
    const theirs = this.remoteFrames.get(t);
    let remoteBits: number;
    let predicted = false;
    if (theirs !== undefined) {
      remoteBits = theirs;
    } else if (this.rollback && this.peerReady && mine !== undefined && mayPredict(this, t)) {
      remoteBits = predictedRemoteBits(this, t);
      predicted = true;
      this.rollbackStats.predictions++;
    } else {
      this.stall('peer');
      return 'stall';
    }
    if (mine === undefined) {
      this.stall('local');
      return 'stall';
    }
    if (this.rollback && this.predictionLimit > 0) rollbackPushSlot(this, world);
    this.applyPlayer(this.role, mine, t);
    this.applyPlayer((1 - this.role) as LanRole, remoteBits, t);
    if (this.rollback) this.tickMeta.set(t, { remoteBits, predicted });
    this.stall(undefined);
    return predicted ? 'predicted' : 'confirmed';
  }

  /** True = run the tick (frames for it are present and applied to the NetSlots); false = stall (skip Process). */
  tryBeginTick(world: any): boolean {
    if (!this.rollback) return this.beginTick(world) !== 'stall';
    return this.beginTick(world) === 'confirmed'; // legacy bool: a PREDICTED tick is driven by the NetScope rollback path
  }

  /**
   * v0.2.3: net pause is a wire state. Either side's P key freezes BOTH peers on the same lockstep tick with
   * the identical original PAUSED! overlay (v0.2.2: only the pausing side saw the overlay - the peer's frame
   * stream dried up and it froze on the last frame behind a WAITING strip). Idempotent; fromWire suppresses
   * the echo. Lockstep-safe by construction: the paused peer sends no frames, so both peers halt at the same
   * next tick; QUIT on the overlay concedes on either side (the scope CHud.Pause wrapper wires it).
   */
  setPaused(paused: boolean, fromWire = false): void {
    if (this.phase !== 'playing' || this.netPaused === paused) return;
    this.netPaused = paused;
    this.world?.mHud?.Pause(paused);
    if (!fromWire) this.link.send(paused ? { t: 'pause' } : { t: 'unpause' });
    this.onStateChange?.();
  }

  /** Set the stall reason; the UI (WAITING strip) is told when it CHANGES (v0.1.7 - it never was before). */
  private stall(reason: 'peer' | 'local' | 'waiting' | undefined): void {
    // v0.2.3 stall watchdog: a stall that has now lasted STALL_DESYNC_MS continuously (stallSince survives the
    // unchanged-reason early return below) means the frames dried up while the link stayed alive - no checksum
    // can ever be paired again. Escalate to the desync teardown instead of freezing on WAITING forever.
    // EXEMPT: while the peer's world is still building (no frame of this game yet - a relaunched client
    // cold-boots for ~5-8 s), waiting is the intended state, not a divergence.
    if (
      reason !== undefined && this.phase === 'playing' && this.peerReady &&
      this.stallSince !== undefined && Date.now() - this.stallSince >= STALL_DESYNC_MS
    ) {
      this.triggerDesync(undefined, undefined, undefined);
      return;
    }
    if (this.stallReason === reason) return;
    if (reason !== undefined && this.stallReason === undefined) this.stallCount++;
    this.stallReason = reason;
    this.stallSince = reason === undefined ? undefined : Date.now();
    this.onStateChange?.();
  }

  /**
   * Enter the desync freeze (idempotent): detection (compareSum), the peer's 'desync' message (v0.2.3: sets
   * desyncAt so the receiving side also abandons), or the stall watchdog (v0.2.3). The peer is told whenever
   * we are the first to know.
   */
  private triggerDesync(tick: number | undefined, mine: string | undefined, theirs: string | undefined): void {
    if (this.phase === 'desync' || this.phase === 'ended') return;
    if (typeof tick === 'number') this.desyncTick = tick;
    this.desyncDetail = { tick: tick ?? -1, mine: mine ?? '?', theirs: theirs ?? '?' };
    this.phase = 'desync';
    this.desyncAt = Date.now();
    this.desynced = true;
    this.link.send({ t: 'desync', tick, mine, theirs });
    this.onStateChange?.();
  }

  /** After the tick ran (world.mTick already advanced): advance the virtual clock, sample + send, checkpoint. */
  afterTick(world: any): void {
    const t = world.mTick - this.startTick;
    this.virtualTimeMs += 1000 / CMain.mFPS;
    // v0.1.7: the sample taken right after the executed tick (t-1) is the frame for t-1+D - one tick less input
    // latency than v0.1.4's t+D, still D ticks of wire budget for the peer (both peers shift identically).
    const s = this.rollbackV2 ? t - 1 : t - 1 + this.inputDelay;
    const bits = this.rollbackV2 ? this.localFrames.get(s)! : this.sampleLocalBits();
    if (!this.rollbackV2) this.localFrames.set(s, bits);
    let sum: LanChecksum | undefined;
    if (t > 0 && t % LAN_CHECKSUM_EVERY === 0) {
      sum = this.checksum(world, t);
      this.recordChecksum(t, sum);
    }
    // v0.2.3 §7: a checksum computed on a PREDICTED tick is only trustworthy once the tick confirms - hold it
    // back and piggyback it once it does (the receiver also compares only confirmed ticks).
    if (this.rollback && sum && t > this.confirmTick) {
      this.pendingSumSends.push(sum);
      sum = undefined;
    }
    // Drain at most two held checksums per frame message (the cadence makes >1 pending vanishingly rare).
    // A held sum was computed on a PREDICTED tick - by the time it confirms, a correction replay may have
    // recomputed that tick's sum (ourSums). Send the LATEST value, never the stale prediction (the packaged
    // net playtest desynced on exactly this: the peer compared our stale predicted sum against its truth).
    let piggy: LanChecksum | undefined;
    const sendNow: LanChecksum[] = [];
    while (this.rollback && this.pendingSumSends.length && this.pendingSumSends[0].tick <= this.confirmTick && sendNow.length < 2) {
      const held = this.pendingSumSends.shift()!;
      const latest = this.ourSums.get(held.tick);
      sendNow.push(latest !== undefined ? { ...held, ...JSON.parse(latest) } : held);
    }
    if (sendNow.length) piggy = sendNow.shift();
    this.link.send({ t: 'in', tick: s, bits, sum: sum ?? piggy });
    for (const extra of sendNow) this.link.send({ t: 'in', tick: s, bits, sum: extra });
    if (this.mode === 'DeathMatch' && t > 0 && t % DM_CHECKPOINT_EVERY === 0) this.maybeCheckpoint(world, t);
    // Keep a small window of frames buffered (scales with the input delay); rollback needs the window wide
    // enough to REPLAY from a correction (local frames too - the replay drives both players).
    const prune = t - (this.rollback ? ROLLBACK_WINDOW_TICKS + this.inputDelay + 3 : this.inputDelay + 3);
    for (const k of this.localFrames.keys()) if (k < prune) this.localFrames.delete(k);
    for (const k of this.remoteFrames.keys()) if (k < prune) this.remoteFrames.delete(k);
    // TCP input lockstep bounds peer skew by D. Retain two checksum intervals (and the rollback window)
    // for late comparisons, rather than retaining every checksum for the lifetime of a long session.
    const sumPrune = t - Math.max(2 * LAN_CHECKSUM_EVERY, ROLLBACK_WINDOW_TICKS + this.inputDelay + 3);
    for (const k of this.ourSums.keys()) if (k < sumPrune) this.ourSums.delete(k);
    for (const k of this.remoteSums.keys()) if (k < sumPrune) this.remoteSums.delete(k);
    if (this.rollback) {
      const metaPrune = this.confirmTick - (ROLLBACK_WINDOW_TICKS + 2);
      for (const k of this.tickMeta.keys()) if (k < metaPrune) this.tickMeta.delete(k);
      // Snapshots are captured BEFORE input application in beginTick, including predicted branches.
      // The earliest divergent tick owns a valid pre-tick state; correction rebuilds every later slot.
    }
    // v0.2.1 L3 (kept alongside rollback): the shadow leads the local player's DISPLAY by the already-sampled
    // future input frames - rollback fixes the cadence (stalls/jitter), the shadow hides the D-tick input
    // delay. Frozen during stalls by construction (advanceShadow only runs on executed ticks).
    if (!this.rollbackV2) advanceShadow(this, world);
    else { this.commitConfirmed(world); this.presentation.capture(world); }
  }

  /** Shared live/replay step. Only the confirmed frontier may commit external side effects. */
  executeWorldStep(world: any, tick: number): void {
    const meta = this.tickMeta.get(tick);
    delete meta.checkpoint;
    this.pendingSounds.delete(tick);
    this.events.begin(tick);
    this.soundRecordingTick = tick;
    try { world.Process(); } finally { this.soundRecordingTick = undefined; }
    meta.endState = world.mCompleteState;
    if ((tick + 1) % LAN_CHECKSUM_EVERY === 0) this.computeChecksumString(world, tick + 1);
  }

  commitConfirmed(world: any): void {
    if (this.correctionPending !== undefined) return;
    const frontier = Math.min(this.confirmTick, this.tickIndex(world) - 1);
    for (let t = this.confirmedThrough + 1; t <= frontier; t++) {
      const meta = this.tickMeta.get(t);
      if (!meta) break;
      if (meta.checkpoint) {
        this.netCheckpoint = meta.checkpoint;
        if (this.mode !== 'DeathMatch') recordWaveReached(meta.checkpoint.snap.wave);
      }
      this.events.confirm(t);
      this.pendingSounds.delete(t);
      this.confirmedThrough = t;
      this.compareSum(t + 1);
    }
    this.events.presentLocal(this.role);
  }

  private submitLocalInput(tick: number): void {
    if (this.localFrames.has(tick)) return;
    CMain.mInput?.ProcessAllKeys();
    const bits = this.sampleLocalBits();
    this.localFrames.set(tick, bits);
    this.link.send({ t: 'in', tick, bits });
  }

  /** Store our checksum for tick t (meta + legacy map) and compare against a received counterpart. */
  recordChecksum(t: number, sum: LanChecksum): void {
    const key = JSON.stringify(sum);
    this.ourSums.set(t, key);
    const meta = this.tickMeta.get(t);
    if (meta) meta.sum = key;
    this.compareSum(t);
  }

  /** v0.2.3: the already-sampled local input frame for tick u (replay input resolution). */
  peekLocalBits(u: number): number | undefined {
    return this.localFrames.get(u);
  }

  /** v0.2.1 L3 (Predict.ts): the world this session drives (identity check for draw overrides). */
  currentWorld(): any {
    return this.world;
  }

  /** v0.2.1 L3 (Predict.ts): this world's relative lockstep tick index. */
  tickIndex(world: any): number {
    return world.mTick - this.startTick;
  }

  /** v0.2.3 rollback: true while a predicted/replayed tick records - the CSound choke point queues its starts. */
  shouldQueueSound(): boolean {
    return this.rollback && !this.presentingSound && this.phase === 'playing' && this.soundRecordingTick !== undefined;
  }

  /**
   * v0.2.1 L1: spend one tick of schedule catch-up credit (true = rewind the stalled slot and retry it),
   * or yield it (false - the schedule slips a tick and the peers re-lock; see CATCHUP_CREDIT_MAX_MS).
   */
  spendCatchupCredit(nowMs: number, tickMs: number): boolean {
    const dt = nowMs - this.catchupRefillAt;
    if (dt > 0) {
      this.catchupCreditMs = Math.min(CATCHUP_CREDIT_MAX_MS, this.catchupCreditMs + (dt / 1000) * CATCHUP_REFILL_MS_PER_S);
      this.catchupRefillAt = nowMs;
    }
    if (this.catchupCreditMs >= tickMs) {
      this.catchupCreditMs -= tickMs;
      return true;
    }
    return false;
  }

  /** The __set__mLevel hook calls this on every wave advance (the field is empty then - a clean checkpoint). */
  onWaveAdvanced(world: any): void {
    if (this.rollbackV2 && this.holdsWorld(world)) {
      const meta = this.tickMeta.get(this.tickIndex(world));
      if (meta) {
        const snap = capture(world);
        meta.checkpoint = { tick: world.mTick, snap, digest: fnv(JSON.stringify(snap)) };
      }
      return;
    }
    if (this.holdsWorld(world) && this.mode === 'Coop') this.maybeCheckpoint(world, world.mTick - this.startTick);
  }

  /**
   * Checkpoint gate (v0.2.3): never capture from a PREDICTED tick - a correction replay re-runs the wave
   * advance at the same tick and captures the identical snapshot through this same hook.
   */
  maybeCheckpoint(world: any, t: number): void {
    if (this.rollbackV2) return; // v2 checkpoints are staged by the wave hook and committed at the frontier.
    if (this.rollback && this.tickMeta.get(t)?.predicted) return;
    this.captureCheckpoint(world);
  }

  /** The replay path's checksum recomputation (Rollback.replayTick) - the same bookkeeping as afterTick's. */
  computeChecksumString(world: any, t: number): string {
    const key = JSON.stringify(this.checksum(world, t));
    this.ourSums.set(t, key);
    this.remoteSums.get(t); // (compare happens on the next arrival / recordChecksum)
    return key;
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

  /**
   * A NATURAL game end (coop all-dead / DM kill limit) set mCompleteState on BOTH peers in the same tick and the
   * original state machine routed to the debrief - mirror that into the phase machine (v0.2.1). Without this the
   * bridge stayed 'playing' forever: markBackInLobby() no-oped and the room rendered its in-game variant (START /
   * READY / CLOSE hidden) - the "leave and recreate the room" dead end. Idempotent, and deliberately leaves
   * endReason / mCompleteState alone so the forfeit routing is unchanged.
   */
  markEnded(): void {
    if (this.phase === 'ended') return;
    if (this.phase !== 'playing' && this.phase !== 'starting') return;
    this.phase = 'ended';
    this.onStateChange?.();
  }

  /**
   * v0.2.1 LAN retry decision - the net analog of the local debrief handler `if (!armFromCheckpoint())
   * armStartWave(getRunStartWave())`: with a surviving net checkpoint, resume from it (identical to the room's
   * old RESUME semantics); without one (coop death before the first wave advance / DM before tick 1500) rebuild
   * a FRESH run armed at the run's start wave - which in that no-checkpoint case is exactly the wave the players
   * died on. The result feeds the normal wire 'start' path, so both peers rebuild identically.
   */
  retryStart(): NetStart {
    const o = this.startOpts;
    if (!o) throw new Error('retryStart: no game has been started on this session');
    if (this.netCheckpoint) return { ...o, resumeTick: this.netCheckpoint.tick };
    return { ...o, resumeTick: undefined, wave: getRunStartWave() };
  }

  dispose(): void {
    if (active === this) active = null;
    this.phase = 'ended';
    this.world = undefined;
    this.localFrames.clear();
    this.remoteFrames.clear();
    this.ourSums.clear();
    this.remoteSums.clear();
    resetRollback(this);
    this.snapCtx = undefined;
    this.events = new EventJournal();
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
      const primary = consume(input['KEY_' + name]);
      const secondary = consume(input['KEY_' + name + '2']);
      held[name] = primary || secondary;
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
      // v0.2.3 rollback: in-flight shots and effects (< 0.5 s lifetime) may ride a slightly different
      // transient trajectory through a correction (the R10 note in Rollback.ts) - counting them here made a
      // healthy session report a desync. The checksum covers the PERSISTENT world, exactly what the
      // netlockstep canary asserts.
      const id = t._CLASSID_ as string;
      if (id?.startsWith('CThing_Shot_') || id?.startsWith('CThing_Effect_')) continue;
      things++;
      if (id === 'CThing_Creature_Zombie') zombies++;
    }
    return {
      tick,
      ...(this.rollbackV2 ? { full: simulationDigest(captureWorldSnap(world, this.snapCtx, false)) } : {}),
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
    if (this.rollbackV2 && (this.correctionPending !== undefined || tick - 1 > this.confirmedThrough)) return;
    const ours = this.ourSums.get(tick);
    const theirs = this.remoteSums.get(tick);
    if (ours === undefined || theirs === undefined || ours === theirs) return;
    // v0.2.3 §7: in rollback mode a sum is only comparable when the tick is CONFIRMED on this side (a
    // predicted-tick sum is a guess; a correction replay recomputes the real one before this ever fires).
    if (this.rollback && tick > this.confirmTick) return;
    this.triggerDesync(tick, ours, theirs);
  }

  /** v0.2.1: leave the desync freeze for the LAN room (the overlay always promised it; no code performed it). */
  abandonToLobby(): void {
    if (this.phase !== 'desync') return;
    this.phase = 'ended';
    this.desyncAt = undefined;
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
