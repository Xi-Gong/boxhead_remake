// Port of assets/projects/boxhead4/Screen/CScreen_LoadingWorld.as
// Structure from generated/disasm/Screen.CScreen_LoadingWorld.txt top-level script @618072..@618468.
// mObject is the CWorld clip being built (CMain.State_LoadWorld / State_LoadingWorld); when it reports mLoaded the
// screen hides itself and asks CMain for State_InitWorld.
import { proto } from '../../engine/runtime.ts';
import { registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_LoadingWorld extends CScreen {
  override ctor(): void {
    super.ctor();
  }

  override toString(): string {
    return this._CLASSID_;
  }

  override Dispose(): void {
    super.Dispose();
  }

  override Process(): void {
    super.Process();
    if (this.mObject?.mLoaded && this.__get__mNormal()) {
      this.nState = 'State_InitWorld';
      this._visible = false;
    }
  }

  override Draw(): void {
    super.Draw();
  }
}
proto(CScreen_LoadingWorld, { _CLASSID_: 'CScreen_LoadingWorld', mFirstTime: true });

registerGameClass('Screen.CScreen_LoadingWorld', CScreen_LoadingWorld);
