// Port of projects/boxhead4/Thing/Shot/CThing_Shot_Devastator.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_Devastator.txt (top-level script
// @368211..@369606). _FireLine: counter loop recovered from bytecode.
import { proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_Devastator extends CThing_Shot {
  declare mCounter: any;

  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    if (!Thing.Shot.CThing_Shot_Devastator.mcDrawObject_Cache) {
      Thing.Shot.CThing_Shot_Devastator.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Shot.Devastator');
    }
    this.mcDrawObject = Thing.Shot.CThing_Shot_Devastator.mcDrawObject_Cache.Clone();
    this.mDelta = this.mAngle.__get__mDelta().ScaleN(0.9);
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.SetRadius(0.25);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    const _loc2_ = this.mPosition.Add(this.mDelta);
    const _loc3_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, _loc2_, 0.04, Thing.Affect.CThing_Affect.mAffect_Bullet);
    if (_loc3_) {
      if (_loc3_.mCollideType == 'wall') {
        this.Delete();
        return;
      }
    }
    if (!(this.mCounter++ % 2) && this.mCounter >= 4) {
      this._FireLine(this.mAngle.Clone().Add(1.5707963267948966));
      this._FireLine(this.mAngle.Clone().Sub(1.5707963267948966));
    }
    this.Move(_loc2_);
    this.mcDrawObject.Animate_Cycle(1);
  }

  _FireLine(a?: any): void {
    const _loc5_ = this.mWorld.mMap;
    const _loc4_ = a.__get__mDelta().ScaleN(0.4);
    let _loc2_ = this.mPosition.Add(_loc4_);
    _loc2_.mZ = 0;
    _loc4_.ScaleN(2);
    let _loc3_ = 8; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Devastator.txt @369246
    while (_loc3_) { // [BC] generated/disasm/Thing.Shot.CThing_Shot_Devastator.txt @369251
      if (_loc5_.GetCell(_loc2_.mX, _loc2_.mY).mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) {
        break;
      }
      this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(_loc2_, this.mAngle.Clone(), this, 200));
      _loc3_--; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Devastator.txt @369421
      _loc2_ = _loc2_.Add(_loc4_);
    }
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Shot_Devastator, { _CLASSID_: 'CThing_Shot_Devastator', mCounter: 0 });

registerGameClass('Thing.Shot.CThing_Shot_Devastator', CThing_Shot_Devastator);
