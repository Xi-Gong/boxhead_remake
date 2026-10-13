// Port of projects/boxhead4/Screen/CScreen_Main.as
// Structure from generated/disasm/Screen.CScreen_Main.txt top-level script @601380..@602380.
// Main menu: four text buttons (mcSinglePlay / mcCoopPlay / mcDeathPlay / mcInstructions). Roll-over shows the item at
// full alpha with a jittering DropShadow + Blur every enterFrame. (mcInstructions only played a click and linked to
// the CMG site; the remake scope opens the local instructions page instead, see src/game/scope.ts.)
import { flash, mathRandom, proto, random } from '../../engine/runtime.ts';
import { CSound, registerGameClass } from '../packages.ts';
import { CScreen } from './CScreen.ts';

export class CScreen_Main extends CScreen {
  override ctor(): void {
    super.ctor();
    this.Init_Buttons();
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

  Init_Buttons(): void {
    this.Register_Button(this.mcSinglePlay, 'State_SelectWorld_Single');
    this.Register_Button(this.mcCoopPlay, 'State_SelectWorld_Coop');
    this.Register_Button(this.mcDeathPlay, 'State_SelectWorld_DeathMatch');
    this.Register_Button(this.mcInstructions, undefined, 'http://www.crazymonkeygames.com/instr/boxhead2play/');
  }

  Register_Button(mc: any, nState?: any, dURL?: any): void {
    mc.pClass = this;
    mc._Contents._alpha = 50;
    mc.nState = nState;
    mc.onRollOver = function (this: any): void {
      this.onEnterFrame = function (this: any): void {
        this._Contents._alpha = 100;
        this._Contents.filters = [new flash.filters.DropShadowFilter(mathRandom() * 3, random(360)), new flash.filters.BlurFilter(mathRandom() * 2, mathRandom() * 2)];
      };
    };
    mc.onRollOut = function (this: any): void {
      this._Contents._alpha = 50;
      delete this.onEnterFrame;
      this._Contents.filters = [];
    };
    if (nState) {
      mc.onRelease = function (this: any): void {
        CSound.mSamples.Click.PlaySound();
        this.pClass.nState = this.nState;
      };
    } else if (dURL) {
      mc.onRelease = function (this: any): void {
        CSound.mSamples.Click2.PlaySound();
      };
    }
  }
}
proto(CScreen_Main, { _CLASSID_: 'CScreen_Main' });

registerGameClass('Screen.CScreen_Main', CScreen_Main);
