// Port of assets/projects/boxhead4/World/Map/CMap_Cell.as
// Structure / statics from generated/disasm/World.Map.CMap_Cell.txt top-level script @151413..@166310.
//
// mObjects: an AS2 Array used as a hash map keyed by `thing.sUniqueID` ("t" + id, never integer-like), so its
// `length` stays 0: `mObjects.sort(...)` in Draw() is a no-op in AS2 and in JS alike, and for..in enumerates the
// string keys (forIn()). Kept as a JS Array on purpose (identical semantics).
//
// Navigation flow field (Nav_Update): BFS from the player cells over 4-neighbours, skipping mCollide_Navigation
// cells, stamped with nSID (= getTimer() of the restart). Time budget: getTimer() - nSTimer > nTimeOut (3 ms) and
// staleness 2000 ms in Nav_Direction — ported with getTimer(). See mNavBudgetMode for the TEST-ONLY override.
import { ArrayFlags, flash, forIn, getTimer, proto, random, sortOn } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, scidd, registerGameClass } from '../../packages.ts';

export class CMap_Cell {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;

  declare mPosition: any;
  declare mP1: any;
  declare mP2: any;
  declare mCentre: any;
  declare mArea: any;
  declare mID: any;
  declare mChildCount: number;
  declare mCollide: number;
  declare mObjects: any;
  declare nID: number;
  declare nDist: number;
  declare nVD: number;
  declare mAdjacentCells: any[];
  declare ac: any[];
  declare mEast: CMap_Cell;
  declare mSouth: CMap_Cell;
  declare mWest: CMap_Cell;
  declare mNorth: CMap_Cell;
  declare mNext: CMap_Cell;
  declare mSessionIDCheck: any;

  static mCellSize = 32;
  static mSize = new flash.geom.Point(CMap_Cell.mCellSize, CMap_Cell.mCellSize);
  static mCollide_None = 0;
  static mCollide_Solid = 1;
  static mCollide_Ledge = 2;
  static mCollide_Shot = 4;
  static mCollide_Path = 8;
  static mCollide_Road = 16;
  static mCollide_Creature = 32;
  static mCollide_Player = 64;
  static mCollide_Object = 128;
  static mCollide_EdgeOfMap = 256;
  static mCollide_StaticImpassable = CMap_Cell.mCollide_Ledge | CMap_Cell.mCollide_Solid;
  static mCollide_NonShootable = CMap_Cell.mCollide_Solid;
  static mCollide_NonMovable = CMap_Cell.mCollide_StaticImpassable | CMap_Cell.mCollide_Creature | CMap_Cell.mCollide_Object | CMap_Cell.mCollide_Player;
  static mCollide_Moving = CMap_Cell.mCollide_Creature | CMap_Cell.mCollide_Player;
  static mCollide_NonMovablePlayer = CMap_Cell.mCollide_StaticImpassable | CMap_Cell.mCollide_Creature | CMap_Cell.mCollide_Object | CMap_Cell.mCollide_Player;
  static mCollide_NoSpawn = CMap_Cell.mCollide_Creature | CMap_Cell.mCollide_Object;
  static mCollide_Navigation = CMap_Cell.mCollide_StaticImpassable | CMap_Cell.mCollide_Object;
  static mAdjacentCells_Amount = 8;
  static mCurrentSessionID = 0;
  static mDirection_E = 1;
  static mDirection_SE = 2;
  static mDirection_S = 4;
  static mDirection_SW = 8;
  static mDirection_W = 16;
  static mDirection_NW = 32;
  static mDirection_N = 64;
  static mDirection_NE = 128;
  static mDirections_Diagonal = CMap_Cell.mDirection_SE | CMap_Cell.mDirection_SW | CMap_Cell.mDirection_NW | CMap_Cell.mDirection_NE;
  static mDirections_Straight = CMap_Cell.mDirection_E | CMap_Cell.mDirection_S | CMap_Cell.mDirection_W | CMap_Cell.mDirection_N;
  static mDirections_All = CMap_Cell.mDirections_Diagonal | CMap_Cell.mDirections_Straight;
  static mDirectionM_E = (CMap_Cell.mDirection_E | CMap_Cell.mDirection_NE | CMap_Cell.mDirection_SE) ^ 4294967295;
  static mDirectionM_SE = CMap_Cell.mDirection_SE ^ 4294967295;
  static mDirectionM_S = (CMap_Cell.mDirection_S | CMap_Cell.mDirection_SE | CMap_Cell.mDirection_SW) ^ 4294967295;
  static mDirectionM_SW = CMap_Cell.mDirection_SW ^ 4294967295;
  static mDirectionM_W = (CMap_Cell.mDirection_W | CMap_Cell.mDirection_SW | CMap_Cell.mDirection_NW) ^ 4294967295;
  static mDirectionM_NW = CMap_Cell.mDirection_NW ^ 4294967295;
  static mDirectionM_N = (CMap_Cell.mDirection_N | CMap_Cell.mDirection_NW | CMap_Cell.mDirection_NE) ^ 4294967295;
  static mDirectionM_NE = CMap_Cell.mDirection_NE ^ 4294967295;
  static xPOI = new flash.geom.Point();
  static yPOI = new flash.geom.Point();
  static nSDist = 0;
  static nInterations = 5;
  static nTimeOut = 3;
  // Flow-field state (created by Nav_Reset/Nav_Update at runtime in AS2; declared here for typing only).
  static nState: any;
  static nSID: any;
  static nSTimer: any;
  static nFullScanCount: any;
  static nList: any[];
  static pList: any[];

  /**
   * TEST-ONLY switch (NOT in the AS2 original): `undefined` (default) = the original getTimer() budget
   * (`getTimer() - nSTimer > nTimeOut`, 3 ms). A number N makes the "resume"/"continue" budget check deterministic
   * and engine-independent: the check reports "out of time" once N cells have been popped from pList during the
   * current Nav_Update call. Never set by game code.
   */
  static mNavBudgetMode: number | undefined = undefined;
  /** TEST-ONLY counter for mNavBudgetMode (cells popped in the current Nav_Update call). */
  static mNavBudgetCells = 0;

  constructor(x: any, y: any) {
    this.mPosition = new flash.geom.Point(x, y);
    this.mP1 = this.mPosition;
    this.mP2 = new flash.geom.Point(x + 1, y + 1);
    this.mCentre = new Thing.Math.CThing_Position(x + 0.5, y + 0.5, 0);
    this.mArea = new flash.geom.Rectangle(this.mPosition.x, this.mPosition.y, 1, 1);
    this.mID = this.mPosition;
    this.mChildCount = 0;
    this.mCollide = World.Map.CMap_Cell.mCollide_None;
    this.mObjects = new Array();
    this.nID = -1;
  }

  SetAdjacents(tList: any[]): void {
    this.mAdjacentCells = tList;
    this.ac = this.mAdjacentCells;
    this.mEast = this.mAdjacentCells[0];
    this.mSouth = this.mAdjacentCells[2];
    this.mWest = this.mAdjacentCells[4];
    this.mNorth = this.mAdjacentCells[6];
    this.mNext = this.mEast;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  ContainsClassID(cCLASSID: any): any {
    for (const _loc2_ of forIn(this.mObjects)) {
      if (this.mObjects[_loc2_]._CLASSID_ == cCLASSID) {
        return this.mObjects[_loc2_];
      }
    }
    return undefined;
  }

  ContainsBaseClassID(cBASECLASSID: any): any {
    for (const _loc2_ of forIn(this.mObjects)) {
      if (this.mObjects[_loc2_]._BASECLASSID_ == cBASECLASSID) {
        return this.mObjects[_loc2_];
      }
    }
    return undefined;
  }

  Draw(): void {
    if (this.mChildCount > 1) {
      // No-op in AS2 too: mObjects has only string keys, length 0.
      this.mObjects.sort(this._SortOrder);
    }
    for (const _loc2_ of forIn(this.mObjects)) {
      this.mObjects[_loc2_].Draw();
    }
  }

  DebugDraw(): void {
    if (this.mCollide & World.Map.CMap_Cell.mCollide_Solid) {
      DrawPrimitive.CDrawPrimitive_Square.Draw(World.Map.CMap.mcDebug, new flash.geom.Point(this.mPosition.x * World.Map.CMap_Cell.mSize.x, this.mPosition.y * World.Map.CMap_Cell.mSize.y), World.Map.CMap_Cell.mSize.x, 65280, 50, false);
    }
  }

  DebugMark(tColor: any, tSolid: any): void {
    DrawPrimitive.CDrawPrimitive_Square.Draw(World.Map.CMap.mcDebug, new flash.geom.Point(this.mPosition.x * World.Map.CMap_Cell.mSize.x, this.mPosition.y * World.Map.CMap_Cell.mSize.y), World.Map.CMap_Cell.mSize.x, tColor, 50, tSolid);
  }

  _SortOrder(a: any, b: any): number {
    const _loc2_ = a.mPosition.mY;
    const _loc1_ = b.mPosition.mY;
    return _loc2_ <= _loc1_ ? (_loc2_ >= _loc1_ ? 0 : 1) : -1;
  }

  DeleteThing(tObject: any): void {
    delete this.mObjects[tObject.sUniqueID];
    this.mChildCount--;
  }

  AddThing(tObject: any): void {
    this.mObjects[tObject.sUniqueID] = tObject;
    this.mChildCount++;
  }

  Affect(tAffect: any): void {
    for (const _loc4_ of forIn(this.mObjects)) {
      const _loc2_ = this.mObjects[_loc4_];
      if (_loc2_.mAffectFlags & tAffect.mType && tAffect.mAffector.mID != _loc2_.mID) {
        this.mObjects[_loc4_].Affect(tAffect);
      }
    }
  }

  CollideFlagsInDirection(d: any): number {
    const _loc2_ = this.ac[d]?.mCollide;
    return !(d & 1) ? _loc2_ : _loc2_ | (this.ac[(d - 1) & 7].mCollide | this.ac[(d + 1) & 7].mCollide);
  }

  GetClearMoveDirection(d2: any, d1: any): number {
    let _loc2_: any;
    const _loc5_ = d2 <= d1 ? (Math.abs(d2 - d1) <= 4 ? -1 : 1) : Math.abs(d2 - d1) <= 4 ? 1 : -1;
    if (d2 & 1) {
      for (let _loc3_ = 1; _loc3_ <= 3; _loc3_ += 2) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @153657
        _loc2_ = (d2 + _loc3_ * _loc5_) & 7; // [BC] generated/disasm/World.Map.CMap_Cell.txt @153700
        if (!(this.CollideFlagsInDirection(_loc2_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
          return _loc2_;
        }
        _loc2_ = (d2 - _loc3_ * _loc5_) & 7; // [BC] generated/disasm/World.Map.CMap_Cell.txt @153778
        if (!(this.CollideFlagsInDirection(_loc2_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
          return _loc2_;
        }
      }
    } else {
      _loc2_ = (d2 + 2 * _loc5_) & 7;
      if (!(this.CollideFlagsInDirection(_loc2_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
        return _loc2_;
      }
      _loc2_ = (d2 - 2 * _loc5_) & 7;
      if (!(this.CollideFlagsInDirection(_loc2_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
        return _loc2_;
      }
    }
    return -1;
  }

  ValidMoveDirection(): any {
    for (let _loc2_ = 0; _loc2_ < 8; _loc2_ += 2) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @154064
      if (this.mAdjacentCells[_loc2_] != undefined && (this.mAdjacentCells[_loc2_].mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) == 0) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @154173
        return this.mAdjacentCells[_loc2_];
      }
    }
    return undefined;
  }

  LineIntersection(cLine: any): any {
    const _loc10_ = this.LineIntersection_Map(cLine);
    if (_loc10_) {
      return _loc10_;
    }
    for (const _loc9_ of forIn(this.mObjects)) {
      const _loc3_ = cLine.mTag;
      const _loc2_ = this.mObjects[_loc9_];
      if (_loc3_.mID != _loc2_.mID && _loc2_.mAffectFlags & _loc3_.cAffectFlags) {
        World.Map.CMap_Cell.xPOI.x = _loc2_.mPosition.mX;
        World.Map.CMap_Cell.xPOI.y = _loc2_.mPosition.mY;
        const _loc4_ = cLine.QDistance_PointToLine_SQR(World.Map.CMap_Cell.xPOI);
        if (_loc4_ < _loc2_.mRadius_SQR) {
          return { mCollideType: 'thing', mThing: _loc2_, mPOI: World.Map.CMap_Cell.xPOI };
        }
      }
    }
    return undefined;
  }

  LineIntersection_ThingList(cLine: any): any {
    const _loc4_ = cLine.mTag;
    const _loc5_: any[] = new Array();
    for (const _loc7_ of forIn(this.mObjects)) {
      const _loc2_ = this.mObjects[_loc7_];
      if (_loc4_.mID != _loc2_.mID && _loc2_.mAffectFlags & _loc4_.cAffectFlags) {
        World.Map.CMap_Cell.xPOI.x = _loc2_.mPosition.mX;
        World.Map.CMap_Cell.xPOI.y = _loc2_.mPosition.mY;
        const _loc3_ = cLine.QDistance_PointToLine_SQR(World.Map.CMap_Cell.xPOI);
        if (_loc3_ < _loc2_.mRadius_SQR) {
          _loc5_.push(_loc2_);
        }
      }
    }
    return _loc5_.length <= 0 ? undefined : _loc5_;
  }

  LineIntersection_Map(cLine: any): any {
    const _loc3_ = cLine.mTag;
    if ((this.mCollide & World.Map.CMap_Cell.mCollide_Solid) == World.Map.CMap_Cell.mCollide_Solid) {
      let _loc4_: any = undefined;
      let _loc5_: any = undefined;
      let _loc6_: any;
      let _loc7_: any;
      if (cLine.mTag.xDirection > 0) {
        _loc6_ = cLine.mP1.y + (this.mP1.x - cLine.mP1.x) * _loc3_.xGradient;
        if (_loc6_ >= this.mP1.y && _loc6_ <= this.mP2.y) {
          _loc4_ = true; // [BC] generated/disasm/World.Map.CMap_Cell.txt @155232
          World.Map.CMap_Cell.xPOI.x = this.mP1.x;
          World.Map.CMap_Cell.xPOI.y = _loc6_;
        }
      } else if (_loc3_.xDirection < 0) {
        _loc6_ = cLine.mP1.y + (this.mP2.x - cLine.mP1.x) * _loc3_.xGradient;
        if (_loc6_ >= this.mP1.y && _loc6_ <= this.mP2.y) {
          _loc4_ = true; // [BC] generated/disasm/World.Map.CMap_Cell.txt @155455
          World.Map.CMap_Cell.xPOI.x = this.mP2.x;
          World.Map.CMap_Cell.xPOI.y = _loc6_;
        }
      }
      if (_loc3_.yDirection > 0) {
        _loc7_ = cLine.mP1.x + (this.mP1.y - cLine.mP1.y) * _loc3_.yGradient;
        if (_loc7_ >= this.mP1.x && _loc7_ <= this.mP2.x) {
          _loc5_ = true; // [BC] generated/disasm/World.Map.CMap_Cell.txt @155673
          World.Map.CMap_Cell.yPOI.x = _loc7_;
          World.Map.CMap_Cell.yPOI.y = this.mP1.y;
        }
      } else if (_loc3_.yDirection < 0) {
        _loc7_ = cLine.mP1.x + (this.mP2.y - cLine.mP1.y) * _loc3_.yGradient;
        if (_loc7_ >= this.mP1.x && _loc7_ <= this.mP2.x) {
          _loc5_ = true; // [BC] generated/disasm/World.Map.CMap_Cell.txt @155896
          World.Map.CMap_Cell.yPOI.x = _loc7_;
          World.Map.CMap_Cell.yPOI.y = this.mP2.y;
        }
      }
      if (_loc4_ != undefined && _loc5_ != undefined) {
        return {
          mCollideType: 'wall',
          mPOI: scidd.Math.CMath.Distance_Sqr(World.Map.CMap_Cell.xPOI, cLine.mP1) >= scidd.Math.CMath.Distance_Sqr(World.Map.CMap_Cell.yPOI, cLine.mP1) ? World.Map.CMap_Cell.yPOI : World.Map.CMap_Cell.xPOI,
        };
      }
      if (_loc4_ != undefined || _loc5_ != undefined) {
        return { mCollideType: 'wall', mPOI: _loc4_ != undefined ? World.Map.CMap_Cell.xPOI : World.Map.CMap_Cell.yPOI }; // [BC] generated/disasm/World.Map.CMap_Cell.txt @156315
      }
    }
    return undefined;
  }

  Nav_Direction(cDir: any, tDir: any, tCollideFlags: any, tForceIt: any): number {
    const self = this as any;
    if (World.Map.CMap_Cell.nSTimer - this.nID < 2000) {
      const _loc9_ = 'NavDir_CW_'; // [BC] generated/disasm/World.Map.CMap_Cell.txt @156439 (unused in the original)
      void _loc9_;
      if (this.ac[tDir]?.nDist < this.nDist) {
        if (!(self['NavReal_' + tDir]?.() & tCollideFlags)) {
          return tDir;
        }
      }
      if (this.ac[cDir]?.nDist < this.nDist) {
        if (!(self['NavReal_' + cDir]?.() & tCollideFlags)) {
          return cDir;
        }
      }
      if (tForceIt == false) {
        if ((World.Map.CMap_Cell.nFullScanCount = World.Map.CMap_Cell.nFullScanCount + 1) > 5) {
          return -1;
        }
      }
      if (this.Nav_VD(tCollideFlags) == 0) {
        if (tForceIt == true) {
          // (empty in the original)
        }
        return -1;
      }
      const _loc4_ = sortOn(this.ac, 'nDist', ArrayFlags.RETURNINDEXEDARRAY | ArrayFlags.NUMERIC | ArrayFlags.DESCENDING) as number[];
      for (let _loc2_ = _loc4_.length - 1; _loc2_ >= 0; _loc2_--) {
        const _loc3_ = _loc4_[_loc2_]!;
        if (this.nVD & (1 << _loc3_)) {
          return _loc3_;
        }
      }
      if (tForceIt == true) {
        // (empty in the original)
      }
      return -1;
    }
    return this.NavReal_Dir(tDir, cDir, tCollideFlags);
  }

  NavReal_Dir(d2: any, d1: any, tCollideFlags: any): number {
    const self = this as any;
    const _loc5_ = 'NavReal_'; // [BC] generated/disasm/World.Map.CMap_Cell.txt @157012
    let _loc6_: any = undefined;
    let _loc3_: any = undefined;
    if (!(self[_loc5_ + d2]?.() & tCollideFlags)) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @157063
      return d2;
    }
    if (d1 != d2) {
      if (!(self[_loc5_ + d1]?.() & tCollideFlags)) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @157117
        return d1;
      }
      _loc6_ = d2 <= d1 ? (Math.abs(d2 - d1) <= 4 ? -1 : 1) : Math.abs(d2 - d1) <= 4 ? 1 : -1;
    } else {
      _loc6_ = random(2) * 2 - 1;
    }
    if (d2 & 1) {
      for (let _loc2_ = 1; _loc2_ <= 3; _loc2_ += 2) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @157333
        _loc3_ = (d2 + _loc2_ * _loc6_) & 7; // [BC] generated/disasm/World.Map.CMap_Cell.txt @157389
        if (!(self[_loc5_ + _loc3_]() & tCollideFlags)) {
          return _loc3_;
        }
        _loc3_ = (d2 - _loc2_ * _loc6_) & 7; // [BC] generated/disasm/World.Map.CMap_Cell.txt @157447
        if (!(self[_loc5_ + _loc3_]() & tCollideFlags)) {
          return _loc3_;
        }
      }
    } else {
      _loc3_ = (d2 + 2 * _loc6_) & 7;
      if (!(self[_loc5_ + _loc3_]() & tCollideFlags)) {
        return _loc3_;
      }
      _loc3_ = (d2 - 2 * _loc6_) & 7;
      if (!(self[_loc5_ + _loc3_]() & tCollideFlags)) {
        return _loc3_;
      }
    }
    return -1;
  }

  Nav_VD(tCollideFlags: any): number {
    this.nVD = World.Map.CMap_Cell.mDirections_All;
    if (this.mEast.mCollide & tCollideFlags) {
      this.nVD &= World.Map.CMap_Cell.mDirectionM_E;
    }
    if (this.mSouth.mCollide & tCollideFlags) {
      this.nVD &= World.Map.CMap_Cell.mDirectionM_S;
    }
    if (this.mWest.mCollide & tCollideFlags) {
      this.nVD &= World.Map.CMap_Cell.mDirectionM_W;
    }
    if (this.mNorth.mCollide & tCollideFlags) {
      this.nVD &= World.Map.CMap_Cell.mDirectionM_N;
    }
    if (this.nVD == 0) {
      return this.nVD;
    }
    if (this.nVD & World.Map.CMap_Cell.mDirections_Diagonal) {
      if (this.nVD & World.Map.CMap_Cell.mDirection_SE) {
        if (this.ac[1].mCollide & tCollideFlags) {
          this.nVD &= World.Map.CMap_Cell.mDirectionM_SE;
        }
      }
      if (this.nVD & World.Map.CMap_Cell.mDirection_SW) {
        if (this.ac[3].mCollide & tCollideFlags) {
          this.nVD &= World.Map.CMap_Cell.mDirectionM_SW;
        }
      }
      if (this.nVD & World.Map.CMap_Cell.mDirection_NW) {
        if (this.ac[5].mCollide & tCollideFlags) {
          this.nVD &= World.Map.CMap_Cell.mDirectionM_NW;
        }
      }
      if (this.nVD & World.Map.CMap_Cell.mDirection_NE) {
        if (this.ac[7].mCollide & tCollideFlags) {
          this.nVD &= World.Map.CMap_Cell.mDirectionM_NE;
        }
      }
    }
    return this.nVD;
  }

  NavDir_CW_0(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_N) ? -1 : 6) : 2) : 0;
  }

  NavDir_CW_2(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_E) ? -1 : 0) : 4) : 2;
  }

  NavDir_CW_4(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_S) ? -1 : 2) : 6) : 4;
  }

  NavDir_CW_6(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_W) ? -1 : 4) : 0) : 6;
  }

  NavDir_CW_1(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_SE) ? (!(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_E) ? -1 : 0) : 2) : 1;
  }

  NavDir_CW_3(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_SW) ? (!(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_S) ? -1 : 2) : 4) : 3;
  }

  NavDir_CW_5(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_NW) ? (!(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_W) ? -1 : 4) : 6) : 5;
  }

  NavDir_CW_7(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_NE) ? (!(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_N) ? -1 : 6) : 0) : 7;
  }

  NavDir_CCW_0(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_S) ? -1 : 2) : 6) : 0;
  }

  NavDir_CCW_2(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_W) ? -1 : 4) : 0) : 2;
  }

  NavDir_CCW_4(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_N) ? -1 : 6) : 2) : 4;
  }

  NavDir_CCW_6(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_E) ? -1 : 0) : 4) : 6;
  }

  NavDir_CCW_1(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_SE) ? (!(this.nVD & C.mDirection_E) ? (!(this.nVD & C.mDirection_S) ? -1 : 2) : 0) : 1;
  }

  NavDir_CCW_3(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_SW) ? (!(this.nVD & C.mDirection_S) ? (!(this.nVD & C.mDirection_W) ? -1 : 4) : 2) : 3;
  }

  NavDir_CCW_5(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_NW) ? (!(this.nVD & C.mDirection_W) ? (!(this.nVD & C.mDirection_N) ? -1 : 6) : 4) : 5;
  }

  NavDir_CCW_7(): number {
    const C = World.Map.CMap_Cell;
    return !(this.nVD & C.mDirection_NE) ? (!(this.nVD & C.mDirection_N) ? (!(this.nVD & C.mDirection_E) ? -1 : 0) : 6) : 7;
  }

  NavReal_0(): number {
    return this.ac[0].mCollide;
  }

  NavReal_1(): number {
    return this.ac[1].mCollide | this.ac[0].mCollide | this.ac[2].mCollide;
  }

  NavReal_2(): number {
    return this.ac[2].mCollide;
  }

  NavReal_3(): number {
    return this.ac[3].mCollide | this.ac[2].mCollide | this.ac[4].mCollide;
  }

  NavReal_4(): number {
    return this.ac[4].mCollide;
  }

  NavReal_5(): number {
    return this.ac[5].mCollide | this.ac[4].mCollide | this.ac[6].mCollide;
  }

  NavReal_6(): number {
    return this.ac[6].mCollide;
  }

  NavReal_7(): number {
    return this.ac[7].mCollide | this.ac[6].mCollide | this.ac[0].mCollide;
  }

  static Nav_Reset(): void {
    World.Map.CMap_Cell.nState = 'restart';
    World.Map.CMap_Cell.nSID = 0;
    delete (World.Map.CMap_Cell as any).pList;
  }

  static Nav_Restart(): void {
    World.Map.CMap_Cell.nState = World.Map.CMap_Cell.nState != 'finished' ? World.Map.CMap_Cell.nState : 'restart';
    if (World.Map.CMap_Cell.nState == 'restart') {
      World.Map.CMap_Cell.nSID = World.Map.CMap_Cell.nSID + 1;
    }
  }

  /** Budget check of "resume"/"continue" (original: getTimer() - nSTimer > nTimeOut; see mNavBudgetMode). */
  static _NavOutOfTime(): boolean {
    const C = World.Map.CMap_Cell;
    if (C.mNavBudgetMode !== undefined) {
      return C.mNavBudgetCells >= C.mNavBudgetMode; // TEST-ONLY deterministic budget (not in AS2)
    }
    return getTimer() - C.nSTimer > C.nTimeOut; // [BC] generated/disasm/World.Map.CMap_Cell.txt @163616 / @164175
  }

  static Nav_Update(sCellList: any): void {
    const C = World.Map.CMap_Cell;
    let _loc1_: any;
    let _loc2_: any;
    let _loc3_: any;
    C.nSTimer = getTimer(); // [BC] generated/disasm/World.Map.CMap_Cell.txt @162306
    C.mNavBudgetCells = 0; // TEST-ONLY counter reset (not in AS2)
    C.nFullScanCount = 0;
    if (C.nState == 'restart' || C.nState == undefined) {
      C.nList = new Array();
      C.nSID = C.nSTimer; // [BC] generated/disasm/World.Map.CMap_Cell.txt @162492
      C.nSDist = 0;
      for (const _loc5_ of forIn(sCellList)) {
        sCellList[_loc5_].NF_4();
      }
      for (_loc3_ = 0; _loc3_ < 5 && C.nList.length; _loc3_++) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @162597
        C.pList = C.nList;
        C.nList = new Array();
        for (const _loc2k_ of forIn(C.pList)) {
          _loc1_ = C.pList[_loc2k_ as any].ac;
          _loc1_[0].NF_4();
          _loc1_[2].NF_4();
          _loc1_[4].NF_4();
          _loc1_[6].NF_4();
        }
        C.nSDist = C.nSDist + 1; // [BC] generated/disasm/World.Map.CMap_Cell.txt @162990
      }
      C.nState = !C.nList.length ? 'finished' : 'resume';
    } else if (C.nState == 'resume') {
      for (_loc3_ = 0; _loc3_ < 5 && C.nList.length; _loc3_++) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163131
        C.pList = C.nList;
        C.nList = new Array();
        while (C.pList.length) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163272
          // Bytecode quirk kept: the counter starts at `nInterations && pList.length` (= pList.length, i.e. the whole
          // layer), unlike the "continue" branch below. [BC] generated/disasm/asm/World.Map.CMap_Cell.txt @163313..@163374
          for (_loc2_ = C.nInterations && C.pList.length; _loc2_; _loc2_--) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163370
            _loc1_ = C.pList.pop().ac; // [BC] generated/disasm/World.Map.CMap_Cell.txt @163431
            C.mNavBudgetCells++; // TEST-ONLY counter (not in AS2)
            _loc1_[0].NF_4();
            _loc1_[2].NF_4();
            _loc1_[4].NF_4();
            _loc1_[6].NF_4();
          }
          if (C._NavOutOfTime()) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163616
            C.nState = 'continue';
            return;
          }
        }
        C.nSDist = C.nSDist + 1; // [BC] generated/disasm/World.Map.CMap_Cell.txt @163702
      }
      C.nState = !C.nList.length ? 'finished' : 'resume';
    } else if (C.nState == 'continue') {
      while (C.pList.length) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163831
        for (_loc2_ = C.nInterations; _loc2_ && C.pList.length; _loc2_--) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @163891
          _loc1_ = C.pList.pop().ac; // [BC] generated/disasm/World.Map.CMap_Cell.txt @163990
          C.mNavBudgetCells++; // TEST-ONLY counter (not in AS2)
          _loc1_[0].NF_4();
          _loc1_[2].NF_4();
          _loc1_[4].NF_4();
          _loc1_[6].NF_4();
        }
        if (C._NavOutOfTime()) { // [BC] generated/disasm/World.Map.CMap_Cell.txt @164175
          C.nState = 'continue';
          return;
        }
      }
      C.nSDist = C.nSDist + 1; // [BC] generated/disasm/World.Map.CMap_Cell.txt @164261
      C.nState = !C.nList.length ? 'finished' : 'resume';
    }
  }

  NF_4(): void {
    if (!(this.mCollide & World.Map.CMap_Cell.mCollide_Navigation || this.nID == World.Map.CMap_Cell.nSID)) {
      this.nID = World.Map.CMap_Cell.nSID;
      this.nDist = World.Map.CMap_Cell.nSDist;
      World.Map.CMap_Cell.nList.push(this);
    }
  }
}
proto(CMap_Cell, { _CLASSID_: 'CMap_Cell', _BASECLASSID_: 'CMap_Cell' });

registerGameClass('World.Map.CMap_Cell', CMap_Cell);
