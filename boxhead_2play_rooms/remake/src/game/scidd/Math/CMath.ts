// Port of projects/boxhead4/scidd/Math/CMath.as
// The .as text is a raw class prologue (ffdec could not rebuild the class: `0.Name = function` = static member, see
// generated/reports/hotspots.md "class prologue"); structure taken from generated/disasm/scidd.Math.CMath.txt
// top-level script @98323..@103884.
import { flash, proto } from '../../../engine/runtime.ts';
import { scidd, registerGameClass } from '../../packages.ts';

export class CMath {
  declare _CLASSID_: string;
  static r360 = 6.283185307179586;
  static DegToRad = 0.017453292519943295;
  static degToRad = 0.017453292519943295;
  static RadToDeg = 57.29577951308232;
  static radToDeg = 57.29577951308232;

  constructor() {
  }

  static DotProduct(p1: any, p2: any): number {
    return p1.x * p2.x + p1.y * p2.y;
  }

  static CrossProduct(p1: any, p2: any): any {
    return new flash.geom.Point(p1.y * p2.x - p1.x * p2.y, p1.x * p2.y - p1.y * p2.x);
  }

  static CrossProduct_Origin(o: any, p1: any, p2: any): any {
    return scidd.Math.CMath.CrossProduct(p1.subtract(o), p2.subtract(o));
  }

  static Range(tNumber: any, tMin: any, tMax: any): any {
    return tNumber <= tMax ? (tNumber >= tMin ? tNumber : tMin) : tMax;
  }

  static Never0(tNumber: any): any {
    return tNumber != 0 ? tNumber : 0.000001;
  }

  static Sign(tNumber: any): number {
    return tNumber >= 0 ? (tNumber <= 0 ? 0 : 1) : -1;
  }

  static Tween(tMin: any, tMax: any, tFactor: any, tEaseIn?: any, pow?: any): number {
    tEaseIn = tEaseIn != undefined ? tEaseIn : 0;
    if (tEaseIn != 0) {
      pow = pow != undefined ? pow : 15;
      tFactor = tEaseIn <= 0 ? Math.pow(tFactor, pow * (0 - tEaseIn) + 1) : 1 - Math.pow(1 - tFactor, pow * tEaseIn + 1);
    }
    return (tMax - tMin) * tFactor + tMin;
  }

  static Define(tObject: any, tDefault: any): any {
    return tObject != undefined ? tObject : tDefault;
  }

  static Round(tNumber: any, tBase: any): number {
    return Math.round(tNumber / tBase) * tBase;
  }

  static Floor(tNumber: any, tBase: any): number {
    return Math.floor(tNumber / tBase) * tBase;
  }

  static Ceil(tNumber: any, tBase: any): number {
    return Math.ceil(tNumber / tBase) * tBase;
  }

  static DecimalPlaces(tNumber: any): number {
    let _loc2_ = 0; // [BC] generated/disasm/scidd.Math.CMath.txt @99519
    while (tNumber % 1 != 0) { // [BC] generated/disasm/scidd.Math.CMath.txt @99524
      tNumber *= 10;
      _loc2_ = _loc2_ + 1; // [BC] generated/disasm/scidd.Math.CMath.txt @99577
    }
    return _loc2_;
  }

  static GetLineNormal(p1: any, p2: any): any {
    const _loc1_ = new flash.geom.Matrix();
    _loc1_.rotate(-1.5707963267948966);
    const _loc2_ = _loc1_.transformPoint(new flash.geom.Point(p2.x - p1.x, p2.y - p1.y));
    _loc2_.normalize(1);
    return _loc2_;
  }

  static GetAngle(p1: any, p2: any): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  static CorrectAngle(a: any): number {
    while (a < 0) {
      a += scidd.Math.CMath.r360;
    }
    a %= scidd.Math.CMath.r360;
    return a;
  }

  static RotationDirection(angle: any, targetAngle: any): number {
    const _loc1_ = scidd.Math.CMath.CorrectAngle(targetAngle) - scidd.Math.CMath.CorrectAngle(angle);
    if (_loc1_ < -3.141592653589793) {
      return 0 - (scidd.Math.CMath.r360 + _loc1_);
    }
    if (_loc1_ > 3.141592653589793) {
      return _loc1_ - scidd.Math.CMath.r360;
    }
    return _loc1_;
  }

  static SideOfLine(p: any, p1: any, p2: any): number {
    return (p1.x - p.x) * (p2.y - p.y) - (p2.x - p.x) * (p1.y - p.y);
  }

  static SideOfLine_SIGN(p: any, p1: any, p2: any): number {
    return scidd.Math.CMath.Sign(scidd.Math.CMath.SideOfLine(p, p1, p2));
  }

  static PointInShape(p: any, pShape: any): boolean {
    for (let _loc1_ = 0; _loc1_ < pShape.length - 1; _loc1_++) { // [BC] generated/disasm/scidd.Math.CMath.txt @100435
      if (scidd.Math.CMath.SideOfLine(p, pShape[_loc1_], pShape[_loc1_ + 1]) < 0) { // [BC] generated/disasm/scidd.Math.CMath.txt @100533
        return false;
      }
    }
    if (scidd.Math.CMath.SideOfLine(p, pShape[pShape.length - 1], pShape[0]) < 0) {
      return false;
    }
    return true;
  }

  static PointInShape_Closed(p: any, pShape: any): boolean {
    for (let _loc1_ = 0; _loc1_ < pShape.length - 1; _loc1_++) { // [BC] generated/disasm/scidd.Math.CMath.txt @100699
      if (scidd.Math.CMath.SideOfLine(p, pShape[_loc1_], pShape[_loc1_ + 1]) < 0) { // [BC] generated/disasm/scidd.Math.CMath.txt @100797
        return false;
      }
    }
    return true;
  }

  static LineIntersection(l1p1: any, l1p2: any, l2p1: any, l2p2: any): any {
    const _loc5_ = l2p2.x - l2p1.x;
    const _loc4_ = l2p2.y - l2p1.y;
    const _loc8_ = l1p2.x - l1p1.x;
    const _loc7_ = l1p2.y - l1p1.y;
    const _loc3_ = ((l2p1.y - l1p1.y) * _loc8_ - (l2p1.x - l1p1.x) * _loc7_) / (_loc5_ * _loc7_ - _loc4_ * _loc8_);
    let _loc6_: any = new flash.geom.Point(l2p1.x + _loc3_ * _loc5_, l2p1.y + _loc3_ * _loc4_);
    if (isNaN(_loc6_.x)) {
      _loc6_ = !l2p1.equals(l2p2) ? (!l1p1.equals(l1p2) ? undefined : l1p1.clone()) : l2p2.clone();
    }
    const _loc10_ = ((l1p1.y - l2p1.y) * _loc5_ - (l1p1.x - l2p1.x) * _loc4_) / (_loc8_ * _loc4_ - _loc7_ * _loc5_);
    return !(_loc3_ >= 0 && _loc3_ <= 1 && _loc10_ >= 0 && _loc10_ <= 1) ? undefined : _loc6_;
  }

  static LineIntersection2(l1p1: any, l1p2: any, l2p1: any, l2p2: any): any {
    const _loc11_ = l1p2.y - l1p1.y;
    const _loc9_ = l1p1.x - l1p2.x;
    const _loc10_ = l2p2.y - l2p1.y;
    const _loc7_ = l2p1.x - l2p2.x;
    const _loc1_ = _loc11_ * _loc7_ - _loc10_ * _loc9_;
    if (Math.abs(_loc1_) < 0.00001) {
      return undefined;
    }
    const _loc8_ = l1p2.x * l1p1.y - l1p1.x * l1p2.y;
    const _loc6_ = l2p2.x * l2p1.y - l2p1.x * l2p2.y;
    return new flash.geom.Point((_loc9_ * _loc6_ - _loc7_ * _loc8_) / _loc1_, (_loc10_ * _loc8_ - _loc11_ * _loc6_) / _loc1_);
  }

  static LineIntersection3(l1p1: any, l1p2: any, l2p1: any, l2p2: any, rp: any): boolean {
    if (l1p2.x == l1p1.x || l2p2.x == l2p1.x) {
      return false;
    }
    const _loc4_ = (l1p2.y - l1p1.y) / (l1p2.x - l1p1.x);
    const _loc7_ = (l2p2.y - l2p1.y) / (l2p2.x - l2p1.x);
    if (_loc4_ == _loc7_) {
      return false;
    }
    const _loc8_ = l1p1.y - _loc4_ * l1p1.x;
    const _loc9_ = l2p1.y - _loc7_ * l2p1.x;
    rp.x = (_loc9_ - _loc8_) / (_loc4_ - _loc7_);
    if (rp.x < Math.min(l1p1.x, l1p2.x) || rp.x > Math.max(l1p1.x, l1p2.x)) {
      return false;
    }
    if (rp.x < Math.min(l2p1.x, l2p2.x) || rp.x > Math.max(l2p1.x, l2p2.x)) {
      return false;
    }
    rp.y = _loc4_ * rp.x + _loc8_;
    return true;
  }

  static LineIntersection4(l1p1: any, l1p2: any, l2p1: any, l2p2: any, rp: any): boolean {
    if (scidd.Math.CMath.SideOfLine(l1p1, l2p1, l2p2) > 0) {
      return false;
    }
    const _loc1_ = scidd.Math.CMath.LineIntersection(l1p1, l1p2, l2p1, l2p2);
    if (_loc1_ == undefined) {
      return false;
    }
    rp.x = _loc1_.x;
    rp.y = _loc1_.y;
    return true;
  }

  static GetIntersectionPoint2(l1p1: any, l1p2: any, l2p1: any, l2p2: any, tOut: any): boolean {
    const _loc1_ = l2p1.y * l2p2.x - l2p1.x * l2p2.y;
    if (Math.abs(_loc1_) < 0.00001) {
      return false;
    }
    const _loc2_ = l1p2.subtract(l1p1);
    const _loc5_ = (l2p2.y * _loc2_.x - l2p2.x * _loc2_.y) / _loc1_;
    tOut.x = l1p1.x - l2p1.x * _loc5_;
    tOut.y = l1p1.y - l2p1.y * _loc5_;
    return true;
  }

  static LineToLine_Parallel(l1p1: any, l1p2: any, l2p1: any, l2p2: any): boolean {
    const _loc1_ = l2p1.y * l2p2.x - l2p1.x * l2p2.y;
    return Math.abs(_loc1_) >= 0.00001;
  }

  static Distance_PointToLine(p: any, lp1: any, lp2: any): number {
    return Math.sqrt(scidd.Math.CMath.Distance_PointToLine_Sqr(p, lp1, lp2));
  }

  static Distance_PointToLine_Sqr(p: any, lp1: any, lp2: any): number {
    const _loc1_ = lp2.subtract(lp1);
    const _loc8_ = p.subtract(lp1);
    const _loc5_ = scidd.Math.CMath.DotProduct(_loc8_, _loc1_);
    const _loc4_ = scidd.Math.CMath.DotProduct(_loc1_, _loc1_);
    const _loc3_ = _loc5_ / _loc4_;
    const _loc7_ = lp1.add(new flash.geom.Point(_loc1_.x * _loc3_, _loc1_.y * _loc3_));
    const _loc2_ = p.subtract(_loc7_);
    return _loc2_.x * _loc2_.x + _loc2_.y * _loc2_.y;
  }

  static Distance_PointToLine2(p: any, lp1: any, lp2: any): number {
    return Math.abs((scidd.Math.CMath.CrossProduct_Origin(lp1, lp2, p) as any) / flash.geom.Point.distance(lp1, lp2));
  }

  static Distance_Sqr(p1: any, p2: any): number {
    const _loc1_ = p2.subtract(p1);
    return _loc1_.x * _loc1_.x + _loc1_.y * _loc1_.y;
  }

  static ScalePoint(p: any, tScale: any): any {
    const _loc1_ = p.clone();
    _loc1_.x *= tScale;
    _loc1_.y *= tScale;
    return _loc1_;
  }

  static GetMatrix(p: any, a: any): any {
    const _loc2_ = Math.cos(a);
    const _loc1_ = Math.sin(a);
    return new flash.geom.Matrix(_loc2_, _loc1_, 0 - _loc1_, _loc2_, p.x, p.y);
  }

  static GetMatrix_Angle(a: any): any {
    const _loc2_ = Math.cos(a);
    const _loc1_ = Math.sin(a);
    return new flash.geom.Matrix(_loc2_, _loc1_, 0 - _loc1_, _loc2_, 0, 0);
  }
}
proto(CMath, { _CLASSID_: 'scidd.Math.CMath' });

registerGameClass('scidd.Math.CMath', CMath);
