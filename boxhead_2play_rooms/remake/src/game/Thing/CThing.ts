// Port of projects/boxhead4/Thing/CThing.as
// Statement order / member layout from generated/disasm/Thing.CThing.txt (top-level script @269837..@272464).
import { flash, proto } from '../../engine/runtime.ts';
import { Thing, registerGameClass } from '../packages.ts';

export class CThing {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;

  // ---- AS2 dynamic instance fields (created by the constructor / methods; typed loosely like AS2) ----
  declare mP: any;
  declare mPosition: any;
  declare mAngle: any;
  declare mParent: any;
  declare mUniqueID: any;
  declare sUniqueID: any;
  declare mID: any;
  declare mFlags: any;
  /** Set by CThing_Collection.AddThing / Register_Thing. */
  declare mWorld: any;
  declare mThing_Collection: any;
  declare mRadius: any;
  declare mRadius_SQR: any;
  declare mAffectors: any;
  declare mAffectFlags: any;
  /**
   * Current process function. AS2 keeps it as an INSTANCE property (`this.Process = this.Process_Init`); Delete()
   * removes it again (`delete this.Process`) so CThing_Collection.Process() calls nothing for the dead thing.
   */
  declare Process: any;
  // Fields shared by most subclasses (declared once here for the loose AS2 typing).
  declare mLife: any;
  declare mMaxLife: any;
  declare mDamage: any;
  declare mDelta: any;
  declare mHeight: any;
  declare mAlpha: any;
  declare mCurrentCell: any;
  declare mcDrawObject: any;

  static mAllocate_ID = 0;
  static mAllocate_ProcessID_Count = 3;
  static mFlag_Collidable = 1;
  static mFlag_WaitForMove = 2;
  static mFlag_CellMoved = 4;
  static mFlag_Drawn = 8;
  static mFlag_SortFloor = 16;
  static mFlag_DEAD = 32;
  static pDraw: any = new flash.geom.Point(0, 0);

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    this.mP = this.mPosition = tPosition;
    this.mAngle = tAngle != undefined ? tAngle : new Thing.Math.CThing_Angle(0);
    this.mParent = tParent;
    this.mUniqueID = Thing.CThing.mAllocate_ID = Thing.CThing.mAllocate_ID + 1; // [BC] generated/disasm/Thing.CThing.txt @270082
    this.sUniqueID = 't' + this.mUniqueID;
    this.mID = this.mParent != undefined ? tParent.mID : this.mUniqueID;
    this.mFlags = 0;
  }

  MakeIDUnique(): void {
    this.mID = this.mUniqueID;
  }

  static Renew(): void {
    Thing.CThing.mAllocate_ID = 0;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    this.mWorld.mMap.mMapwho.DeleteThing(this);
  }

  SetRadius(tRadius?: any): void {
    this.mRadius = tRadius;
    this.mRadius_SQR = this.mRadius * this.mRadius;
  }

  GrowRadius(tRadius?: any): boolean {
    if (this.mRadius == undefined) {
      this.mRadius = 0;
    }
    if (this.mRadius < tRadius) {
      this.SetRadius(this.mRadius + 0.05);
      return true;
    }
    return false;
  }

  Delete(): void {
    delete this.Process;
    this.mThing_Collection.DeleteThing(this);
  }

  Move(nPosition?: any): void {
    if (nPosition != this.mPosition) {
      this.mPosition.mX = nPosition.mX;
      this.mPosition.mY = nPosition.mY;
      this.mPosition.mZ = nPosition.mZ;
    }
    this.mWorld.mMap.mMapwho.MoveThing(this);
  }

  Affect_Setup(tFlags?: any): void {
    this.mAffectors = new Array();
    this.mAffectFlags = tFlags;
  }

  Affect(tAffect?: any): void {
    this.mAffectors.push(tAffect);
  }

  ClearAffects(): void {
    this.mAffectFlags = 0;
  }

  PlaySound(tSound?: any, tPosition?: any): void {
    // AS2: tSound may be undefined (e.g. players have no mSound.Damage) -> calling a method of undefined is a no-op.
    tSound?.PlaySound(new flash.geom.Point(0, 0));
  }

  static DummyThings(): any {
    Thing.CThing.Renew();
    return undefined;
  }
}
proto(CThing, { _CLASSID_: 'CThing', _BASECLASSID_: 'CThing' });

registerGameClass('Thing.CThing', CThing);
