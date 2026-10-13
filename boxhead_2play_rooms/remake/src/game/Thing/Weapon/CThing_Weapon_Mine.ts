// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_Mine.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Mine.txt.
import { proto } from '../../../engine/runtime.ts';
import { CSound, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Mine extends CThing_Weapon {
  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 1;
    this.mTotalAmmo = this.mAmmo = 10;
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Mine.txt @432411
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    const _loc2_ = tPosition.Clone();
    const _loc3_ = this.mWorld.mMap.GetCell(_loc2_.mX, _loc2_.mY);
    if (_loc3_.mChildCount <= 1) {
      this.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Mine(_loc2_, tAngle, this.mParent, this.mDamage));
      this.DecrementAmmo();
      this.PlaySound(CSound.mSamples.Weapon_Mine_Place_wav);
    }
  }
}
proto(CThing_Weapon_Mine, { _CLASSID_: 'CThing_Weapon_Mine', mNameID: 'mine', mName: 'Claymore', mShortName: 'Mines' });

registerGameClass('Thing.Weapon.CThing_Weapon_Mine', CThing_Weapon_Mine);
