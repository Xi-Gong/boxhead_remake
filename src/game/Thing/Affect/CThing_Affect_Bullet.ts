// Port of assets/projects/boxhead4/Thing/Affect/CThing_Affect_Bullet.as
// Statement order / member layout from generated/disasm/Thing.Affect.CThing_Affect_Bullet.txt (top-level script
// @363400..@363671).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Affect } from './CThing_Affect.ts';

export class CThing_Affect_Bullet extends CThing_Affect {
  declare mHitDirection: any;

  constructor(tOwner?: any, tAffector?: any, tDamage?: any, tHitDirection?: any) {
    super(Thing.Affect.CThing_Affect.mAffect_Bullet, tOwner, tAffector, tDamage);
    this.mHitDirection = tHitDirection;
  }

  AffectThing(tThing?: any): any {
    tThing.mLife -= this.mDamage;
    return this.mDamage;
  }
}
proto(CThing_Affect_Bullet, { _CLASSID_: 'CThing_Affect_Bullet' });

registerGameClass('Thing.Affect.CThing_Affect_Bullet', CThing_Affect_Bullet);
