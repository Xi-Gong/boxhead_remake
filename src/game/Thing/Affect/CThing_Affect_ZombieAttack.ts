// Port of assets/projects/boxhead4/Thing/Affect/CThing_Affect_ZombieAttack.as
// Statement order / member layout from generated/disasm/Thing.Affect.CThing_Affect_ZombieAttack.txt (top-level script
// @495756..@495991).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Affect } from './CThing_Affect.ts';

export class CThing_Affect_ZombieAttack extends CThing_Affect {
  constructor(tOwner?: any, tDamage?: any) {
    super(Thing.Affect.CThing_Affect.mAffect_ZombieAttack, tOwner, tOwner, tDamage);
  }

  AffectThing(tThing?: any): any {
    tThing.mLife -= this.mDamage;
    return this.mDamage;
  }
}
proto(CThing_Affect_ZombieAttack, { _CLASSID_: 'CThing_Affect_ZombieAttack' });

registerGameClass('Thing.Affect.CThing_Affect_ZombieAttack', CThing_Affect_ZombieAttack);
