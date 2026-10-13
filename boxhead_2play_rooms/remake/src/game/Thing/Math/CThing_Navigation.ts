// Port of projects/boxhead4/Thing/Math/CThing_Navigation.as
// Unused by the shipped game — ported straightforwardly, no tests (CONVENTIONS rule 11).
import { proto } from '../../../engine/runtime.ts';
import { World, registerGameClass } from '../../packages.ts';

export class CThing_Navigation {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mOwner: any;
  declare mMap: any;

  constructor(tOwner: any) {
    this.mOwner = tOwner;
    this.mMap = this.mOwner.mWorld.mMap;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    // AS2 `super.Dispose()`: the class has no base class (Object has no Dispose) -> silent no-op in AS2.
    (Object.prototype as any).Dispose?.call(this);
  }

  MoveInDirection2(tDirection: any): any {
    const _loc6_ = this.mMap.GetCell(this.mOwner.mPosition.mX, this.mOwner.mPosition.mY);
    if (_loc6_.CollideFlagsInDirection(tDirection) & World.Map.CMap_Cell.mCollide_NonMovable) {
      const _loc4_ = 1; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @416835
      let _loc5_ = 1; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @416848
      let _loc3_ = tDirection - _loc4_; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @416861
      let _loc2_ = tDirection + _loc4_; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @416874
      while (_loc5_ <= 3) { // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @416879
        if (!(_loc6_.CollideFlagsInDirection(_loc3_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
          return _loc3_;
        }
        if (!(_loc6_.CollideFlagsInDirection(_loc2_) & World.Map.CMap_Cell.mCollide_NonMovable)) {
          return _loc2_;
        }
        _loc5_++; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @417016
        _loc3_ -= _loc4_; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @417025
        _loc2_ += _loc4_; // [BC] generated/disasm/Thing.Math.CThing_Navigation.txt @417038
      }
    }
    return tDirection;
  }
}
proto(CThing_Navigation, { _CLASSID_: 'CThing_Navigation', _BASECLASSID_: 'CThing_Navigation' });

registerGameClass('Thing.Math.CThing_Navigation', CThing_Navigation);
