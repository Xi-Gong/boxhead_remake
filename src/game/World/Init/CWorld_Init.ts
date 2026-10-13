// Port of assets/projects/boxhead4/World/Init/CWorld_Init.as
// MovieClip subclass placed on the room timelines (registered for the World_Init_* / Piece.* linkages, see
// public/assets/library.json `classes`). The AS2 constructor body is in ctor(): it finds the enclosing CWorld and
// registers itself with CWorld.AddInitObject. Structure from generated/disasm/World.Init.CWorld_Init.txt @106111..@107046.
import { MovieClip, flash, proto, toAS2String } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';

export class CWorld_Init extends MovieClip {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mWorld: any;

  override ctor(): void {
    super.ctor();
    this.mWorld = this.FindParent('CWorld');
    // AS2: calling a method of undefined (no enclosing CWorld, e.g. a gallery preview) is a silent no-op.
    this.mWorld?.AddInitObject?.(this);
  }

  FindParent(tClassID: any): any {
    let _loc3_ = 0; // [BC] generated/disasm/World.Init.CWorld_Init.txt @106286
    let _loc2_: any = this._parent; // [BC] generated/disasm/World.Init.CWorld_Init.txt @106299
    while (_loc3_ < 10) { // [BC] generated/disasm/World.Init.CWorld_Init.txt @106304
      if (_loc2_?._CLASSID_ == tClassID) { // [BC] generated/disasm/World.Init.CWorld_Init.txt @106336
        return _loc2_;
      }
      _loc2_ = _loc2_?._parent; // [BC] generated/disasm/World.Init.CWorld_Init.txt @106355
      _loc3_++; // [BC] generated/disasm/World.Init.CWorld_Init.txt @106373
    }
    return undefined;
  }

  GetPosition(mc: any): any {
    const _loc2_ = new flash.geom.Point(0, 0);
    mc.localToGlobal(_loc2_);
    this.mWorld?.globalToLocal(_loc2_); // AS2: no-op without an enclosing CWorld
    return new Thing.Math.CThing_Position(_loc2_.x, _loc2_.y, 0);
  }

  __get__mPosition(): any {
    return this.GetPosition(this);
  }

  __get__mPosition2(): any {
    const _loc2_ = this.__get__mPosition();
    return new Thing.Math.CThing_Position(_loc2_.mX + this._width, _loc2_.mY + this._height, 0);
  }

  __get__mAngle(): any {
    const _loc2_ = this._rotation * Thing.Math.CThing_Angle.Deg2Rad;
    return new Thing.Math.CThing_Angle(_loc2_);
  }

  override toString(): string {
    return this._CLASSID_ + ',' + toAS2String(this._x) + ',' + toAS2String(this._y) + ',' + toAS2String(this._width) + ',' + toAS2String(this._height);
  }

  Dispose(): void {
    this.removeMovieClip();
  }

  // addProperty(name, __get__name, function () {}) — getters with an EMPTY setter (assignments are ignored).
  get mAngle(): any { return this.__get__mAngle(); }
  set mAngle(_v: any) { /* AS2 empty setter */ }
  get mPosition(): any { return this.__get__mPosition(); }
  set mPosition(_v: any) { /* AS2 empty setter */ }
  get mPosition2(): any { return this.__get__mPosition2(); }
  set mPosition2(_v: any) { /* AS2 empty setter */ }
}
proto(CWorld_Init, { _CLASSID_: 'CWorld_Init', _BASECLASSID_: 'CWorld_Init' });

registerGameClass('World.Init.CWorld_Init', CWorld_Init);
