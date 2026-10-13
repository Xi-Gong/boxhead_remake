// Port of assets/projects/boxhead4/Thing/Math/CThing_Position.as
// Structure (static vs prototype members, property list) from generated/disasm/Thing.Math.CThing_Position.txt
// top-level script @143255..@148956.
import { flash, proto, toAS2String } from '../../../engine/runtime.ts';
import { Thing, World, scidd, registerGameClass } from '../../packages.ts';

export class CThing_Position {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mX: any;
  declare mY: any;
  declare mZ: any;

  /** Projection factor for z (set to -sin(tilt) by CDrawPrimitive_XSI_Animation). */
  static mPFactor = 1;
  static PI = 3.141592653589793;
  static PI360 = CThing_Position.PI * 2;
  static Deg2Rad = CThing_Position.PI / 180;
  static Rad2Deg = 180 / CThing_Position.PI;

  constructor(tx?: any, ty?: any, tz?: any) {
    this.mX = tx;
    this.mY = ty;
    this.mZ = tz;
  }

  Clone(): CThing_Position {
    return new Thing.Math.CThing_Position(this.mX, this.mY, this.mZ);
  }

  ConvertScreenToCell(): this {
    this.mX /= World.Map.CMap_Cell.mSize.x;
    this.mY /= World.Map.CMap_Cell.mSize.y;
    return this;
  }

  ConvertCellToScreen(): any {
    return new flash.geom.Point(Math.round(this.mX * World.Map.CMap_Cell.mSize.x), Math.round((this.mY + this.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y));
  }

  __get__mCellCentre(): CThing_Position {
    return new Thing.Math.CThing_Position(Math.floor(this.mX) + 0.5, Math.floor(this.mY) + 0.5, this.mZ);
  }

  CellCentre(): this {
    this.mX = Math.floor(this.mX) + 0.5;
    this.mY = Math.floor(this.mY) + 0.5;
    return this;
  }

  Round(): this {
    this.mX = Math.round(this.mX);
    this.mY = Math.round(this.mY);
    return this;
  }

  Floor(): this {
    this.mX = Math.floor(this.mX);
    this.mY = Math.floor(this.mY);
    return this;
  }

  Ceil(): this {
    this.mX = Math.ceil(this.mX);
    this.mY = Math.ceil(this.mY);
    return this;
  }

  Add(p: any): CThing_Position {
    return new Thing.Math.CThing_Position(this.mX + p.mX, this.mY + p.mY, this.mZ + p.mZ);
  }

  Add2(p1: any, p2: any): this {
    this.mX = p1.mX + p2.mX;
    this.mY = p1.mY + p2.mY;
    this.mZ = p1.mZ + p2.mZ;
    return this;
  }

  Sub(p: any): CThing_Position {
    return new Thing.Math.CThing_Position(this.mX - p.mX, this.mY - p.mY, this.mZ - p.mZ);
  }

  Subtract(p: any): CThing_Position {
    return new Thing.Math.CThing_Position(this.mX - p.mX, this.mY - p.mY, this.mZ - p.mZ);
  }

  Equals(p: any): boolean {
    return this.mX == p.mX && this.mY == p.mY && this.mZ == p.mZ;
  }

  Equals0(): boolean {
    return this.mX == 0 && this.mY == 0 && this.mZ == 0;
  }

  Set(p: any): this {
    this.mX = p.mX;
    this.mY = p.mY;
    this.mZ = p.mZ;
    return this;
  }

  SetXYZ(x: any, y: any, z: any): this {
    this.mX = x;
    this.mY = y;
    this.mZ = z;
    return this;
  }

  Clear(): this {
    this.mX = 0;
    this.mY = 0;
    this.mZ = 0;
    return this;
  }

  ScaleN(tScale: any): this {
    this.mX *= tScale;
    this.mY *= tScale;
    this.mZ *= tScale;
    return this;
  }

  Scale(tScale: any): this {
    this.mX *= tScale.mX;
    this.mY *= tScale.mY;
    this.mZ *= tScale.mZ;
    return this;
  }

  Invert(): this {
    this.mX = 0 - this.mX;
    this.mY = 0 - this.mY;
    this.mZ = 0 - this.mZ;
    return this;
  }

  __get__mInverse(): CThing_Position {
    return new Thing.Math.CThing_Position(0 - this.mX, 0 - this.mY, 0 - this.mZ);
  }

  __get__mAbs(): CThing_Position {
    return new Thing.Math.CThing_Position(Math.abs(this.mX), Math.abs(this.mY), Math.abs(this.mZ));
  }

  __get__mLength_SQR(): number {
    return this.mX * this.mX + this.mY * this.mY + this.mZ * this.mZ;
  }

  __get__mLength(): number {
    return Math.sqrt(this.mX * this.mX + this.mY * this.mY + this.mZ * this.mZ);
  }

  __get__mLength2D_SQR(): number {
    return this.mX * this.mX + this.mY * this.mY;
  }

  __get__mLength2D(): number {
    return Math.sqrt(this.mX * this.mX + this.mY * this.mY);
  }

  toCVector3(): any {
    return new scidd.Math.CVector3(this.mX, this.mY, this.mZ);
  }

  toPoint(): any {
    return new flash.geom.Point(this.mX, this.mY);
  }

  toPointXY(): any {
    return new flash.geom.Point(this.mX, this.mY);
  }

  toPointXZ(): any {
    return new flash.geom.Point(this.mX, this.mZ);
  }

  toPointZY(): any {
    return new flash.geom.Point(this.mZ, this.mY);
  }

  toAngleZ(): number {
    return Math.atan2(this.mY, this.mX);
  }

  RoundBase(tBase: any): this {
    this.mX = scidd.Math.CMath.Round(this.mX, tBase);
    this.mY = scidd.Math.CMath.Round(this.mY, tBase);
    this.mZ = scidd.Math.CMath.Round(this.mZ, tBase);
    return this;
  }

  Distance(p: any): number {
    const _loc4_ = this.mX - p.mX;
    const _loc3_ = this.mY - p.mY;
    const _loc2_ = this.mZ - p.mZ;
    return Math.sqrt(_loc4_ * _loc4_ + _loc3_ * _loc3_ + _loc2_ * _loc2_);
  }

  Distance_SQR(p: any): number {
    const _loc4_ = this.mX - p.mX;
    const _loc3_ = this.mY - p.mY;
    const _loc2_ = this.mZ - p.mZ;
    return _loc4_ * _loc4_ + _loc3_ * _loc3_ + _loc2_ * _loc2_;
  }

  Distance2D(p: any): number {
    const _loc3_ = this.mX - p.mX;
    const _loc2_ = this.mY - p.mY;
    return Math.sqrt(_loc3_ * _loc3_ + _loc2_ * _loc2_);
  }

  Distance2D_SQR(p: any): number {
    const _loc3_ = p.mX - this.mX;
    const _loc2_ = p.mY - this.mY;
    return _loc3_ * _loc3_ + _loc2_ * _loc2_;
  }

  Normalize(tLength: any): this {
    this.ScaleN(!(this.mX == 0 && this.mY == 0 && this.mZ == 0) ? tLength / Math.sqrt(this.mX * this.mX + this.mY * this.mY + this.mZ * this.mZ) : 1);
    return this;
  }

  ScaleN2D(tScale: any): this {
    this.mX *= tScale;
    this.mY *= tScale;
    return this;
  }

  Normalize2D(tLength: any): this {
    this.ScaleN2D(!(this.mX == 0 && this.mY == 0) ? tLength / Math.sqrt(this.mX * this.mX + this.mY * this.mY) : 1);
    return this;
  }

  AngleToPosition(p: any): number {
    let _loc2_: any;
    _loc2_ = Math.atan2(p.mY - this.mY, p.mX - this.mX);
    return _loc2_ >= 0 ? _loc2_ : _loc2_ + Thing.Math.CThing_Position.PI360;
  }

  CAngleToPosition(p: any): any {
    return new Thing.Math.CThing_Angle(this.AngleToPosition(p));
  }

  DotProduct(tv: any): number {
    return this.mX * tv.mX + this.mY * tv.mY + this.mZ * tv.mZ;
  }

  CrossProduct(tv: any): CThing_Position {
    return new Thing.Math.CThing_Position(this.mY * tv.mZ - this.mZ * tv.mY, this.mZ * tv.mX - this.mX * tv.mZ, this.mX * tv.mY - this.mY * tv.mX);
  }

  Precision(tPrecision: any): this {
    const _loc2_ = tPrecision != 0 ? Math.pow(10, tPrecision) : 1;
    this.mX = Math.round(this.mX * _loc2_) / _loc2_;
    this.mY = Math.round(this.mY * _loc2_) / _loc2_;
    this.mZ = Math.round(this.mZ * _loc2_) / _loc2_;
    return this;
  }

  static Average(tvlist: any): CThing_Position {
    const _loc3_ = tvlist[0].Clone();
    for (let _loc1_ = 1; _loc1_ < tvlist.length; _loc1_++) { // [BC] generated/disasm/Thing.Math.CThing_Position.txt @147922
      // Original bug kept: Add() returns a NEW position and the result is discarded (the sum is never accumulated).
      _loc3_.Add(tvlist[_loc1_]); // [BC] generated/disasm/Thing.Math.CThing_Position.txt @147965
    }
    return new Thing.Math.CThing_Position(_loc3_.mX / tvlist.length, _loc3_.mY / tvlist.length, _loc3_.mZ / tvlist.length);
  }

  RotateZ(r: any): this {
    const _loc3_ = Math.cos(r);
    const _loc2_ = Math.sin(r);
    const _loc4_ = this.mX * _loc3_ - this.mY * _loc2_;
    this.mY = this.mY * _loc3_ + this.mX * _loc2_;
    this.mX = _loc4_;
    return this;
  }

  RotateY(r: any): this {
    const _loc3_ = Math.cos(r);
    const _loc2_ = Math.sin(r);
    const _loc4_ = this.mX * _loc3_ - this.mZ * _loc2_;
    this.mZ = this.mZ * _loc3_ + this.mX * _loc2_;
    this.mX = _loc4_;
    return this;
  }

  static PlaneNormal(tv1: any, tv2: any, tv3: any): CThing_Position {
    return tv3.Subtract(tv2).CrossProduct(tv1.Subtract(tv2)).Normalize(1);
  }

  toString(): string {
    return this._CLASSID_ + ':{mX=' + toAS2String(this.mX) + ', mY=' + toAS2String(this.mY) + ', mZ=' + toAS2String(this.mZ) + '}';
  }

  // addProperty(name, __get__name, function () {}) — getters with an EMPTY setter (assignments are ignored).
  get mAbs(): CThing_Position { return this.__get__mAbs(); }
  set mAbs(_v: CThing_Position) { /* AS2 empty setter */ }
  get mCellCentre(): CThing_Position { return this.__get__mCellCentre(); }
  set mCellCentre(_v: CThing_Position) { /* AS2 empty setter */ }
  get mInverse(): CThing_Position { return this.__get__mInverse(); }
  set mInverse(_v: CThing_Position) { /* AS2 empty setter */ }
  get mLength(): number { return this.__get__mLength(); }
  set mLength(_v: number) { /* AS2 empty setter */ }
  get mLength2D(): number { return this.__get__mLength2D(); }
  set mLength2D(_v: number) { /* AS2 empty setter */ }
  get mLength2D_SQR(): number { return this.__get__mLength2D_SQR(); }
  set mLength2D_SQR(_v: number) { /* AS2 empty setter */ }
  get mLength_SQR(): number { return this.__get__mLength_SQR(); }
  set mLength_SQR(_v: number) { /* AS2 empty setter */ }
}
proto(CThing_Position, { _CLASSID_: 'CThing_Position', _BASECLASSID_: 'CThing_Position' });

registerGameClass('Thing.Math.CThing_Position', CThing_Position);
