// Port of assets/projects/boxhead4/Thing/Weapon/CThing_Weapon_Railgun.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Railgun.txt (top-level script
// @435423..@436117).
import { proto } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Railgun extends CThing_Weapon {
  /** Shared muzzle-flash draw object (created by the first constructor call). */
  static mcMuzzleFlash: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 5;
    this.mTotalAmmo = this.mAmmo = 15;
    this.mFireRateCount = 0;
    this.mDamage = 100;
    this.mAuto = false;
    this.mRange = 10;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    if (!Thing.Weapon.CThing_Weapon_Railgun.mcMuzzleFlash) {
      Thing.Weapon.CThing_Weapon_Railgun.mcMuzzleFlash = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional('Railgun.MuzzleFlash', 8);
    }
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Railgun.txt @435824
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_MuzzleFlash(tPosition.Clone(), tAngle, Thing.Weapon.CThing_Weapon_Railgun.mcMuzzleFlash));
    this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Railgun(tPosition, tAngle, this.mParent, this.mDamage, this.mRange));
    this.PlaySound(CSound.mSamples.Weapon_Railgun_Fire_wav);
  }
}
proto(CThing_Weapon_Railgun, { _CLASSID_: 'CThing_Weapon_Railgun', mNameID: 'railgun', mName: 'Railgun', mShortName: 'Railgun' });

registerGameClass('Thing.Weapon.CThing_Weapon_Railgun', CThing_Weapon_Railgun);
