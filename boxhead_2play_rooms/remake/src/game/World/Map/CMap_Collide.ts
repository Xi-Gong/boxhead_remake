// Port of projects/boxhead4/World/Map/CMap_Collide.as
// Structure from generated/disasm/World.Map.CMap_Collide.txt top-level script @136225..@141015.
import { flash, forIn, proto } from '../../../engine/runtime.ts';
import { CMain, Thing, World, scidd, registerGameClass } from '../../packages.ts';

export class CMap_Collide {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  static _StepSize = 1;
  declare mMap: any;
  declare mCells: any[];
  declare mCollideFlag: boolean;

  constructor(tMap: any) {
    this.mMap = tMap;
    this.mCells = this.mMap.mCells;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  /** Marks the half-open cell rectangle [p1, p2) with cFlags (OR). */
  MarkArea_PP(p1: any, p2: any, cFlags: any): void {
    for (let _loc4_ = p1.mY; _loc4_ < p2.mY; _loc4_++) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @136397
      let _loc2_ = p1.mX; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136427
      const _loc3_ = this.mCells[_loc4_]; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136446
      while (_loc2_ < p2.mX) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @136451
        // AS2: a write to a member of undefined (row/cell off the map) is silently ignored.
        const cell = _loc3_?.[_loc2_];
        if (cell != undefined) {
          cell.mCollide = cell.mCollide | cFlags; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136498
        }
        _loc2_ = _loc2_ + 1; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136505
      }
    }
  }

  PlayerCollide(tThing: any): any {
    const _loc5_ = tThing.mPosition;
    if (this.mCells[_loc5_.mY & 65535]?.[_loc5_.mX & 65535]?.mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) {
      return _loc5_;
    }
    let _loc3_: any;
    for (let _loc4_ = 3; _loc4_; _loc4_--) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @136666
      this.mCollideFlag = false; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136691
      if (CMain.mSaveData.mCollisionsActive) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @136711
        _loc3_ = this.Collide_Mapwho(tThing.mPosition.Add(tThing.mDelta), tThing.mRadius, tThing.mID); // [BC] generated/disasm/World.Map.CMap_Collide.txt @136772
        tThing.mDelta.mX = _loc3_.mX - tThing.mPosition.mX; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136810
        tThing.mDelta.mY = _loc3_.mY - tThing.mPosition.mY; // [BC] generated/disasm/World.Map.CMap_Collide.txt @136844
      }
      _loc3_ = this.Collide_Map(tThing.mPosition, tThing.mDelta, tThing.mRadius * 0.85); // [BC] generated/disasm/World.Map.CMap_Collide.txt @136895
      if (!this.mCollideFlag) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @136910
        break;
      }
    }
    return _loc3_;
  }

  CreatureCollide(tThing: any): any {
    const _loc5_ = tThing.mPosition;
    if (this.mCells[_loc5_.mY & 65535]?.[_loc5_.mX & 65535]?.mCollide & World.Map.CMap_Cell.mCollide_EdgeOfMap) {
      return _loc5_;
    }
    let _loc3_: any;
    for (let _loc4_ = 1; _loc4_; _loc4_--) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @137077
      this.mCollideFlag = false; // [BC] generated/disasm/World.Map.CMap_Collide.txt @137102
      _loc3_ = this.Collide_Mapwho(tThing.mPosition.Add(tThing.mDelta), tThing.mRadius, tThing.mID); // [BC] generated/disasm/World.Map.CMap_Collide.txt @137159
      tThing.mDelta.mX = _loc3_.mX - tThing.mPosition.mX; // [BC] generated/disasm/World.Map.CMap_Collide.txt @137197
      tThing.mDelta.mY = _loc3_.mY - tThing.mPosition.mY; // [BC] generated/disasm/World.Map.CMap_Collide.txt @137231
      _loc3_ = this.Collide_Map(tThing.mPosition, tThing.mDelta, tThing.mRadius); // [BC] generated/disasm/World.Map.CMap_Collide.txt @137269
      if (!this.mCollideFlag) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @137284
        break;
      }
    }
    tThing.mDelta.mX = _loc3_.mX - tThing.mPosition.mX;
    tThing.mDelta.mY = _loc3_.mY - tThing.mPosition.mY;
    return _loc3_;
  }

  BounceCollide(tThing: any): boolean {
    this.mCollideFlag = false;
    let _loc3_ = tThing.mDelta.Clone();
    let _loc4_ = this.Collide_Mapwho_Height(tThing.mPosition.Add(_loc3_), tThing.mRadius, tThing.mID);
    _loc3_.mX = _loc4_.mX - tThing.mPosition.mX;
    _loc3_.mY = _loc4_.mY - tThing.mPosition.mY;
    _loc4_ = this.Collide_Map(tThing.mPosition, _loc3_, tThing.mRadius);
    if (!this.mCollideFlag) {
      return false;
    }
    _loc3_ = tThing.mDelta;
    const _loc5_ = _loc4_.Subtract(tThing.mPosition.Add(_loc3_)).Normalize2D(1);
    const _loc6_ = 2 * (_loc3_.mX * _loc5_.mX + _loc3_.mY * _loc5_.mY);
    tThing.mDelta.mX = _loc3_.mX - _loc5_.mX * _loc6_;
    tThing.mDelta.mY = _loc3_.mY - _loc5_.mY * _loc6_;
    return true;
  }

  GenericCollide(tThing: any): boolean {
    this.mCollideFlag = false;
    const _loc3_ = tThing.mDelta.Clone();
    let _loc4_ = this.Collide_Mapwho(tThing.mPosition.Add(_loc3_), tThing.mRadius, tThing.mID);
    _loc3_.mX = _loc4_.mX - tThing.mPosition.mX;
    _loc3_.mY = _loc4_.mY - tThing.mPosition.mY;
    _loc4_ = this.Collide_Map(tThing.mPosition, _loc3_, tThing.mRadius);
    void _loc4_;
    return this.mCollideFlag;
  }

  Collide_Map(main_p: any, main_d: any, main_r: any): any {
    if (isNaN(main_p.mX) || isNaN(main_d.mX)) {
      // (empty in the shipped bytecode: debug trace stripped)
    }
    if (this.mCells[main_p.mY & 65535]?.[main_p.mX & 65535]?.mCollide & World.Map.CMap_Cell.mCollide_EdgeOfMap) {
      return main_p;
    }
    const _loc2_ = main_p.Add(main_d);
    if (!this.QCollide_Map(_loc2_, main_r)) {
      return _loc2_;
    }
    this.mCollideFlag = true;
    _loc2_.mY = main_p.mY;
    if (!this.QCollide_Map(_loc2_, main_r)) {
      return _loc2_;
    }
    _loc2_.mY = main_p.mY + main_d.mY;
    _loc2_.mX = main_p.mX;
    if (!this.QCollide_Map(_loc2_, main_r)) {
      return _loc2_;
    }
    return main_p;
  }

  QCollide_Map(main_p: any, main_r: any, main_ry?: any): boolean {
    const _loc5_ = new flash.geom.Rectangle(main_p.mX - main_r, main_p.mY - main_r, main_r * 2, main_r * 2);
    const _loc2_ = this.mMap.GetCellList_Area(_loc5_, true);
    for (const _loc3_ of forIn(_loc2_)) {
      if (_loc2_[_loc3_].mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) {
        return true;
      }
    }
    return false;
  }

  Collide_Mapwho(main_p: any, main_r: any, main_ID: any): any {
    const _loc8_ = this.mMap.GetCellList_Area(new flash.geom.Rectangle(main_p.mX - main_r, main_p.mY - main_r, main_r * 2, main_r * 2), false);
    let _loc6_: any = undefined;
    for (const _loc11_ of forIn(_loc8_)) {
      const _loc7_ = _loc8_[_loc11_].mObjects;
      for (const _loc9_ of forIn(_loc7_)) {
        const _loc2_ = _loc7_[_loc9_];
        if (_loc2_.mFlags & Thing.CThing.mFlag_Collidable && main_ID != _loc2_.mID) {
          _loc6_ = _loc2_.mPosition.Distance2D(main_p);
          if (_loc6_ < main_r + _loc2_.mRadius) {
            _loc2_.mCollidedWithID = _loc2_.mID;
            const _loc4_ = main_p.Subtract(_loc2_.mPosition);
            _loc4_.ScaleN((main_r + _loc2_.mRadius - _loc6_) / _loc6_);
            main_p = main_p.Add(_loc4_);
            if (isNaN(main_p.mX)) {
              // (empty in the shipped bytecode: debug trace stripped)
            }
            this.mCollideFlag = true;
          }
        }
      }
    }
    return main_p;
  }

  Collide_Mapwho_Height(main_p: any, main_r: any, main_ID: any): any {
    const _loc9_ = this.mMap.GetCellList_Area(new flash.geom.Rectangle(main_p.mX - main_r, main_p.mY - main_r, main_r * 2, main_r * 2), false);
    let _loc6_: any = undefined;
    for (const _loc12_ of forIn(_loc9_)) {
      const _loc7_ = _loc9_[_loc12_].mObjects;
      for (const _loc10_ of forIn(_loc7_)) {
        const _loc2_ = _loc7_[_loc10_];
        if (_loc2_.mFlags & Thing.CThing.mFlag_Collidable && main_ID != _loc2_.mID) {
          const _loc4_ = _loc2_.mPosition;
          _loc6_ = _loc4_.Distance2D(main_p);
          if (_loc6_ < main_r + _loc2_.mRadius && main_p.mZ < _loc4_.mZ + _loc2_.mHeight) {
            _loc2_.mCollidedWithID = _loc2_.mID;
            const _loc5_ = main_p.Subtract(_loc4_);
            _loc5_.ScaleN((main_r + _loc2_.mRadius - _loc6_) / _loc6_);
            main_p = main_p.Add(_loc5_);
            this.mCollideFlag = true;
          }
        }
      }
    }
    return main_p;
  }

  Collide_Line(cThing: any, p1: any, p2: any, radius: any, cAffectFlags: any, cMapOnly?: any): any {
    const _loc6_ = p2.Subtract(p1);
    let _loc5_ = _loc6_.__get__mLength() / World.Map.CMap_Collide._StepSize;
    const _loc2_ = new flash.geom.Rectangle(p1.mX - radius, p1.mY - radius, radius * 2, radius * 2);
    const _loc8_ = _loc6_.mX / _loc5_;
    const _loc7_ = _loc6_.mY / _loc5_;
    const _loc4_ = new scidd.Math.CLine(p1.toPoint(), p2.toPoint());
    _loc4_.mTag = new Object();
    _loc4_.mTag.xGradient = _loc6_.mY / _loc6_.mX;
    _loc4_.mTag.yGradient = _loc6_.mX / _loc6_.mY;
    _loc4_.mTag.xDirection = scidd.Math.CMath.Sign(_loc6_.mX);
    _loc4_.mTag.yDirection = scidd.Math.CMath.Sign(_loc6_.mY);
    _loc4_.mTag.mID = cThing.mID;
    _loc4_.mTag.cAffectFlags = cAffectFlags;
    _loc4_.mTag.f = !cMapOnly ? 'LineIntersection' : 'LineIntersection_Map';
    World.Map.CMap_Cell.mCurrentSessionID++;
    let _loc3_: any = undefined;
    while (_loc5_ > 0) {
      _loc3_ = this._Collide_Line_Area(_loc2_, _loc4_);
      if (_loc3_) {
        break;
      }
      _loc5_ -= World.Map.CMap_Collide._StepSize;
      _loc2_.x += _loc8_;
      _loc2_.y += _loc7_;
    }
    if (_loc3_ == undefined) {
      _loc2_.x = p2.mX;
      _loc2_.y = p2.mY;
      _loc3_ = this._Collide_Line_Area(_loc2_, _loc4_);
      if (_loc3_) {
        return _loc3_;
      }
    }
    if (_loc3_ == undefined) {
      return undefined;
    }
    const _loc11_ = _loc3_.mThing;
    if (_loc11_) {
      const _loc9_ = _loc3_.mPOI;
      _loc9_.x -= p1.mX;
      _loc9_.y -= p1.mY;
      _loc9_.normalize(_loc9_.length - _loc11_.mRadius);
      _loc9_.x += p1.mX;
      _loc9_.y += p1.mY;
    }
    return _loc3_;
  }

  _Collide_Line_Area(rArea: any, cLine: any): any {
    const _loc4_ = this.mMap.GetCellList_Area_FilterSessionID(rArea, false, World.Map.CMap_Cell.mCurrentSessionID);
    let _loc3_ = 1.7976931348623157e308; // [BC] generated/disasm/World.Map.CMap_Collide.txt @140727
    let _loc2_: any = undefined;
    let _loc7_: any = undefined;
    let _loc5_: any = undefined;
    const _loc8_ = cLine.mTag.f;
    for (const _loc9_ of forIn(_loc4_)) {
      _loc2_ = _loc4_[_loc9_][_loc8_](cLine);
      if (_loc2_) {
        _loc5_ = scidd.Math.CMath.Distance_Sqr(_loc2_.mPOI, cLine.mP1);
        if (_loc5_ < _loc3_) { // [BC] generated/disasm/World.Map.CMap_Collide.txt @140904
          _loc3_ = _loc5_;
          _loc7_ = _loc2_;
        }
      }
    }
    return _loc7_;
  }
}
proto(CMap_Collide, { _CLASSID_: 'CMap_Collide', _BASECLASSID_: 'CMap_Collide' });

registerGameClass('World.Map.CMap_Collide', CMap_Collide);
