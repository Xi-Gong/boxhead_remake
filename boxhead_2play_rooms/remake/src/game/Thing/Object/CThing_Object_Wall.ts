// Port of projects/boxhead4/Thing/Object/CThing_Object_Wall.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_Wall.txt (top-level script
// @351763..@354065).
import { forIn, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_Wall extends CThing_Object {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition.__get__mCellCentre(), tAngle, tParent);
    this.MakeIDUnique();
    this.Process = this.Process_Init;
    this.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet | Thing.Affect.CThing_Affect.mAffect_Explosion | Thing.Affect.CThing_Affect.mAffect_ZombieAttack | Thing.Affect.CThing_Affect.mAffect_DevilAttack | Thing.Affect.CThing_Affect.mAffect_FireBall);
    this.mMaxLife = this.mLife = 1000; // [BC] generated/disasm/Thing.Object.CThing_Object_Wall.txt @352031
    this.mAlpha = 100;
    if (!Thing.Object.CThing_Object_Wall.mcDrawObject_Cache) {
      Thing.Object.CThing_Object_Wall.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Object.Wall');
    }
    this.mcDrawObject = Thing.Object.CThing_Object_Wall.mcDrawObject_Cache.Clone();
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
    this.mCurrentCell.mCollide &= World.Map.CMap_Cell.mCollide_Object ^ -1;
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.mCurrentCell.mCollide |= World.Map.CMap_Cell.mCollide_Object;
    this.mHeight = 1;
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
    if (!this.GrowRadius(0.48)) {
      this.Process = this.Process_Normal;
      this.Process();
    }
  }

  Process_Normal_Init(): void {
    this.SetRadius(0.42);
    this.mFlags |= Thing.CThing.mFlag_Collidable;
    this.Process = this.Process_Sleep;
  }

  Process_Normal(): void {
    if (this.mAffectors.length) {
      this.ProcessAffects();
    }
  }

  Process_FadeOut(): void {
    this.mAlpha -= 20;
    if (this.mAlpha < 10) {
      this.Delete();
    }
  }

  /** Wakes the wall up (Process_Sleep -> Process_Normal) whenever something affects it. */
  Affect(tAffect?: any): void {
    super.Affect(tAffect);
    this.Process = this.Process_Normal;
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, Thing.CThing.pDraw, 1, this.mAlpha);
  }

  ProcessAffects(): void {
    for (const _loc3_ of forIn(this.mAffectors)) {
      const _loc2_ = this.mAffectors[_loc3_];
      switch (_loc2_.mType) {
        case Thing.Affect.CThing_Affect.mAffect_Bullet:
        case Thing.Affect.CThing_Affect.mAffect_FireBall:
        case Thing.Affect.CThing_Affect.mAffect_Explosion:
        case Thing.Affect.CThing_Affect.mAffect_ZombieAttack:
        case Thing.Affect.CThing_Affect.mAffect_DevilAttack:
          _loc2_.AffectThing(this);
          if (this.mLife <= 0) {
            this.ClearAffects();
            this.mFlags |= Thing.CThing.mFlag_Collidable;
            this.Process = this.Process_FadeOut;
            this.Process_FadeOut();
            this.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_SmokeCloud(this.mPosition.Clone()));
            this.mWorld.mMap.mDecal.Draw_ScorchMark(this.mPosition);
            return;
          }
          this.mcDrawObject.GotoToFrame(Math.floor((1 - this.mLife / this.mMaxLife) * this.mcDrawObject.__get__mFrameAmount()));
          break;
      }
    }
    this.mAffectors = new Array();
    this.Process = this.Process_Sleep;
  }
}
proto(CThing_Object_Wall, { _CLASSID_: 'CThing_Object_Wall' });

registerGameClass('Thing.Object.CThing_Object_Wall', CThing_Object_Wall);
