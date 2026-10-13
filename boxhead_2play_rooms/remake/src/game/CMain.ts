// Port of projects/boxhead4/CMain.as
// Structure from generated/disasm/CMain.txt top-level script @201587..@204873 (initaction of sprite 774).
// The "Main" clip (linkage Main, char 757) placed on root frame 62. Its onEnterFrame (Process) runs the state machine
// at CMain.mFPS ticks per second on top of the 50 fps enterFrame: ProcessFrames returns min(n, mFrameCap = 1) ticks
// per enterFrame (lost time is dropped) and only the last tick of a frame draws (fState(true)).
import {
  LocalConnection, MovieClip, _global, _root, flash, frameTime, getTimer, proto,
} from '../engine/runtime.ts';
import { CInput, CSaveData, CSound, DrawPrimitive, Screen, System, Thing, World, scidd, registerGameClass } from './packages.ts';

export class CMain extends MovieClip {
  static _this: any;
  static mSaveData: any;
  static mProfiler: any;
  static mSound: any;
  static mInput: any;
  static mInitBGTimeStamp: any;
  static mFPS = 25;
  static mInitBGTasks = false;
  static mTimeAllowedBGTasks = 25;

  override ctor(): void {
    super.ctor();
    CMain._this = this;
    CMain.mSaveData = new CSaveData();
    CMain.mSaveData.LoadData('morerooms_default');
    CMain.mProfiler = new scidd.CProfiler();
    this.mScreenSize = new flash.geom.Point(this._Size._width, this._Size._height);
    CMain.mSound = new CSound(this);
    this.mScreen_Collection = new Screen.CScreen_Collection(this, this.mScreenSize);
    this.SetState('State_Init');
    this.onEnterFrame = this.Process;
  }

  override toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  Process(): void {
    const _loc5_ = getTimer(); // [BC] generated/disasm/CMain.txt @201964 (ffdec `7120;`: unused register store)
    void _loc5_;
    _root._FPS?.Update?.();
    scidd.CProfiler.Clear();
    const _loc4_ = this.ProcessFrames(CMain.mFPS);
    for (let _loc3_ = _loc4_; _loc3_; _loc3_--) { // [BC] generated/disasm/CMain.txt @202056 (for t = n; t; t--)
      this.fState(_loc3_ == 1); // [BC] generated/disasm/CMain.txt @202096
      CSound.ProcessAll();
    }
    CMain.mInput?.ProcessAllKeys(); // AS2: undefined before State_Init ran (first enterFrame has no tick)
    if (_loc4_) {
      // AS2: _root._Debug does not exist in the shipped movie -> the store is a silent no-op.
      if (_root._Debug != undefined) _root._Debug.text = scidd.CProfiler.GetString();
    }
    CMain.ProcessBGTasks();
  }

  static ProcessBGTasks(): void {
    let _loc2_ = CMain.mTimeAllowedBGTasks;
    if (!CMain.mInitBGTasks) {
      CMain.mInitBGTimeStamp = getTimer(); // [BC] generated/disasm/CMain.txt @202301
      const _loc3_ = new DrawPrimitive.XSI.CDrawPrimitive_XSI_DI(_global.mXSI_Data?.mItems);
      void _loc3_;
      if (_global.mXSI_Data != undefined) delete _global.mXSI_Data.mItems;
      delete _global.mXSI_Data;
      Thing.Creature.CThing_Creature_Player.GetCollection(CMain.mSaveData.mPlayer1_CharacterIndex);
      Thing.Creature.CThing_Creature_Player.GetCollection(CMain.mSaveData.mPlayer2_CharacterIndex);
      Thing.Creature.CThing_Creature_Devil.GetCollection();
      Thing.Creature.CThing_Creature_Zombie.GetCollection();
      CMain.mInitBGTasks = true;
      _loc2_ = 1000; // [BC] generated/disasm/CMain.txt @202554 (ffdec `1000;`)
    }
    DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(CMain.mInitBGTimeStamp, _loc2_); // [BC] generated/disasm/CMain.txt @202602
    CMain.mInitBGTimeStamp = getTimer(); // [BC] generated/disasm/CMain.txt @202615 (ffdec `1418`)
  }

  static AddPlayers(): void {
  }

  Draw(): void {
  }

  SetState(nState: any): void {
    if (this[nState] != undefined) {
      CMain.ProcessFrames_Reset();
      this.mStateCount = 0;
      this.fState = this[nState];
    }
  }

  Process_Screen(screenID: any, tObject?: any): boolean {
    this.mcScreen = this.mScreen_Collection.Process(screenID, tObject);
    if (this.mcScreen.nState != undefined) {
      if (this.mcScreen.nState == 'State_SelectWorld') {
        this.mcScreen.nState = !this.mReturn_SelectWorld ? 'State_SelectWorld_Single' : this.mReturn_SelectWorld;
      }
      this.SetState(this.mcScreen.nState);
      return true;
    }
    return false;
  }

  State_Init(): void {
    CMain.mInput = new CInput();
    System.CContextMenu.InGame();
    const _loc3_ = new LocalConnection();
    void _loc3_;
    this.SetState(!_global.mDebug ? 'State_Intro' : 'State_SelectWorld_DeathMatch');
  }

  State_Intro(): void {
    this.Process_Screen('Screen_Intro');
  }

  State_Main(): void {
    this.Process_Screen('Screen_Main');
  }

  State_Instructions(): void {
  }

  State_SelectWorld_Single(): void {
    this.DeleteWorld();
    if (this.Process_Screen('Screen_SelectWorld', { mMode: 'Single' })) {
      this.mWorldLibLink = this.mcScreen.mWorldLibLink;
      this.mReturn_SelectWorld = 'State_SelectWorld_Single';
    }
  }

  State_SelectWorld_Coop(): void {
    this.DeleteWorld();
    if (this.Process_Screen('Screen_SelectWorld', { mMode: 'Coop' })) {
      this.mWorldLibLink = this.mcScreen.mWorldLibLink;
      this.mReturn_SelectWorld = 'State_SelectWorld_Coop';
    }
  }

  State_SelectWorld_DeathMatch(): void {
    this.DeleteWorld();
    if (this.Process_Screen('Screen_SelectWorld', { mMode: 'DeathMatch' })) {
      this.mWorldLibLink = this.mcScreen.mWorldLibLink;
      this.mReturn_SelectWorld = 'State_SelectWorld_DeathMatch';
    }
  }

  State_LoadWorld(): void {
    this.Process_Screen('Screen_LoadingWorld', this.mcWorld);
    if (this.mcScreen.mNormal) {
      this.mcWorld = this.attachMovie('World', '_World', this.getNextHighestDepth(), { mWorldLibLink: this.mWorldLibLink });
      this.SetState('State_LoadingWorld');
      CMain.mInput = new CInput();
    }
  }

  State_LoadingWorld(): void {
    this.Process_Screen('Screen_LoadingWorld', this.mcWorld);
  }

  State_InitWorld(): void {
    const _loc2_ = CMain.mSaveData.mGameSpeed != 0 ? CMain.mSaveData.mGameSpeed : 0.5;
    CMain.mFPS = 25 * _loc2_;
    this.SetState('State_RunWorld');
  }

  State_RunWorld(flagDraw?: any): void {
    this.mcWorld.Process();
    if (flagDraw) {
      this.mcWorld.Draw();
    }
    if (this.mcWorld.mCompleteState) {
      CMain.mFPS = 25;
      this.mcWorld.mPause = true;
      switch (this.mcWorld.mCompleteState) {
        case 'error':
        default:
          this.SetState(this.mReturn_SelectWorld);
          break;
        case 'quit':
          this.SetState(World.CWorld.mGameMode != 'DeathMatch' ? 'State_Debrief' : this.mReturn_SelectWorld);
          break;
        case 'player dead':
          this.SetState('State_Debrief');
          break;
        case 'player1 wins':
          Screen.CScreen_Debrief_Winner.mWinnerIndex = 0;
          this.SetState('State_Debrief_Winner');
          break;
        case 'player2 wins':
          Screen.CScreen_Debrief_Winner.mWinnerIndex = 1;
          this.SetState('State_Debrief_Winner');
      }
    }
  }

  DeleteWorld(): void {
    // [BC] generated/disasm/CMain.txt @204284: AS2 reads undefined.mNormal (no screen yet: State_Init -> SelectWorld
    // when _global.mDebug, or a SetState before the first Process_Screen) as undefined -> no crash.
    if (this.mcScreen?.mNormal && this.mcWorld) {
      this.mcWorld.Dispose();
      this.mcWorld.removeMovieClip();
      delete this.mcWorld;
    }
  }

  State_Debrief_Winner(): void {
    this.Process_Screen('Screen_Debrief_Winner', this.mcWorld);
    this.DeleteWorld();
  }

  State_Debrief(): void {
    this.Process_Screen('Screen_Debrief', this.mcWorld);
    this.DeleteWorld();
  }

  // Deviation CMAIN_FRAMETIME (src/game/deviations.ts): every getTimer() of ProcessFrames / ProcessFrames_Reset
  // reads frameTime() = the SCHEDULED time of the current enterFrame (multiples of 20 ms), so the tick maths are
  // exactly the Flash 50 fps grid on any monitor refresh rate.
  ProcessFrames(tFrameRate: any): number {
    if (this.mSingleFrame) {
      this.mTimeSlice = frameTime(); // [BC] generated/disasm/CMain.txt @204521 (getTimer(); ffdec `3858`)
      return 1;
    }
    const _loc3_ = 1000 / tFrameRate;
    this.mTimeSlice = this.mTimeSlice != undefined ? this.mTimeSlice : frameTime(); // [BC] generated/disasm/CMain.txt @204583
    let _loc2_ = Math.floor((frameTime() - this.mTimeSlice) / _loc3_); // [BC] generated/disasm/CMain.txt @204617 (ffdec `7786 - this.mTimeSlice`)
    if (_loc2_ > 0) {
      this.mTimeSlice += _loc2_ * _loc3_;
      _loc2_ = _loc2_ <= this.mFrameCap ? _loc2_ : this.mFrameCap;
      return _loc2_;
    }
    return 0;
  }

  static ProcessFrames_Reset(): void {
    CMain._this.mTimeSlice = frameTime(); // [BC] generated/disasm/CMain.txt @204757 (getTimer(); ffdec `8734`), deviation CMAIN_FRAMETIME
  }
}
proto(CMain, {
  _CLASSID_: 'CMain',
  _BASECLASSID_: 'CMain',
  mSingleFrame: false,
  mFrameCap: 1,
});

registerGameClass('CMain', CMain);
