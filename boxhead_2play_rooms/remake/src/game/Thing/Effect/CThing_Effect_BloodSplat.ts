// Port of projects/boxhead4/Thing/Effect/CThing_Effect_BloodSplat.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_BloodSplat.txt (top-level script
// @284690..@284967).
import { proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_BloodSplat extends CThing_Effect {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.Process = this.Process_Normal;
    if (!Thing.Effect.CThing_Effect_BloodSplat.mcDrawObject_Cache) {
      Thing.Effect.CThing_Effect_BloodSplat.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional('Effect.Explosion');
    }
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }
}
proto(CThing_Effect_BloodSplat, { _CLASSID_: 'CThing_Effect_BloodSplat' });

registerGameClass('Thing.Effect.CThing_Effect_BloodSplat', CThing_Effect_BloodSplat);
