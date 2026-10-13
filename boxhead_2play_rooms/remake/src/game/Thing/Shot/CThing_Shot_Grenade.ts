// Port of projects/boxhead4/Thing/Shot/CThing_Shot_Grenade.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt (top-level script
// @384701..@386023). Process_Normal: bounce-sound flag recovered from bytecode.
import { proto } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_Grenade extends CThing_Shot {
  /** Shared draw object (created by the first constructor call). */
  static mcDrawObject: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, tPower?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    this.mPower = tPower;
    this.mEffect = new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this, this.mDamage);
    if (!Thing.Shot.CThing_Shot_Grenade.mcDrawObject) {
      Thing.Shot.CThing_Shot_Grenade.mcDrawObject = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static('Shot.Grenade');
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
    this.mMaxLife = this.mLife = 60; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt @385096
    this.mPosition.mZ = 40 / World.Map.CMap_Cell.mSize.x;
    this.mDelta = this.mAngle.mDelta;
    this.mDelta.mZ = 0.5;
    this.mDelta.ScaleN(1 * this.mPower);
    this.SetRadius(0.1);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    let _loc2_ = false; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt @385298
    this.mDelta.mZ -= 0.06;
    if (this.mPosition.mZ + this.mDelta.mZ < 0) {
      if ((this.mDelta.mZ = Math.abs(this.mDelta.mZ)) <= 0.06) {
        this.mDelta.mZ = 0;
      }
      this.mDelta.ScaleN(0.5);
      this.mPosition.mZ = 0;
      _loc2_ = true; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt @385537
    }
    if (this.mWorld.mMap.mCollide.BounceCollide(this)) {
      _loc2_ = true; // [BC] generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt @385586
      this.mDelta.ScaleN2D(0.25);
    }
    if (_loc2_ && this.mDelta.__get__mLength() > 0.06) { // [BC] generated/disasm/Thing.Shot.CThing_Shot_Grenade.txt @385670
      this.PlaySound(CSound.mSamples.Shot_Grenade_Bounce_wav);
    }
    this.Move(this.mPosition.Add(this.mDelta));
    if (--this.mLife == 0) {
      this.Process_Explode();
    }
  }

  Process_Explode(): void {
    this.mThing_Collection.AddThing_Effect(this.mEffect);
    this.Delete();
  }

  Draw(): void {
    Thing.Shot.CThing_Shot_Grenade.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 100);
  }
}
proto(CThing_Shot_Grenade, { _CLASSID_: 'CThing_Shot_Grenade' });

registerGameClass('Thing.Shot.CThing_Shot_Grenade', CThing_Shot_Grenade);
