// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_SmartBomb.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_SmartBomb.txt (top-level script
// @440464..@441124).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_SmartBomb extends CThing_Weapon {
  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 12;
    this.mTotalAmmo = this.mAmmo = 20;
    this.mFireRateCount = 0;
    this.mDamage = 100;
    this.mAuto = false;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_SmartBomb.txt @440904
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    // Original bug kept: `mParent.Angle` does not exist (undefined -> CThing creates a new CThing_Angle(0)).
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_SmartBomb(this.mParent.mPosition, this.mParent.Angle, this.mParent, 3));
    this.DecrementAmmo();
  }
}
proto(CThing_Weapon_SmartBomb, { _CLASSID_: 'CThing_Weapon_SmartBomb', mNameID: 'smartbomb', mName: 'Smart Bomb' });

registerGameClass('Thing.Weapon.CThing_Weapon_SmartBomb', CThing_Weapon_SmartBomb);
