// LAN lobby screen (deviation LAN_MULTIPLAYER): a real screen of the game's screen system (like the
// instructions page: a synthetic frame of original characters + drawn text/buttons, original cross-fade transition).
// v0.1.4 rework: two clean views - ENTRY (create a room / join by discovery list or IP) and ROOM (both players with
// READY states; the host's START leads into the net setup screen once both are ready; RESUME continues a finished
// game from its checkpoint). All state lives in the bridge (bridge.ts); this screen only renders it.
// v0.2.2 restyle (UiStyle): both views sit on the ORIGINAL options-window card (localSymbols 9005 - the highscore
// table's own chrome), with the select-screen pill buttons, the signature red headings and the #e60000@35% wash as
// hover/selected feedback. Coordinates inside the panel are centred (x -230..230); the manual-IP DOM input tracks
// its logical rectangle through bridge.presenter (contentToClient + onResize - the centred 640x480 content space).
import { proto, registerClass } from '../../../engine/runtime.ts';
import { CScreen } from '../../Screen/CScreen.ts';
import { lanBridge } from './bridge.ts';
import { getRunStartWave } from '../StartWave.ts';
import { SCREEN_LAN_LOBBY_LINKAGE } from '../localSymbols.ts';
import { inputSummary } from '../InputBadge.ts';
import { RoomSettingsPanel } from './RoomSettingsPanel.ts';
import { BODY_FONT, GREEN, GREY, INK, MENU_FONT, RED, glow, panelCard, pillButton, setButtonEnabled, setButtonLabel, text } from '../UiStyle.ts';

/** The manual-IP input's logical rectangle (top-left x/y, width, height in 640x480 stage units). */
const IP_BOX = { x: 332, y: 338, w: 146, h: 24 };

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
  private panel: any;
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
  private addrText: any;
  private inputsText: any;
  private resumeText: any;
  private resumeBtn: any;
  private readyBtn: any;
  private leaveBtn: any;
  private startBtn: any;
  private startHint: any;
  private closeBtn: any;
  bBack: any;
  private roomSettings!: RoomSettingsPanel;

  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.dirty = true;
    this.tickCount = 0;
    this.entryEls = [];
    this.roomEls = [];
    this.hostRows = [];
    this.Build();
    this.roomSettings = new RoomSettingsPanel(this);
    this.unregisterUi = lanBridge().onUi(() => { this.dirty = true; });
    if (typeof document !== 'undefined') this.buildIpInput();
    this.startTimers();
    this.Refresh();
    // The screen system removes replaced screens with removeMovieClip (CScreen.Dispose is never called) - the
    // DOM input / timers / bridge subscription must go with the clip, or the black IP box lingers over the
    // next screen (user-reported) and the discovery tick leaks.
    this.onUnload = (): void => this.teardown();
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

  /** Removes every side object outside the canvas (also wired to onUnload - see ctor). */
  private teardown(): void {
    this.unregisterUi?.();
    this.unregisterUi = undefined;
    this.unresize?.();
    this.unresize = undefined;
    if (this.tickTimer !== undefined && typeof window !== 'undefined') window.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    this.ipInput?.remove();
    this.ipInput = undefined;
  }

  override Dispose(): void {
    this.teardown();
    super.Dispose();
  }

  Text(x: number, y: number, w: number, h: number, font: string, size: number, color: number, bold: boolean,
    align: 'left' | 'right' | 'center', value: string, multiline = false): any {
    return text(this.panel ?? this, 'tf' + this.mDepth++, x, y, w, h, font, size, color, bold, align, value, multiline);
  }

  /** A UiStyle pill button centred on (x, y) INSIDE the panel; the unique-name rule still applies (see ctor note). */
  Button(x: number, y: number, w: number, h: number, label: string, size: number, onPress: () => void,
    opts: { selected?: boolean } = {}): any {
    const b = pillButton(this.panel ?? this, 'b' + this.mDepth, x, y, w, h, label, size, opts);
    this.mDepth++;
    b.onRelease = function (this: any): void {
      onPress();
      this.pScreen.dirty = true;
    };
    b.pScreen = this;
    return b;
  }

  private Build(): void {
    // ---- the shared options-window card (dims the menu background, swallows stray clicks)
    this.panel = panelCard(this);

    // NOTE: the element passed to entry()/room() must be the display object itself - never
    // `this.Text(...).filters = x` (that expression evaluates to the FILTER ARRAY, and _visible on an array is a
    // silent no-op, so the text would stay visible in BOTH views).
    const entry = (el: any): void => { this.entryEls.push(el); };
    const room = (el: any): void => { this.roomEls.push(el); };
    const heading = (label: string, x: number): any => {
      const h = this.Text(x, -100, 210, 20, MENU_FONT, 15, RED, true, 'left', label);
      h.filters = glow();
      return h;
    };

    // ---- ENTRY view (nothing hosted / connected yet): CREATE column left, discovery + IP right
    entry((() => { const t = this.Text(-230, -152, 460, 30, MENU_FONT, 24, INK, false, 'center', 'LAN GAME'); t.filters = glow(); return t; })());
    entry((() => { const d = this.panel.createEmptyMovieClip('divider', this.panel.getNextHighestDepth()); d.lineStyle(2, 0xd8d8d8); d.moveTo(0, -78); d.lineTo(0, 112); return d; })());
    entry(heading('CREATE A ROOM', -222));
    entry(this.Text(-222, -74, 200, 34, BODY_FONT, 11, INK, false, 'left', 'Set up a room on this machine - player 2 joins from theirs.', true));
    entry(this.Button(-117, -6, 150, 30, 'CREATE ROOM', 15, () => lanBridge().host()));
    entry(this.Text(12, 80, 210, 14, BODY_FONT, 11, INK, true, 'left', 'OR JOIN BY IP ADDRESS'));
    // the DOM input sits over (-225..-60, 78..102); JOIN sits right of it
    entry(this.Button(200, 110, 60, 26, 'JOIN', 13, () => this.joinByIp()));

    entry(heading('JOIN A ROOM', 12));
    this.searchingText = this.Text(12, -74, 208, 16, BODY_FONT, 11, GREY, false, 'left', 'searching for games on your network...');
    entry(this.searchingText);
    for (let i = 0; i < 5; i++) {
      const idx = i;
      const row = this.Button(115, -60 + i * 30, 210, 24, '', 11, () => {
        const b = lanBridge();
        const h = b.hosts[idx] as any;
        if (h && h.status === 'lobby' && h.players === 1) b.join(h.ip, h.port);
      });
      this.hostRows.push(row);
      entry(row);
    }

    // ---- ROOM view (hosting / connected / during a reconnect window)
    room((() => { const t = this.Text(-230, -152, 460, 30, MENU_FONT, 24, INK, false, 'center', 'GAME ROOM'); t.filters = glow(); return t; })());
    this.statusText = this.Text(-230, -122, 460, 16, BODY_FONT, 11, RED, true, 'center', '');
    this.pingText = this.Text(100, -20, 125, 16, BODY_FONT, 11, GREEN, true, 'right', '');
    room(this.pingText);
    this.addrText = this.Text(-230, -104, 460, 16, BODY_FONT, 11, INK, true, 'center', '');
    room(this.addrText);
    room(this.Text(-222, -80, 180, 18, BODY_FONT, 14, INK, true, 'left', 'PLAYER 1 (HOST)'));
    room(this.Text(15, -80, 200, 18, BODY_FONT, 13, GREEN, true, 'right', 'READY'));
    this.p2Row = this.Text(-222, -48, 230, 18, BODY_FONT, 14, INK, true, 'left', 'PLAYER 2');
    room(this.p2Row);
    this.p2Badge = this.Text(15, -48, 200, 18, BODY_FONT, 13, GREY, true, 'right', 'WAITING');
    room(this.p2Badge);
    this.inputsText = this.Text(-222, -20, 290, 16, BODY_FONT, 11, GREY, false, 'left', 'YOUR INPUTS: KEYBOARD');
    room(this.inputsText);
    room(this.Button(0, 64, 170, 24, 'GAME SETTINGS', 12, () => this.roomSettings.open()));

    this.resumeText = this.Text(-230, 8, 460, 16, BODY_FONT, 12, INK, true, 'center', 'LAST GAME AVAILABLE');
    room(this.resumeText);
    this.resumeBtn = this.Button(0, 36, 190, 28, 'RESUME GAME', 14, () => lanBridge().requestRetry());
    room(this.resumeBtn);

    this.readyBtn = this.Button(-110, 96, 150, 28, 'READY', 15, () => lanBridge().setReady(!lanBridge().ready), { selected: true });
    room(this.readyBtn);
    this.leaveBtn = this.Button(110, 96, 150, 28, 'LEAVE', 15, () => lanBridge().leaveLobby());
    room(this.leaveBtn);
    this.startBtn = this.Button(-110, 96, 150, 28, 'START', 15, () => lanBridge().enterSetup(), { selected: true });
    room(this.startBtn);
    this.startHint = this.Text(-230, 115, 460, 14, BODY_FONT, 11, GREY, false, 'center', 'waiting for player 2 to get ready');
    room(this.startHint);
    this.closeBtn = this.Button(110, 96, 150, 28, 'CLOSE ROOM', 14, () => lanBridge().leaveLobby());
    room(this.closeBtn);

    // shared (both views): the status line under the title + BACK at the panel's lower edge
    this.bBack = this.Button(0, 148, 170, 28, 'BACK TO MENU', 14, () => {
      lanBridge().leaveLobby();
      this.nState = 'State_Main';
    });
  }

  /** The manual-IP entry is a DOM input over the canvas (canvas text cannot be edited). */
  private buildIpInput(): void {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '192.168.x.x';
    input.maxLength = 21;
    // display:none until the first Refresh has placed it (otherwise the input flashes for a frame at the stage's
    // top-left corner before contentToClient positions it). v0.2.2: the white-pill look of the panel's own controls.
    input.style.cssText = 'position:absolute;display:none;box-sizing:border-box;background:#f5f5f3;border:1px solid #d8d8d8;'
      + 'border-radius:12px;color:#1f1f1f;font-family:Calibri,Arial,sans-serif;font-weight:bold;text-align:center;'
      + 'padding:0 4px;z-index:7;outline:none';
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.joinByIp();
    });
    input.addEventListener('focus', () => { input.style.borderColor = '#ef1304'; });
    input.addEventListener('blur', () => { input.style.borderColor = '#d8d8d8'; });
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
      // DYNAMIC_VIEWPORT: IP_BOX is authored-content (640x480 screen) space - the content is centred on the grown
      // stage, so glue through contentToClient (identity to logicalToClient at 4:3 windows).
      const a = presenter.contentToClient(IP_BOX.x, IP_BOX.y);
      const b = presenter.contentToClient(IP_BOX.x + IP_BOX.w, IP_BOX.y + IP_BOX.h);
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
    if (!room) this.roomSettings.root._visible = false;
    this.roomSettings.refresh();
    for (const el of this.entryEls) el._visible = entry;
    for (const el of this.roomEls) el._visible = room;
    if (this.ipInput) this.ipInput.style.display = entry ? 'block' : 'none';
    this.placeInput();

    // Entry: the discovery list (empty rows are HIDDEN, not blank plates - the searching hint then takes the
    // space; joinable rooms bright, full / in-game dim).
    this.searchingText._visible = entry && b.hosts.length === 0;
    for (let i = 0; i < this.hostRows.length; i++) {
      const h = b.hosts[i] as any;
      const row = this.hostRows[i];
      row._visible = entry && !!h; // no host on this slot -> no plate at all
      if (!h) continue;
      const name = String(h.name ?? '?').slice(0, 16);
      setButtonLabel(row, `${name} · ${h.players}/2 · ${h.status === 'lobby' ? 'WAITING' : 'IN GAME'}`);
      setButtonEnabled(row, h.status === 'lobby' && h.players === 1);
    }

    // Room: players, ready states, ping, the host's own address (join-by-IP for player 2).
    if (this.addrText) {
      const show = room && b.isHost && (b.phase === 'hosting' || b.phase === 'lobby');
      this.addrText._visible = show;
      const a = b.hostAddrs[0];
      this.addrText.text = a
        ? `YOUR ADDRESS: ${a} - give it to player 2 to join by IP`
        : 'YOUR ADDRESS: unknown - player 2 can still find this room in the list';
    }
    if (this.pingText) {
      const rtt = b.rttMs;
      this.pingText._visible = room && rtt !== undefined && !!b.peerName;
      if (rtt !== undefined) this.pingText.text = `PING ${rtt <= 0 ? '<1' : Math.round(rtt)} MS`;
    }
    if (this.p2Row) this.p2Row.text = b.peerName ? `PLAYER 2 - ${String(b.peerName).slice(0, 14)}` : 'PLAYER 2';
    if (this.inputsText) this.inputsText.text = `YOUR INPUTS: ${inputSummary()}`;
    if (this.p2Badge) {
      if (!b.peerName) { this.p2Badge.text = 'WAITING'; this.p2Badge.textColor = GREY; }
      else if (!b.ready) { this.p2Badge.text = 'NOT READY'; this.p2Badge.textColor = RED; }
      else { this.p2Badge.text = 'READY'; this.p2Badge.textColor = GREEN; }
    }
    // v0.2.1: the strip appears after EVERY finished game. A surviving checkpoint keeps the old RESUME semantics;
    // without one (died before the first wave advance / DM tick 1500) it becomes the failed-wave RETRY instead -
    // the net analog of the local debrief fallback (see NetSession.retryStart).
    const sess = b.session;
    const ended = sess?.phase === 'ended' && !!sess.startOpts;
    const canResume = b.isHost && ended && !!sess!.netCheckpoint;
    const canRetryFresh = b.isHost && ended && !sess!.netCheckpoint;
    const showRetryStrip = canResume || canRetryFresh;
    if (this.resumeText) {
      this.resumeText._visible = room && showRetryStrip;
      this.resumeText.text = canResume ? 'LAST GAME AVAILABLE' : 'GAME OVER - RETRY AVAILABLE';
    }
    if (this.resumeBtn) {
      this.resumeBtn._visible = room && showRetryStrip;
      if (showRetryStrip) this.resumeBtn._Contents._Label.text = canResume ? 'RESUME GAME' : `RETRY AT WAVE ${getRunStartWave()}`;
    }

    // Client: READY toggle; Host: START (gated on player 2 being connected AND ready) + CLOSE ROOM.
    const bothReady = !!b.peerName && b.ready;
    if (this.readyBtn) this.readyBtn._visible = room && !b.isHost && b.phase !== 'playing';
    if (this.leaveBtn) this.leaveBtn._visible = room && !b.isHost && b.phase !== 'playing';
    if (this.startBtn) {
      this.startBtn._visible = room && b.isHost && b.phase === 'lobby';
      setButtonEnabled(this.startBtn, bothReady, 40);
    }
    if (this.startHint) this.startHint._visible = room && b.isHost && b.phase === 'lobby' && !bothReady;
    if (this.closeBtn) this.closeBtn._visible = room && b.isHost && b.phase !== 'playing';

    if (this.statusText) this.statusText.text = b.message || this.statusFor(b);
  }

  private statusFor(b: ReturnType<typeof lanBridge>): string {
    if (b.phase === 'hosting') return 'waiting for player 2 to join...';
    if (b.phase === 'lobby' && b.isHost) return b.ready ? 'both players ready - choose game settings' : 'waiting for player 2 to get ready';
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
