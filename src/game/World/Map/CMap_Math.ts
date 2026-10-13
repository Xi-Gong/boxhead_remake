// Port of assets/projects/boxhead4/World/Map/CMap_Math.as
// Unused by the shipped game (an empty helper created by CMap) — ported straightforwardly, no tests (CONVENTIONS rule 11).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';

export class CMap_Math {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mMap: any;

  constructor(tMap: any) {
    this.mMap = tMap;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }
}
proto(CMap_Math, { _CLASSID_: 'CMap_Math', _BASECLASSID_: 'CMap_Math' });

registerGameClass('World.Map.CMap_Math', CMap_Math);
