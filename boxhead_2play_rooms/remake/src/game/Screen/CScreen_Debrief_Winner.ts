// Port of projects/boxhead4/Screen/CScreen_Debrief_Winner.as
// Structure from generated/disasm/Screen.CScreen_Debrief_Winner.txt top-level script @502905..@504246.
// Death Match result screen: "PLAYER n WINS" with the winner's character (mcWinners frame = character index + 1).
// Submitting is always disabled (the screen has no score/name fields; most stores below hit undefined members).
import { _global, proto, random } from '../../engine/runtime.ts';
import { CMain, CSound, External, Screen, registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_Debrief_Winner extends CScreen {
  static mWinnerIndex: any;

  override ctor(): void {
    super.ctor();
    this.tbWinner.text = 'PLAYER ' + (Screen.CScreen_Debrief_Winner.mWinnerIndex + 1) + ' WINS';
    this.mcWinners.gotoAndStop(CMain.mSaveData['mPlayer' + (Screen.CScreen_Debrief_Winner.mWinnerIndex + 1) + '_CharacterIndex'] + 1);
    CSound.mSamples.World_End_wav.PlaySound();
    // AS2: no mStatus / _ViewHighscores in Screen_Debrief_Winner -> stores into undefined are silent no-ops.
    const _status = this.mEndText[random(this.mEndText.length)];
    if (this.mStatus != undefined) this.mStatus.text = _status;
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
    if (this._ViewHighscores != undefined) {
      this._ViewHighscores.pClass = this;
      this._ViewHighscores.onRelease = function (this: any): void {
        if (_global.mCrazyMonkeyGames) {
          this.getURL('http://scores.crazymonkeygames.com/hs/listscores.php?id=' + External.CHighscore_Submit.mGameID, '_BLANK');
          External.CTracker.Click_ViewHighscore();
          return; // [BC] generated/disasm/Screen.CScreen_Debrief_Winner.txt @503493 (ffdec: §§push(getURL(..)))
        }
      };
    }
    if (!(CMain.mSaveData.mDevilsActive == 1 && CMain.mSaveData.mCollisionsActive == 1 && CMain.mSaveData.mDamageActive == 1)) {
      this.DisableSubmitScore();
    }
    this.DisableSubmitScore();
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Dispose(): void {
    super.Dispose();
  }

  SubmitHighscore(): void {
    // [ORACLE P1] literal keys reversed: AS2 {playerName, playerScore} enumerates in source order (initObject copy)
    this.mcSubmitHighScore = this.attachMovie('Screen.SubmitHighScore', '_SubmitHighscore', this.getNextHighestDepth(), { playerScore: this.mScore?.text, playerName: this.mUsername?.text });
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
    if (this.mUsername != undefined) {
      this.mUsername.selectable = false;
      this.mUsername._alpha = 50;
    }
    if (this._SendScore != undefined) {
      this._SendScore.enabled = false;
      this._SendScore._alpha = 50;
    }
    if (this._Boundary != undefined) this._Boundary._alpha = 50;
    if (this.txtEnterYourName != undefined) this.txtEnterYourName._alpha = 50;
  }

  override Draw(): void {
    super.Draw();
  }
}
proto(CScreen_Debrief_Winner, {
  _CLASSID_: 'CScreen_Debrief_Winner',
  mFirstTime: true,
  mEndText: ['YOU WERE EATEN!', 'DEATH!', 'WIMPISH!', 'YOUR HEAD WAS RIPPED OFF!', 'GAME OVER!', 'LOSER!', 'BLED TO DEATH', 'DRAINED OF BLOOD'],
});

registerGameClass('Screen.CScreen_Debrief_Winner', CScreen_Debrief_Winner);
