// Port of assets/projects/boxhead4/Thing/Weapon/CThing_Weapon_Devastator.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Devastator.txt (top-level script
// @438490..@438982).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Devastator extends CThing_Weapon {
  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 4;
    this.mTotalAmmo = this.mAmmo = Thing.Weapon.CThing_Weapon.mInfinateAmmo;
    this.mFireRateCount = 0;
    this.mDamage = 100;
    this.mAuto = true;
    this.mRange = 8;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Devastator.txt @438825
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Devastator(tPosition, tAngle, this.mParent, this.mDamage));
  }
}
proto(CThing_Weapon_Devastator, { _CLASSID_: 'CThing_Weapon_Devastator', mNameID: 'devastator', mName: 'The Devastator' });

registerGameClass('Thing.Weapon.CThing_Weapon_Devastator', CThing_Weapon_Devastator);
