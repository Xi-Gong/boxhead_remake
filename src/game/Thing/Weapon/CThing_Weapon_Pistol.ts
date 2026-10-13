// Port of assets/projects/boxhead4/Thing/Weapon/CThing_Weapon_Pistol.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Pistol.txt (top-level script
// @408928..@409635).
import { proto } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Pistol extends CThing_Weapon {
  /** Shared muzzle-flash draw object (created by the first constructor call). */
  static mcMuzzleFlash: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 8;
    this.mTotalAmmo = this.mAmmo = Thing.Weapon.CThing_Weapon.mInfinateAmmo;
    this.mFireRateCount = 0;
    this.mDamage = 26;
    this.mAuto = false;
    this.mRange = 8;
    if (!Thing.Weapon.CThing_Weapon_Pistol.mcMuzzleFlash) {
      Thing.Weapon.CThing_Weapon_Pistol.mcMuzzleFlash = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional('Pistol.MuzzleFlash', 8);
    }
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Pistol.txt @409345
  Process_Normal(): void {
  }

  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_MuzzleFlash(tPosition.Clone(), tAngle, Thing.Weapon.CThing_Weapon_Pistol.mcMuzzleFlash));
    // Note: the pistol bullet always uses the literal range 8, not this.mRange.
    this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(tPosition, tAngle, this.mParent, this.mDamage, 8));
    this.PlaySound(CSound.mSamples.Weapon_Pistol_Fire_wav);
  }
}
proto(CThing_Weapon_Pistol, { _CLASSID_: 'CThing_Weapon_Pistol', mNameID: 'pistol', mName: 'Pistol', mShortName: 'Pistol' });

registerGameClass('Thing.Weapon.CThing_Weapon_Pistol', CThing_Weapon_Pistol);
