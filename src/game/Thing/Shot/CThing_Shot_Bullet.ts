// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot_Bullet.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_Bullet.txt (top-level script
// @359436..@361245).
import { _root, flash, proto, random } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_Bullet extends CThing_Shot {
  static pDraw: any = new flash.geom.Point();

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, tRange?: any, tDelay?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    this.mDelay = tDelay != undefined ? tDelay : false;
    tRange = tRange != undefined ? tRange : 10;
    this.mDestination = this.mPosition.Add(new Thing.Math.CThing_Position(1, 0, 0).RotateZ(this.mAngle.__get__mAngle()).Normalize(tRange));
    this.mMaxLife = this.mLife = 2; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Bullet.txt @359731
    this.mDelta = new Thing.Math.CThing_Position(0, (random(4) + 2) / World.Map.CMap_Cell.mSize.x, (random(4) + 2) / World.Map.CMap_Cell.mSize.y).RotateZ(this.mAngle.__get__mAngle());
    this.mAlpha = 75;
    this.Process = !this.mDelay ? this.Process_Init : this.Process_Delay;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Delay(): void {
    this.Process = this.Process_Init;
  }

  /** Hit-scan: the whole range is resolved on the first tick; the tracer then fades for 2 ticks. */
  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    const _loc3_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, this.mDestination, 0.04, Thing.Affect.CThing_Affect.mAffect_Bullet);
    if (_loc3_) {
      if (_loc3_.mPOI) {
        this.mDestination.mX = _loc3_.mPOI.x;
        this.mDestination.mY = _loc3_.mPOI.y;
      }
      if (_loc3_.mCollideType == 'thing') {
        _loc3_.mThing.Affect(new Thing.Affect.CThing_Affect_Bullet(this.mParent, this, this.mDamage, this.mAngle));
      }
      if (_loc3_.mCollideType == 'wall') {
      }
      if (random(3) == 0 && _root._quality != 'LOW') {
        this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_BulletHit(this.mDestination.Clone()));
      }
      this.PlaySound(CSound.mSamples['Shot_HitWall_' + (random(3) + 1) + '_wav']);
    }
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    this.mDelta.ScaleN(0.75);
    this.mDestination.mX += this.mDelta.mX * 0.5;
    this.mDestination.mY += this.mDelta.mY * 0.5;
    this.mDestination.mZ += this.mDelta.mZ * 0.5;
    this.mPosition.mX += this.mDelta.mX;
    this.mPosition.mY += this.mDelta.mY;
    this.mPosition.mZ += this.mDelta.mZ;
    if (--this.mLife == 0) {
      this.Delete();
    }
  }

  Draw(): void {
    const _loc3_ = this.mWorld.GetScreenPosition(this.mPosition);
    const _loc2_ = this.mWorld.GetScreenPosition(this.mDestination);
    DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch, _loc3_, _loc2_, 0.5, 13421772, this.mAlpha);
  }
}
proto(CThing_Shot_Bullet, { _CLASSID_: 'CThing_Shot_Bullet' });

registerGameClass('Thing.Shot.CThing_Shot_Bullet', CThing_Shot_Bullet);
