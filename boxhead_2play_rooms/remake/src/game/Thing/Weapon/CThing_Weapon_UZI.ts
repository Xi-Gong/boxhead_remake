// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_UZI.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_UZI.txt (top-level script
// @419182..@419876).
import { proto } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_UZI extends CThing_Weapon {
  /** Shared muzzle-flash draw object (created by the first constructor call). */
  static mcMuzzleFlash: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 4;
    this.mTotalAmmo = this.mAmmo = 100;
    this.mFireRateCount = 0;
    this.mDamage = 35;
    this.mAuto = true;
    this.mRange = 8;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    if (!Thing.Weapon.CThing_Weapon_UZI.mcMuzzleFlash) {
      Thing.Weapon.CThing_Weapon_UZI.mcMuzzleFlash = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional('UZI.MuzzleFlash', 8);
    }
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_UZI.txt @419583
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_MuzzleFlash(tPosition.Clone(), tAngle, Thing.Weapon.CThing_Weapon_UZI.mcMuzzleFlash));
    this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(tPosition, tAngle, this.mParent, this.mDamage, this.mRange));
    this.PlaySound(CSound.mSamples.Weapon_UZI_Fire_wav);
  }
}
proto(CThing_Weapon_UZI, { _CLASSID_: 'CThing_Weapon_UZI', mNameID: 'uzi', mName: 'UZI', mShortName: 'UZI' });

registerGameClass('Thing.Weapon.CThing_Weapon_UZI', CThing_Weapon_UZI);
