// Port of projects/boxhead4/Screen/CScreen_Collection.as
// Structure from generated/disasm/Screen.CScreen_Collection.txt top-level script @232792..@233398.
// Owns the screen container clip; Process(idScreen) keeps the current screen, or attaches a new one (linkage idScreen)
// above it and starts its transition from the previous one.
import { proto } from '../../engine/runtime.ts';
import { Screen, registerGameClass } from '../packages.ts';

export class CScreen_Collection {
  [key: string]: any;
  static mState_Normal = 0;
  static mState_TransitionIn = 1;
  static mState_TransitionOut = 2;

  constructor(tmcParent: any, tScreenSize: any) {
    Screen.CScreen_Transition.mScreenSize = tScreenSize;
    this.mcParent = tmcParent;
    this.mcContainer = this.mcParent.createEmptyMovieClip('_Screen_Collection', this.mcParent.getNextHighestDepth());
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  Process(idScreen: any, tObject?: any): any {
    // AS2: on the first call mcScreenFront is undefined (method call / member read are silent no-ops).
    this.mcScreenFront?.Process?.();
    if (this.mcScreenFront?.idScreen != idScreen) {
      this.mcScreenBack = this.mcScreenFront;
      this.mcScreenFront = this.mcContainer.attachMovie(idScreen, '_' + idScreen, this.mcContainer.getNextHighestDepth(), { mObject: tObject });
      this.mcScreenFront.idScreen = idScreen;
      this.mcScreenFront.mcParent = this.mcParent;
      this.mcScreenFront.Open(this.mcScreenBack);
    }
    this.mcScreenFront.mObject = tObject;
    return this.mcScreenFront;
  }

  Draw(): void {
  }
}
proto(CScreen_Collection, { _CLASSID_: 'CScreen_Collection' });

registerGameClass('Screen.CScreen_Collection', CScreen_Collection);
