// Port of projects/boxhead4/Thing/Object/CThing_Object_Barrel.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_Barrel.txt (top-level script
// @332747..@334714).
import { forIn, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_Barrel extends CThing_Object {
  /** Shared draw object (created by the first constructor call). */
  static mcDrawObject: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition.__get__mCellCentre(), tAngle, tParent);
    this.MakeIDUnique();
    this.mDamage = tDamage != undefined ? tDamage : 100;
    if (!Thing.Object.CThing_Object_Barrel.mcDrawObject) {
      Thing.Object.CThing_Object_Barrel.mcDrawObject = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static('Object.Barrel');
    }
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
    this.mCurrentCell.mCollide &= World.Map.CMap_Cell.mCollide_Object ^ -1;
  }

  Process_Init(): void {
    this.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet | Thing.Affect.CThing_Affect.mAffect_Explosion | Thing.Affect.CThing_Affect.mAffect_DevilAttack | Thing.Affect.CThing_Affect.mAffect_FireBall);
    this.mClusterExplode = this.mBiggerBang = 0; // [BC] generated/disasm/Thing.Object.CThing_Object_Barrel.txt @333316
    this.mMaxLife = this.mLife = 1; // [BC] generated/disasm/Thing.Object.CThing_Object_Barrel.txt @333343
    this.mHeight = 1;
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.mCurrentCell.mCollide |= World.Map.CMap_Cell.mCollide_Object;
    this.mWorld.mUpgrades.Register_Object(this);
    this.Process = !(this.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Player) ? this.Process_Normal_Init : this.Process_PlayerOnCell;
    this.Process();
  }

  Process_PlayerOnCell(): void {
    if (this.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Player) {
      return;
    }
    this.mFlags |= Thing.CThing.mFlag_Collidable;
    this.Process = this.Process_GrowRadius;
    this.Process();
  }

  Process_GrowRadius(): void {
    if (!this.GrowRadius(0.42)) {
      this.Process = this.Process_Normal_Init;
      this.Process();
    }
  }

  Process_Normal_Init(): void {
    this.SetRadius(0.42);
    this.mFlags |= Thing.CThing.mFlag_Collidable;
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    if (this.mAffectors.length) {
      this.ProcessAffects();
    }
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    Thing.Object.CThing_Object_Barrel.mcDrawObject.Render(this.mWorld.bmCurrentDraw, Thing.CThing.pDraw, 100);
  }

  /** Any damaging affect (even a 0-damage explosion corner hit) blows the barrel up -> chain reactions. */
  ProcessAffects(): void {
    const _loc4_ = this.mAffectors;
    this.mAffectors = new Array();
    for (const _loc5_ of forIn(_loc4_)) {
      const _loc3_ = _loc4_[_loc5_];
      switch (_loc3_.mType) {
        case Thing.Affect.CThing_Affect.mAffect_DevilAttack:
        case Thing.Affect.CThing_Affect.mAffect_Bullet:
        case Thing.Affect.CThing_Affect.mAffect_FireBall:
        case Thing.Affect.CThing_Affect.mAffect_Explosion: {
          this.mWorld.mUpgrades.ApplyUpgrade_Object(this);
          this.Delete();
          const _loc2_ = this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(this.mPosition, this.mAngle, this.mParent, this.mDamage));
          _loc2_.mClusterExplode = this.mClusterExplode;
          _loc2_.mBiggerBang = this.mBiggerBang;
          return;
        }
      }
    }
  }
}
proto(CThing_Object_Barrel, { _CLASSID_: 'CThing_Object_Barrel' });

registerGameClass('Thing.Object.CThing_Object_Barrel', CThing_Object_Barrel);
