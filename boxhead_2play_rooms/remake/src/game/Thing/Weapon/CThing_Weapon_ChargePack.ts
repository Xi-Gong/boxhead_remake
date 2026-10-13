// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_ChargePack.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_ChargePack.txt (top-level script
// @443796..@444999).
import { forIn, proto } from '../../../engine/runtime.ts';
import { CSound, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_ChargePack extends CThing_Weapon {
  declare mDetonate: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 1;
    this.mTotalAmmo = this.mAmmo = 10;
    this.mFireRateCount = 0;
    this.mDamage = 150;
    this.mAuto = false;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    this.Reset();
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_ChargePack.txt @444254
  Process_Normal(): void {
  }

  /** A press places a charge pack; the next press detonates every charge pack this player owns. */
  Fire(tPosition?: any, tAngle?: any): void {
    if (this.mDetonate) {
      const _loc2_ = this.mThing_Collection.SearchThings('mParent', this.mParent, this.mThing_Collection.SearchThings('_CLASSID_', 'CThing_Object_ChargePack'));
      for (const _loc3_ of forIn(_loc2_)) {
        _loc2_[_loc3_].mDetonate = true;
      }
      this.mDetonate = false;
    } else {
      this.PlaySound(CSound.mSamples.Weapon_Mine_Place_wav);
      const _loc4_ = tPosition.Clone();
      const _loc5_ = this.mWorld.mMap.GetCell(_loc4_.mX, _loc4_.mY);
      if (_loc5_.mChildCount <= 1) {
        this.mThing_Collection.AddThing(new Thing.Object.CThing_Object_ChargePack(_loc4_, tAngle, this.mParent, this.mDamage));
        this.mDetonate = true;
        this.DecrementAmmo();
      }
    }
  }

  WeaponEmpty(): any {
    const _loc2_ = this.mThing_Collection.SearchThings('mParent', this.mParent, this.mThing_Collection.SearchThings('_CLASSID_', 'CThing_Object_ChargePack'));
    return _loc2_.length == 0 && this.mAmmo <= 0;
  }

  Reset(): void {
    super.Reset();
    // AS2: the constructor calls Reset() before Player.AddWeapon's Register_Thing() sets mThing_Collection ->
    // undefined.SearchThings(...) is undefined and undefined.length is undefined (mDetonate = undefined).
    const _loc3_ = this.mThing_Collection?.SearchThings('mParent', this.mParent, this.mThing_Collection.SearchThings('_CLASSID_', 'CThing_Object_ChargePack'));
    this.mDetonate = _loc3_?.length && this.mAmmo <= 0;
  }
}
proto(CThing_Weapon_ChargePack, { _CLASSID_: 'CThing_Weapon_ChargePack', mNameID: 'chargepack', mName: 'Charge Packs', mShortName: 'Charges' });

registerGameClass('Thing.Weapon.CThing_Weapon_ChargePack', CThing_Weapon_ChargePack);
