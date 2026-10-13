// Port of assets/projects/boxhead4/Thing/Affect/CThing_Affect_FireBall.as
// Statement order / member layout from generated/disasm/Thing.Affect.CThing_Affect_FireBall.txt (top-level script
// @382502..@382773).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Affect } from './CThing_Affect.ts';

export class CThing_Affect_FireBall extends CThing_Affect {
  declare mHitDirection: any;

  constructor(tOwner?: any, tAffector?: any, tDamage?: any, tHitDirection?: any) {
    super(Thing.Affect.CThing_Affect.mAffect_FireBall, tOwner, tAffector, tDamage);
    this.mHitDirection = tHitDirection;
  }

  AffectThing(tThing?: any): any {
    tThing.mLife -= this.mDamage;
    return this.mDamage;
  }
}
proto(CThing_Affect_FireBall, { _CLASSID_: 'CThing_Affect_FireBall' });

registerGameClass('Thing.Affect.CThing_Affect_FireBall', CThing_Affect_FireBall);
