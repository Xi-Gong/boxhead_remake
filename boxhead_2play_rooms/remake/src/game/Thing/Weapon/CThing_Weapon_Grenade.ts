// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_Grenade.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Grenade.txt (top-level script
// @428889..@429750).
import { getTimer, proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass, scidd } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Grenade extends CThing_Weapon {
  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 12;
    this.mTotalAmmo = this.mAmmo = 20;
    this.mFireRateCount = 0;
    this.mDamage = 150;
    this.mAuto = false;
    this.mOnRelease = true;
    this.mRange = 6;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Grenade.txt @429352
  Process_Normal(): void {
  }

  /** tTime = the fire key's mTimePressed; throw power = hold time in seconds clamped to [0.25, 0.75]. */
  Fire(tPosition?: any, tAngle?: any, tTime?: any): void {
    const _loc3_ = tPosition.Clone();
    const _loc4_ = (getTimer() - tTime) / 1000; // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Grenade.txt @429443
    const _loc2_ = this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Grenade(_loc3_, tAngle, this.mParent, this.mDamage, scidd.Math.CMath.Range(_loc4_, 0.25, 0.75)));
    // The explosion shares the grenade's position object (it travels with the grenade).
    _loc2_.mEffect = new Thing.Effect.CThing_Effect_Explosion(_loc3_, tAngle, this.mParent, this.mDamage);
    _loc2_.mEffect.mClusterExplode = this.mClusterExplode;
    _loc2_.mEffect.mBiggerBang = this.mBiggerBang;
    this.DecrementAmmo();
  }
}
proto(CThing_Weapon_Grenade, { _CLASSID_: 'CThing_Weapon_Grenade', mNameID: 'grenade', mName: 'Grenades', mShortName: 'Grenades' });

registerGameClass('Thing.Weapon.CThing_Weapon_Grenade', CThing_Weapon_Grenade);
