// Port of assets/projects/boxhead4/Thing/Affect/CThing_Affect.as
// Statement order / member layout from generated/disasm/Thing.Affect.CThing_Affect.txt (top-level script
// @176063..@176477).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';

export class CThing_Affect {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mType: any;
  declare mDamage: any;
  declare mAffector: any;
  declare mOwner: any;

  static mAffect_None = 0;
  static mAffect_Bullet = 1;
  static mAffect_Electricuted = 2;
  static mAffect_Explosion = 4;
  static mAffect_Punched = 8;
  static mAffect_Push = 16;
  static mAffect_Vapourize = 32;
  static mAffect_ZombieAttack = 64;
  static mAffect_PlayerLineOfSight = 128;
  static mAffect_DevilAttack = 256;
  static mAffect_FireBall = 512;

  constructor(tType?: any, tOwner?: any, tAffector?: any, tDamage?: any) {
    this.mType = tType;
    this.mDamage = tDamage;
    this.mAffector = tAffector;
    this.mOwner = tOwner;
  }

  toString(): string {
    return this._CLASSID_;
  }

  // ffdec showed `var Dispose = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Affect.CThing_Affect.txt @176202
  Dispose(): void {
  }

  AffectThing(tThing?: any): any {
    tThing.mLife -= this.mDamage;
    return this.mDamage;
  }
}
proto(CThing_Affect, { _CLASSID_: 'CThing_Affect', _BASECLASSID_: 'CThing_Affect' });

registerGameClass('Thing.Affect.CThing_Affect', CThing_Affect);
