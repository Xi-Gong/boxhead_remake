// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot_Laser.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_Laser.txt (top-level script
// @392490..@393531).
import { _root, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_Laser extends CThing_Shot {
  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, tRange?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    tRange = tRange != undefined ? tRange : 10;
    this.mDestination = this.mPosition.Add(this.mAngle.__get__mDelta().ScaleN(100));
    this.mAlpha = 75;
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    if (_root._quality != 'LOW') {
      this.mWorld.mMap.mMapwho.MoveThing(this);
    }
    const _loc3_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, this.mDestination, 0.04, Thing.Affect.CThing_Affect.mAffect_Bullet, true);
    if (_loc3_) {
      if (_loc3_.mPOI) {
        this.mDestination.mX = _loc3_.mPOI.x;
        this.mDestination.mY = _loc3_.mPOI.y;
      }
    }
    this.mWorld.mMap.mAffect.Affect_Line(this, this.mPosition, this.mDestination, 0.04, new Thing.Affect.CThing_Affect_Bullet(this.mParent, this, this.mDamage, this.mAngle));
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    // Original quirk kept: mLife is never set (undefined - 1 = NaN, never == 0), so the laser never deletes itself.
    if (--this.mLife == 0) {
      this.Delete();
    }
  }

  Draw(): void {
    const _loc3_ = this.mWorld.GetScreenPosition(this.mPosition);
    const _loc2_ = this.mWorld.GetScreenPosition(this.mDestination);
    DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch, _loc3_, _loc2_, 3, 8421631, this.mAlpha * 0.5);
    DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch, _loc3_, _loc2_, 2, 16777215, this.mAlpha);
  }
}
proto(CThing_Shot_Laser, { _CLASSID_: 'CThing_Shot_Laser' });

registerGameClass('Thing.Shot.CThing_Shot_Laser', CThing_Shot_Laser);
