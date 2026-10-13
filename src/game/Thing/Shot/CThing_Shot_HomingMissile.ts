// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot_HomingMissile.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_HomingMissile.txt (top-level script
// @388620..@389758).
import { proto, random } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_HomingMissile extends CThing_Shot {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    if (!Thing.Shot.CThing_Shot_HomingMissile.mcDrawObject_Cache) {
      Thing.Shot.CThing_Shot_HomingMissile.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Shot.Rocket');
    }
    this.mEffect = new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this, this.mDamage);
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.mcDrawObject = Thing.Shot.CThing_Shot_HomingMissile.mcDrawObject_Cache.Clone();
    this.mDelta = this.mAngle.__get__mDelta().ScaleN(0.5);
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.SetRadius(0.25);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    if (random(2)) {
      this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_RocketSmoke(this.mPosition.Clone(), this.mAngle));
    }
    this.mDelta.ScaleN(1.1);
    const _loc3_ = this.mPosition.Add(this.mDelta);
    const _loc2_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, _loc3_, 0.04, Thing.Affect.CThing_Affect.mAffect_Bullet);
    if (_loc2_) {
      if (!_loc2_.mPOI) {
      }
      if (_loc2_.mCollideType == 'thing') {
      }
      this.Process_Explode();
      return;
    }
    this.Move(_loc3_);
    this.mcDrawObject.Animate_Cycle(1);
  }

  Process_Explode(): void {
    this.Delete();
    this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this, this.mDamage));
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Shot_HomingMissile, { _CLASSID_: 'CThing_Shot_HomingMissile' });

registerGameClass('Thing.Shot.CThing_Shot_HomingMissile', CThing_Shot_HomingMissile);
