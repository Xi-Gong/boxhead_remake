// Port of projects/boxhead4/Screen/CScreen.as
// Structure from generated/disasm/Screen.CScreen.txt top-level script @500172..@500794 (initaction of sprite 847).
// Base class of every menu screen clip (Screen_* linkages). Screens start invisible; CScreen_Collection attaches them
// and CScreen_Transition cross-fades from a bitmap of the previous screen, then shows the clip (mNormal = true).
import { MovieClip, proto } from '../../engine/runtime.ts';
import { CSound, Screen, registerGameClass } from '../packages.ts';

export class CScreen extends MovieClip {
  static bFlag_Delete = 1;

  override ctor(): void {
    super.ctor();
    // AS2: screens without a "Back to menu" icon (Intro, Main, Loading) store into undefined -> silent no-ops.
    if (this._Icon_Back != undefined) {
      this._Icon_Back.pClass = this;
      this._Icon_Back.onPress = function (this: any): void {
        CSound.mSamples.Click.PlaySound();
        this.pClass.GoBack();
      };
    }
    this._visible = false;
    this.mScreen_Transition = new Screen.CScreen_Transition();
  }

  GoBack(): void {
    this.nState = 'State_Main';
  }

  override toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    this.removeMovieClip();
  }

  Open(mcBack?: any): void {
    this.mScreen_Transition.TransitionIn(this, mcBack);
  }

  __get__mNormal(): boolean {
    return this.mScreen_Transition.mState == Screen.CScreen_Transition.mState_Normal;
  }

  Process(): void {
    this.mScreen_Transition.Process();
  }

  Draw(): void {
  }

  // addProperty("mNormal", __get__mNormal, function () {}) - getter with an EMPTY setter.
  get mNormal(): boolean { return this.__get__mNormal(); }
  set mNormal(_v: boolean) { /* AS2 empty setter */ }
}
proto(CScreen, { _CLASSID_: 'CScreen', _BASECLASSID_: 'CScreen' });

registerGameClass('Screen.CScreen', CScreen);
