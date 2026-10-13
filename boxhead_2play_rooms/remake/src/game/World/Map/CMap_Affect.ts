// Port of projects/boxhead4/World/Map/CMap_Affect.as
// Structure from generated/disasm/World.Map.CMap_Affect.txt top-level script @518249..@519849.
// Area rule (via CMap.GetCellBounds): a rectangle (x-r, y-r, 2r, 2r) affects cells round(x-r)-1 .. round(x+r) in both
// axes (clamped to the map) — the "padded square" that makes explosions reach diagonal/neighbour cells.
import { flash, forIn, proto } from '../../../engine/runtime.ts';
import { World, scidd, registerGameClass } from '../../packages.ts';

export class CMap_Affect {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  static _StepSize = 1;
  declare mMap: any;

  constructor(tMap: any) {
    this.mMap = tMap;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  AffectArea(tArea: any, tAffect: any): void {
    const _loc5_ = this.mMap.GetCellList_Area(tArea);
    for (const _loc7_ of forIn(_loc5_)) {
      if (_loc5_[_loc7_].mChildCount) {
        const _loc3_ = _loc5_[_loc7_].mObjects;
        for (const _loc6_ of forIn(_loc3_)) {
          const _loc2_ = _loc3_[_loc6_];
          if (_loc2_.mAffectFlags & tAffect.mType && tAffect.mAffector.mID != _loc2_.mID) {
            _loc2_.Affect(tAffect);
          }
        }
      }
    }
  }

  Affect_Line(cThing: any, p1: any, p2: any, radius: any, tAffect: any): number {
    const _loc9_ = p2.Subtract(p1);
    let _loc7_ = _loc9_.__get__mLength() / World.Map.CMap_Affect._StepSize;
    const _loc4_ = new flash.geom.Rectangle(p1.mX - radius, p1.mY - radius, radius * 2, radius * 2);
    const _loc11_ = _loc9_.mX / _loc7_;
    const _loc10_ = _loc9_.mY / _loc7_;
    const _loc6_ = new scidd.Math.CLine(p1.toPoint(), p2.toPoint());
    _loc6_.mTag = new Object();
    _loc6_.mTag.xGradient = _loc9_.mY / _loc9_.mX;
    _loc6_.mTag.yGradient = _loc9_.mX / _loc9_.mY;
    _loc6_.mTag.xDirection = scidd.Math.CMath.Sign(_loc9_.mX);
    _loc6_.mTag.yDirection = scidd.Math.CMath.Sign(_loc9_.mY);
    _loc6_.mTag.mID = cThing.mID;
    _loc6_.mTag.cAffectFlags = tAffect.mType;
    let _loc3_: any[] = new Array();
    let _loc8_: any = undefined;
    World.Map.CMap_Cell.mCurrentSessionID++;
    while (_loc7_ > 0) {
      _loc8_ = this._Affect_Line_Area(_loc4_, _loc6_);
      if (_loc8_) {
        _loc3_ = _loc3_.concat(_loc8_);
      }
      _loc7_ -= World.Map.CMap_Affect._StepSize;
      _loc4_.x += _loc11_;
      _loc4_.y += _loc10_;
    }
    _loc4_.x = p2.mX;
    _loc4_.y = p2.mY;
    _loc8_ = this._Affect_Line_Area(_loc4_, _loc6_);
    if (_loc8_) {
      _loc3_ = _loc3_.concat(_loc8_);
    }
    for (const _loc13_ of forIn(_loc3_)) {
      const _loc2_ = _loc3_[_loc13_ as any];
      if (_loc2_.mAffectFlags & tAffect.mType && tAffect.mAffector.mID != _loc2_.mID) {
        _loc2_.Affect(tAffect);
      }
    }
    return _loc3_.length;
  }

  _Affect_Line_Area(rArea: any, cLine: any): any[] {
    const _loc3_ = this.mMap.GetCellList_Area_FilterSessionID(rArea, false, World.Map.CMap_Cell.mCurrentSessionID);
    let _loc2_: any[] = new Array();
    let _loc4_: any = undefined;
    for (const _loc6_ of forIn(_loc3_)) {
      _loc4_ = _loc3_[_loc6_].LineIntersection_ThingList(cLine);
      if (_loc4_) {
        _loc2_ = _loc2_.concat(_loc4_);
      }
    }
    return _loc2_;
  }
}
proto(CMap_Affect, { _CLASSID_: 'CMap_Affect', _BASECLASSID_: 'CMap_Affect' });

registerGameClass('World.Map.CMap_Affect', CMap_Affect);
