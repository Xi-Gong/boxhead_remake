// Port of assets/projects/boxhead4/Thing/Object/CThing_Object_ChargePack.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_ChargePack.txt (top-level script
// @337025..@338327).
import { proto } from '../../../engine/runtime.ts';
import { CMain, CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_ChargePack extends CThing_Object {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition.__get__mCellCentre(), tAngle, tParent);
    this.mDamage = tDamage != undefined ? tDamage : 100;
    this.mFlags |= Thing.CThing.mFlag_SortFloor;
    this.mClusterExplode = this.mBiggerBang = 0; // [BC] generated/disasm/Thing.Object.CThing_Object_ChargePack.txt @337204
    if (!Thing.Object.CThing_Object_ChargePack.mcDrawObject_Cache) {
      Thing.Object.CThing_Object_ChargePack.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Object.ChargePack');
    }
    this.mcDrawObject = Thing.Object.CThing_Object_ChargePack.mcDrawObject_Cache.Clone();
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
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.mWorld.mUpgrades.Register_Object(this);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    this.mcDrawObject.Animate_Cycle(1 / CMain.mFPS);
    if (this.mDetonate) {
      this.mDetonateCounter = CMain.mFPS / 10;
      this.PlaySound(CSound.mSamples.Object_Mine_Detonate_wav);
      this.Process = this.Process_Detonate;
      this.Process();
    }
  }

  Process_Detonate(): void {
    this.mcDrawObject.Animate_Cycle(1);
    if (--this.mDetonateCounter < 0) {
      this.mWorld.mUpgrades.ApplyUpgrade_Object(this);
      const _loc2_ = this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this.mParent, this.mDamage));
      _loc2_.mClusterExplode = this.mClusterExplode;
      _loc2_.mBiggerBang = this.mBiggerBang;
      this.Delete();
    }
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, Thing.CThing.pDraw, 1, 100);
  }
}
proto(CThing_Object_ChargePack, { _CLASSID_: 'CThing_Object_ChargePack' });

registerGameClass('Thing.Object.CThing_Object_ChargePack', CThing_Object_ChargePack);
