// Port of projects/boxhead4/Thing/Shot/CThing_Shot_ClusterShell.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot_ClusterShell.txt (top-level script
// @307335..@308535). Process_Normal: bounce-sound flag recovered from bytecode.
import { mathRandom, proto, random } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Shot } from './CThing_Shot.ts';

export class CThing_Shot_ClusterShell extends CThing_Shot {
  /** Shared draw object (created by the first constructor call). */
  static mcDrawObject: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition, tAngle, tParent, tDamage);
    this.mMaxLife = this.mLife = 16 + random(8);
    this.mDelta = this.mAngle.mDelta;
    this.mDelta.ScaleN(1 * (0.05 + mathRandom() * 0.05));
    this.mDelta.mZ = 0.5;
    this.SetRadius(0.1);
    if (!Thing.Shot.CThing_Shot_ClusterShell.mcDrawObject) {
      Thing.Shot.CThing_Shot_ClusterShell.mcDrawObject = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static('Shot.ClusterShell');
    }
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Normal(): void {
    let _loc2_ = false; // [BC] generated/disasm/Thing.Shot.CThing_Shot_ClusterShell.txt @307806
    this.mDelta.mZ -= 0.06;
    if (this.mPosition.mZ + this.mDelta.mZ < 0) {
      if ((this.mDelta.mZ = Math.abs(this.mDelta.mZ)) <= 0.06) {
        this.mDelta.mZ = 0;
      }
      this.mDelta.ScaleN(0.5);
      this.mPosition.mZ = 0;
      _loc2_ = true; // [BC] generated/disasm/Thing.Shot.CThing_Shot_ClusterShell.txt @308045
    }
    if (this.mWorld.mMap.mCollide.BounceCollide(this)) {
      _loc2_ = true; // [BC] generated/disasm/Thing.Shot.CThing_Shot_ClusterShell.txt @308094
      this.mDelta.ScaleN2D(0.25);
    }
    if (_loc2_ && this.mDelta.__get__mLength() > 0.06) { // [BC] generated/disasm/Thing.Shot.CThing_Shot_ClusterShell.txt @308178
      this.PlaySound(CSound.mSamples.Shot_Grenade_Bounce_wav);
    }
    this.Move(this.mPosition.Add(this.mDelta));
    if (--this.mLife == 0) {
      this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this, this.mDamage));
      this.Delete();
    }
  }

  Draw(): void {
    Thing.Shot.CThing_Shot_ClusterShell.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 100);
  }
}
proto(CThing_Shot_ClusterShell, { _CLASSID_: 'CThing_Shot_ClusterShell' });

registerGameClass('Thing.Shot.CThing_Shot_ClusterShell', CThing_Shot_ClusterShell);
