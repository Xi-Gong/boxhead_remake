// Port of projects/boxhead4/Thing/Weapon/CThing_Weapon_Shotgun.as
// Statement order / member layout from generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt (top-level script
// @421804..@423157). Fire(): pellet loop recovered from bytecode (ffdec lost the counter and the delay flag).
import { proto } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Weapon } from './CThing_Weapon.ts';

export class CThing_Weapon_Shotgun extends CThing_Weapon {
  /** Shared muzzle-flash draw object (created by the first constructor call). */
  static mcMuzzleFlash: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mFireRate = 12;
    this.mTotalAmmo = this.mAmmo = 20;
    this.mFireRateCount = 0;
    this.mDamage = 51;
    this.mAuto = false;
    this.mRange = 7;
    this.mWideShot = 0;
    tParent.mWorld.mUpgrades.Register_Weapon(this);
    if (!Thing.Weapon.CThing_Weapon_Shotgun.mcMuzzleFlash) {
      Thing.Weapon.CThing_Weapon_Shotgun.mcMuzzleFlash = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional('Shotgun.MuzzleFlash', 8);
    }
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @422356
  Process_Normal(): void {
  }

  /**
   * Centre pellet, then pairs at -a/+a for a = step, 2*step (step = 1.25 deg * (mWideShot + 1)): one pair without the
   * WideShot/WiderShot upgrade (3 pellets), two pairs with it (5 pellets; the outer pair is delayed one tick).
   */
  Fire(tPosition?: any, tAngle?: any): void {
    super.Fire(tPosition, tAngle);
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_MuzzleFlash(tPosition.Clone(), tAngle, Thing.Weapon.CThing_Weapon_Shotgun.mcMuzzleFlash));
    this.PlaySound(CSound.mSamples.Weapon_Shotgun_Fire_wav);
    const _loc6_ = this.mRange;
    const _loc8_ = this.mParent;
    this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(tPosition.Clone(), tAngle, _loc8_, this.mDamage, _loc6_));
    let _loc3_ = 0; // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @422650
    const _loc5_ = 1.25 * (this.mWideShot + 1);
    let _loc4_ = _loc5_;
    while (_loc3_ <= (!this.mWideShot ? 0 : 1)) { // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @422697
      this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(tPosition.Clone(), new Thing.Math.CThing_Angle(tAngle.__get__mAngle() - (_loc4_ * 3.141592653589793) / 180), _loc8_, this.mDamage, _loc6_, _loc3_ >= 1)); // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @422893
      this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(tPosition.Clone(), new Thing.Math.CThing_Angle(tAngle.__get__mAngle() + (_loc4_ * 3.141592653589793) / 180), _loc8_, this.mDamage, _loc6_, _loc3_ >= 1)); // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @423042
      _loc3_++; // [BC] generated/disasm/Thing.Weapon.CThing_Weapon_Shotgun.txt @423056
      _loc4_ += _loc5_;
    }
  }
}
proto(CThing_Weapon_Shotgun, { _CLASSID_: 'CThing_Weapon_Shotgun', mNameID: 'shotgun', mName: 'Shotgun', mShortName: 'Shotgun' });

registerGameClass('Thing.Weapon.CThing_Weapon_Shotgun', CThing_Weapon_Shotgun);
