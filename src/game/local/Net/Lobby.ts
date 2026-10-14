// LAN lobby screen (deviation LAN_MULTIPLAYER): a real screen of the game's screen system (like the
// instructions page: a synthetic frame of original characters + drawn text/buttons, original cross-fade transition).
// v0.1.4 rework: two clean views - ENTRY (create a room / join by discovery list or IP) and ROOM (both players with
// READY states; the host's START leads into the net setup screen once both are ready; RESUME continues a finished
// game from its checkpoint). All state lives in the bridge (bridge.ts); this screen only renders it. Layout: Text()
// places top-left, Button() CENTRES on (x,y) - every coordinate below is chosen with that in mind so the columns
// (host x 30..300, join x 330..610) never overlap at any window size; the manual-IP DOM input tracks the letterboxed
// canvas through bridge.presenter (logicalToClient + onResize).
import { TextFormat, flash, proto, registerClass } from '../../../engine/runtime.ts';
import { CScreen } from '../../Screen/CScreen.ts';
import { lanBridge } from './bridge.ts';
import { buildMenuButton, SCREEN_LAN_LOBBY_LINKAGE } from '../localSymbols.ts';

const INK = 0x333333;
const ACCENT = 0xcc0000;
const GREEN = 0x007000;
const GREY = 0x888888;
/** The manual-IP input's logical rectangle (top-left x/y, width, height in 640x480 stage units). */
const IP_BOX = { x: 330, y: 316, w: 200, h: 24 };

function glow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2)];
}

function menuShadow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2), new flash.filters.DropShadowFilter(5, 45, 0x000000, 1, 5, 5, 0.18, 1)];
}

/** Loose IPv4 / IPv4:port check - the port scan on the main side does the real work. */
function looksLikeAddress(raw: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d+))?$/.exec(raw);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) if (Number(m[i]) > 255) return false;
  if (m[5] !== undefined && Number(m[5]) > 65535) return false;
  return true;
}

export class CScreen_LanLobby extends CScreen {
  // NOTE: display objects are created with Object.create - field initializers never run (engine DisplayObject.ts).
  // Everything is assigned in ctor() below.
  private dirty!: boolean;
  private ipInput: HTMLInputElement | undefined;
  private unresize: (() => void) | undefined;
  private tickTimer: number | undefined;
  private tickCount!: number;
  private unregisterUi: (() => void) | undefined;
  private entryEls!: any[];
  private roomEls!: any[];
  private hostRows!: any[];
  private searchingText: any;
  private statusText: any;
  private pingText: any;
  private p2Row: any;
  private p2Badge: any;
  private resumeText: any;
  private resumeBtn: any;
  private readyBtn: any;
  private leaveBtn: any;
  private startBtn: any;
  private startHint: any;
  private closeBtn: any;
  bBack: any;

  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.dirty = true;
    this.tickCount = 0;
    this.entryEls = [];
    this.roomEls = [];
    this.hostRows = [];
    this.Build();
    this.unregisterUi = lanBridge().onUi(() => { this.dirty = true; });
    if (typeof document !== 'undefined') this.buildIpInput();
    this.startTimers();
    this.Refresh();
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Process(): void {
    super.Process();
    if (this.dirty) {
      this.dirty = false;
      this.Refresh();
    }
  }

  override Dispose(): void {
    this.unregisterUi?.();
    this.unresize?.();
    if (this.tickTimer !== undefined && typeof window !== 'undefined') window.clearInterval(this.tickTimer);
    this.ipInput?.remove();
    super.Dispose();
  }

  Text(x: number, y: number, w: number, h: number, font: string, size: number, color: number, bold: boolean,
    align: 'left' | 'right' | 'center', text: string, multiline = false): any {
    const tf = this.createTextField('tf' + this.mDepth, this.mDepth++, x, y, w, h);
    tf.embedFonts = true;
    tf.selectable = false;
    if (multiline) {
      tf.multiline = true;
      tf.wordWrap = true;
    }
    tf.setNewTextFormat(new TextFormat(font, size, color, bold, false, false, undefined, undefined, align));
    tf.text = text;
    return tf;
  }

  Button(x: number, y: number, w: number, h: number, label: string, size: number, onPress: () => void): any {
    // The name must be unique AND advance mDepth: createEmptyMovieClip REPLACES a same-named sibling (AS2 rule) -
    // sharing names silently deleted earlier buttons (five host rows all called 'b109' ate the HOST button).
    const b = buildMenuButton(this, 'b' + this.mDepth, x, y, w, h, label, size);
    this.mDepth++;
    b.onRelease = function (this: any): void {
      onPress();
      this.pScreen.dirty = true;
    };
    b.pScreen = this;
    return b;
  }

  private Build(): void {
    // ---- shared header + footer
    this.Text(150, 12, 340, 40, 'Arial Rounded MT Bold', 30, INK, false, 'center', 'LAN GAME').filters = menuShadow();
    this.Text(20, 44, 600, 20, 'Calibri', 13, ACCENT, true, 'center', '', false); // status line (Refresh keeps it)
    this.statusText = this['tf' + (this.mDepth - 1)];
    this.bBack = this.Button(320, 445, 180, 26, 'BACK TO MENU', 14, () => {
      lanBridge().leaveLobby();
      this.nState = 'State_Main';
    });

    // ---- ENTRY view (nothing hosted / connected yet)
    const entry = (el: any): void => { this.entryEls.push(el); };
    const divider = this.createEmptyMovieClip('divider', this.mDepth++);
    divider.lineStyle(2, 0x9c9c9c);
    divider.moveTo(320, 76);
    divider.lineTo(320, 420);
    entry(divider);

    entry(this.Text(30, 80, 270, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', 'CREATE A ROOM').filters = menuShadow());
    entry(this.Text(30, 112, 260, 32, 'Calibri', 11, INK, false, 'left', 'Set up a room on this machine - player 2 joins from theirs.', true));
    entry(this.Button(170, 220, 220, 30, 'CREATE ROOM', 16, () => lanBridge().host()));

    entry(this.Text(330, 80, 280, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', 'JOIN A ROOM').filters = menuShadow());
    this.searchingText = this.Text(330, 112, 260, 60, 'Calibri', 12, GREY, false, 'left',
      'Searching for games on your network...\n(or join by IP address below)', true);
    entry(this.searchingText);
    for (let i = 0; i < 5; i++) {
      const idx = i;
      const row = this.Button(470, 122 + i * 30, 260, 24, '', 11, () => {
        const b = lanBridge();
        const h = b.hosts[idx] as any;
        if (h && h.status === 'lobby' && h.players === 1) b.join(h.ip, h.port);
      });
      this.hostRows.push(row);
      entry(row);
    }
    entry(this.Text(330, 268, 260, 16, 'Calibri', 12, INK, true, 'left', 'OR JOIN BY IP ADDRESS'));
    entry(this.Button(565, 328, 60, 24, 'JOIN', 12, () => this.joinByIp()));

    // ---- ROOM view (hosting / connected / during a reconnect window)
    const room = (el: any): void => { this.roomEls.push(el); };
    room(this.Text(30, 80, 300, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', 'GAME ROOM').filters = menuShadow());
    this.pingText = this.Text(430, 86, 180, 16, 'Calibri', 12, GREEN, true, 'right', '');
    room(this.pingText);
    room(this.Text(60, 140, 240, 18, 'Calibri', 14, INK, true, 'left', 'PLAYER 1 (HOST)'));
    room(this.Text(290, 140, 90, 18, 'Calibri', 13, GREEN, true, 'right', 'READY'));
    this.p2Row = this.Text(60, 180, 240, 18, 'Calibri', 14, INK, true, 'left', 'PLAYER 2');
    room(this.p2Row);
    this.p2Badge = this.Text(230, 180, 150, 18, 'Calibri', 13, GREY, true, 'right', 'WAITING');
    room(this.p2Badge);

    this.resumeText = this.Text(220, 258, 200, 16, 'Calibri', 12, INK, true, 'center', 'LAST GAME AVAILABLE');
    room(this.resumeText);
    this.resumeBtn = this.Button(320, 290, 180, 26, 'RESUME GAME', 14, () => lanBridge().startGame(true));
    room(this.resumeBtn);

    this.readyBtn = this.Button(220, 330, 150, 28, 'READY', 15, () => lanBridge().setReady(!lanBridge().ready));
    room(this.readyBtn);
    this.leaveBtn = this.Button(420, 330, 150, 28, 'LEAVE', 15, () => lanBridge().leaveLobby());
    room(this.leaveBtn);
    this.startBtn = this.Button(220, 330, 150, 28, 'START', 15, () => lanBridge().enterSetup());
    room(this.startBtn);
    this.startHint = this.Text(170, 362, 300, 14, 'Calibri', 11, GREY, false, 'center', 'waiting for player 2 to get ready');
    room(this.startHint);
    this.closeBtn = this.Button(420, 330, 150, 28, 'CLOSE ROOM', 14, () => lanBridge().leaveLobby());
    room(this.closeBtn);
  }

  /** The manual-IP entry is a DOM input over the canvas (canvas text cannot be edited). */
  private buildIpInput(): void {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '192.168.x.x';
    input.maxLength = 21;
    input.style.cssText = 'position:absolute;background:#181818;border:2px solid #9c9c9c;'
      + 'color:#fff;font-family:Consolas,monospace;text-align:center;padding:0 2px;z-index:7;outline:none';
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.joinByIp();
    });
    stage.appendChild(input);
    this.ipInput = input;
    this.unresize = lanBridge().presenter?.onResize(() => this.placeInput());
    this.placeInput();
  }

  /** Keep the input glued to its logical rectangle: canvas letterboxing is tracked via the presenter. */
  private placeInput(): void {
    const input = this.ipInput;
    if (!input) return;
    const stage = document.getElementById('stage');
    if (!stage) return;
    let x1: number, y1: number, x2: number, y2: number;
    const presenter = lanBridge().presenter;
    if (presenter) {
      const a = presenter.logicalToClient(IP_BOX.x, IP_BOX.y);
      const b = presenter.logicalToClient(IP_BOX.x + IP_BOX.w, IP_BOX.y + IP_BOX.h);
      x1 = a.x; y1 = a.y; x2 = b.x; y2 = b.y;
    } else {
      // Fallback: derive the transform from the canvas' own bounding rect (640x480 logical stage).
      const cv = stage.querySelector('.game-canvas') as HTMLElement | null;
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      x1 = r.left + (IP_BOX.x * r.width) / 640; y1 = r.top + (IP_BOX.y * r.height) / 480;
      x2 = r.left + ((IP_BOX.x + IP_BOX.w) * r.width) / 640; y2 = r.top + ((IP_BOX.y + IP_BOX.h) * r.height) / 480;
    }
    const s = stage.getBoundingClientRect();
    const w = Math.max(40, x2 - x1), h = Math.max(16, y2 - y1);
    input.style.left = `${x1 - s.left}px`;
    input.style.top = `${y1 - s.top}px`;
    input.style.width = `${w}px`;
    input.style.height = `${h}px`;
    input.style.fontSize = `${Math.max(9, Math.round(h * 0.55))}px`;
  }

  private joinByIp(): void {
    const raw = (this.ipInput?.value ?? '').trim();
    if (!raw) return;
    const b = lanBridge();
    if (!looksLikeAddress(raw)) {
      b.message = 'enter a valid IPv4 address, e.g. 192.168.1.5';
      this.dirty = true;
      return;
    }
    const colon = raw.indexOf(':');
    if (colon === -1) b.join(raw);
    else b.join(raw.slice(0, colon), Number(raw.slice(colon + 1)));
  }

  /** 1 s dirty tick (ping / ready / countdown refresh); every 2nd tick also retries discovery while on the entry view
   *  (a failed UDP bind - two instances on one machine - self-heals once the competing instance exits). */
  private startTimers(): void {
    if (typeof window === 'undefined') return;
    const b = lanBridge();
    if (b.available && b.phase === 'idle') b.refresh();
    this.tickTimer = window.setInterval(() => {
      this.tickCount++;
      const bridge = lanBridge();
      if (this.tickCount % 2 === 0 && (bridge.phase === 'idle' || bridge.phase === 'error')) bridge.refresh();
      this.dirty = true;
    }, 1000) as unknown as number;
  }

  private Refresh(): void {
    const b = lanBridge();
    const entry = b.phase === 'idle' || b.phase === 'error' || b.phase === 'joining';
    const room = b.phase === 'hosting' || b.phase === 'lobby' || b.phase === 'playing';
    for (const el of this.entryEls) el._visible = entry;
    for (const el of this.roomEls) el._visible = room;
    if (this.ipInput) this.ipInput.style.display = entry ? 'block' : 'none';
    this.placeInput();

    const setLabel = (btn: any, text: string): void => { if (btn?._Contents?._Label) btn._Contents._Label.text = text; };
    // Entry: the discovery list (joinable rooms bright, full / in-game dim).
    this.searchingText._visible = entry && b.hosts.length === 0;
    for (let i = 0; i < this.hostRows.length; i++) {
      const h = b.hosts[i] as any;
      const row = this.hostRows[i];
      if (!h) { setLabel(row, ''); continue; }
      const name = String(h.name ?? '?').slice(0, 16);
      setLabel(row, `${name} · ${h.players}/2 · ${h.status === 'lobby' ? 'WAITING' : 'IN GAME'}`);
      row._alpha = h.status === 'lobby' && h.players === 1 ? 100 : 45;
    }

    // Room: players, ready states, ping.
    if (this.pingText) {
      const rtt = b.rttMs;
      this.pingText._visible = room && rtt !== undefined && !!b.peerName;
      if (rtt !== undefined) this.pingText.text = `PING ${rtt <= 0 ? '<1' : Math.round(rtt)} MS`;
    }
    if (this.p2Row) this.p2Row.text = b.peerName ? `PLAYER 2 - ${String(b.peerName).slice(0, 14)}` : 'PLAYER 2';
    if (this.p2Badge) {
      if (!b.peerName) { this.p2Badge.text = 'WAITING'; this.p2Badge.textColor = GREY; }
      else if (!b.ready) { this.p2Badge.text = 'NOT READY'; this.p2Badge.textColor = ACCENT; }
      else { this.p2Badge.text = 'READY'; this.p2Badge.textColor = GREEN; }
    }
    const canResume = b.isHost && b.session?.phase === 'ended' && !!b.session.netCheckpoint;
    if (this.resumeText) this.resumeText._visible = room && canResume;
    if (this.resumeBtn) this.resumeBtn._visible = room && canResume;

    // Client: READY toggle; Host: START (gated on player 2 being connected AND ready) + CLOSE ROOM.
    const bothReady = !!b.peerName && b.ready;
    if (this.readyBtn) this.readyBtn._visible = room && !b.isHost && b.phase !== 'playing';
    if (this.leaveBtn) this.leaveBtn._visible = room && !b.isHost && b.phase !== 'playing';
    if (this.startBtn) {
      this.startBtn._visible = room && b.isHost && b.phase === 'lobby';
      this.startBtn._alpha = bothReady ? 100 : 40;
    }
    if (this.startHint) this.startHint._visible = room && b.isHost && b.phase === 'lobby' && !bothReady;
    if (this.closeBtn) this.closeBtn._visible = room && b.isHost && b.phase !== 'playing';

    if (this.statusText) this.statusText.text = b.message || this.statusFor(b);
  }

  private statusFor(b: ReturnType<typeof lanBridge>): string {
    if (b.phase === 'hosting') return 'waiting for player 2 to join...';
    if (b.phase === 'lobby' && !b.isHost) return b.ready ? 'READY - waiting for the host to start' : 'press READY when you are set';
    if (b.phase === 'playing' && b.session?.phase === 'reconnecting') return `RECONNECTING... ${b.session.reconnectSecondsLeft()}s`;
    return '';
  }
}
proto(CScreen_LanLobby, { _CLASSID_: 'CScreen_LanLobby' });

/** Register the lobby class for its synthetic linkage (the symbol itself is added by installLocalSymbols). */
export function registerLobbyPage(): void {
  registerClass(SCREEN_LAN_LOBBY_LINKAGE, CScreen_LanLobby);
}
