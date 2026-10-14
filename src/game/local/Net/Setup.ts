// LAN net setup screen (deviation LAN_MULTIPLAYER, v0.1.4): the traditional 2-player select look - the ORIGINAL
// SubScreen_Coop / SubScreen_DeathMatch art (two character cards with < > arrows, the 18-level selector, the mode
// headings) is attached verbatim, so the page is pixel-identical to the local CScreen_SelectWorld content. The HOST
// drives every control (mode, both characters, level, difficulty, frags); each change mirrors to the client through
// bridge.setSel -> {t:'setup'} and the client's copy renders read-only behind a WAITING FOR HOST banner. START GAME
// launches both sides through bridge.startGame(false) (level -> ROOM_Single_00XX, characters -> GameConfig).
import { TextFormat, flash, proto, registerClass } from '../../../engine/runtime.ts';
import { CScreen } from '../../Screen/CScreen.ts';
import { CScreen_SelectWorld } from '../../Screen/CScreen_SelectWorld.ts';
import { CSound } from '../../packages.ts';
import { lanBridge } from './bridge.ts';
import { buildMenuButton, SCREEN_LAN_SETUP_LINKAGE } from '../localSymbols.ts';
import type { SetupSelection } from './protocol.ts';

const INK = 0x333333;
const GREEN = 0x00ff00;
const DIFFICULTY = ['BEGINNER', 'INTERMEDIATE', 'EXPERT', 'NIGHTMARE'];
const FRAGS = [5, 10, 20, 50];

function glow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2)];
}

export class CScreen_LanSetup extends CScreen {
  // NOTE: display objects are created with Object.create - field initializers never run (engine DisplayObject.ts).
  // Everything is assigned in ctor() below.
  private dirty!: boolean;
  private unregisterUi: (() => void) | undefined;
  private mcSubScreen: any;
  private subMode!: string;
  private bMode: any;
  private bDiff: any;
  private bFrags: any;
  private bStart: any;
  private bBack: any;
  private bLeave: any;
  private waitText: any;

  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.dirty = true;
    this.subMode = '';
    this.Build();
    this.unregisterUi = lanBridge().onUi(() => { this.dirty = true; });
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
    super.Dispose();
  }

  Text(x: number, y: number, w: number, h: number, font: string, size: number, color: number, bold: boolean,
    align: 'left' | 'right' | 'center', text: string): any {
    const tf = this.createTextField('tf' + this.mDepth, this.mDepth++, x, y, w, h);
    tf.embedFonts = true;
    tf.selectable = false;
    tf.setNewTextFormat(new TextFormat(font, size, color, bold, false, false, undefined, undefined, align));
    tf.text = text;
    return tf;
  }

  Button(x: number, y: number, w: number, h: number, label: string, size: number, onPress: () => void): any {
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
    // Option plates across the top (labels live on the plates; only the host's clicks do anything).
    this.Text(30, 46, 60, 18, 'Calibri', 13, INK, true, 'left', 'MODE').filters = glow();
    this.bMode = this.Button(160, 55, 170, 24, '', 12, () => this.cycleMode());
    this.Text(245, 46, 90, 18, 'Calibri', 13, INK, true, 'left', 'DIFFICULTY').filters = glow();
    this.bDiff = this.Button(375, 55, 180, 24, '', 12, () => {
      const b = lanBridge();
      b.setSel({ ...b.sel, difficulty: (b.sel.difficulty + 1) % 4 });
    });
    this.Text(480, 46, 50, 18, 'Calibri', 13, INK, true, 'left', 'FRAGS').filters = glow();
    this.bFrags = this.Button(565, 55, 110, 24, '', 12, () => {
      const b = lanBridge();
      b.setSel({ ...b.sel, gameAmount: (b.sel.gameAmount + 1) % 4 });
    });

    // The client only waits (or leaves); the host starts or goes back to the room.
    this.waitText = this.Text(120, 84, 400, 20, 'Calibri', 14, GREEN, true, 'center', 'WAITING FOR HOST...');
    this.waitText.filters = glow();
    this.bStart = this.Button(320, 452, 180, 28, 'START GAME', 15, () => lanBridge().startGame(false));
    this.bBack = this.Button(90, 452, 140, 24, 'BACK', 13, () => lanBridge().backToRoom());
    this.bLeave = this.Button(550, 452, 140, 24, 'LEAVE', 13, () => lanBridge().leaveLobby());
  }

  /** Attach the original SubScreen for the current mode (its art = the traditional select screen). */
  private attachSubScreen(): void {
    const b = lanBridge();
    this.subMode = b.sel.mode;
    if (this.mcSubScreen) this.mcSubScreen.removeMovieClip();
    this.mcSubScreen = this.attachMovie('SubScreen_' + this.subMode, 'mcSubScreen', 10);
    // Level preview inside the selector (what the original Setup_LevelSelection does), without the exclusive /
    // highscore bits (site-lock dead code): the shadow filters move onto the icons, as in the original.
    const sel = this.mcSubScreen.mcLevel_Selection;
    sel.mcLevelIcons = sel.attachMovie('LevelIcons_Single', '_mcLevelIcons', sel.getNextHighestDepth());
    sel.mcLevelIcons.filters = sel._Shadow.filters;
    sel._Shadow._visible = false;
    sel.mcLevelIcons._ViewHighScore._visible = false;
    sel.mcLevelIcons.mcExclusive._visible = false;
    if (b.isHost) {
      this.wireChar(this.mcSubScreen.mcPlayer1_Character, 'charP1');
      this.wireChar(this.mcSubScreen.mcPlayer2_Character, 'charP2');
      sel.bLeft.onRelease = () => this.cycleLevel(-1);
      sel.bRight.onRelease = () => this.cycleLevel(1);
    } else {
      // Mirror only: dim the arrows so it is obvious they are not ours to press.
      this.mcSubScreen.mcPlayer1_Character.bLeft._alpha = 50;
      this.mcSubScreen.mcPlayer1_Character.bRight._alpha = 50;
      this.mcSubScreen.mcPlayer2_Character.bLeft._alpha = 50;
      this.mcSubScreen.mcPlayer2_Character.bRight._alpha = 50;
      sel.bLeft._alpha = 50;
      sel.bRight._alpha = 50;
    }
  }

  private wireChar(mc: any, key: 'charP1' | 'charP2'): void {
    mc.bLeft.onRelease = () => this.cycleChar(key, -1);
    mc.bRight.onRelease = () => this.cycleChar(key, 1);
  }

  private cycleChar(key: 'charP1' | 'charP2', d: number): void {
    CSound.mSamples.Click2.PlaySound();
    const b = lanBridge();
    const v = (b.sel[key] + d + 4) % 4;
    b.setSel({ ...b.sel, [key]: v });
  }

  private cycleLevel(d: number): void {
    CSound.mSamples.Click2.PlaySound();
    const b = lanBridge();
    b.setSel({ ...b.sel, levelIdx: (b.sel.levelIdx + d + 18) % 18 });
  }

  private cycleMode(): void {
    CSound.mSamples.Click2.PlaySound();
    const b = lanBridge();
    b.setSel({ ...b.sel, mode: b.sel.mode === 'Coop' ? 'DeathMatch' : 'Coop' });
  }

  private Refresh(): void {
    const b = lanBridge();
    if (b.phase !== 'setup' && b.phase !== 'playing') {
      this.nState = 'State_LanLobby';
      return;
    }
    const sel = b.sel;
    if (sel.mode !== this.subMode) this.attachSubScreen();

    const setLabel = (btn: any, text: string): void => { if (btn?._Contents?._Label) btn._Contents._Label.text = text; };
    setLabel(this.bMode, sel.mode === 'Coop' ? 'CO-OP' : 'DEATHMATCH');
    setLabel(this.bDiff, DIFFICULTY[sel.difficulty]!);
    setLabel(this.bFrags, String(FRAGS[sel.gameAmount]!));
    this.bFrags._visible = sel.mode === 'DeathMatch';
    this.bFrags.enabled = sel.mode === 'DeathMatch';

    // Mirror the selection into the original art (preview frames are 1-based).
    if (this.mcSubScreen) {
      CScreen_SelectWorld.mcGotoFrame(this.mcSubScreen.mcPlayer1_Character.mcCharacter, sel.charP1, true);
      CScreen_SelectWorld.mcGotoFrame(this.mcSubScreen.mcPlayer2_Character.mcCharacter, sel.charP2, true);
      this.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(sel.levelIdx + 1);
    }

    const host = b.isHost;
    this.waitText._visible = !host;
    this.bStart._visible = host;
    this.bBack._visible = host;
    this.bLeave._visible = !host;
    this.bMode._alpha = host ? 100 : 55;
    this.bDiff._alpha = host ? 100 : 55;
    this.bFrags._alpha = host ? 100 : 55;
  }
}
proto(CScreen_LanSetup, { _CLASSID_: 'CScreen_LanSetup' });

/** Register the setup class for its synthetic linkage (the symbol itself is added by installLocalSymbols). */
export function registerSetupPage(): void {
  registerClass(SCREEN_LAN_SETUP_LINKAGE, CScreen_LanSetup);
}
