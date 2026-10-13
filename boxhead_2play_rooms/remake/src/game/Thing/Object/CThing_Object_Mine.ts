// Port of projects/boxhead4/Thing/Object/CThing_Object_Mine.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_Mine.txt (top-level script
// @342983..@344516).
import { proto } from '../../../engine/runtime.ts';
import { CMain, CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_Mine extends CThing_Object {
  declare mTestFlags: any;

  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any) {
    super(tPosition.__get__mCellCentre(), tAngle, tParent);
    this.mDamage = tDamage != undefined ? tDamage : 100;
    this.mFlags |= Thing.CThing.mFlag_SortFloor;
    if (!Thing.Object.CThing_Object_Mine.mcDrawObject_Cache) {
      Thing.Object.CThing_Object_Mine.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Object.Mine');
    }
    this.mcDrawObject = Thing.Object.CThing_Object_Mine.mcDrawObject_Cache.Clone();
    this.mClusterExplode = this.mBiggerBang = 0; // [BC] generated/disasm/Thing.Object.CThing_Object_Mine.txt @343283
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
    // Triggered by creatures; in DeathMatch also by players (after the cell was first left empty).
    this.mTestFlags = World.Map.CMap_Cell.mCollide_Creature | (World.CWorld.mGameMode != 'DeathMatch' ? 0 : World.Map.CMap_Cell.mCollide_Player);
    this.Process = World.CWorld.mGameMode != 'DeathMatch' ? this.Process_Normal : this.Process_WaitForCollideFlags0;
    this.Process();
  }

  Process_WaitForCollideFlags0(): void {
    if ((this.mCurrentCell.mCollide & this.mTestFlags) == 0) {
      this.Process = this.Process_Normal;
    }
  }

  Process_Normal(): void {
    this.mcDrawObject.Animate_Cycle(1 / CMain.mFPS);
    if (this.mCurrentCell.mCollide & this.mTestFlags) {
      this.mDetonateCounter = CMain.mFPS * 2;
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
proto(CThing_Object_Mine, { _CLASSID_: 'CThing_Object_Mine' });

registerGameClass('Thing.Object.CThing_Object_Mine', CThing_Object_Mine);
