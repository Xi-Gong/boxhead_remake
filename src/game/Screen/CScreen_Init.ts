// Port of assets/projects/boxhead4/Screen/CScreen_Init.as
// Structure from generated/disasm/Screen.CScreen_Init.txt top-level script @595530..@595851. (The Screen_Init linkage
// is registered but never shown: CMain.State_Init does not process a screen.)
import { proto } from '../../engine/runtime.ts';
import { registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_Init extends CScreen {
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
  }

  override Draw(): void {
    super.Draw();
  }
}
proto(CScreen_Init, { _CLASSID_: 'CScreen_Init' });

registerGameClass('Screen.CScreen_Init', CScreen_Init);
