// Port of assets/projects/boxhead4/World/Map/CMap_Navigation.as
// Unused by the shipped game (an empty helper created by CMap) — ported straightforwardly, no tests (CONVENTIONS rule 11).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';

export class CMap_Navigation {
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
proto(CMap_Navigation, { _CLASSID_: 'CMap_Navigation', _BASECLASSID_: 'CMap_Navigation' });

registerGameClass('World.Map.CMap_Navigation', CMap_Navigation);
