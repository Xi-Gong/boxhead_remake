// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot_Railgun.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_Railgun.txt (top-level script
// @395890..@397440).
import { flash, proto, random } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_Railgun extends CThing_Shot {
  static pDraw: any = new flash.geom.Point();

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, tRange?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    tRange = tRange != undefined ? tRange : 10;
    this.mDestination = this.mPosition.Add(new Thing.Math.CThing_Position(1, 0, 0).RotateZ(this.mAngle.__get__mAngle()).Normalize(tRange));
    this.mMaxLife = this.mLife = 2; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Railgun.txt @396145
    this.mDelta = new Thing.Math.CThing_Position(0, (random(4) + 2) / World.Map.CMap_Cell.mSize.x, (random(4) + 2) / World.Map.CMap_Cell.mSize.y).RotateZ(this.mAngle.__get__mAngle());
    this.mAlpha = 75;
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  /** Piercing: everything along the line (up to the first wall) is affected via CMap_Affect.Affect_Line. */
  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    const _loc2_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, this.mDestination, 0.04, Thing.Affect.CThing_Affect.mAffect_Bullet, true);
    if (_loc2_) {
      if (_loc2_.mPOI) {
        this.mDestination.mX = _loc2_.mPOI.x;
        this.mDestination.mY = _loc2_.mPOI.y;
      }
    }
    this.mWorld.mMap.mAffect.Affect_Line(this, this.mPosition, this.mDestination, 0.04, new Thing.Affect.CThing_Affect_Bullet(this.mParent, this, this.mDamage, this.mAngle));
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
    DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch, _loc3_, _loc2_, 2, 10053375, this.mAlpha * 0.75);
  }
}
proto(CThing_Shot_Railgun, { _CLASSID_: 'CThing_Shot_Railgun' });

registerGameClass('Thing.Shot.CThing_Shot_Railgun', CThing_Shot_Railgun);
