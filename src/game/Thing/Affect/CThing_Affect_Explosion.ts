// Port of assets/projects/boxhead4/Thing/Affect/CThing_Affect_Explosion.as
// Statement order / member layout from generated/disasm/Thing.Affect.CThing_Affect_Explosion.txt (top-level script
// @313499..@313949).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Affect } from './CThing_Affect.ts';

export class CThing_Affect_Explosion extends CThing_Affect {
  declare mRange: any;

  constructor(tOwner?: any, tAffector?: any, tDamage?: any, tRange?: any) {
    super(Thing.Affect.CThing_Affect.mAffect_Explosion, tOwner, tAffector, tDamage);
    this.mRange = tRange;
  }

  /** Damage falloff: distance <= 0.5R -> 100 %, <= 0.75R -> 75 %, <= R -> 50 %, beyond R -> 0 (no life change). */
  AffectThing(tThing?: any): any {
    const _loc4_ = tThing.mPosition.Distance2D(this.mAffector.mPosition);
    if (_loc4_ <= this.mRange) {
      const _loc3_ = _loc4_ / this.mRange;
      const _loc2_ = _loc3_ > 0.5 ? (_loc3_ > 0.75 ? this.mDamage * 0.5 : this.mDamage * 0.75) : this.mDamage;
      tThing.mLife -= _loc2_;
      return _loc2_;
    }
    return 0;
  }
}
proto(CThing_Affect_Explosion, { _CLASSID_: 'CThing_Affect_Explosion' });

registerGameClass('Thing.Affect.CThing_Affect_Explosion', CThing_Affect_Explosion);
