// Port of assets/projects/boxhead4/Screen/CScreen_Debrief.as
// Structure from generated/disasm/Screen.CScreen_Debrief.txt top-level script @620673..@622320.
// Game-over screen (Single / Coop). mObject is the finished CWorld clip. Score submission is only allowed when devils,
// collisions and damage were all on (otherwise DisableSubmitScore). The online submission/listing (CMG) is replaced by
// the local highscore table through src/game/scope.ts (_SendScore / _ViewHighscores handlers).
import { _global, proto, random } from '../../engine/runtime.ts';
import { CMain, CSaveData, CSound, External, registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_Debrief extends CScreen {
  override ctor(): void {
    super.ctor();
    External.CHighscore_Submit.mGameID = External.CHighscore_Submit.GetGameIDbyLibLink(this.mObject.mWorldLibLink);
    CSound.mSamples.World_End_wav.PlaySound();
    this.mUsername.text = CSaveData._this.__get__mUsername() != undefined ? CSaveData._this.__get__mUsername() : '<Enter name>';
    this.mScore.text = this.mObject.mHud.mScore;
    const _loc4_ = this.mScore.getTextFormat();
    _loc4_.letterSpacing = -2;
    this.mScore.setTextFormat(_loc4_);
    // AS2: Screen_Debrief has no mStatus text field -> the store is a silent no-op (random() is still consumed).
    const _status = this.mEndText[random(this.mEndText.length)];
    if (this.mStatus != undefined) this.mStatus.text = _status;
    this._SendScore.pClass = this;
    this._SendScore.onRelease = function (this: any): void {
      CSound.mSamples.Click.PlaySound();
      if (this.pClass.mUsername.text != '<Enter name>') {
        CSaveData._this.__set__mUsername(this.pClass.mUsername.text);
        External.CTracker.Click_SubmitHighscore();
        if (_global.mCrazyMonkeyGames) {
          this.pClass.SubmitHighscore();
        }
      }
    };
    this._Retry.pClass = this;
    this._Retry.onPress = function (this: any): void {
      this.pClass.nState = 'State_LoadWorld';
      CSound.mSamples.Click.PlaySound();
    };
    this._Exit.pClass = this;
    this._Exit.onPress = function (this: any): void {
      this.pClass.nState = 'State_SelectWorld';
      CSound.mSamples.Click.PlaySound();
    };
    this._ViewHighscores.pClass = this;
    this._ViewHighscores.onRelease = function (this: any): void {
      if (_global.mCrazyMonkeyGames) {
        this.getURL('http://scores.crazymonkeygames.com/hs/listscores.php?id=' + External.CHighscore_Submit.mGameID, '_BLANK');
        External.CTracker.Click_ViewHighscore();
        return; // [BC] generated/disasm/Screen.CScreen_Debrief.txt @621585 (ffdec: §§push(getURL(..)))
      }
    };
    if (!(CMain.mSaveData.mDevilsActive == 1 && CMain.mSaveData.mCollisionsActive == 1 && CMain.mSaveData.mDamageActive == 1)) {
      this.DisableSubmitScore();
    }
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Dispose(): void {
    super.Dispose();
  }

  SubmitHighscore(): void {
    // [ORACLE P1] literal keys reversed: AS2 {playerName, playerScore} enumerates in source order (initObject copy)
    this.mcSubmitHighScore = this.attachMovie('Screen.SubmitHighScore', '_SubmitHighscore', this.getNextHighestDepth(), { playerScore: this.mScore.text, playerName: this.mUsername.text });
  }

  override Process(): void {
    super.Process();
    if (this.mcSubmitHighScore != undefined) {
      this.mcSubmitHighScore.Process();
      if (External.CHighscore_Submit.mContinue) {
        this.mcSubmitHighScore.Dispose();
        delete this.mcSubmitHighScore;
        this.DisableSubmitScore();
      }
    }
  }

  DisableSubmitScore(): void {
    this.mUsername.selectable = false;
    this.mUsername._alpha = 50;
    this._SendScore.enabled = false;
    this._SendScore._alpha = 50;
    // AS2: _Boundary / txtEnterYourName do not exist in Screen_Debrief -> silent no-ops.
    if (this._Boundary != undefined) this._Boundary._alpha = 50;
    if (this.txtEnterYourName != undefined) this.txtEnterYourName._alpha = 50;
  }

  override Draw(): void {
    super.Draw();
  }
}
proto(CScreen_Debrief, {
  _CLASSID_: 'CScreen_Debrief',
  mFirstTime: true,
  mEndText: ['YOU WERE EATEN!', 'DEATH!', 'WIMPISH!', 'YOUR HEAD WAS RIPPED OFF!', 'GAME OVER!', 'LOSER!', 'BLED TO DEATH', 'DRAINED OF BLOOD'],
});

registerGameClass('Screen.CScreen_Debrief', CScreen_Debrief);
