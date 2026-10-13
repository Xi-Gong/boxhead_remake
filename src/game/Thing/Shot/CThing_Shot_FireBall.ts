// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot_FireBall.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_FireBall.txt (top-level script
// @376540..@377719).
import { flash, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_FireBall extends CThing_Shot {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;
  static mCollideRadius = 0.1;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, tDamageMultiply?: any, tSpeed?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    if (!Thing.Shot.CThing_Shot_FireBall.mcDrawObject_Cache) {
      Thing.Shot.CThing_Shot_FireBall.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Effect.FireBall');
    }
    this.mcDrawObject = Thing.Shot.CThing_Shot_FireBall.mcDrawObject_Cache.Clone();
    this.mDamageMultiply = tDamageMultiply;
    this.mDelta = this.mAngle.__get__mDelta().ScaleN(tSpeed != undefined ? tSpeed : 0.15);
    this.Process = this.Process_Init;
    this.mDamage = tDamage;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.SetRadius(!this.mDamageMultiply ? 0.25 : 1);
    this.oCollide = this.mWorld.mMap.mCollide;
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    this.mDelta.ScaleN(1.02);
    if (this.oCollide.GenericCollide(this)) {
      const _loc2_ = new flash.geom.Rectangle(this.mPosition.mX - this.mRadius, this.mPosition.mY - this.mRadius, this.mRadius * 2, this.mRadius * 2);
      this.mWorld.mMap.mAffect.AffectArea(_loc2_, !this.mDamageMultiply ? new Thing.Affect.CThing_Affect_FireBall(this.mParent, this, this.mDamage, this.mAngle) : new Thing.Affect.CThing_Affect_DevilAttack(this.mParent, this, 10000, this.mAngle));
      this.Delete();
      return;
    }
    this.Move(this.mPosition.Add(this.mDelta));
    this.mcDrawObject.Animate_Cycle(1);
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Shot_FireBall, { _CLASSID_: 'CThing_Shot_FireBall' });

registerGameClass('Thing.Shot.CThing_Shot_FireBall', CThing_Shot_FireBall);
