// Port of assets/projects/boxhead4/World/Map/CMap_Mapwho.as
// Structure from generated/disasm/World.Map.CMap_Mapwho.txt top-level script @466915..@467604.
// Bucketing: a thing lives in cell [mY & 0xFFFFFF][mX & 0xFFFFFF] (int truncation of its cell position).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';

export class CMap_Mapwho {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mMap: any;
  declare mMap_Cells: any[];

  constructor(tMap: any) {
    this.mMap = tMap;
    this.mMap_Cells = this.mMap.mCells;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  MoveThing(tThing: any): boolean {
    const _loc2_ = tThing.mCellID;
    const _loc5_ = tThing.mPosition.mX & 16777215;
    const _loc4_ = tThing.mPosition.mY & 16777215;
    if (_loc5_ == _loc2_?.x && _loc4_ == _loc2_?.y) {
      return false;
    }
    if (_loc2_) {
      this.mMap_Cells[_loc2_.y]?.[_loc2_.x]?.DeleteThing(tThing);
    }
    const _loc6_ = this.mMap_Cells[_loc4_]?.[_loc5_];
    _loc6_?.AddThing(tThing);
    tThing.mCellID = _loc6_?.mID.clone();
    return true;
  }

  AddThing(tThing: any): void {
    const _loc3_ = this.mMap_Cells[tThing.mPosition.mY & 16777215]?.[tThing.mPosition.mX & 16777215];
    _loc3_?.AddThing(tThing);
    tThing.mCellID = _loc3_?.mID.clone();
  }

  DeleteThing(tThing: any): void {
    if (tThing.mCellID) {
      this.mMap_Cells[tThing.mCellID.y]?.[tThing.mCellID.x]?.DeleteThing(tThing);
      tThing.mCellID = undefined;
    }
  }
}
proto(CMap_Mapwho, { _CLASSID_: 'CMap_Mapwho', _BASECLASSID_: 'CMap_Mapwho' });

registerGameClass('World.Map.CMap_Mapwho', CMap_Mapwho);
