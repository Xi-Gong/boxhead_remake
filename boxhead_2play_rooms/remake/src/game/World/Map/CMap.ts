// Port of projects/boxhead4/World/Map/CMap.as
// Structure from generated/disasm/World.Map.CMap.txt top-level script @127357..@131249.
import { flash, forIn, proto } from '../../../engine/runtime.ts';
import { Thing, World, registerGameClass } from '../../packages.ts';

export class CMap {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mFirstTime: boolean;
  static mCheckSessionID = 1;
  /** Never assigned in the shipped code (debug drawing target of CMap_Cell.DebugDraw); undefined like in AS2. */
  static mcDebug: any;

  declare mWorld: any;
  declare mWorldSize: any;
  declare mSize: any;
  declare mCells: any[];
  declare mInvalidCell: any;
  declare mMath: any;
  declare mNavigation: any;
  declare mCollide: any;
  declare mAffect: any;
  declare mMapwho: any;
  declare mDecal: any;

  constructor(tWorld: any) {
    this.mWorld = tWorld;
    this.mWorldSize = this.mWorld.mArea.size;
    this.mSize = new flash.geom.Point(Math.round(this.mWorldSize.x / World.Map.CMap_Cell.mSize.x), Math.round(this.mWorldSize.y / World.Map.CMap_Cell.mSize.y));
    this.InitCells();
    this.mMath = new World.Map.CMap_Math(this);
    this.mNavigation = new World.Map.CMap_Navigation(this);
    this.mCollide = new World.Map.CMap_Collide(this);
    this.mAffect = new World.Map.CMap_Affect(this);
    this.mMapwho = new World.Map.CMap_Mapwho(this);
    this.mDecal = new World.Map.CMap_Decal(this);
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  InitCells(): void {
    let _loc2_: any;
    let _loc3_: number;
    let _loc4_: number;
    this.mCells = new Array();
    for (_loc3_ = 0; _loc3_ < this.mSize.y; _loc3_++) { // [BC] generated/disasm/World.Map.CMap.txt @127895
      this.mCells[_loc3_] = new Array(); // [BC] generated/disasm/World.Map.CMap.txt @127948
      _loc4_ = 0; // [BC] generated/disasm/World.Map.CMap.txt @127961
      _loc2_ = this.mCells[_loc3_]; // [BC] generated/disasm/World.Map.CMap.txt @127980
      while (_loc4_ < this.mSize.x) { // [BC] generated/disasm/World.Map.CMap.txt @127985
        _loc2_[_loc4_] = new World.Map.CMap_Cell(_loc4_, _loc3_); // [BC] generated/disasm/World.Map.CMap.txt @128039
        _loc4_ = _loc4_ + 1; // [BC] generated/disasm/World.Map.CMap.txt @128046
      }
    }
    const _loc7_ = World.Map.CMap_Cell.mCollide_EdgeOfMap | World.Map.CMap_Cell.mCollide_Solid;
    _loc4_ = 0; // [BC] generated/disasm/World.Map.CMap.txt @128138
    const _loc6_ = this.mCells[0];
    const _loc5_ = this.mCells[this.mSize.y - 1];
    while (_loc4_ < this.mSize.x) { // [BC] generated/disasm/World.Map.CMap.txt @128206
      _loc6_[_loc4_].mCollide = _loc5_[_loc4_].mCollide = _loc7_; // [BC] generated/disasm/World.Map.CMap.txt @128264
      _loc4_ = _loc4_ + 1; // [BC] generated/disasm/World.Map.CMap.txt @128271
    }
    for (_loc3_ = 0; _loc3_ < this.mSize.y; _loc3_++) { // [BC] generated/disasm/World.Map.CMap.txt @128293
      this.mCells[_loc3_][0].mCollide = this.mCells[_loc3_][this.mSize.x - 1].mCollide = _loc7_; // [BC] generated/disasm/World.Map.CMap.txt @128405
    }
    this.SetAdjacentCells();
  }

  SetAdjacentCells(): void {
    this.mInvalidCell = new World.Map.CMap_Cell(-1, -1);
    this.mInvalidCell.mCollide = World.Map.CMap_Cell.mCollide_Solid;
    for (let _loc6_ = 0; _loc6_ < this.mSize.y; _loc6_++) { // [BC] generated/disasm/World.Map.CMap.txt @128544
      let _loc3_ = 0; // [BC] generated/disasm/World.Map.CMap.txt @128584
      const _loc7_ = this.mCells[_loc6_]; // [BC] generated/disasm/World.Map.CMap.txt @128603
      while (_loc3_ < this.mSize.x) { // [BC] generated/disasm/World.Map.CMap.txt @128608
        let _loc2_ = 0; // [BC] generated/disasm/World.Map.CMap.txt @128643
        const _loc5_: any[] = new Array(); // [BC] generated/disasm/World.Map.CMap.txt @128663
        while (_loc2_ < Thing.Math.CThing_Angle.mDirection_Amount) { // [BC] generated/disasm/World.Map.CMap.txt @128668
          const _loc4_ = this.mCells[_loc6_ + Thing.Math.CThing_Angle.mDirection_Deltas[_loc2_].mY]?.[_loc3_ + Thing.Math.CThing_Angle.mDirection_Deltas[_loc2_].mX]; // [BC] generated/disasm/World.Map.CMap.txt @128789
          _loc5_[_loc2_] = _loc4_ != undefined ? _loc4_ : this.mInvalidCell; // [BC] generated/disasm/World.Map.CMap.txt @128828
          _loc2_ = _loc2_ + 1; // [BC] generated/disasm/World.Map.CMap.txt @128835
        }
        _loc7_[_loc3_].SetAdjacents(_loc5_); // [BC] generated/disasm/World.Map.CMap.txt @128866
        _loc3_ = _loc3_ + 1; // [BC] generated/disasm/World.Map.CMap.txt @128873
      }
    }
  }

  Draw(tArea: any): void {
    const _loc19_ = Math.floor(tArea.left / World.Map.CMap_Cell.mSize.x - 0.5);
    let _loc17_ = Math.floor(tArea.top / World.Map.CMap_Cell.mSize.y - 0.5);
    const _loc18_ = Math.ceil(tArea.right / World.Map.CMap_Cell.mSize.x + 0.5);
    let _loc16_ = Math.ceil(tArea.bottom / World.Map.CMap_Cell.mSize.y + 0.5) + 1;
    const _loc22_ = _loc18_ - _loc19_;
    void _loc22_;
    const _loc13_ = World.Map.CMap_Cell.mSize.y;
    const _loc14_ = Thing.CThing.mFlag_SortFloor;
    const _loc5_: any[] = new Array();
    let _loc12_: number;
    for (_loc12_ = _loc17_; _loc12_ < _loc16_; _loc12_++) {
      let _loc7_ = _loc19_;
      const _loc10_ = this.mCells[_loc12_];
      while (_loc7_ < _loc18_) {
        const _loc9_ = _loc10_?.[_loc7_];
        if (_loc9_?.mChildCount) {
          const _loc6_ = _loc9_.mObjects;
          for (const _loc15_ of forIn(_loc6_)) {
            const _loc2_ = _loc6_[_loc15_];
            const _loc4_ = _loc2_.mP.mY;
            const _loc3_ = ((!(_loc2_.mFlags & _loc14_) ? _loc4_ : _loc4_ & 16777215) * _loc13_) & 16777215;
            if (!_loc5_[_loc3_]) {
              _loc5_[_loc3_] = [_loc2_];
            } else {
              _loc5_[_loc3_].push(_loc2_);
            }
          }
        }
        _loc7_ = _loc7_ + 1;
      }
    }
    _loc17_ *= _loc13_;
    _loc16_ *= _loc13_;
    let _loc11_: any = undefined;
    for (_loc12_ = _loc17_; _loc12_ <= _loc16_; _loc12_++) {
      _loc11_ = _loc5_[_loc12_];
      if (_loc11_) {
        for (const _loc20_ of forIn(_loc11_)) {
          const _loc8_ = _loc11_[_loc20_];
          _loc8_.Draw();
          _loc8_.mFlags |= Thing.CThing.mFlag_Drawn;
        }
      }
    }
  }

  GetCell(x: any, y: any): any {
    return this.mCells[y & 16777215]?.[x & 16777215];
  }

  GetCellBounds(oRect: any): any {
    const _loc2_ = new flash.geom.Rectangle();
    _loc2_.left = Math.max(0, Math.round(oRect.left) - 1);
    _loc2_.top = Math.max(0, Math.round(oRect.top) - 1);
    _loc2_.right = Math.min(this.mSize.x - 1, Math.round(oRect.right));
    _loc2_.bottom = Math.min(this.mSize.y - 1, Math.round(oRect.bottom));
    return _loc2_;
  }

  GetCellBounds_Min(oRect: any): any {
    const _loc2_ = new flash.geom.Rectangle();
    _loc2_.left = Math.max(0, Math.floor(oRect.left));
    _loc2_.top = Math.max(0, Math.floor(oRect.top));
    _loc2_.right = Math.min(this.mSize.x - 1, Math.floor(oRect.right));
    _loc2_.bottom = Math.min(this.mSize.y - 1, Math.floor(oRect.bottom));
    return _loc2_;
  }

  GetCellList_Area(tArea: any, tMinArea?: any): any[] {
    const _loc6_: any[] = new Array();
    if (isNaN(tArea.x)) {
      return _loc6_;
    }
    const _loc3_ = tMinArea != true ? this.GetCellBounds(tArea) : this.GetCellBounds_Min(tArea);
    for (let _loc5_ = _loc3_.top; _loc5_ <= _loc3_.bottom; _loc5_++) {
      let _loc2_ = _loc3_.left;
      const _loc4_ = this.mCells[_loc5_];
      while (_loc2_ <= _loc3_.right) {
        _loc6_.push(_loc4_?.[_loc2_]);
        _loc2_ = _loc2_ + 1;
      }
    }
    return _loc6_;
  }

  GetCellList_Area_FilterSessionID(tArea: any, tMinArea: any, tSessionID: any): any[] {
    const _loc8_: any[] = new Array();
    if (isNaN(tArea.x)) {
      return _loc8_;
    }
    const _loc4_ = tMinArea != true ? this.GetCellBounds(tArea) : this.GetCellBounds_Min(tArea);
    for (let _loc6_ = _loc4_.top; _loc6_ <= _loc4_.bottom; _loc6_++) {
      let _loc3_ = _loc4_.left;
      const _loc5_ = this.mCells[_loc6_];
      while (_loc3_ <= _loc4_.right) {
        const _loc2_ = _loc5_?.[_loc3_];
        if (_loc2_.mSessionIDCheck != tSessionID) {
          _loc2_.mSessionIDCheck = tSessionID;
          _loc8_.push(_loc2_);
        }
        _loc3_ = _loc3_ + 1;
      }
    }
    return _loc8_;
  }
}
proto(CMap, { _CLASSID_: 'CMap', _BASECLASSID_: 'CMap', mFirstTime: true });

registerGameClass('World.Map.CMap', CMap);
