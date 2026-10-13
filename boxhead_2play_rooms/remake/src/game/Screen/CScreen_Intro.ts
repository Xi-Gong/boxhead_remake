// Port of projects/boxhead4/Screen/CScreen_Intro.as
// Structure from generated/disasm/Screen.CScreen_Intro.txt top-level script @597837..@598842.
// Plays the logo clips one after another in REAL time (getTimer, each clip's mFrameRate set by its frame-1 script):
// every tick the clip is stepped with nextFrame() up to the frame due now; at its last frame the next logo starts;
// after the last one nState = "State_Main". (The CrazyMonkeyGames logo is removed by the remake scope, see
// src/game/scope.ts, so only the Sean Cooper logo plays.)
import { forIn, getTimer, int, proto } from '../../engine/runtime.ts';
import { registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_Intro extends CScreen {
  override ctor(): void {
    super.ctor();
    this.mSequence = new Array();
    if (this._Logo_SeanCooper != undefined) {
      this.mSequence.push(this._Logo_SeanCooper);
    }
    if (this._Logo_CrazyMonkeys != undefined) {
      this.mSequence.push(this._Logo_CrazyMonkeys);
    }
    for (const _loc3_ of forIn(this.mSequence)) {
      this.mSequence[_loc3_].stop();
      this.mSequence[_loc3_]._visible = false;
    }
    this.mSequenceIndex = 0;
    // AS2: _parent is the screen container clip (not CMain), so CMain.mSingleFrame stays false.
    this._parent.mSingleFrame = true;
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Dispose(): void {
    super.Dispose();
  }

  override Process(): void {
    super.Process();
    if (this.__get__mNormal()) {
      // AS2: after the last logo (and again when CScreen_Collection processes this screen once more while Screen_Main
      // is attached) mSequenceIndex is past the end: _loc3_ is undefined, `undefined._visible == false` is false and
      // `undefined._currentframe == undefined._totalframes` is true -> the index advances and nState is set again.
      const _loc3_ = this.mSequence[this.mSequenceIndex];
      if (_loc3_?._visible == false) {
        this.mTimeSlice = undefined;
        _loc3_._visible = true;
        _loc3_.gotoAndStop(1);
      } else if (_loc3_?._currentframe == _loc3_?._totalframes) {
        if (_loc3_ != undefined) _loc3_._visible = false;
        this.mSequenceIndex = this.mSequenceIndex + 1;
        if (this.mSequenceIndex >= this.mSequence.length) {
          this.nState = 'State_Main';
          return;
        }
      } else {
        const _loc4_ = this.GetFrameIndex(_loc3_._totalframes, _loc3_.mFrameRate);
        while (_loc3_._currentframe != _loc4_) {
          _loc3_.nextFrame();
        }
      }
    }
  }

  override Draw(): void {
    super.Draw();
  }

  GetFrameIndex(tTotalFrames: any, tFrameRate: any): number {
    this.mTimeSlice = this.mTimeSlice != undefined ? this.mTimeSlice : getTimer(); // [BC] generated/disasm/Screen.CScreen_Intro.txt @598715
    let _loc2_ = int((getTimer() - this.mTimeSlice) / (1000 / tFrameRate)) + 1; // [BC] generated/disasm/Screen.CScreen_Intro.txt @598748
    if (_loc2_ > tTotalFrames) {
      _loc2_ = tTotalFrames;
    }
    return _loc2_;
  }
}
proto(CScreen_Intro, { _CLASSID_: 'CScreen_Intro', mFrameCap: 10 });

registerGameClass('Screen.CScreen_Intro', CScreen_Intro);
