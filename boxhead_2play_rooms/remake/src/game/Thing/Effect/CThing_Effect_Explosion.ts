// Port of projects/boxhead4/Thing/Effect/CThing_Effect_Explosion.as
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt (top-level script
// @301151..@302932). Process_Init: both angle loops recovered from bytecode (ffdec lost the loop variable).
import { flash, mathRandom, proto, random } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_Explosion extends CThing_Effect {
  // ---- AS2 dynamic instance fields ----
  declare mRange: any;
  declare mDelay: any;
  declare mBiggerBang: any;
  declare mClusterExplode: any;

  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition, tAngle, tParent);
    this.MakeIDUnique();
    this.mDamage = tDamage;
    // Radius in cells: 2 + 0.005 per damage point above 100.
    this.mRange = 2 + Math.max(this.mDamage - 100, 0) * 0.005;
    this.mDelay = 0;
    this.mClusterExplode = this.mBiggerBang = 0; // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301360
    if (!Thing.Effect.CThing_Effect_Explosion.mcDrawObject_Cache) {
      Thing.Effect.CThing_Effect_Explosion.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Effect.Explosion');
    }
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    let _loc2_: any;
    let _loc3_: any;
    let _loc4_: any;
    if (this.mClusterExplode) {
      _loc2_ = 0; // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301615
      _loc3_ = Thing.Math.CThing_Angle.PI360 / 4;
      while (_loc2_ < Thing.Math.CThing_Angle.PI360) { // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301658
        _loc4_ = new Thing.Math.CThing_Angle(_loc2_ + mathRandom() * (_loc3_ / 2) - _loc3_ / 4); // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301762
        this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_ClusterShell(this.mPosition.Clone(), _loc4_, this.mParent, this.mDamage));
        _loc2_ = _loc2_ + _loc3_; // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301859
      }
    }
    if (this.mBiggerBang) {
      _loc2_ = 0; // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301895
      _loc3_ = Thing.Math.CThing_Angle.PI360 / (this.mBiggerBang * 1.5);
      while (_loc2_ < Thing.Math.CThing_Angle.PI360) { // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @301951
        _loc4_ = new Thing.Math.CThing_Angle(_loc2_ + mathRandom() * (_loc3_ / 4) - _loc3_ / 8); // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @302055
        const _loc5_ = this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(this.mPosition.Add(_loc4_.__get__mDelta()), _loc4_, this.mParent, this.mDamage));
        _loc5_.mDelay = 2 + random(4);
        _loc2_ = _loc2_ + _loc3_; // [BC] generated/disasm/Thing.Effect.CThing_Effect_Explosion.txt @302189
      }
    }
    this.Process = this.Process_Delay;
    this.Process();
  }

  Process_Delay(): void {
    if (--this.mDelay >= 0) {
      return;
    }
    this.mWorld.Shake(new flash.geom.Point(0, 30));
    this.mWorld.mBrightness = 1;
    // The affected area is the bounding SQUARE of the radius (CMap_Affect.AffectArea); the falloff is in
    // CThing_Affect_Explosion.AffectThing (things in the corners get 0 damage but are still "hit").
    const _loc2_ = new flash.geom.Rectangle(this.mPosition.mX - this.mRange, this.mPosition.mY - this.mRange, this.mRange * 2, this.mRange * 2);
    this.mWorld.mMap.mAffect.AffectArea(_loc2_, new Thing.Affect.CThing_Affect_Explosion(this.mParent, this, this.mDamage, this.mRange));
    this.mWorld.mBrightness = 1;
    this.mWorld.mMap.mDecal.Draw_ScorchMark(this.mPosition);
    this.PlaySound(CSound.mSamples.Effect_Explosion_wav);
    this.mcDrawObject = Thing.Effect.CThing_Effect_Explosion.mcDrawObject_Cache.Clone();
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    if (this.mcDrawObject.Animate(2.5)) {
      this.Delete();
    }
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Effect_Explosion, { _CLASSID_: 'CThing_Effect_Explosion' });

registerGameClass('Thing.Effect.CThing_Effect_Explosion', CThing_Effect_Explosion);
