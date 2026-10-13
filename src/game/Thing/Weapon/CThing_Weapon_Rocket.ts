// Port of assets/projects/boxhead4/Thing/Weapon/CThing_Weapon_Rocket.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Rocket.txt (top-level script
// @425902..@426519).
import { proto } from '../../../engine/runtime.ts';
import { CSound, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Rocket extends CThing_Weapon {
  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 12;
    this.mTotalAmmo = this.mAmmo = 20;
    this.mFireRateCount = 0;
    this.mDamage = 250;
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Rocket.txt @426208
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    const _loc4_ = tPosition.Clone();
    const _loc3_ = this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Rocket(_loc4_, tAngle, this.mParent, this.mDamage));
    // Replaces the rocket's own explosion; it shares the rocket's position object (travels with the rocket).
    _loc3_.mEffect = new Thing.Effect.CThing_Effect_Explosion(_loc4_, tAngle, this.mParent, this.mDamage);
    _loc3_.mEffect.mClusterExplode = this.mClusterExplode;
    _loc3_.mEffect.mBiggerBang = this.mBiggerBang;
    this.PlaySound(CSound.mSamples.Weapon_Rocket_Fire_wav);
  }
}
proto(CThing_Weapon_Rocket, { _CLASSID_: 'CThing_Weapon_Rocket', mNameID: 'rocket', mName: 'Rocket Launcher', mShortName: 'Rockets' });

registerGameClass('Thing.Weapon.CThing_Weapon_Rocket', CThing_Weapon_Rocket);
