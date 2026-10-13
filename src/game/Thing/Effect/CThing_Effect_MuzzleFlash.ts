// Port of assets/projects/boxhead4/Thing/Effect/CThing_Effect_MuzzleFlash.as
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_MuzzleFlash.txt (top-level script
// @318670..@319033).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_MuzzleFlash extends CThing_Effect {
  /** tDrawObject = the weapon's shared CDrawPrimitive_MovieClip_OmniDirectional (e.g. "Pistol.MuzzleFlash"). */
  constructor(tPosition?: any, tAngle?: any, tDrawObject?: any) {
    super(tPosition, tAngle);
    this.mcDrawObject = tDrawObject;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  /** Lives one tick: registers in the mapwho (so it is drawn once) and deletes itself. */
  Process_Normal(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.Delete();
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), this.mAngle, 100);
  }
}
proto(CThing_Effect_MuzzleFlash, { _CLASSID_: 'CThing_Effect_MuzzleFlash' });

registerGameClass('Thing.Effect.CThing_Effect_MuzzleFlash', CThing_Effect_MuzzleFlash);
