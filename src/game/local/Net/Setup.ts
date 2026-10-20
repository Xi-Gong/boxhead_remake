// LAN net setup screen (deviation LAN_MULTIPLAYER, v0.1.4): the traditional 2-player select look - the ORIGINAL
// SubScreen_Coop / SubScreen_DeathMatch art (two character cards with < > arrows, the 18-level selector, the mode
// headings) is attached verbatim, so the page is pixel-identical to the local CScreen_SelectWorld content. The HOST
// drives every control (mode, both characters, level, difficulty, frags); each change mirrors to the client through
// bridge.setSel -> {t:'setup'} and the client's copy renders read-only behind a WAITING FOR HOST banner. START GAME
// launches both sides through bridge.startGame(false) (level -> ROOM_Single_00XX, characters -> GameConfig).
import { proto, registerClass } from '../../../engine/runtime.ts';
import { CScreen } from '../../Screen/CScreen.ts';
import { CScreen_SelectWorld } from '../../Screen/CScreen_SelectWorld.ts';
import { CSound } from '../../packages.ts';
import { lanBridge } from './bridge.ts';
import { RoomSettingsPanel } from './RoomSettingsPanel.ts';
import { WaveInput } from '../WaveInput.ts';
import { waveArrow } from '../StartWaveUi.ts';
import { showWaveLimit } from '../TimedWaveUi.ts';
import { SCREEN_LAN_SETUP_LINKAGE } from '../localSymbols.ts';
import { BODY_FONT, GREY, INK, glow, pillButton, setButtonEnabled, setButtonLabel, text } from '../UiStyle.ts';


const DIFFICULTY = ['BEGINNER', 'INTERMEDIATE', 'EXPERT', 'NIGHTMARE'];
const FRAGS = [5, 10, 20, 50];

export class CScreen_LanSetup extends CScreen {
  // NOTE: display objects are created with Object.create - field initializers never run (engine DisplayObject.ts).
  // Everything is assigned in ctor() below.
  private dirty!: boolean;
  private unregisterUi: (() => void) | undefined;
  private mcSubScreen: any;
  private widgets: any;
  private subMode!: string;
  private bMode: any;
  private bDiff: any;
  private bFrags: any;
  private fragsLabel: any;
  private bWave: any;
  private bWaveLabel: any;
  private bBest: any;
  private bStart: any;
  private bBack: any;
  private bLeave: any;
  private waitText: any;
  private roomSettings!: RoomSettingsPanel;
  waveInput!: WaveInput;
  private waveLeft: any;
  private waveRight: any;

  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.dirty = true;
    this.subMode = '';
    // The SubScreen must claim its fixed depth 10 BEFORE the widgets allocate: v0.2.2 moved text/pillButton
    // to getNextHighestDepth() allocation, and with the art attached after Build() the difficulty plate
    // landed exactly on depth 10 and was evicted by insertChild (label survived, value vanished).
    this.attachSubScreen();
    // Authored SubScreen masks occupy depths beyond 10. Keep added controls in their own layer above that
    // range: a mode switch must not mask individual labels/plates that happen to share authored depths.
    this.widgets = this.createEmptyMovieClip('_SetupControls', 100);
    this.Build();
    this.roomSettings = new RoomSettingsPanel(this);
    this.unregisterUi = lanBridge().onUi(() => { this.dirty = true; });
    this.Refresh();
    // The screen system removes replaced screens with removeMovieClip (CScreen.Dispose is never called) -
    // unsubscribe from the bridge when the clip goes, or the dead screen keeps refreshing forever.
    const previousUnload = this.onUnload;
    this.onUnload = (): void => {
      previousUnload?.call(this);
      this.unregisterUi?.();
      this.unregisterUi = undefined;
    };
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
    this.waveInput.refresh();
  }

  override Dispose(): void {
    this.waveInput.dispose();
    this.unregisterUi?.();
    super.Dispose();
  }

  Text(x: number, y: number, w: number, h: number, font: string, size: number, color: number, bold: boolean,
    align: 'left' | 'right' | 'center', value: string): any {
    return text(this.widgets, 'tf' + this.mDepth++, x, y, w, h, font, size, color, bold, align, value);
  }

  /** A UiStyle pill button centred on (x, y) (v0.2.2 restyle - the select screens' control language). */
  Button(x: number, y: number, w: number, h: number, label: string, size: number, onPress: () => void,
    opts: { selected?: boolean } = {}): any {
    const b = pillButton(this.widgets, 'b' + this.mDepth, x, y, w, h, label, size, opts);
    this.mDepth++;
    b.onRelease = function (this: any): void {
      onPress();
      this.pScreen.dirty = true;
    };
    b.pScreen = this;
    return b;
  }

  private Build(): void {
    // MODE sits alone in the free top-left band (the SubScreen's own baked headings own the y55..135 centre);
    // DIFFICULTY / FRAGS live in the band between the level-name plate (~y372) and the bottom buttons (y440).
    // Labels sit above their value plates, leaving the level preview and footer unobstructed.
    const modeLabel = this.Text(30, 12, 55, 16, 'Calibri', 12, INK, true, 'left', 'MODE');
    modeLabel.filters = glow();
    this.bMode = this.Button(165, 24, 140, 22, '', 12, () => this.cycleMode());
    this.Button(533, 24, 164, 24, 'GAME SETTINGS', 12, () => this.roomSettings.open());
    const diffLabel = this.Text(230, 369, 180, 16, 'Calibri', 12, INK, true, 'center', 'DIFFICULTY');
    diffLabel.filters = glow();
    this.bDiff = this.Button(320, 399, 180, 24, '', 12, () => {
      const b = lanBridge();
      b.setSel({ ...b.sel, difficulty: (b.sel.difficulty + 1) % 4 });
    });
    this.fragsLabel = this.Text(472, 369, 128, 16, 'Calibri', 12, INK, true, 'center', 'FRAGS');
    this.fragsLabel.filters = glow();
    this.bFrags = this.Button(536, 399, 128, 24, '', 12, () => {
      const b = lanBridge();
      b.setSel({ ...b.sel, gameAmount: (b.sel.gameAmount + 1) % 4 });
    });
    // START_WAVE_SELECTOR (v0.1.9): the wave plate shares the frags slot - Coop shows the wave, Death Match the
    // frag limit (the only mode-dependent control of that band, like the local screen's DM-hidden cycler).
    this.bWaveLabel = this.Text(472, 369, 128, 16, 'Calibri', 12, INK, true, 'center', 'WAVE');
    this.bWaveLabel.filters = glow();
    this.bWave = this.Button(536, 399, 90, 24, '', 14, () => this.waveInput.focus());
    this.waveInput = new WaveInput({screen:this,field:this.bWave._Contents._Label,rect:{x:491,y:387,w:90,h:24},
      get:()=>lanBridge().sel.wave ?? 1, set:wave=>{const b=lanBridge();b.setSel({...b.sel,wave});},
      max:()=>lanBridge().sel.maxWave ?? 100, editable:()=>lanBridge().isHost,
      visible:()=>lanBridge().sel.mode==='Coop'&&!this.roomSettings.root._visible});
    this.waveLeft=waveArrow(this.widgets,'_WaveLeft',476,399,-1,()=>this.waveInput.cycle(-1));
    this.waveRight=waveArrow(this.widgets,'_WaveRight',596,399,1,()=>this.waveInput.cycle(1));
    // START_WAVE_SELECTOR (v0.2.4): the host's historical best wave = the cycler's cap, mirrored to the client with
    // every setup change - small grey copy centred under the plate, in the gap above the bottom button row.
    this.bBest = this.Text(472, 414, 128, 14, BODY_FONT, 11, GREY, true, 'center', 'BEST 1');
    this.bBest.filters = glow();

    // The client only waits (or leaves); the host starts or goes back to the room. START GAME carries the
    // options-window selected wash (the primary action); WAITING uses the body ink like the original status copy.
    this.waitText = this.Text(170, 436, 300, 18, BODY_FONT, 14, INK, true, 'center', 'WAITING FOR HOST...');
    this.waitText.filters = glow();
    this.bStart = this.Button(320, 444, 180, 28, 'START GAME', 15, () => {
      if (lanBridge().sel.mode !== 'Coop' || this.waveInput.commit()) lanBridge().startGame(false);
    }, { selected: true });
    this.bBack = this.Button(90, 444, 140, 24, 'BACK', 13, () => lanBridge().backToRoom());
    this.bLeave = this.Button(550, 444, 140, 24, 'LEAVE', 13, () => lanBridge().leaveLobby());
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
    this.roomSettings.refresh();
    if (b.phase !== 'setup' && b.phase !== 'playing') {
      this.nState = 'State_LanLobby';
      return;
    }
    const sel = b.sel;
    showWaveLimit(this.widgets,sel.levelIdx,sel.mode==='Coop'&&b.timedWavesAvailable(),20,390,180);
    if (sel.mode !== this.subMode) this.attachSubScreen();

    setButtonLabel(this.bMode, sel.mode === 'Coop' ? 'CO-OP' : 'DEATHMATCH');
    setButtonLabel(this.bDiff, DIFFICULTY[sel.difficulty]!);
    setButtonLabel(this.bFrags, String(FRAGS[sel.gameAmount]!));
    this.bBest.text = 'BEST ' + Math.max(1, Math.floor(sel.maxWave ?? 1));
    const bestFormat=this.bBest.getTextFormat();bestFormat.size=11;this.bBest.setTextFormat(bestFormat);
    if(this.bBest.textWidth>124){bestFormat.size*=124/this.bBest.textWidth;this.bBest.setTextFormat(bestFormat);}
    const showFrags = sel.mode === 'DeathMatch';
    this.bFrags._visible = showFrags;
    this.bFrags.enabled = showFrags;
    this.fragsLabel._visible = showFrags;
    const showWave = sel.mode === 'Coop';
    this.bWave._visible = showWave;
    this.bWave.enabled = showWave;
    this.bWaveLabel._visible = showWave;
    this.bBest._visible = showWave;
    this.waveLeft._visible = showWave; this.waveRight._visible = showWave;

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
    for (const button of [this.bMode, this.bDiff, this.bFrags, this.bWave]) setButtonEnabled(button, host, 55);
    for (const arrow of [this.waveLeft,this.waveRight]) setButtonEnabled(arrow,host,55);
    this.waveInput.refresh();
  }
}
proto(CScreen_LanSetup, { _CLASSID_: 'CScreen_LanSetup' });

/** Register the setup class for its synthetic linkage (the symbol itself is added by installLocalSymbols). */
export function registerSetupPage(): void {
  registerClass(SCREEN_LAN_SETUP_LINKAGE, CScreen_LanSetup);
}
