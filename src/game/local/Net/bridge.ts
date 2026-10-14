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
import { NetSession } from './NetSession.ts';
import { LAN_INPUT_DELAY } from './protocol.ts';
import type { GameConfig, LanMessage, SetupSelection } from './protocol.ts';

/** The Presenter surface the bridge needs (main.ts hands the real platform Presenter over). */
export interface PresenterLike {
  logicalToClient(x: number, y: number): { x: number; y: number };
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
  sel: SetupSelection = { mode: 'Coop', charP1: 3, charP2: 0, levelIdx: 0, difficulty: 0, gameAmount: 0 };
  /** Peer link round-trip time (heartbeat echo; live already while in the room). */
  rttMs: number | undefined;
  /** Host: this machine's non-internal IPv4s (fetched on host(); the room view shows them). */
  hostAddrs: string[] = [];
  /** Set by main.ts: lets DOM overlays (the IP input) track the letterboxed canvas. */
  presenter: PresenterLike | undefined;
  peerName = '';
  session: NetSession | null = null;
  sid: string | undefined;
  /** Client: the host ip it joined (reconnects go there). */
  hostIp = '';
  private reconnectTimer: number | undefined;
  private deadlineTimer: number | undefined;
  private uiCbs = new Set<() => void>();
  private started = false;

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
    void desktop!.lan.discoverStart().then((r) => {
      if (!r.ok) { this.message = `discovery unavailable: ${r.reason}`; this.notify(); }
    });
  }

  host(): void {
    if (!this.available) return;
    this.isHost = true;
    this.phase = 'hosting';
    this.message = 'HOSTING - waiting for player 2...';
    this.notify();
    void desktop!.lan.hostStart().then(async (r) => {
      if (!r.ok) { this.phase = 'error'; this.message = `cannot host: ${r.reason}`; }
      else if (desktop!.lan.addresses) this.hostAddrs = await desktop!.lan.addresses().catch(() => []);
      this.notify();
    });
  }

  join(ip: string, port?: number): void {
    if (!this.available) return;
    this.isHost = false;
    this.hostIp = ip;
    this.phase = 'joining';
    this.message = `connecting to ${ip}...`;
    this.notify();
    void desktop!.lan.connect(ip, port, { name: 'player', sid: this.sid, char: 0 }).then((r) => {
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
    if (this.session && this.session.phase === 'ended' && this.phase === 'playing') {
      this.phase = 'lobby';
      this.message = ''; // the room view shows its own RESUME strip when a checkpoint survives
      void desktop?.lan?.hostSetStatus('lobby');
      this.notify();
    }
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
      difficulty: sd?.mDifficulty != null ? sd.mDifficulty : 0,
      gameAmount: sd?.mGameAmount != null ? sd.mGameAmount : 0,
    };
    this.send({ t: 'setup', sel: this.sel });
    this.phase = 'setup';
    CMain._this?.SetState('State_LanSetup');
    this.notify();
  }

  /** Host: BACK on the setup screen -> both sides return to the room view. */
  backToRoom(): void {
    if (this.phase !== 'setup' || !this.isHost) return;
    this.send({ t: 'lobby' });
    this.phase = 'lobby';
    CMain._this?.SetState('State_LanLobby');
    this.notify();
  }

  /** Host: the setup selection changed -> mirror it to the client. */
  setSel(sel: SetupSelection): void {
    this.sel = sel;
    if (this.phase === 'setup') this.send({ t: 'setup', sel });
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
    if (!this.available || !this.isHost) return;
    const sd: any = CMain.mSaveData;
    if (resume) {
      if (this.phase !== 'lobby' || !this.session?.startOpts || !this.session.netCheckpoint) return;
      const opts = this.session.startOpts;
      const resumeTick = this.session.netCheckpoint.tick;
      this.send({ t: 'start', mode: opts.mode, roomLink: opts.roomLink, cfg: opts.cfg, seed: opts.seed, inputDelay: opts.inputDelay, resumeTick });
      this.launch(opts.mode, opts.roomLink, opts.cfg, opts.seed, opts.inputDelay, resumeTick, 0);
      return;
    }
    if (this.phase !== 'setup') return;
    const sel = this.sel;
    const cfg: GameConfig = {
      difficulty: sel.difficulty,
      gameSpeed: sd.mGameSpeed != null ? sd.mGameSpeed : 1,
      devils: sd.mDevilsActive !== false,
      collisions: sd.mCollisionsActive !== false,
      damage: sd.mDamageActive !== false,
      gameAmount: sel.gameAmount,
      detail: sd.mDetail !== false,
      charP1: sel.charP1,
      charP2: sel.charP2,
    };
    // Lockstep input delay adapts to the measured link RTT: on a real LAN (<5 ms) it stays 1; a virtual-LAN link
    // at ~60 ms needs 2 ticks so the peer's frames arrive before the tick that consumes them (no stalls).
    const inputDelay = this.rttMs === undefined
      ? LAN_INPUT_DELAY
      : Math.min(4, Math.max(1, Math.ceil((this.rttMs + 25) / 40)));
    const roomLink = 'ROOM_Single_' + PAD4(sel.levelIdx + 1);
    const seed = (Math.random() * 2 ** 32) >>> 0;
    // Persist the choices on the host like the local SelectWorld screen does.
    sd['mLevelIndex_' + sel.mode] = sel.levelIdx;
    sd.mPlayer1_CharacterIndex = sel.charP1;
    sd.mPlayer2_CharacterIndex = sel.charP2;
    sd.mDifficulty = sel.difficulty;
    sd.mGameAmount = sel.gameAmount;
    this.send({ t: 'start', mode: sel.mode, roomLink, cfg, seed, inputDelay });
    this.launch(sel.mode, roomLink, cfg, seed, inputDelay, undefined, 0);
  }

  /** Build the local session and drive the game start through the shared NetSession path. */
  private launch(mode: 'Coop' | 'DeathMatch', roomLink: string, cfg: GameConfig, seed: number, inputDelay: number | undefined, resumeTick: number | undefined, role: 0 | 1): void {
    if (!this.session) this.session = new NetSession(role, { send: (m) => this.send(m) });
    this.session.onStateChange = () => {
      netOverlaySync(this.session);
      this.notify();
    };
    void desktop?.lan?.hostSetStatus('playing');
    this.phase = 'playing';
    this.started = true;
    this.notify();
    this.session.startLocalGame({ mode, roomLink, cfg, seed, inputDelay, resumeTick }, CMain._this);
    netOverlaySync(this.session);
  }

  // ---------------------------------------------------------------------------------------------- transport events

  private send(msg: LanMessage): void { desktop?.lan?.send(msg); }

  private onMessage(msg: any): void {
    if (msg.t === 'hello') {
      // Host: a client joined (fresh or reconnecting). The sid is what the client will keep using.
      this.sid = this.sid ?? msg.sid;
      this.peerName = String(msg.name ?? 'player 2');
      const backFromEnd = this.session != null && this.session.phase === 'ended';
      if (this.phase === 'hosting' || this.phase === 'lobby' || backFromEnd) {
        this.phase = 'lobby';
        this.ready = false; // a fresh hello = a fresh room member (mid-game reconnects go through session.onHello)
        this.send({ t: 'lobby' }); // (back) in the room view
      }
      if (this.session) this.session.onHello(msg); // a reconnect mid-game resumes
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
      this.launch(msg.mode, msg.roomLink, msg.cfg, msg.seed, msg.inputDelay, msg.resumeTick, 1);
      return;
    }
    if (msg.t === 'setup') {
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
    if (msg.t === 'hb') {
      // Our own heartbeat probe echoed back: the link round-trip time (live already in the room).
      this.rttMs = Math.max(0, Date.now() - msg.ts);
    }
    this.session?.onNetMessage(msg);
  }

  private onPeer(e: { connected: boolean; reason?: string }): void {
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
    if (this.session?.role === 1 && this.hostIp) {
      const tryConnect = (): void => {
        if (!this.session || this.session.phase !== 'reconnecting' || !this.hostIp) return;
        void desktop?.lan?.connect(this.hostIp, undefined, { name: 'player', sid: this.sid, char: 0, capTick: this.session.netCheckpoint?.tick })
          .catch(() => undefined);
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
