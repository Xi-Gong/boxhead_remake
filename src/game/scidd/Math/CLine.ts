// Port of assets/projects/boxhead4/scidd/Math/CLine.as
// The .as text is a raw class prologue; structure from generated/disasm/scidd.Math.CLine.txt top-level script
// @185432..@194677. Getter-only properties (addProperty with an EMPTY setter) → TS get + no-op set.
// Quirks kept on purpose (bytecode-verified):
//   - __get__mNormal/__get__mCentre/__get__mDelta return the cache object itself on the FIRST call (callers that
//     mutate it, e.g. mNormalUnit's normalize(1), mutate the cache) and a clone afterwards.
//   - __get__mAngle has its condition inverted: it returns undefined until something sets _cache_Angle.
//   - __get__mGradient never stores its cache; Reflect uses `v.y` for the y component.
//   - caches are never invalidated (Move() keeps stale caches).
import { flash, proto } from '../../../engine/runtime.ts';
import { scidd, registerGameClass } from '../../packages.ts';

export class CLine {
  declare _CLASSID_: string;
  declare mP1: any;
  declare mP2: any;
  declare _cache_Normal: any;
  declare _cache_Centre: any;
  declare _cache_Delta: any;
  declare _cache_Angle: any;
  declare _cache_Length: any;
  declare _cache_LengthSQR: any;
  declare _cache_Gradient: any;
  declare _cache_Orientation: any;
  declare _cache_Orientation180: any;
  /** Dynamic field set by CMap_Collide/CMap_Affect (line metadata). */
  declare mTag: any;

  constructor(p1?: any, p2?: any) {
    this.mP1 = p1;
    this.mP2 = p2;
  }

  Clone(tNoPointClone?: any): CLine {
    return !(tNoPointClone == undefined || tNoPointClone == false) ? new scidd.Math.CLine(this.mP1, this.mP2) : new scidd.Math.CLine(this.mP1.clone(), this.mP2.clone());
  }

  toString(): string {
    return 'CLine:: ' + this.mP1 + ' , ' + this.mP2;
  }

  Draw(mc: any, tColor?: any, tAlpha?: any): void {
    mc.lineStyle(1, tColor != undefined ? tColor : 65280, tAlpha != undefined ? tAlpha : 100);
    mc.moveTo(this.mP1.x, this.mP1.y);
    mc.lineTo(this.mP2.x, this.mP2.y);
  }

  DrawNormal(mc: any, tColor?: any, tAlpha?: any): void {
    mc.lineStyle(1, tColor != undefined ? tColor : 65280, tAlpha != undefined ? tAlpha : 100);
    mc.moveTo(this.mP1.x, this.mP1.y);
    mc.lineTo(this.mP2.x, this.mP2.y);
    let _loc2_ = this.mP2.subtract(this.mP1);
    _loc2_.normalize(_loc2_.length / 2);
    _loc2_ = _loc2_.add(this.mP1);
    mc.moveTo(_loc2_.x, _loc2_.y);
    const _loc4_ = this.__get__mNormal();
    _loc4_.normalize(this.__get__mDelta().length / 4);
    _loc2_ = _loc2_.add(_loc4_);
    mc.lineTo(_loc2_.x, _loc2_.y);
  }

  Move(d: any, scalar: any): this {
    d = d.clone();
    d.normalize(d.length * scalar);
    this.mP1 = this.mP1.add(d);
    this.mP2 = this.mP2.add(d);
    return this;
  }

  Offset(d: any): CLine {
    return new scidd.Math.CLine(this.mP1.add(d), this.mP2.add(d));
  }

  __get__mNormal(): any {
    return this._cache_Normal != undefined ? this._cache_Normal.clone() : (this._cache_Normal = new flash.geom.Point(this.mP1.y - this.mP2.y, this.mP2.x - this.mP1.x));
  }

  __get__mNormalUnit(): any {
    const _loc2_ = this.__get__mNormal();
    _loc2_.normalize(1);
    return _loc2_;
  }

  __get__mCentre(): any {
    return this._cache_Centre != undefined ? this._cache_Centre.clone() : (this._cache_Centre = new flash.geom.Point((this.mP1.x + this.mP2.x) / 2, (this.mP2.y + this.mP1.y) / 2));
  }

  __get__mDelta(): any {
    return this._cache_Delta != undefined ? this._cache_Delta.clone() : (this._cache_Delta = this.mP2.subtract(this.mP1));
  }

  __get__mAngle(): any {
    // [BC] generated/disasm/scidd.Math.CLine.txt @187143 — inverted condition is in the bytecode (original bug).
    return this._cache_Angle != undefined ? (this._cache_Angle = Math.atan2(this.mP2.y - this.mP1.y, this.mP2.x - this.mP1.x)) : this._cache_Angle;
  }

  __get__mLength(): any {
    if (this._cache_Length == undefined) {
      const _loc2_ = this.__get__mDelta();
      return (this._cache_Length = Math.sqrt(_loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y));
    }
    return this._cache_Length;
  }

  __get__mLength_SQR(): any {
    if (this._cache_LengthSQR == undefined) {
      const _loc2_ = this.__get__mDelta();
      return (this._cache_LengthSQR = _loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y);
    }
    return this._cache_LengthSQR;
  }

  __get__mCrossProduct(): any {
    return new flash.geom.Point(this.mP1.y * this.mP2.x - this.mP1.x * this.mP2.y, this.mP1.x * this.mP2.y - this.mP1.y * this.mP2.x);
  }

  __get__mGradient(): any {
    if (this._cache_Gradient == undefined) {
      const _loc2_ = this.__get__mDelta();
      return _loc2_.x / _loc2_.y;
    }
    return this._cache_Gradient;
  }

  SideOfLine(p: any): number {
    return (this.mP1.x - p.x) * (this.mP2.y - p.y) - (this.mP2.x - p.x) * (this.mP1.y - p.y);
  }

  __get__mInverse(): CLine {
    return new scidd.Math.CLine(this.mP2, this.mP1);
  }

  Scale(tScale: any): CLine {
    const _loc2_ = this.__get__mDelta();
    const _loc3_ = this.__get__mCentre();
    _loc2_.x *= tScale * 0.5;
    _loc2_.y *= tScale * 0.5;
    return new scidd.Math.CLine(_loc3_.subtract(_loc2_), _loc3_.add(_loc2_));
  }

  Scale1(tScale: any): CLine {
    const _loc2_ = this.__get__mDelta();
    _loc2_.x *= tScale;
    _loc2_.y *= tScale;
    return new scidd.Math.CLine(this.mP1, this.mP1.add(_loc2_));
  }

  Scale2(tScale: any): CLine {
    const _loc2_ = this.__get__mDelta();
    _loc2_.x *= tScale;
    _loc2_.y *= tScale;
    return new scidd.Math.CLine(this.mP2.subtract(_loc2_), this.mP2);
  }

  SetLength(tLength: any): CLine {
    const _loc2_ = this.__get__mDelta();
    _loc2_.normalize(tLength / 2);
    const _loc3_ = this.__get__mCentre();
    return new scidd.Math.CLine(_loc3_.subtract(_loc2_), _loc3_.add(_loc2_));
  }

  SetLength1(tLength: any): CLine {
    const _loc2_ = this.__get__mDelta();
    _loc2_.normalize(tLength);
    return new scidd.Math.CLine(this.mP1, this.mP1.add(_loc2_));
  }

  SetLength2(tLength: any): CLine {
    const _loc2_ = this.__get__mDelta();
    _loc2_.normalize(tLength);
    return new scidd.Math.CLine(this.mP2.subtract(_loc2_), this.mP2);
  }

  Rotate(tAngle: any): CLine {
    const _loc2_ = this.__get__mCentre();
    const _loc3_ = scidd.Math.CMath.GetMatrix_Angle(tAngle);
    return new scidd.Math.CLine(_loc3_.transformPoint(this.mP1.subtract(_loc2_)).add(_loc2_), _loc3_.transformPoint(this.mP2.subtract(_loc2_)).add(_loc2_));
  }

  Rotate90(): CLine {
    return new scidd.Math.CLine(this.mP1, this.mP1.subtract(this.__get__mNormal()));
  }

  Rotate180(): CLine {
    return new scidd.Math.CLine(this.mP1, this.mP1.subtract(this.__get__mDelta()));
  }

  Rotate270(): CLine {
    return new scidd.Math.CLine(this.mP1, this.mP1.add(this.__get__mNormal()));
  }

  Average(l2: any): CLine {
    const _loc3_ = this.mP1.add(l2.mP1);
    const _loc2_ = this.mP2.add(l2.mP2);
    _loc3_.x /= 2;
    _loc3_.y /= 2;
    _loc2_.x /= 2;
    _loc2_.y /= 2;
    return new scidd.Math.CLine(_loc3_, _loc2_);
  }

  Distance_PointToLine(p: any, inf?: any): number {
    return Math.sqrt(this.Distance_PointToLine_SQR(p, inf));
  }

  Distance_PointToLine_SQR(p: any, inf?: any): number {
    let _loc2_: any;
    let _loc3_: any;
    let _loc5_: any;
    let _loc8_: any;
    if (inf) {
      _loc2_ = this.__get__mDelta();
      _loc3_ = p.subtract(this.mP1);
      _loc8_ = (_loc2_.x * _loc3_.x + _loc2_.y * _loc3_.y) / (_loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y);
      const _loc10_ = p.x - (this.mP1.x + _loc2_.x * _loc8_);
      const _loc9_ = p.y - (this.mP1.y + _loc2_.y * _loc8_);
      return _loc10_ * _loc10_ + _loc9_ * _loc9_;
    }
    const _loc4_ = this;
    _loc2_ = _loc4_.__get__mDelta();
    _loc3_ = p.subtract(_loc4_.mP1);
    const _loc7_ = _loc2_.x * _loc3_.x + _loc2_.y * _loc3_.y;
    if (_loc7_ <= 0) {
      return _loc3_.x * _loc3_.x + _loc3_.y * _loc3_.y;
    }
    const _loc11_ = _loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y;
    if (_loc11_ <= _loc7_) {
      _loc5_ = p.subtract(_loc4_.mP2);
      return _loc5_.x * _loc5_.x + _loc5_.y * _loc5_.y;
    }
    _loc8_ = _loc7_ / _loc11_;
    const _loc12_ = new flash.geom.Point(_loc4_.mP1.x + _loc8_ * _loc2_.x, _loc4_.mP1.y + _loc8_ * _loc2_.y);
    _loc5_ = p.subtract(_loc12_);
    return _loc5_.x * _loc5_.x + _loc5_.y * _loc5_.y;
  }

  QDistance_PointToLine_SQR(p: any): number {
    const _loc3_ = this.mP2.x - this.mP1.x;
    const _loc2_ = this.mP2.y - this.mP1.y;
    const _loc9_ = p.x - this.mP1.x;
    const _loc8_ = p.y - this.mP1.y;
    const _loc4_ = (_loc3_ * _loc9_ + _loc2_ * _loc8_) / (_loc3_ * _loc3_ + _loc2_ * _loc2_);
    const _loc7_ = p.x - (this.mP1.x + _loc3_ * _loc4_);
    const _loc6_ = p.y - (this.mP1.y + _loc2_ * _loc4_);
    return _loc7_ * _loc7_ + _loc6_ * _loc6_;
  }

  ProjectPointToLine(p: any, inf?: any): any {
    let _loc2_: any;
    let _loc4_: any;
    let _loc6_: any;
    if (inf) {
      _loc2_ = this.__get__mDelta();
      _loc6_ = p.subtract(this.mP1);
      if (_loc2_.x == 0 && _loc2_.y == 0) {
        return this.mP1;
      }
      _loc4_ = (_loc2_.x * _loc6_.x + _loc2_.y * _loc6_.y) / this.__get__mLength_SQR();
      return new flash.geom.Point(this.mP1.x + _loc4_ * _loc2_.x, this.mP1.y + _loc4_ * _loc2_.y);
    }
    _loc2_ = this.__get__mDelta();
    _loc6_ = p.subtract(this.mP1);
    if (_loc2_.x == 0 && _loc2_.y == 0) {
      return this.mP1;
    }
    const _loc3_ = _loc2_.x * _loc6_.x + _loc2_.y * _loc6_.y;
    const _loc5_ = this.__get__mLength_SQR();
    if (_loc5_ <= _loc3_ || _loc3_ < 0) {
      return undefined;
    }
    _loc4_ = _loc3_ / _loc5_;
    return new flash.geom.Point(this.mP1.x + _loc4_ * _loc2_.x, this.mP1.y + _loc4_ * _loc2_.y);
  }

  DirectionToPoint(p: any): number {
    const _loc2_ = this.__get__mDelta();
    const _loc3_ = p.subtract(this.mP1);
    return (_loc2_.x * _loc3_.x + _loc2_.y * _loc3_.y) / this.__get__mLength_SQR();
  }

  IsPointOnLine(p: any): boolean {
    if (Math.abs((this.mP1.x - p.x) * (this.mP2.y - p.y) - (this.mP2.x - p.x) * (this.mP1.y - p.y)) < 0.00001) {
      const _loc2_ = this.__get__mDelta();
      const _loc5_ = p.subtract(this.mP1);
      const _loc4_ = _loc5_.x * _loc2_.x + _loc5_.y * _loc2_.y;
      const _loc6_ = _loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y;
      if (_loc4_ >= 0 && _loc6_ >= _loc4_) {
        return true;
      }
    }
    return false;
  }

  Parallel(tLine: any): boolean {
    const _loc3_ = this.__get__mDelta();
    const _loc2_ = tLine.__get__mDelta();
    return Math.abs(_loc3_.y * _loc2_.x - _loc3_.x * _loc2_.y) >= 0.00001 ? false : true;
  }

  GetRectangle(): any {
    let _loc2_: any;
    let _loc3_: any;
    let _loc4_: any;
    let _loc5_: any;
    if (this.mP1.x > this.mP2.x) {
      _loc2_ = this.mP2.x;
      _loc4_ = this.mP1.x;
    } else {
      _loc2_ = this.mP1.x;
      _loc4_ = this.mP2.x;
    }
    if (this.mP1.y > this.mP2.y) {
      _loc3_ = this.mP2.y;
      _loc5_ = this.mP1.y;
    } else {
      _loc3_ = this.mP1.y;
      _loc5_ = this.mP2.y;
    }
    return new flash.geom.Rectangle(_loc2_, _loc3_, _loc4_ - _loc2_, _loc5_ - _loc3_);
  }

  Intersects(cLine: any, rp: any, inf?: any): boolean {
    let _loc4_: any;
    let _loc6_: any;
    if (inf) {
      _loc4_ = this.__get__mDelta();
      _loc6_ = cLine.__get__mDelta();
      const _loc12_ = _loc4_.y * _loc6_.x - _loc4_.x * _loc6_.y;
      if (Math.abs(_loc12_) < 0.00001) {
        return false;
      }
      const _loc9_ = cLine.mP1.subtract(this.mP1);
      const _loc14_ = (_loc6_.y * _loc9_.x - _loc6_.x * _loc9_.y) / _loc12_;
      rp.x = this.mP1.x - _loc4_.x * _loc14_;
      rp.y = this.mP1.y - _loc4_.y * _loc14_;
      return true;
    }
    const _loc2_ = cLine.mP1;
    const _loc7_ = cLine.mP2;
    _loc4_ = cLine.__get__mDelta();
    _loc6_ = this.__get__mDelta();
    const _loc13_ = _loc4_.x * _loc6_.y;
    const _loc11_ = _loc6_.x * _loc4_.y;
    const _loc5_ = ((_loc2_.y - this.mP1.y) * _loc6_.x - (_loc2_.x - this.mP1.x) * _loc6_.y) / (_loc13_ - _loc11_);
    if (isNaN(_loc5_)) {
      if (_loc2_.equals(_loc7_)) {
        rp.x = _loc7_.x;
        rp.y = _loc7_.y;
      } else if (this.mP1.equals(this.mP2)) {
        rp.x = this.mP1.x;
        rp.y = this.mP1.y;
      } else {
        return false;
      }
    } else {
      rp.x = _loc2_.x + _loc5_ * _loc4_.x;
      rp.y = _loc2_.y + _loc5_ * _loc4_.y;
    }
    const _loc10_ = ((this.mP1.y - _loc2_.y) * _loc4_.x - (this.mP1.x - _loc2_.x) * _loc4_.y) / (_loc11_ - _loc13_);
    return !(_loc5_ >= 0 && _loc5_ <= 1 && _loc10_ >= 0 && _loc10_ <= 1) ? false : true;
  }

  DoesIntersect_Infinate(cLine: any): boolean {
    return this.SideOfLine(cLine.mP1) != this.SideOfLine(cLine.mP2);
  }

  CrossLine(cLine: any): number {
    const _loc3_ = this.SideOfLine(cLine.mP1);
    const _loc2_ = this.SideOfLine(cLine.mP2);
    if (_loc3_ > _loc2_) {
      return -1;
    }
    if (_loc3_ < _loc2_) {
      return 1;
    }
    return 0;
  }

  QCrossLine(cLine: any): boolean {
    const _loc3_ = cLine.mP1;
    const _loc2_ = cLine.mP2;
    return (this.mP1.x - _loc3_.x) * (this.mP2.y - _loc3_.y) - (this.mP2.x - _loc3_.x) * (this.mP1.y - _loc3_.y) != (this.mP1.x - _loc2_.x) * (this.mP2.y - _loc2_.y) - (this.mP2.x - _loc2_.x) * (this.mP1.y - _loc2_.y);
  }

  Reflect(v: any, tElasticity?: any): any {
    const _loc2_ = this.__get__mNormal();
    _loc2_.normalize(1);
    const _loc3_ = 2 * (v.x * _loc2_.x + v.y * _loc2_.y);
    return new flash.geom.Point(_loc3_ * _loc2_.x, _loc3_ * v.y);
  }

  __get__mOrientation(): any {
    return this._cache_Orientation != undefined ? this._cache_Orientation : (this._cache_Orientation = this.GetOrientation(0));
  }

  __get__mOrientation180(): any {
    return this._cache_Orientation180 != undefined ? this._cache_Orientation180 : (this._cache_Orientation180 = this.GetOrientation(3.141592653589793));
  }

  GetOrientation(tAdjustAngle?: any): any {
    tAdjustAngle = tAdjustAngle != undefined ? tAdjustAngle : 0;
    const _loc2_: any = {
      mMatrix: new flash.geom.Matrix(),
      iMatrix: new flash.geom.Matrix(),
      mPosition: this.mP1,
      mAngle: Math.atan2(this.mP2.y - this.mP1.y, this.mP2.x - this.mP1.x) + tAdjustAngle,
    };
    _loc2_.iMatrix.rotate(_loc2_.mAngle);
    _loc2_.iMatrix.translate(_loc2_.mPosition.x, _loc2_.mPosition.y);
    _loc2_.mMatrix.translate(0 - _loc2_.mPosition.x, 0 - _loc2_.mPosition.y);
    _loc2_.mMatrix.rotate(0 - _loc2_.mAngle);
    _loc2_.mLine = this.ApplyMatrix(_loc2_.mMatrix);
    return _loc2_;
  }

  ApplyMatrix(m: any): CLine {
    return new scidd.Math.CLine(m.transformPoint(this.mP1), m.transformPoint(this.mP2));
  }

  // addProperty(name, __get__name, function () {}) — getter with an empty setter (assignments are ignored).
  get mAngle(): any { return this.__get__mAngle(); }
  set mAngle(_v: any) { /* AS2 empty setter */ }
  get mCentre(): any { return this.__get__mCentre(); }
  set mCentre(_v: any) { /* AS2 empty setter */ }
  get mCrossProduct(): any { return this.__get__mCrossProduct(); }
  set mCrossProduct(_v: any) { /* AS2 empty setter */ }
  get mDelta(): any { return this.__get__mDelta(); }
  set mDelta(_v: any) { /* AS2 empty setter */ }
  get mGradient(): any { return this.__get__mGradient(); }
  set mGradient(_v: any) { /* AS2 empty setter */ }
  get mInverse(): any { return this.__get__mInverse(); }
  set mInverse(_v: any) { /* AS2 empty setter */ }
  get mLength(): any { return this.__get__mLength(); }
  set mLength(_v: any) { /* AS2 empty setter */ }
  get mLength_SQR(): any { return this.__get__mLength_SQR(); }
  set mLength_SQR(_v: any) { /* AS2 empty setter */ }
  get mNormal(): any { return this.__get__mNormal(); }
  set mNormal(_v: any) { /* AS2 empty setter */ }
  get mNormalUnit(): any { return this.__get__mNormalUnit(); }
  set mNormalUnit(_v: any) { /* AS2 empty setter */ }
  get mOrientation(): any { return this.__get__mOrientation(); }
  set mOrientation(_v: any) { /* AS2 empty setter */ }
  get mOrientation180(): any { return this.__get__mOrientation180(); }
  set mOrientation180(_v: any) { /* AS2 empty setter */ }
}
proto(CLine, { _CLASSID_: 'scidd.Math.CLine' });

registerGameClass('scidd.Math.CLine', CLine);
