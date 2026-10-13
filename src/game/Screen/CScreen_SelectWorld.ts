// Port of assets/projects/boxhead4/Screen/CScreen_SelectWorld.as
// Structure from generated/disasm/Screen.CScreen_SelectWorld.txt top-level script @604202..@613191.
// Level / character selection for the three modes (SubScreen_<mode> attached over _SubScreen_Container), the game
// options window and the key-binding window. Saved fields are accessed by name through CMain.mSaveData[field] (AS2
// properties of CSaveData).
import { Key, _global, forIn, getTimer, proto, toAS2String } from '../../engine/runtime.ts';
import { CInput, CMain, CSound, Screen, Thing, World, registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_SelectWorld extends CScreen {
  static Single_Exclusives = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  static Coop_Exclusives = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  static DeathMatch_Exclusives = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  override ctor(): void {
    super.ctor();
    switch (this.mObject.mMode.toUpperCase()) {
      case 'SINGLE':
      default:
        this.mMode = 'Single';
        this.Single_Setup();
        break;
      case 'COOP':
        this.mMode = 'Coop';
        this.Coop_Setup();
        break;
      case 'DEATHMATCH':
        this.mMode = 'DeathMatch';
        this.DeathMatch_Setup();
    }
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Dispose(): void {
    super.Dispose();
  }

  override Process(): void {
    super.Process();
    if (this.mScreen_Transition.mState == Screen.CScreen_Transition.mState_Normal) {
    }
  }

  override Draw(): void {
    super.Draw();
  }

  General_Setup(mcInit: any): void {
    this.WindowControls_Setup();
    this.WindowOptions_Setup();
    this.mcWindow_Options._visible = false;
    this.mcWindow_Controls._visible = false;
    mcInit._visible = true;
    if (this.mcWindow_Controls.mc2PlayerCover._visible = this.mMode == 'Single') {
      this.mcWindow_Controls.mc2PlayerCover.useHandCursor = false;
      this.mcWindow_Controls.mc2PlayerCover.onPress = function (): void { // [BC] generated/disasm/Screen.CScreen_SelectWorld.txt @604890 (ffdec: `= 0`)
      };
    }
  }

  Single_Setup(): void {
    World.CWorld.mGameMode = this.mMode;
    this.mcSubScreen = this.attachMovie('SubScreen_' + this.mMode, '_SubScreen_Container', this._SubScreen_Container.getDepth());
    this.General_Setup(this.mcSubScreen);
    this.Setup_CharacterSelection(this.mcSubScreen.mcPlayer1_Character, 'mPlayer1_CharacterIndex');
    this.Setup_LevelSelection(this.mcSubScreen.mcLevel_Selection, 'mLevelIndex_' + this.mMode);
  }

  Coop_Setup(): void {
    World.CWorld.mGameMode = this.mMode;
    this.mcSubScreen = this.attachMovie('SubScreen_' + this.mMode, '_SubScreen_Container', this._SubScreen_Container.getDepth());
    this.General_Setup(this.mcSubScreen);
    this.Setup_CharacterSelection(this.mcSubScreen.mcPlayer1_Character, 'mPlayer1_CharacterIndex');
    this.Setup_CharacterSelection(this.mcSubScreen.mcPlayer2_Character, 'mPlayer2_CharacterIndex');
    this.Setup_LevelSelection(this.mcSubScreen.mcLevel_Selection, 'mLevelIndex_' + this.mMode);
  }

  DeathMatch_Setup(): void {
    World.CWorld.mGameMode = this.mMode;
    this.mcSubScreen = this.attachMovie('SubScreen_' + this.mMode, '_SubScreen_Container', this._SubScreen_Container.getDepth());
    this.General_Setup(this.mcSubScreen);
    this.Setup_CharacterSelection(this.mcSubScreen.mcPlayer1_Character, 'mPlayer1_CharacterIndex');
    this.Setup_CharacterSelection(this.mcSubScreen.mcPlayer2_Character, 'mPlayer2_CharacterIndex');
    this.Setup_LevelSelection(this.mcSubScreen.mcLevel_Selection, 'mLevelIndex_' + this.mMode);
  }

  Setup_LevelSelection(mcTarget: any, sdField: any): void {
    mcTarget.mcLevelIcons = mcTarget.attachMovie('LevelIcons_Single', '_mcLevelIcons', mcTarget.getNextHighestDepth());
    mcTarget.mcLevelIcons.filters = mcTarget._Shadow.filters;
    mcTarget._Shadow._visible = false;
    mcTarget.sdField = sdField;
    this.ChangeLevel(mcTarget, Screen.CScreen_SelectWorld.mcGotoFrame(mcTarget.mcLevelIcons, CMain.mSaveData[sdField], true) - 1);
    mcTarget.mcLevelIcons._ViewHighScore._visible = this.mMode != 'DeathMatch';
    mcTarget.mcLevelIcons._ViewHighScore.sdField = sdField;
    mcTarget.mcLevelIcons._ViewHighScore.pClass = this;
    mcTarget.mcLevelIcons._ViewHighScore.onRelease = function (this: any): void {
      this.pClass.LoadHighScore(CMain.mSaveData[this.sdField]);
      CSound.mSamples.Click2.PlaySound();
    };
    mcTarget.bLeft.sdField = sdField;
    mcTarget.bLeft.pClass = this;
    mcTarget.bLeft.tgClass = mcTarget;
    mcTarget.bLeft.onRelease = function (this: any): void {
      CMain.mSaveData[this.sdField] = Screen.CScreen_SelectWorld.mcGotoFrame(this._parent.mcLevelIcons, -1) - 1;
      CSound.mSamples.Click2.PlaySound();
      this.pClass.ChangeLevel(this.tgClass, CMain.mSaveData[this.sdField]);
    };
    mcTarget.bRight.sdField = sdField;
    mcTarget.bRight.pClass = this;
    mcTarget.bRight.tgClass = mcTarget;
    mcTarget.bRight.onRelease = function (this: any): void {
      CMain.mSaveData[this.sdField] = Screen.CScreen_SelectWorld.mcGotoFrame(this._parent.mcLevelIcons, 1) - 1;
      CSound.mSamples.Click2.PlaySound();
      this.pClass.ChangeLevel(this.tgClass, CMain.mSaveData[this.sdField]);
    };
  }

  ChangeLevel(mcTarget: any, tIndex: any): void {
    const _loc5_ = (Screen.CScreen_SelectWorld as any)[this.mMode + '_Exclusives'];
    mcTarget.mcLevelIcons._Button.sdField = mcTarget.sdField;
    mcTarget.mcLevelIcons._Button.pClass = this;
    const _loc4_ = !_global.mHostedOnCMG ? _loc5_[tIndex] == 1 : false;
    mcTarget.mcLevelIcons.mcExclusive._visible = _loc4_;
    if (!_loc4_) {
      mcTarget.mcLevelIcons._Button.onRelease = function (this: any): void {
        this.pClass.LoadLevel(CMain.mSaveData[this.sdField]);
        CSound.mSamples.Click.PlaySound();
      };
    }
  }

  LoadLevel(tLevelIndex: any): void {
    this.mWorldLibLink = 'ROOM_Single_' + this.Pad0_4(tLevelIndex + 1);
    this.nState = 'State_LoadWorld';
    Thing.Creature.CThing_Creature.mDamageActive = this.mMode != 'DeathMatch' ? CMain.mSaveData.mDamageActive : true;
  }

  LoadHighScore(tLevelIndex: any): any {
    const _loc2_ = 'ROOM_' + this.mMode + '_' + this.Pad0_4(tLevelIndex + 1);
    // (The shipped bytecode only builds the table id; the remake scope shows the local table, see scope.ts.)
    return _loc2_;
  }

  Pad0_4(tNumber: any): string {
    let _loc1_ = toAS2String(tNumber);
    while (_loc1_.length < 4) {
      _loc1_ = '0' + _loc1_;
    }
    return _loc1_;
  }

  Setup_CharacterSelection(mcTarget: any, sdField: any): void {
    Screen.CScreen_SelectWorld.mcGotoFrame(mcTarget.mcCharacter, CMain.mSaveData[sdField], true);
    mcTarget.bLeft.sdField = sdField;
    mcTarget.bLeft.onRelease = function (this: any): void {
      CMain.mSaveData[this.sdField] = Screen.CScreen_SelectWorld.mcGotoFrame(this._parent.mcCharacter, -1) - 1;
      CSound.mSamples.Click2.PlaySound();
    };
    mcTarget.bRight.sdField = sdField;
    mcTarget.bRight.onRelease = function (this: any): void {
      CMain.mSaveData[this.sdField] = Screen.CScreen_SelectWorld.mcGotoFrame(this._parent.mcCharacter, 1) - 1;
      CSound.mSamples.Click2.PlaySound();
    };
  }

  static mcGotoFrame(mc: any, dAdd: any, fromStart?: any): number {
    const _loc2_ = mc._totalframes;
    const _loc3_ = !fromStart ? mc._currentframe : 1;
    mc.gotoAndStop((_loc3_ - 1 + dAdd + _loc2_ * 100) % _loc2_ + 1);
    return mc._currentframe;
  }

  WindowOptions_Setup(): void {
    this.RegisterButton_OnRelease(this._Game_Options, 'WindowOptions_Open');
    this.RegisterButton_OnRelease(this.mcWindow_Options._Button_Close, 'WindowOptions_Close');
    this.RegisterButton_OnRelease(this.mcWindow_Options._Button_Reset, 'ResetOptions');
    this.mcWindow_Options.mAllGroups = new Array();
    let _loc2_: any[] = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Level_Beginner, 'mDifficulty', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Level_Intermediate, 'mDifficulty', 1));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Level_Expert, 'mDifficulty', 2));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Level_Nightmare, 'mDifficulty', 3));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
    _loc2_ = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Speed_Slow, 'mGameSpeed', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Speed_Normal, 'mGameSpeed', 1));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Speed_Fast, 'mGameSpeed', 2));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
    _loc2_ = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Devils_Off, 'mDevilsActive', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Devils_On, 'mDevilsActive', 1));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
    _loc2_ = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Collide_Off, 'mCollisionsActive', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Collide_On, 'mCollisionsActive', 1));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
    _loc2_ = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Damage_Off, 'mDamageActive', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Damage_On, 'mDamageActive', 1));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
    _loc2_ = new Array();
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Game1, 'mGameAmount', 0));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Game2, 'mGameAmount', 1));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Game3, 'mGameAmount', 2));
    _loc2_.push(this.RegisterButton_Option(_loc2_, this.mcWindow_Options._Game4, 'mGameAmount', 3));
    this.RegisterButton_SetGroup(_loc2_);
    this.mcWindow_Options.mAllGroups.push(_loc2_);
  }

  RegisterButton_SetGroup(bGroup: any): void {
    const _loc2_ = bGroup[0]._Button.sdField;
    for (const _loc3_ of forIn(bGroup)) {
      bGroup[_loc3_]._Selected._visible = CMain.mSaveData[_loc2_] == bGroup[_loc3_]._Button.sdValue;
    }
  }

  RegisterButton_Option(bGroup: any, mcButton: any, sdField: any, sdValue: any): any {
    mcButton._Button.pClass = this;
    mcButton._Button.sdField = sdField;
    mcButton._Button.sdValue = sdValue;
    mcButton._Button.mGroup = bGroup;
    mcButton._Button.onRelease = function (this: any): void {
      CSound.mSamples.Click2.PlaySound();
      CMain.mSaveData[this.sdField] = this.sdValue;
      this.pClass.RegisterButton_SetGroup(this.mGroup);
    };
    return mcButton;
  }

  ResetOptions(): void {
    CMain.mSaveData.__set__mDifficulty(0);
    CMain.mSaveData.__set__mGameSpeed(1);
    CMain.mSaveData.__set__mDevilsActive(1);
    CMain.mSaveData.__set__mCollisionsActive(1);
    CMain.mSaveData.__set__mDamageActive(1);
    CMain.mSaveData.__set__mGameAmount(1);
    for (const _loc2_ of forIn(this.mcWindow_Options.mAllGroups)) {
      this.RegisterButton_SetGroup(this.mcWindow_Options.mAllGroups[_loc2_]);
    }
  }

  WindowOptions_Open(): void {
    this.mcWindow_Options._visible = true;
  }

  WindowOptions_Close(): void {
    this.mcWindow_Options._visible = false;
  }

  RegisterDifficulty(mc: any, tList: any, tIndex: any): void {
    mc._Selected._visible = CMain.mSaveData.__get__mDifficulty() == tIndex;
    mc.mIndex = tIndex;
    mc.mList = tList;
    mc.onRelease = function (this: any): void {
      if (this._Selected._visible) {
        return;
      }
      for (const _loc2_ of forIn(this.mList)) {
        this.mList[_loc2_]._Selected._visible = false;
      }
      CSound.mSamples.Click.PlaySound();
      CMain.mSaveData.__set__mDifficulty(this.mIndex);
      this._Selected._visible = true;
    };
  }

  WindowControls_Setup(): void {
    this.RegisterButton_OnRelease(this._Game_Controls, 'WindowControls_Open');
    this.RegisterButton_OnRelease(this.mcWindow_Controls._Button_Close, 'WindowControls_Close');
    this.RegisterButton_OnRelease(this.mcWindow_Controls._Button_Reset, 'ResetControls');
    this.mcWindow_Controls.mcPressKey._visible = false;
    this.mcWindow_Controls.mcPlayer1.mIndex = 1;
    this.WindowControls_Setup_Player(this.mcWindow_Controls.mcPlayer1);
    this.mcWindow_Controls.mcPlayer2.mIndex = 2;
    this.WindowControls_Setup_Player(this.mcWindow_Controls.mcPlayer2);
    this.UpdateKeys();
  }

  WindowControls_Setup_Player(mcPlayer: any): void {
    mcPlayer.kList = new Array();
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'Shoot'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'MoveUp'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'MoveDown'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'MoveLeft'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'MoveRight'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'NextWeapon'));
    mcPlayer.kList.push(this.RegisterButton_ChangeKey(mcPlayer, 'PrevWeapon'));
  }

  RegisterButton_ChangeKey(mcPlayer: any, sdVariable: any): any {
    const _loc2_ = mcPlayer['mcChangeKey_' + sdVariable];
    const _loc4_ = mcPlayer['tb' + sdVariable];
    _loc4_.text = sdVariable;
    _loc2_.pClass = this;
    _loc2_.tbKey = _loc4_;
    _loc2_.sdVariable = sdVariable;
    _loc2_.sdField = 'mPlayer' + mcPlayer.mIndex + '_Key' + sdVariable;
    _loc2_.onRelease = function (this: any): void {
      CSound.mSamples.Click2.PlaySound();
      this.pClass.Activate_WaitForKeypress(this);
    };
    return _loc2_;
  }

  Activate_WaitForKeypress(mc: any): void {
    this.mcWindow_Controls.mcPressKey._visible = true;
    this.mcWindow_Controls.mcPressKey.mcInvalidKey._visible = false;
    this.mcWindow_Controls.mcPressKey.onEnterFrame = function (this: any): void {
      if (this.mcInvalidKey._visible) {
        this.mcInvalidKey._alpha = 100;
        const _loc2_ = Math.min((getTimer() - this.mcInvalidKey.mTimer) / 500 - 1, 1); // [BC] generated/disasm/Screen.CScreen_SelectWorld.txt @610952
        if (_loc2_ == 1) {
          this.mcInvalidKey._alpha = 100;
          this.mcPressAKey._alpha = 100;
          this.mcInvalidKey._visible = false;
        } else if (_loc2_ > 0) {
          this.mcInvalidKey._alpha = 100 * (1 - _loc2_);
          this.mcPressAKey._alpha = 100 * _loc2_;
        }
      }
    };
    this.mcWindow_Controls.mKeyListener = new Object();
    this.mcWindow_Controls.mKeyListener.pClass = this;
    this.mcWindow_Controls.mKeyListener.trgClass = mc;
    this.mcWindow_Controls.mKeyListener.onKeyDown = function (this: any): void {
      const _loc2_ = Key.getCode();
      const _loc3_ = CInput.isValidKey(_loc2_);
      if (_loc2_ == 27) {
        this.pClass.mcWindow_Controls.mcPressKey._visible = false;
        delete this.pClass.mcWindow_Controls.mcPressKey.onEnterFrame;
        Key.removeListener(this);
      } else if (_loc3_) {
        if (_loc3_.mValid) {
          this.pClass.mcWindow_Controls.mcPressKey._visible = false;
          CMain.mSaveData[this.trgClass.sdField] = _loc2_;
          this.pClass.UpdateKeys();
          delete this.pClass.mcWindow_Controls.mcPressKey.onEnterFrame;
          Key.removeListener(this);
        }
      } else {
        this.pClass.mcWindow_Controls.mcPressKey.mcInvalidKey.mTimer = getTimer(); // [BC] generated/disasm/Screen.CScreen_SelectWorld.txt @611545
        this.pClass.mcWindow_Controls.mcPressKey.mcInvalidKey._visible = true;
        this.pClass.mcWindow_Controls.mcPressKey.mcPressAKey._alpha = 0;
      }
    };
    Key.addListener(this.mcWindow_Controls.mKeyListener);
  }

  UpdateKeys(): void {
    const _loc4_ = [this.mcWindow_Controls.mcPlayer1, this.mcWindow_Controls.mcPlayer2];
    for (const _loc6_ of forIn(_loc4_)) {
      for (const _loc5_ of forIn(_loc4_[_loc6_].kList)) {
        const _loc2_ = _loc4_[_loc6_].kList[_loc5_];
        const _loc3_ = CMain.mSaveData[_loc2_.sdField];
        // AS2: an unknown key code gives undefined.mName -> undefined -> the field shows "undefined".
        _loc2_.tbKey.text = CInput.isValidKey(_loc3_)?.mName;
      }
    }
  }

  ResetControls(): void {
    CMain.mSaveData.__set__mPlayer1_KeyMoveUp(38);
    CMain.mSaveData.__set__mPlayer1_KeyMoveDown(40);
    CMain.mSaveData.__set__mPlayer1_KeyMoveLeft(37);
    CMain.mSaveData.__set__mPlayer1_KeyMoveRight(39);
    CMain.mSaveData.__set__mPlayer1_KeyShoot(191);
    CMain.mSaveData.__set__mPlayer1_KeyNextWeapon(190);
    CMain.mSaveData.__set__mPlayer1_KeyPrevWeapon(188);
    CMain.mSaveData.__set__mPlayer2_KeyMoveUp(CInput.ToAscii('W'));
    CMain.mSaveData.__set__mPlayer2_KeyMoveDown(CInput.ToAscii('S'));
    CMain.mSaveData.__set__mPlayer2_KeyMoveLeft(CInput.ToAscii('A'));
    CMain.mSaveData.__set__mPlayer2_KeyMoveRight(CInput.ToAscii('D'));
    CMain.mSaveData.__set__mPlayer2_KeyShoot(CInput.ToAscii(' '));
    CMain.mSaveData.__set__mPlayer2_KeyNextWeapon(CInput.ToAscii('E'));
    CMain.mSaveData.__set__mPlayer2_KeyPrevWeapon(CInput.ToAscii('Q'));
    this.UpdateKeys();
  }

  WindowControls_Open(): void {
    this.mcWindow_Controls._visible = true;
  }

  WindowControls_Close(): void {
    this.mcWindow_Controls._visible = false;
  }

  RegisterButton_OnRelease(mc: any, cbFunction: any, cbPara1?: any, cbPara2?: any): void {
    mc._Selected._visible = false;
    mc._Button.pClass = this;
    mc._Button.cbFunction = cbFunction;
    mc._Button.cbPara1 = cbPara1;
    mc._Button.cbPara2 = cbPara2;
    // The handler reads `cbFunction` from the enclosing activation (closure) and the parameters from the button.
    mc._Button.onRelease = function (this: any): void {
      CSound.mSamples.Click2.PlaySound();
      this.pClass[cbFunction](this.cbPara1, this.cbPara2);
    };
  }
}
proto(CScreen_SelectWorld, { _CLASSID_: 'CScreen_SelectWorld', mFirstTime: true });


registerGameClass('Screen.CScreen_SelectWorld', CScreen_SelectWorld);
