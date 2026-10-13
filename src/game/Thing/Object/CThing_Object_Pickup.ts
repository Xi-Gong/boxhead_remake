// Port of assets/projects/boxhead4/Thing/Object/CThing_Object_Pickup.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_Pickup.txt (top-level script
// @347507..@349128).
import { proto } from '../../../engine/runtime.ts';
import { CMain, CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_Pickup extends CThing_Object {
  // ---- AS2 dynamic instance fields ----
  declare mReappearCount: any;
  declare mDeleteCounter: any;
  /** Set by World code for dropped pickups (deleted instead of respawning). */
  declare mDeleteOnPickup: any;

  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition.__get__mCellCentre(), tAngle, tParent);
    if (!Thing.Object.CThing_Object_Pickup.mcDrawObject_Cache) {
      Thing.Object.CThing_Object_Pickup.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Object.Pickup');
    }
    this.mcDrawObject = Thing.Object.CThing_Object_Pickup.mcDrawObject_Cache.Clone();
    this.Process = this.Process_Init;
    this.mAlpha = 100;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.AddThing(this);
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    if (this.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Player) {
      this.PickedUp();
    }
  }

  Process_Count(): void {
    if (--this.mReappearCount < 0) {
      this.Process = this.Process_Init;
    }
  }

  Process_DeleteCounter_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.Process = this.Process_DeleteCounter;
  }

  Process_DeleteCounter(): void {
    if (--this.mDeleteCounter < 0) {
      this.Delete();
      return;
    }
    if (this.mDeleteCounter < CMain.mFPS) {
      this.mAlpha = (this.mDeleteCounter / CMain.mFPS) * 100;
    }
    if (this.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Player) {
      this.PickedUp();
    }
  }

  PickedUp(): void {
    let _loc2_: any = undefined;
    if ((_loc2_ = this.mCurrentCell.ContainsClassID('CThing_Creature_Player'))) {
      if (_loc2_.mFlags & Thing.CThing.mFlag_DEAD) {
        return;
      }
      _loc2_.RandomPickup();
    }
    this.PlaySound(CSound.mSamples.Object_Pickup_wav);
    if (this.mDeleteOnPickup) {
      this.Delete();
      return;
    }
    this.mWorld.mMap.mMapwho.DeleteThing(this);
    this.mReappearCount = CMain.mFPS * (World.CWorld.mGameMode != 'DeathMatch' ? 30 : 10);
    this.Process = this.Process_Count;
  }

  SetDeleteCounter(tCount?: any): void {
    this.mDeleteCounter = tCount;
    this.Process = this.Process_DeleteCounter_Init;
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, Thing.CThing.pDraw, 1, this.mAlpha);
  }
}
proto(CThing_Object_Pickup, { _CLASSID_: 'CThing_Object_Pickup' });

registerGameClass('Thing.Object.CThing_Object_Pickup', CThing_Object_Pickup);
