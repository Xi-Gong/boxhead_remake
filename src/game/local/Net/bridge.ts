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
import type { GameConfig, LanMessage } from './protocol.ts';

/**
 * Local lobby-panel state of the OLD v0.1.3 host controls (mode/difficulty/frags/room). Kept until the v0.1.4
 * setup screen replaces those controls (the `lobby` wire message is bare since v0.1.4 - nothing is pushed anymore).
 */
interface LobbyPanel {
  mode: 'Coop' | 'DeathMatch';
  roomIdx: number;
  difficulty: number;
  killsIdx: number;
}

export type LanUiPhase =
  | 'idle' // in the lobby, nothing hosted / connected
  | 'hosting' // hosting, waiting for player 2
  | 'joining' // connecting to a host
  | 'lobby' // host <-> client connected, configuring
  | 'playing' // in the net game (or its reconnect window)
  | 'error'; // last operation failed (message set)

const PAD4 = (n: number): string => String(n).padStart(4, '0');

class LanBridge {
  phase: LanUiPhase = 'idle';
  message = '';
  hosts: { ip: string; name: string; status: string; players: number; port: number }[] = [];
  /** Host: the old v0.1.3 panel selection (local only until the setup screen replaces it). */
  cfg: LobbyPanel = { mode: 'Coop', roomIdx: 0, difficulty: 0, killsIdx: 0 };
  /** Client: own character choice (sent in the hello); Host: the joined client's name + character. */
  charP2 = 0;
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
  private notify(): void { for (const cb of this.uiCbs) cb(); }

  // ---------------------------------------------------------------------------------------------- discovery / hosting

  refresh(): void {
    if (!this.available) return;
    void desktop!.lan.discoverStart().then((r) => {
      if (!r.ok) { this.message = `discovery unavailable: ${r.reason}`; this.notify(); }
    });
  }

  host(): void {
    if (!this.available) return;
    this.phase = 'hosting';
    this.message = 'HOSTING - waiting for player 2...';
    this.notify();
    void desktop!.lan.hostStart().then((r) => {
      if (!r.ok) { this.phase = 'error'; this.message = `cannot host: ${r.reason}`; }
      this.notify();
    });
  }

  /** Host side: the (old v0.1.3) lobby selection changed. The wire message is bare since v0.1.4. */
  pushCfg(cfg: LobbyPanel): void {
    this.cfg = cfg;
    if (this.phase === 'lobby') this.send({ t: 'lobby' });
    this.notify();
  }

  join(ip: string, port?: number): void {
    if (!this.available) return;
    this.hostIp = ip;
    this.phase = 'joining';
    this.message = `connecting to ${ip}...`;
    this.notify();
    void desktop!.lan.connect(ip, port, { name: 'player', sid: this.sid, char: this.charP2 }).then((r) => {
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
    this.peerName = '';
    this.message = '';
    this.notify();
  }

  /** State_LanLobby entry: after a finished net game both players land back here (checkpoint kept for 续局). */
  markBackInLobby(): void {
    if (this.session && this.session.phase === 'ended' && this.phase === 'playing') {
      this.phase = 'lobby';
      this.message = this.session.netCheckpoint ? 'RESUME GAME available' : '';
      void desktop?.lan?.hostSetStatus('lobby');
      this.notify();
    }
  }

  // ---------------------------------------------------------------------------------------------- game start / resume

  /** Host: START GAME (fresh) or RESUME GAME (续局, from the surviving checkpoint). */
  startGame(resume: boolean): void {
    if (this.phase !== 'lobby' || !this.available) return;
    const sd: any = CMain.mSaveData;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const cfg: GameConfig = {
      difficulty: this.cfg.difficulty,
      gameSpeed: sd.mGameSpeed != null ? sd.mGameSpeed : 1,
      devils: sd.mDevilsActive !== false,
      collisions: sd.mCollisionsActive !== false,
      damage: sd.mDamageActive !== false,
      gameAmount: this.cfg.killsIdx,
      detail: sd.mDetail !== false,
      charP1: sd.mPlayer1_CharacterIndex != null ? sd.mPlayer1_CharacterIndex : 3, // v0.1.4: from the setup screen (L2)
      charP2: this.charP2,
    };
    const resumeTick = resume && this.session?.netCheckpoint ? this.session.netCheckpoint.tick : undefined;
    const seedFinal = resume && this.session?.startOpts ? this.session.startOpts.seed : seed;
    this.send({ t: 'start', mode: this.cfg.mode, roomLink: 'ROOM_Single_' + PAD4(this.cfg.roomIdx + 1), cfg, seed: seedFinal, resumeTick });
    this.launch(this.cfg.mode, 'ROOM_Single_' + PAD4(this.cfg.roomIdx + 1), cfg, seedFinal, resumeTick, 0);
  }

  /** Build the local session and drive the game start through the shared NetSession path. */
  private launch(mode: 'Coop' | 'DeathMatch', roomLink: string, cfg: GameConfig, seed: number, resumeTick: number | undefined, role: 0 | 1): void {
    if (!this.session) this.session = new NetSession(role, { send: (m) => this.send(m) });
    this.session.onStateChange = () => {
      netOverlaySync(this.session);
      this.notify();
    };
    void desktop?.lan?.hostSetStatus('playing');
    this.phase = 'playing';
    this.started = true;
    this.notify();
    this.session.startLocalGame({ mode, roomLink, cfg, seed, resumeTick }, CMain._this);
    netOverlaySync(this.session);
  }

  // ---------------------------------------------------------------------------------------------- transport events

  private send(msg: LanMessage): void { desktop?.lan?.send(msg); }

  private onMessage(msg: any): void {
    if (msg.t === 'hello') {
      // Host: a client joined (fresh or reconnecting). The sid is what the client will keep using.
      this.sid = this.sid ?? msg.sid;
      this.peerName = String(msg.name ?? 'player 2');
      this.charP2 = Number(msg.char ?? 0) || 0;
      const backFromEnd = this.session != null && this.session.phase === 'ended';
      if (this.phase === 'hosting' || this.phase === 'lobby' || backFromEnd) {
        this.phase = 'lobby';
        this.send({ t: 'lobby' }); // (back) in the room view
      }
      if (this.session) this.session.onHello(msg); // a reconnect mid-game resumes
      this.notify();
      return;
    }
    if (msg.t === 'start' && !this.session) {
      // Client: the host starts the game. cfg carries everything the simulation must share. A resume whose
      // snapshot came along (restarted client) is adopted before the session launches.
      this.cfg.mode = msg.mode;
      this.charP2 = msg.cfg?.charP2 ?? 0;
      const session = new NetSession(1, { send: (m) => this.send(m) });
      if (msg.resumeTick !== undefined && msg.snap) session.netCheckpoint = { tick: msg.resumeTick, snap: msg.snap, digest: '' };
      this.session = session;
      this.launch(msg.mode, msg.roomLink, msg.cfg, msg.seed, msg.resumeTick, 1);
      return;
    }
    if (msg.t === 'lobby') {
      // v0.1.4: bare "in the room" signal (the old cfg payload is gone; the setup screen owns the selection now).
      this.notify();
      return;
    }
    if (msg.t === 'leave' && msg.reason === 'quit' && (this.phase === 'lobby')) {
      this.phase = this.started ? 'playing' : 'hosting';
      this.peerName = '';
      this.message = 'player 2 left the lobby';
      this.notify();
      return;
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
    } else if (this.phase === 'lobby' || this.phase === 'hosting') {
      this.phase = this.started ? 'playing' : 'hosting';
      this.peerName = '';
      this.message = 'player 2 disconnected';
      this.notify();
    }
  }

  private startReconnectLoop(): void {
    this.stopTimers();
    if (this.session?.role === 1 && this.hostIp) {
      this.reconnectTimer = window.setInterval(() => {
        if (!this.session || this.session.phase !== 'reconnecting' || !this.hostIp) return;
        void desktop?.lan?.connect(this.hostIp, undefined, { name: 'player', sid: this.sid, char: this.charP2, capTick: this.session.netCheckpoint?.tick })
          .catch(() => undefined);
      }, 2000) as unknown as number;
    }
    this.deadlineTimer = window.setInterval(() => {
      const s = this.session;
      if (!s || s.phase !== 'reconnecting') { this.stopTimers(); return; }
      if (s.reconnectSecondsLeft() <= 0) {
        this.stopTimers();
        s.forfeit();
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
