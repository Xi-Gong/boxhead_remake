// LAN lobby screen (deviation LAN_MULTIPLAYER, v0.1.3): a real screen of the game's screen system (like the
// instructions page: a synthetic frame of original characters + drawn text/buttons, original cross-fade transition).
// Host side: host / configure (mode, difficulty, DM frags, room) / start; client side: discover hosts on the LAN,
// join by click or manual IP, pick player 2's character. After a finished net game both sides land back here and
// the host may offer RESUME GAME (续局) from the surviving checkpoint. All state lives in the bridge (bridge.ts).
import { TextFormat, flash, proto, registerClass } from '../../../engine/runtime.ts';
import { CScreen } from '../../Screen/CScreen.ts';
import { lanBridge } from './bridge.ts';
import { buildMenuButton, SCREEN_LAN_LOBBY_LINKAGE } from '../localSymbols.ts';

const INK = 0x333333;
const ACCENT = 0xcc0000;
const DIFFICULTY = ['BEGINNER', 'INTERMEDIATE', 'EXPERT', 'NIGHTMARE'];
const FRAGS = [5, 10, 20, 50];
const CHARACTERS = ['SWAT', 'BOND', 'GI JOE', 'BAMBO'];

function glow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2)];
}

function menuShadow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2), new flash.filters.DropShadowFilter(5, 45, 0x000000, 1, 5, 5, 0.18, 1)];
}

export class CScreen_LanLobby extends CScreen {
  // NOTE: display objects are created with Object.create - field initializers never run (engine DisplayObject.ts).
  // Everything is assigned in ctor() below.
  private dirty!: boolean;
  private ipInput: HTMLInputElement | undefined;
  bMode: any;
  bDiff: any;
  bFrags: any;
  bRoom: any;
  bChar: any;
  /** HOST / WAITING / START GAME / RESUME GAME. */
  bAction: any;
  bBack: any;
  private statusText: any;
  private peerText: any;
  private hostRows!: any[];
  private unregisterUi: (() => void) | undefined;

  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.dirty = true;
    this.hostRows = [];
    this.Build();
    this.unregisterUi = lanBridge().onUi(() => { this.dirty = true; });
    if (typeof document !== 'undefined') this.buildIpInput();
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
    const b = buildMenuButton(this, 'b' + this.mDepth, x, y, w, h, label, size);
    b.onRelease = function (this: any): void {
      onPress();
      this.pScreen.dirty = true;
    };
    b.pScreen = this;
    return b;
  }

  private Build(): void {
    this.Text(150, 12, 340, 40, 'Arial Rounded MT Bold', 30, INK, false, 'center', 'LAN GAME').filters = menuShadow();
    this.Text(20, 44, 600, 20, 'Calibri', 13, ACCENT, true, 'center', '', false); // status line (Refresh keeps it)
    this.statusText = this['tf' + (this.mDepth - 1)];
    this.Text(30, 76, 270, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', 'HOST GAME').filters = menuShadow();
    this.Text(330, 76, 280, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', 'JOIN GAME').filters = menuShadow();

    // Host column.
    this.Text(30, 106, 130, 18, 'Calibri', 14, INK, true, 'left', 'MODE').filters = glow();
    this.bMode = this.Button(200, 115, 100, 22, '', 12, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, mode: b.cfg.mode === 'Coop' ? 'DeathMatch' : 'Coop' });
    });
    this.Text(30, 132, 130, 18, 'Calibri', 14, INK, true, 'left', 'DIFFICULTY').filters = glow();
    this.bDiff = this.Button(200, 141, 100, 22, '', 12, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, difficulty: (b.cfg.difficulty + 1) % 4 });
    });
    this.Text(30, 158, 130, 18, 'Calibri', 14, INK, true, 'left', 'FRAGS').filters = glow();
    this.bFrags = this.Button(200, 167, 100, 22, '', 12, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, killsIdx: (b.cfg.killsIdx + 1) % 4 });
    });
    this.Text(30, 184, 130, 18, 'Calibri', 14, INK, true, 'left', 'ROOM').filters = glow();
    this.Button(168, 193, 26, 22, '<', 14, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, roomIdx: (b.cfg.roomIdx + 17) % 18 });
    });
    this.bRoom = this.Button(232, 193, 70, 22, '', 12, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, roomIdx: (b.cfg.roomIdx + 1) % 18 });
    });
    this.Button(296, 193, 26, 22, '>', 14, () => {
      const b = lanBridge();
      b.pushCfg({ ...b.cfg, roomIdx: (b.cfg.roomIdx + 1) % 18 });
    });
    this.Text(30, 224, 290, 18, 'Calibri', 12, INK, false, 'left', '', true).filters = glow();
    this.peerText = this['tf' + (this.mDepth - 1)];
    this.bAction = this.Button(175, 252, 150, 26, 'HOST', 15, () => this.onAction());

    // Join column.
    for (let i = 0; i < 5; i++) {
      const row = this.Button(330, 106 + i * 26, 280, 22, '', 11, () => {
        const b = lanBridge();
        const h = b.hosts[i];
        if (h) b.join(h.ip, h.port);
      });
      this.hostRows.push(row);
    }
    this.Button(395, 244, 150, 22, 'REFRESH', 12, () => lanBridge().refresh());
    this.Text(330, 276, 30, 18, 'Calibri', 14, INK, true, 'left', 'IP').filters = glow();
    this.Button(585, 285, 55, 22, 'JOIN', 12, () => {
      const ip = (this.ipInput?.value ?? '').trim();
      if (ip) lanBridge().join(ip);
    });
    this.Text(330, 314, 130, 18, 'Calibri', 14, INK, true, 'left', 'CHARACTER').filters = glow();
    this.bChar = this.Button(500, 323, 110, 22, '', 12, () => {
      const b = lanBridge();
      b.charP2 = (b.charP2 + 1) % 4;
    });

    this.Text(20, 350, 600, 30, 'Calibri', 11, INK, false, 'center',
      'Both players share the host settings. On either machine every key set (arrows or WASD) and every gamepad drives the local player.', true).filters = glow();
    this.bBack = this.Button(320, 410, 180, 26, 'BACK TO MENU', 14, () => {
      lanBridge().leaveLobby();
      this.nState = 'State_Main';
    });
  }

  private onAction(): void {
    const b = lanBridge();
    if (b.phase === 'idle' || b.phase === 'error') {
      b.host();
      return;
    }
    if (b.phase === 'lobby') {
      b.startGame(false);
      return;
    }
    if (b.phase === 'playing' && b.session?.phase === 'ended' && b.session.netCheckpoint) {
      b.startGame(true); // 续局: continue from the surviving checkpoint
    }
  }

  /** The manual-IP entry is a DOM input over the canvas (canvas text cannot be edited). */
  private buildIpInput(): void {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '192.168.x.x';
    input.maxLength = 15;
    input.style.cssText = 'position:absolute;width:34%;left:38%;top:60.5%;background:#181818;border:2px solid #9c9c9c;'
      + 'color:#fff;font:13px Consolas,monospace;text-align:center;padding:1px 4px;z-index:7';
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const ip = input.value.trim();
        if (ip) lanBridge().join(ip);
      }
    });
    stage.appendChild(input);
    this.ipInput = input;
  }

  private Refresh(): void {
    const b = lanBridge();
    const cfg = b.cfg;
    const setLabel = (btn: any, text: string): void => { if (btn?._Contents?._Label) btn._Contents._Label.text = text; };
    setLabel(this.bMode, cfg.mode === 'Coop' ? 'COOP' : 'DEATHMATCH');
    setLabel(this.bDiff, DIFFICULTY[cfg.difficulty]!);
    setLabel(this.bFrags, String(FRAGS[cfg.killsIdx]));
    setLabel(this.bRoom, 'ROOM ' + (cfg.roomIdx + 1));
    setLabel(this.bChar, CHARACTERS[b.charP2]!);
    for (let i = 0; i < this.hostRows.length; i++) {
      setLabel(this.hostRows[i], b.hosts[i] ? `${(b.hosts[i] as any).name}  (${(b.hosts[i] as any).status})` : '');
    }
    if (this.statusText) this.statusText.text = b.message || this.statusFor(b);
    if (this.peerText) {
      this.peerText.text = b.phase === 'lobby'
        ? `PLAYER 2: ${b.peerName || '...'}${b.session?.netCheckpoint && b.session.phase === 'ended' ? '  (resume available)' : ''}`
        : '';
    }
    if (this.bAction) {
      let label = 'HOST';
      let visible = true;
      if (b.phase === 'hosting') label = 'WAITING...';
      else if (b.phase === 'lobby') label = 'START GAME';
      else if (b.phase === 'playing') {
        if (b.session?.phase === 'ended' && b.session.netCheckpoint) label = 'RESUME GAME';
        else visible = false;
      }
      this.bAction._visible = visible;
      this.bAction.enabled = visible && b.phase !== 'joining';
      setLabel(this.bAction, label);
    }
    // The manual-IP box only matters before a connection exists.
    if (this.ipInput) this.ipInput.style.display = b.phase === 'idle' || b.phase === 'error' || b.phase === 'joining' ? 'block' : 'none';
  }

  private statusFor(b: ReturnType<typeof lanBridge>): string {
    if (b.phase === 'lobby') return b.session ? 'CONNECTED - the host starts the game' : 'CONNECTED';
    if (b.phase === 'hosting') return 'HOSTING - waiting for player 2...';
    if (b.phase === 'playing' && b.session?.phase === 'reconnecting') return `RECONNECTING... ${b.session.reconnectSecondsLeft()}s`;
    return '';
  }
}
proto(CScreen_LanLobby, { _CLASSID_: 'CScreen_LanLobby' });

/** Register the lobby class for its synthetic linkage (the symbol itself is added by installLocalSymbols). */
export function registerLobbyPage(): void {
  registerClass(SCREEN_LAN_LOBBY_LINKAGE, CScreen_LanLobby);
}
