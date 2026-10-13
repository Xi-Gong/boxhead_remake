// Port of assets/projects/boxhead4/Screen/CScreen_Transition.as
// Structure from generated/disasm/Screen.CScreen_Transition.txt top-level script @235896..@237297.
// Cross-fade: on the first Process the incoming screen (still invisible - BitmapData.draw ignores the source's own
// visibility) and the whole stage are snapshotted; the incoming bitmap (default DropShadowFilter) fades in by +10
// alpha per tick over the outgoing one (-10); the old screen clip is removed immediately.
import { _root, flash, proto } from '../../engine/runtime.ts';
import { Screen, registerGameClass } from '../packages.ts';

export class CScreen_Transition {
  [key: string]: any;
  static mScreenSize: any;
  static mState_TransitionIn = 0;
  static mState_Normal = 2;

  constructor() {
    this.mTick = 0;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  TransitionIn(tmcIN: any, tmcOUT: any): void {
    this.mState = Screen.CScreen_Transition.mState_TransitionIn;
    this.mState_CountTarget = this.mTransitionIn_Time;
    this.mState_Count = 0;
    this.mcIN = tmcIN;
    this.mcOUT = tmcOUT;
  }

  TransitionIn_Process(): boolean {
    if (this.bmIN == undefined) {
      this.mcContainer = this.mcIN._parent.createEmptyMovieClip('_ScreenTransition_Container', this.mcIN._parent.getNextHighestDepth());
      this.mcContainer_OUT = this.mcContainer.createEmptyMovieClip('_OUT', this.mcContainer.getNextHighestDepth());
      this.mcContainer_IN = this.mcContainer.createEmptyMovieClip('_IN', this.mcContainer.getNextHighestDepth());
      this.bmIN = new flash.display.BitmapData(Screen.CScreen_Transition.mScreenSize.x, Screen.CScreen_Transition.mScreenSize.y, false, 0);
      this.bmOUT = new flash.display.BitmapData(Screen.CScreen_Transition.mScreenSize.x, Screen.CScreen_Transition.mScreenSize.y, false, 0);
      this.bmIN.draw(this.mcIN);
      this.bmOUT.draw(_root);
      this.mcContainer_IN.attachBitmap(this.bmIN, 1);
      this.mcContainer_OUT.attachBitmap(this.bmOUT, 1);
      this.mcContainer_IN.filters = [new flash.filters.DropShadowFilter()];
      // AS2: the first screen has no predecessor (mcOUT undefined) -> silent no-op.
      this.mcOUT?.removeMovieClip?.();
      this.mcContainer_IN._alpha = 0;
    }
    this.mcContainer_IN._alpha = this.mcContainer_IN._alpha + 10;
    this.mcContainer_OUT._alpha = this.mcContainer_OUT._alpha - 10;
    if (this.mcContainer_IN._alpha >= 100) {
      this.bmIN.dispose();
      this.bmOUT.dispose();
      delete this.bmIN;
      delete this.bmOUT;
      this.mcContainer_OUT.removeMovieClip();
      this.mcContainer_IN.removeMovieClip();
      this.mcContainer.removeMovieClip();
      return true;
    }
    return false;
  }

  Process(): void {
    switch (this.mState) {
      case Screen.CScreen_Transition.mState_TransitionIn:
        this.mState_Count = this.mState_Count + 1;
        if (this.TransitionIn_Process()) {
          this.mcIN._visible = true;
          this.mState = Screen.CScreen_Transition.mState_Normal;
        }
      // falls through (no break in the AS2 switch)
      case Screen.CScreen_Transition.mState_Normal:
    }
  }

  Draw(): void {
  }
}
proto(CScreen_Transition, {
  _CLASSID_: 'CScreen_Transition',
  _BASECLASSID_: 'CScreen_Transition',
  mTransitionIn_Time: 30,
  mTransitionOut_Time: 30,
  mTransitionIn_InFront: true,
});

registerGameClass('Screen.CScreen_Transition', CScreen_Transition);
