// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon.txt (top-level script
// @403903..@405859).
import { proto } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';
import { CThing } from '../CThing.ts';

export class CThing_Weapon extends CThing {
  declare mNameID: any;
  declare mName: any;
  declare mShortName: any;
  // ---- AS2 dynamic instance fields ----
  declare mFireRateCount: any;
  declare mFireRate: any;
  declare mTotalAmmo: any;
  declare mAmmo: any;
  declare mAuto: any;
  declare mOnRelease: any;
  declare mRange: any;
  declare mFire: any;
  // Upgrade flags written by World.CUpgrades.ApplyUpgrade_Weapon (read by Grenade / Rocket / Shotgun).
  declare mClusterExplode: any;
  declare mBiggerBang: any;
  declare mWideShot: any;

  static mInfinateAmmo = 999999;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRateCount = 0;
    this.mFireRate = 10;
    this.mTotalAmmo = this.mAmmo = Thing.Weapon.CThing_Weapon.mInfinateAmmo;
  }

  static byCLASSID(tCLASSID?: any, tPosition?: any, tAngle?: any, tParent?: any): any {
    switch (tCLASSID) {
      case 'CThing_Weapon_Pistol':
        return new Thing.Weapon.CThing_Weapon_Pistol(tPosition, tAngle, tParent);
      case 'CThing_Weapon_UZI':
        return new Thing.Weapon.CThing_Weapon_UZI(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Shotgun':
        return new Thing.Weapon.CThing_Weapon_Shotgun(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Rocket':
        return new Thing.Weapon.CThing_Weapon_Rocket(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Grenade':
        return new Thing.Weapon.CThing_Weapon_Grenade(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Mine':
        return new Thing.Weapon.CThing_Weapon_Mine(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Barrel':
        return new Thing.Weapon.CThing_Weapon_Barrel(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Railgun':
        return new Thing.Weapon.CThing_Weapon_Railgun(tPosition, tAngle, tParent);
      case 'CThing_Weapon_Devastator':
        return new Thing.Weapon.CThing_Weapon_Devastator(tPosition, tAngle, tParent);
      case 'CThing_Weapon_SmartBomb':
        return new Thing.Weapon.CThing_Weapon_SmartBomb(tPosition, tAngle, tParent);
      case 'CThing_Weapon_ChargePack':
        return new Thing.Weapon.CThing_Weapon_ChargePack(tPosition, tAngle, tParent);
      case 'CThing_Weapon_FakeWall':
        return new Thing.Weapon.CThing_Weapon_FakeWall(tPosition, tAngle, tParent);
      default:
        return undefined;
    }
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Reset(): void {
    this.mFireRateCount = 0;
  }

  Update(tKey?: any): void {
    this.mWorld.mUpgrades.ApplyUpgrade_Weapon(this);
    if (this.WeaponEmpty()) {
      this.mWorld.mHud.AddMessage_Critical(this.mName + ' is out of ammo!');
      this.mParent.SelectWeapon('pistol');
      return;
    }
    if (--this.mFireRateCount <= 0) {
      this.mFireRateCount = 0;
      if (this.mAuto) {
        if ((this.mFire = tKey.IsDown())) {
          this.Fire(this.mParent.GetWeaponPosition(), this.mParent.mAngle.Clone(), tKey.mTimeDown);
        }
      } else if (this.mOnRelease) {
        if ((this.mFire = tKey.IsReleased())) {
          this.Fire(this.mParent.GetWeaponPosition(), this.mParent.mAngle.Clone(), tKey.mTimePressed);
        }
      } else if ((this.mFire = tKey.IsPressed())) {
        this.Fire(this.mParent.GetWeaponPosition(), this.mParent.mAngle.Clone());
      }
    }
  }

  WeaponEmpty(): any {
    return this.mAmmo <= 0;
  }

  /** `_tTime` only types the 3rd argument Update() passes (used by CThing_Weapon_Grenade.Fire); AS2 ignores extras. */
  Fire(tPosition?: any, tAngle?: any, _tTime?: any): void {
    this.DecrementAmmo();
  }

  DecrementAmmo(): void {
    this.mAmmo -= this.mTotalAmmo != Thing.Weapon.CThing_Weapon.mInfinateAmmo ? 1 : 0;
    this.mFireRateCount = this.mFireRate;
  }

  EmptyWeapon(): void {
    this.mAmmo = this.mTotalAmmo != Thing.Weapon.CThing_Weapon.mInfinateAmmo ? 0 : this.mTotalAmmo;
  }
}
proto(CThing_Weapon, { _CLASSID_: 'CThing_Weapon', _BASECLASSID_: 'CThing_Weapon', mNameID: 'none', mName: 'NONE' });

registerGameClass('Thing.Weapon.CThing_Weapon', CThing_Weapon);
