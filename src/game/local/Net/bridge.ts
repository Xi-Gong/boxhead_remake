// LAN renderer bridge (deviation LAN_MULTIPLAYER, v0.1.3): the single owner of the Electron transport
// (window.boxheadDesktop.lan) on the renderer side. The lobby UI and the overlays read this module's state and get
// notified through onUi; the NetSession is created here when a game starts (host: START pressed; client: 'start'
// message received) and re-used for reconnects / 续局 continuations.
//
// Reconnect flow (link lost mid-game, both sides frozen by the lockstep gate):
//   - the CLIENT retries lan.connect every 2 s with the SAME session id and its checkpoint capTick;
//   - the HOST just waits; the returning client's hello reaches session.onHello which broadcasts the resume
//     `start` message (both peers rebuild from their identical checkpoints) - see NetSession;
//   - after the 30 s window the local side forfeits (NetSession.forfeit) and both drop into the lobby where the
//     host may offer RESUME GAME (续局) from the surviving checkpoint.
import { desktop } from '../../../engine/platform/desktop.ts';
import { CMain } from '../../packages.ts';
import { maxUnlockedWave } from '../WaveUnlock.ts';
import { validWaveNumber } from '../WaveValidation.ts';
import { NetSession } from './NetSession.ts';
import { computeInputDelay } from './protocol.ts';
import { roomSettingsFromSave, savedSwitch } from './RoomSettings.ts';
import type { GameConfig, LanMessage, SetupSelection } from './protocol.ts';

/** The Presenter surface the bridge needs (main.ts hands the real platform Presenter over). */
export interface PresenterLike {
  logicalToClient(x: number, y: number): { x: number; y: number };
  /** DYNAMIC_VIEWPORT: authored-content (640x480 screen) space -> client (the content is centred on the stage). */
  contentToClient(x: number, y: number): { x: number; y: number };
  onResize(fn: () => void): () => void;
}

export type LanUiPhase =
  | 'idle' // in the lobby, nothing hosted / connected
  | 'hosting' // hosting, waiting for player 2
  | 'joining' // connecting to a host
  | 'lobby' // host <-> client connected: the room view
  | 'setup' // both sides on the net setup screen (host drives, client mirrors)
  | 'playing' // in the net game (or its reconnect window)
  | 'error'; // last operation failed (message set)

const PAD4 = (n: number): string => String(n).padStart(4, '0');

class LanBridge {
  phase: LanUiPhase = 'idle';
  message = '';
  hosts: { ip: string; name: string; status: string; players: number; port: number }[] = [];
  /** This machine's room role: host = player 1, client = player 2. */
  isHost = true;
  /** The client player's READY flag (host: from the 'ready' message; client: local via setReady). */
  ready = false;
  /** The shared setup-screen selection (host authors it in enterSetup/setSel; client mirrors via 'setup'). */
  sel: SetupSelection = { mode: 'Coop', charP1: 3, charP2: 0, levelIdx: 0, difficulty: 0, gameAmount: 0, wave: 1, maxWave: 1 };
  /** Peer link round-trip time (heartbeat echo; live already while in the room). */
  rttMs: number | undefined;
  /** Recent heartbeat RTT samples (ms, newest last, capped) - the input-delay picker uses their worst (v0.1.7). */
  rttSamples: number[] = [];
  /** Host: this machine's non-internal IPv4s (fetched on host(); the room view shows them). */
  hostAddrs: string[] = [];
  /** Set by main.ts: lets DOM overlays (the IP input) track the letterboxed canvas. */
  presenter: PresenterLike | undefined;
  peerName = '';
  /** Negotiate rollback for capable peers; QA can still exercise the retained legacy path. */
  useRollbackV2 = true;
  private peerRollbackV2 = false;
  private peerGrowth = false;
  private peerSupplies = false;
  private peerBalance = false;
  private peerTeamPass = false;
  private peerSurvival = false;
  private peerLoot = false;
  private peerRefill = false;
  private peerEndless = false;
  private peerTimedWaves = false;
  private peerWaveDraft = false;
  private peerDraftReady = false;
  private peerCombat = false;
  private peerBossWaves = false;
  private peerBossEncounters = false;
  private peerTieredGrowth = false;
  private peerClearWaves = false;
  private peerVariants = false;
  private peerEnchantment = false;
  private supportsEndless():boolean{return this.peerEndless&&this.peerGrowth&&this.peerSupplies&&this.peerSurvival&&this.peerLoot&&this.peerBalance;}
  private waveMaximum():number{return this.supportsEndless()?maxUnlockedWave():Math.min(100,maxUnlockedWave());}
  timedWavesAvailable():boolean{return this.supportsEndless()&&this.peerTimedWaves;}
  bossWavesAvailable():boolean{return this.timedWavesAvailable()&&this.peerVariants&&this.peerBossWaves;}
  private combatAvailable():boolean{return this.timedWavesAvailable()&&this.peerWaveDraft&&this.peerDraftReady&&this.peerTieredGrowth&&this.peerClearWaves&&this.peerVariants&&this.peerCombat;}
  private peerSupportsRun():boolean{
    const c=this.session?.startOpts?.cfg;
    return !(c?.endless&&!this.supportsEndless()||c?.variants&&(!this.supportsEndless()||!this.peerVariants)||c?.refill&&!this.peerRefill
      ||c?.enchantment&&(!this.supportsEndless()||!this.peerVariants||!this.peerEnchantment)
      ||c?.timedWaves&&(!this.supportsEndless()||!this.peerTimedWaves)
      ||c?.waveDraft&&(!this.supportsEndless()||!this.peerTimedWaves||!this.peerWaveDraft)
      ||c?.draftReady&&(!this.timedWavesAvailable()||!this.peerWaveDraft||!this.peerDraftReady)
      ||c?.combat&&!this.combatAvailable()
      ||c?.bossWaves&&!this.bossWavesAvailable()
      ||c?.bossEncounters&&(!this.bossWavesAvailable()||!this.peerBossEncounters)
      ||c?.tieredGrowth&&(!this.supportsEndless()||!this.peerTieredGrowth)
      ||c?.clearWaves&&(!this.timedWavesAvailable()||!this.peerClearWaves));
  }
  session: NetSession | null = null;
  sid: string | undefined;
  /** Client: the host ip it joined (reconnects go there). */
  hostIp = '';
  private reconnectTimer: number | undefined;
  private reconnectGeneration = 0;
  private deadlineTimer: number | undefined;
  private uiCbs = new Set<() => void>();
  private started = false;
  private operation = 0;

  constructor() {
    const lan = desktop?.lan;
    if (!lan) return;
    lan.onMessage((msg: any) => this.onMessage(msg));
    lan.onPeer((s) => this.onPeer(s));
    lan.onHosts((hosts) => {
      this.hosts = hosts;
      this.notify();
    });
  }

  get available(): boolean { return desktop?.lan != null; }
  onUi(cb: () => void): () => void {
    this.uiCbs.add(cb);
    return () => this.uiCbs.delete(cb);
  }
  /** Wake every onUi listener (the screens re-render on the next frame; tests drive it after poking fields). */
  notify(): void { for (const cb of this.uiCbs) cb(); }

  // ---------------------------------------------------------------------------------------------- discovery / hosting

  refresh(): void {
    if (!this.available) return;
    const operation = this.operation;
    void desktop!.lan.discoverStart().then((r) => {
      if (operation !== this.operation) return;
      if (!r.ok) {
        // v0.2.5: two instances on ONE machine share the fixed discovery port (47630) - the raw EADDRINUSE bind
        // error read like a crash. Name the real situation instead; real LANs are unaffected (each machine binds).
        // (Short on purpose: the lobby status field is 330 px wide at 12 px bold - longer copy clips at both ends.)
        this.message = /EADDRINUSE/.test(String(r.reason))
          ? 'another game on this machine listens - join by IP'
          : `discovery unavailable: ${r.reason}`;
        this.notify();
      }
    });
  }

  host(): void {
    if (!this.available) return;
    const operation = ++this.operation;
    this.isHost = true;
    const sd: any = CMain.mSaveData;
    this.sel = { ...this.sel, mode: 'Coop', wave: 1, maxWave: maxUnlockedWave(), difficulty: sd?.mDifficulty ?? 0,
      gameAmount: sd?.mGameAmount ?? 0, settings: roomSettingsFromSave(sd) };
    this.phase = 'hosting';
    this.message = 'HOSTING - waiting for player 2...';
    this.notify();
    void desktop!.lan.hostStart().then(async (r) => {
      if (operation !== this.operation) return;
      if (!r.ok) { this.phase = 'error'; this.message = `cannot host: ${r.reason}`; }
      else if (desktop!.lan.addresses) {
        const addresses = await desktop!.lan.addresses().catch(() => []);
        if (operation !== this.operation) return;
        this.hostAddrs = addresses;
      }
      this.notify();
    });
  }

  join(ip: string, port?: number): void {
    if (!this.available) return;
    const operation = ++this.operation;
    this.isHost = false;
    this.hostIp = ip;
    this.phase = 'joining';
    this.message = `connecting to ${ip}...`;
    this.notify();
    void desktop!.lan.connect(ip, port, { name: 'player', sid: this.sid, char: 0 }).then((r) => {
      if (operation !== this.operation || this.phase !== 'joining') return;
      if (r.ok) {
        this.phase = 'lobby';
        this.message = '';
        // The transport-generated sid arrives with the host's forwarded hello (peerName / char).
      } else {
        this.phase = 'error';
        this.message = `connect failed: ${r.reason}`;
      }
      this.notify();
    });
  }

  leaveLobby(): void {
    ++this.operation;
    this.stopTimers();
    if (this.session) {
      this.session.dispose();
      this.session = null;
      this.sid = undefined;
    }
    this.send({ t: 'leave', reason: 'quit' });
    void desktop?.lan?.shutdown(); // closes the peer link, the beacons and the discovery listener
    this.phase = 'idle';
    this.started = false;
    this.isHost = true;
    this.ready = false;
    this.rttMs = undefined;
    this.rttSamples = [];
    this.peerName = '';
    this.message = '';
    this.notify();
  }

  /** main.ts hands the platform Presenter over so DOM overlays can track the letterboxed canvas (v0.1.4). */
  setPresenter(p: PresenterLike | undefined): void {
    this.presenter = p;
    this.notify();
  }

  /** State_LanLobby entry: after a finished net game both players land back here (checkpoint kept for 续局). */
  markBackInLobby(): void {
    if (this.session && this.session.phase === 'ended' && this.phase === 'playing') this.backInLobby();
  }

  /**
   * The one transition out of an in-game bridge phase (v0.2.1: also fired from the session's state changes, so a
   * game that ends while the player never re-enters the lobby screen still frees the room - the old one-shot
   * markBackInLobby could not see those).
   */
  private backInLobby(): void {
    this.phase = 'lobby';
    // v0.2.3: a desynced game leaves a banner in the room until the next status overwrite (the user must SEE
    // why the game ended - "returned to lobby immediately" needs its visible reason). Other ends keep the
    // room view's own RESUME/RETRY strip (set by the Lobby, not by this message).
    this.message = this.session?.desynced ? 'CONNECTION DESYNCED - RETURNED TO LOBBY' : '';
    void desktop?.lan?.hostSetStatus('lobby');
    this.notify();
  }

  // ---------------------------------------------------------------------------------------------- room / setup flow

  /** Host: both ready -> enter the setup screen (the client mirrors it via the 'setup' message). */
  enterSetup(): void {
    if (this.phase !== 'lobby' || !this.isHost || !this.peerName || !this.ready) return;
    const sd: any = CMain.mSaveData;
    // Seed the selection from the host's saved preferences, like the local SelectWorld screen.
    this.sel = {
      mode: 'Coop',
      charP1: sd?.mPlayer1_CharacterIndex != null ? sd.mPlayer1_CharacterIndex : 3,
      charP2: sd?.mPlayer2_CharacterIndex != null ? sd.mPlayer2_CharacterIndex : 0,
      levelIdx: sd?.mLevelIndex_Coop != null ? sd.mLevelIndex_Coop : 0,
      difficulty: this.sel.settings ? this.sel.difficulty : sd?.mDifficulty ?? 0,
      gameAmount: this.sel.settings ? this.sel.gameAmount : sd?.mGameAmount ?? 0,
      settings: this.sel.settings ?? roomSettingsFromSave(sd),
      wave: 1, // START_WAVE_SELECTOR: the choice is not persisted - every setup entry starts at wave 1...
      maxWave: this.waveMaximum(), // New peers share the unlocked infinite range; older peers retain 1..100.
    };
    this.send({ t: 'setup', sel: this.sel });
    this.phase = 'setup';
    CMain._this?.SetState('State_LanSetup');
    this.notify();
  }

  /** Host: BACK on the setup screen -> both sides return to the room view. */
  backToRoom(): void {
    if (this.phase !== 'setup' || !this.isHost) return;
    this.send({ t: 'lobby', sel: this.sel });
    this.phase = 'lobby';
    CMain._this?.SetState('State_LanLobby');
    this.notify();
  }

  /** Host: the setup selection changed -> mirror it to the client. */
  setSel(sel: SetupSelection): void {
    if (!this.isHost || !['hosting','lobby','setup'].includes(this.phase)) return;
    if (sel.mode === 'Coop' && !validWaveNumber(sel.wave ?? 1,sel.maxWave ?? 100)) return;
    this.sel = sel;
    if (this.phase === 'setup') this.send({ t: 'setup', sel });
    else this.send({ t: 'lobby', sel });
    this.notify();
  }

  /** Client: the room READY toggle (the host's START is gated on it). */
  setReady(ready: boolean): void {
    this.ready = ready;
    this.send({ t: 'ready', ready });
    this.notify();
  }

  // ---------------------------------------------------------------------------------------------- game start / resume

  /**
   * Host: START GAME on the setup screen (fresh, v0.1.4 selection) or RESUME GAME in the room (续局, from the
   * surviving checkpoint - reuses the original start options wholesale so both peers rebuild identically).
   */
  startGame(resume: boolean): void {
    if(resume&&!this.peerSupportsRun())return;
    if (!this.available || !this.isHost) return;
    const sd: any = CMain.mSaveData;
    if (resume) {
      if (this.phase !== 'lobby' || !this.session?.startOpts || !this.session.netCheckpoint) return;
      const opts = this.session.startOpts;
      const resumeTick = this.session.netCheckpoint.tick;
      this.send({ t: 'start', mode: opts.mode, roomLink: opts.roomLink, cfg: opts.cfg, seed: opts.seed, inputDelay: opts.inputDelay, resumeTick, wave: opts.wave, rollback: true, netcode: opts.netcode });
      this.launch(opts.mode, opts.roomLink, opts.cfg, opts.seed, opts.inputDelay, resumeTick, 0, opts.wave, opts.netcode);
      return;
    }
    if (this.phase !== 'setup') return;
    const sel = this.sel;
    if (sel.mode === 'Coop' && !validWaveNumber(sel.wave ?? 1,this.waveMaximum())) return;
    const settings = sel.settings ?? roomSettingsFromSave(sd);
    const cfg: GameConfig = {
      ...(sel.mode === 'Coop' && this.peerTeamPass ? {teamPass:'team-pass-v1' as const}:{}),
      ...(sel.mode === 'Coop' && this.peerGrowth ? { progression: 'personal-growth-v1' as const } : {}),
      ...(sel.mode === 'Coop' && this.peerSupplies ? { supplies: 'armor-ammo-v1' as const } : {}),
      ...(sel.mode === 'Coop' && this.peerGrowth && this.peerSupplies && this.peerSurvival ? {survival:'survival-v1' as const}:{}),
      ...(sel.mode === 'Coop' && this.peerGrowth && this.peerSupplies && this.peerSurvival && this.peerLoot ? {loot:'supply-crates-v2' as const}:{}),
      ...(sel.mode === 'Coop' && this.peerGrowth && this.peerSupplies && this.peerSurvival && this.peerLoot && this.peerRefill ? {refill:'reliable-supplies-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.supportsEndless()?{endless:'endless-pve-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.supportsEndless()&&this.peerTimedWaves?{timedWaves:'timed-waves-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.timedWavesAvailable()&&this.peerWaveDraft?{waveDraft:'wave-draft-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.timedWavesAvailable()&&this.peerWaveDraft&&this.peerDraftReady?{draftReady:'draft-ready-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.combatAvailable()?{combat:'combat-pve-v2' as const}:{}),
      ...(sel.mode==='Coop'&&this.bossWavesAvailable()?{bossWaves:'boss-waves-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.bossWavesAvailable()&&this.peerBossEncounters?{bossEncounters:'boss-encounters-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.supportsEndless()&&this.peerTieredGrowth?{tieredGrowth:'tiered-growth-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.timedWavesAvailable()&&this.peerClearWaves?{clearWaves:'clearable-waves-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.supportsEndless()&&this.peerVariants?{variants:'enemy-variants-v1' as const}:{}),
      ...(sel.mode==='Coop'&&this.supportsEndless()&&this.peerVariants&&this.peerEnchantment?{enchantment:'persistent-enchantment-v1' as const}:{}),
      ...(sel.mode === 'Coop' && this.peerGrowth && this.peerSupplies && this.peerBalance ? {balance:'pve-balance-v1' as const}:{}),
      difficulty: sel.difficulty,
      ...settings,
      gameAmount: sel.gameAmount,
      detail: savedSwitch(sd.mDetail),
      charP1: sel.charP1,
      charP2: sel.charP2,
    };
    // v0.2.3: the adaptive p90 delay carries the steady latency (one tick better than v0.1.7 at every
    // class), prediction (depth 1) absorbs jitter spikes, and a stall never costs a cadence slot. Depth-2
    // prediction measured unstable on real links (PARITY R10+) - D carries what it can.
    const netcode = this.useRollbackV2 && this.peerRollbackV2 ? 'rollback-v2' : undefined;
    const inputDelay = netcode ? 0 : Math.max(2, computeInputDelay(this.rttSamples, cfg.gameSpeed));
    const roomLink = 'ROOM_Single_' + PAD4(sel.levelIdx + 1);
    const seed = (Math.random() * 2 ** 32) >>> 0;
    // Persist the choices on the host like the local SelectWorld screen does.
    sd['mLevelIndex_' + sel.mode] = sel.levelIdx;
    sd.mPlayer1_CharacterIndex = sel.charP1;
    sd.mPlayer2_CharacterIndex = sel.charP2;
    sd.mDifficulty = sel.difficulty;
    sd.mGameAmount = sel.gameAmount;
    sd.mGameSpeed = settings.gameSpeed; sd.mDevilsActive = settings.devils;
    sd.mCollisionsActive = settings.collisions; sd.mDamageActive = settings.damage;
    this.send({ t: 'start', mode: sel.mode, roomLink, cfg, seed, inputDelay, wave: sel.wave ?? 1, rollback: true, netcode });
    this.launch(sel.mode, roomLink, cfg, seed, inputDelay, undefined, 0, sel.wave ?? 1, netcode);
  }

  /** Build the local session and drive the game start through the shared NetSession path. */
  private launch(mode: 'Coop' | 'DeathMatch', roomLink: string, cfg: GameConfig, seed: number, inputDelay: number | undefined, resumeTick: number | undefined, role: 0 | 1, wave: number | undefined, netcode?: 'rollback-v2'): void {
    if (!this.session) this.session = new NetSession(role, { send: (m) => this.send(m) });
    this.session.onStateChange = () => {
      const s = this.session;
      if (s) {
        // v0.2.1 phase sync: session-driven restarts (a second+ wire 'start' consumed by NetSession itself) must
        // re-enter 'playing' here too - the bridge used to keep its stale phase (stuck 'setup' -> blank room).
        // Any later route to 'ended' frees the room even if the player never re-enters the lobby screen.
        if (s.phase === 'starting' && this.phase !== 'playing') {
          this.phase = 'playing';
          this.started = true;
        } else if (s.phase === 'ended' && this.phase === 'playing') {
          this.backInLobby();
        }
      }
      netOverlaySync(s);
      this.notify();
    };
    void desktop?.lan?.hostSetStatus('playing');
    this.phase = 'playing';
    this.started = true;
    this.notify();
    this.session.startLocalGame({ mode, roomLink, cfg, seed, inputDelay, resumeTick, wave, rollback: true, netcode }, CMain._this);
    netOverlaySync(this.session);
  }

  /**
   * v0.2.1: EITHER peer's retry request (the Debrief RETRY button / the room strip). The host owns the decision
   * and drives both peers through the normal start path; the client just asks over the wire.
   */
  requestRetry(): void {
    if (!this.session || this.session.phase !== 'ended') return;
    if (this.isHost) this.startRetry();
    else this.send({ t: 'retry' });
  }

  /** Host: resume from the surviving net checkpoint when one exists, else a fresh run at the failed wave. */
  startRetry(): void {
    if (!this.isHost || !this.session || this.session.phase !== 'ended' || !this.session.startOpts) return;
    const m = this.session.retryStart();
    this.send({ t: 'start', mode: m.mode, roomLink: m.roomLink, cfg: m.cfg, seed: m.seed, inputDelay: m.inputDelay, resumeTick: m.resumeTick, wave: m.wave, rollback: true, netcode: m.netcode });
    this.launch(m.mode, m.roomLink, m.cfg, m.seed, m.inputDelay, m.resumeTick, 0, m.wave, m.netcode);
  }

  // ---------------------------------------------------------------------------------------------- transport events

  private send(msg: LanMessage): void { desktop?.lan?.send(msg); }

  private onMessage(msg: any): void {
    if (msg.t === 'recover' && msg.stage === 'offer' && !this.session) {
      this.send({ ...msg, stage: 'reject' });
      return;
    }
    if (msg.t === 'hello') {
      this.peerRollbackV2 = Array.isArray(msg.netcodes) && msg.netcodes.includes('rollback-v2');
      this.peerGrowth = Array.isArray(msg.features) && msg.features.includes('personal-growth-v1');
      this.peerSupplies = Array.isArray(msg.features) && msg.features.includes('armor-ammo-v1');
      this.peerBalance = Array.isArray(msg.features) && msg.features.includes('pve-balance-v1');
      this.peerTeamPass = Array.isArray(msg.features) && msg.features.includes('team-pass-v1');
      this.peerSurvival = Array.isArray(msg.features) && msg.features.includes('survival-v1');
      this.peerLoot = Array.isArray(msg.features) && msg.features.includes('supply-crates-v2');
      this.peerRefill = Array.isArray(msg.features) && msg.features.includes('reliable-supplies-v1');
      this.peerEndless = Array.isArray(msg.features) && msg.features.includes('endless-pve-v1');
      this.peerTimedWaves = Array.isArray(msg.features) && msg.features.includes('timed-waves-v1');
      this.peerWaveDraft = Array.isArray(msg.features) && msg.features.includes('wave-draft-v1');
      this.peerDraftReady = Array.isArray(msg.features) && msg.features.includes('draft-ready-v1');
      this.peerCombat = Array.isArray(msg.features) && msg.features.includes('combat-pve-v2');
      this.peerBossWaves = Array.isArray(msg.features) && msg.features.includes('boss-waves-v1');
      this.peerBossEncounters = Array.isArray(msg.features) && msg.features.includes('boss-encounters-v1');
      this.peerTieredGrowth = Array.isArray(msg.features) && msg.features.includes('tiered-growth-v1');
      this.peerClearWaves = Array.isArray(msg.features) && msg.features.includes('clearable-waves-v1');
      this.peerVariants = Array.isArray(msg.features) && msg.features.includes('enemy-variants-v1');
      this.peerEnchantment = Array.isArray(msg.features) && msg.features.includes('persistent-enchantment-v1');
      if(this.isHost){const maxWave=this.waveMaximum();this.sel={...this.sel,maxWave,wave:Math.min(this.sel.wave,maxWave)};}
      // Host: a client joined (fresh or reconnecting). The sid is what the client will keep using.
      this.sid = this.sid ?? msg.sid;
      this.peerName = String(msg.name ?? 'player 2');
      const backFromEnd = this.session != null && this.session.phase === 'ended';
      if (this.phase === 'hosting' || this.phase === 'lobby' || backFromEnd) {
        if (this.phase === 'hosting') this.message = '';
        this.phase = 'lobby';
        this.ready = false; // a fresh hello = a fresh room member (mid-game reconnects go through session.onHello)
        this.send({ t: 'lobby', sel: this.sel }); // (back) in the room view
      }
      if (this.session) {
        if(this.peerSupportsRun())this.session.onHello(msg);
        else this.message=this.session.startOpts?.cfg.timedWaves
          ?'This saved game requires v0.3.1 timed waves on both players.'
          :this.session.startOpts?.cfg.enchantment
            ?'This saved game requires v0.3.0-rc2 persistent enchantment on both players.'
            :'This saved game requires v0.3.0 gameplay features on both players.';
      } // A replacement older peer must never reinterpret an active modern checkpoint.
      this.notify();
      return;
    }
    if (msg.t === 'start' && !this.session) {
      // Client: the host starts the game. cfg carries everything the simulation must share. A resume whose
      // snapshot came along (restarted client) is adopted before the session launches.
      this.sel = { ...this.sel, mode: msg.mode, charP1: msg.cfg?.charP1 ?? 0, charP2: msg.cfg?.charP2 ?? 0 };
      const session = new NetSession(1, { send: (m) => this.send(m) });
      if (msg.resumeTick !== undefined && msg.snap) session.netCheckpoint = { tick: msg.resumeTick, snap: msg.snap, digest: '' };
      this.session = session;
      this.launch(msg.mode, msg.roomLink, msg.cfg, msg.seed, msg.inputDelay, msg.resumeTick, 1, msg.wave, msg.netcode);
      return;
    }
    if (msg.t === 'setup') {
      if (this.isHost || this.phase === 'playing') return;
      // Client: enter / mirror the host's setup screen (read-only).
      this.sel = msg.sel;
      if (this.phase !== 'setup') {
        this.phase = 'setup';
        CMain._this?.SetState('State_LanSetup');
      }
      this.notify();
      return;
    }
    if (msg.t === 'ready') {
      // Host: the client player's READY flag.
      if (this.isHost) this.ready = !!msg.ready;
      this.notify();
      return;
    }
    if (msg.t === 'lobby') {
      if (!this.isHost && this.phase !== 'playing' && msg.sel) this.sel = msg.sel;
      // v0.1.4: bare "in the room" signal. For a client on the setup screen it means the host backed out.
      if (!this.isHost && this.phase === 'setup') {
        this.phase = 'lobby';
        CMain._this?.SetState('State_LanLobby');
      }
      this.notify();
      return;
    }
    if (msg.t === 'leave' && msg.reason === 'quit' && (this.phase === 'lobby' || this.phase === 'setup')) {
      // The peer left the room (or the setup screen).
      this.phase = this.started ? 'playing' : (this.isHost ? 'hosting' : 'idle');
      this.ready = false;
      this.peerName = '';
      this.message = this.isHost ? 'player 2 left the room' : 'the host closed the room';
      CMain._this?.SetState('State_LanLobby');
      this.notify();
      return;
    }
    if (msg.t === 'retry') {
      // v0.2.1: the client pressed RETRY - the host drives the coordinated restart (guards inside no-op it when
      // the game is not retryable).
      this.startRetry();
      return;
    }
    if (msg.t === 'hb') {
      // Our own heartbeat probe echoed back: the link round-trip time (live already in the room). The recent
      // samples feed the input-delay picker at START (v0.1.7).
      this.rttMs = Math.max(0, msg.rttMs ?? Date.now() - msg.ts);
      this.rttSamples.push(this.rttMs);
      if (this.rttSamples.length > 20) this.rttSamples.shift();
    }
    this.session?.onNetMessage(msg);
  }

  private onPeer(e: { connected: boolean; reason?: string; diagnostic?: Record<string, number | string> }): void {
    if (e.connected) {
      this.stopTimers();
      if (this.phase === 'joining') this.phase = 'lobby';
      this.message = '';
      this.notify();
      return;
    }
    if (this.phase === 'playing' && this.session) {
      this.session.onPeerEvent(e);
      netOverlaySync(this.session);
      this.startReconnectLoop();
    } else if (this.phase === 'lobby' || this.phase === 'hosting' || this.phase === 'setup') {
      const fromSetup = this.phase === 'setup';
      this.phase = this.started ? 'playing' : (this.isHost ? 'hosting' : 'idle');
      this.ready = false;
      this.peerName = '';
      this.message = this.isHost ? 'player 2 disconnected' : 'connection to the host lost';
      if (fromSetup && CMain._this) CMain._this.SetState('State_LanLobby');
      this.notify();
    }
  }

  private startReconnectLoop(): void {
    this.stopTimers();
    const generation = this.reconnectGeneration;
    if (this.session?.role === 1 && this.hostIp) {
      let pending = false;
      const tryConnect = (): void => {
        if (pending || generation !== this.reconnectGeneration || !this.session || this.session.phase !== 'reconnecting' || !this.hostIp) return;
        pending = true;
        void desktop?.lan?.connect(this.hostIp, undefined, { name: 'player', sid: this.sid, char: 0, capTick: this.session.netCheckpoint?.tick })
          .catch(() => undefined).finally(() => { pending = false; });
      };
      // Retry every 1 s (v0.1.3 used 2 s; never AT ONCE): a GRACEFUL app quit also fires peer-lost, and an instant
      // retry would hello the host mid-shutdown and trigger a pointless checkpoint resume (the app dies 200-400 ms
      // in). 1 s still beats the host's 3.5 s dead-link watchdog, so genuine virtual-LAN blips lose nothing.
      this.reconnectTimer = window.setInterval(tryConnect, 1000) as unknown as number;
    }
    this.deadlineTimer = window.setInterval(() => {
      const s = this.session;
      if (!s || s.phase !== 'reconnecting') { this.stopTimers(); return; }
      // Re-render EVERY tick so the countdown actually reads (seconds ticking down), on the overlay and in any
      // visible lobby status line.
      netOverlaySync(s);
      this.notify();
      if (s.reconnectSecondsLeft() <= 0) {
        this.stopTimers();
        s.forfeit('timeout');
        netOverlaySync(s);
        this.notify();
      }
    }, 500) as unknown as number;
  }

  private stopTimers(): void {
    ++this.reconnectGeneration;
    if (this.reconnectTimer !== undefined) { clearInterval(this.reconnectTimer); this.reconnectTimer = undefined; }
    if (this.deadlineTimer !== undefined) { clearInterval(this.deadlineTimer); this.deadlineTimer = undefined; }
  }
}

/** Overlay sync hook (set by overlay.ts to avoid a hard dependency from here). */
export let netOverlaySync: (s: NetSession | null) => void = () => {};
export function setNetOverlaySync(fn: (s: NetSession | null) => void): void { netOverlaySync = fn; }

let bridge: LanBridge | undefined;

export function lanBridge(): LanBridge {
  if (!bridge) bridge = new LanBridge();
  return bridge;
}

/** Tests: drop the singleton (and its session). */
export function _resetBridgeForTests(): void {
  bridge?.leaveLobby();
  bridge = undefined;
}
