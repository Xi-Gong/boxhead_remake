// Port of projects/boxhead4/scidd/Math/CVector3.as
// Unused by the shipped game — ported straightforwardly, no tests (CONVENTIONS rule 11).
import { proto } from '../../../engine/runtime.ts';
import { scidd, registerGameClass } from '../../packages.ts';

export class CVector3 {
  declare _CLASSID_: string;
  declare mX: any;
  declare mY: any;
  declare mZ: any;

  constructor(tx?: any, ty?: any, tz?: any) {
    this.mX = tx;
    this.mY = ty;
    this.mZ = tz;
  }

  Clone(): CVector3 {
    return new scidd.Math.CVector3(this.mX, this.mY, this.mZ);
  }

  Add(tv: any): this {
    this.mX += tv.mX;
    this.mY += tv.mY;
    this.mZ += tv.mZ;
    return this;
  }

  Sub(tv: any): this {
    this.mX -= tv.mX;
    this.mY -= tv.mY;
    this.mZ -= tv.mZ;
    return this;
  }

  Equals(tv: any): boolean {
    return this.mX == tv.mX && this.mY == tv.mY && this.mZ == tv.mZ;
  }

  Equals0(): boolean {
    return this.mX == 0 && this.mY == 0 && this.mZ == 0;
  }

  Set(tv: any): this {
    this.mX = tv.mX;
    this.mY = tv.mY;
    this.mZ = tv.mZ;
    return this;
  }

  Clear(): this {
    this.mX = 0;
    this.mY = 0;
    this.mZ = 0;
    return this;
  }

  Invert(): this {
    this.mX = 0 - this.mX;
    this.mY = 0 - this.mY;
    this.mZ = 0 - this.mZ;
    return this;
  }

  Inverse(): CVector3 {
    return new scidd.Math.CVector3(0 - this.mX, 0 - this.mY, 0 - this.mZ);
  }

  Abs(): CVector3 {
    return new scidd.Math.CVector3(Math.abs(this.mX), Math.abs(this.mY), Math.abs(this.mZ));
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

  _Length(): number {
    return Math.sqrt(this.mX * this.mX + this.mY * this.mY + this.mZ * this.mZ);
  }

  Distance(tVector3: any): number {
    const _loc4_ = this.mX - tVector3.mX;
    const _loc3_ = this.mY - tVector3.mY;
    const _loc2_ = this.mZ - tVector3.mZ;
    return Math.sqrt(_loc4_ * _loc4_ + _loc3_ * _loc3_ + _loc2_ * _loc2_);
  }

  Normalize(tLength: any): this {
    if (this._Length() != 0) {
      this.ScaleN(tLength / this._Length());
    }
    return this;
  }

  DotProduct(tv: any): number {
    return this.mX * tv.mX + this.mY * tv.mY + this.mZ * tv.mZ;
  }

  CrossProduct(tv: any): CVector3 {
    return new scidd.Math.CVector3(this.mY * tv.mZ - this.mZ * tv.mY, this.mZ * tv.mX - this.mX * tv.mZ, this.mX * tv.mY - this.mY * tv.mX);
  }

  Precision(tPrecision: any): this {
    const _loc2_ = tPrecision != 0 ? Math.pow(10, tPrecision) : 1;
    this.mX = Math.round(this.mX * _loc2_) / _loc2_;
    this.mY = Math.round(this.mY * _loc2_) / _loc2_;
    this.mZ = Math.round(this.mZ * _loc2_) / _loc2_;
    return this;
  }

  static Average(tvlist: any): CVector3 {
    const _loc3_ = tvlist[0].Clone();
    for (let _loc1_ = 1; _loc1_ < tvlist.length; _loc1_++) { // [BC] generated/disasm/scidd.Math.CVector3.txt @199559
      _loc3_.Add(tvlist[_loc1_]); // [BC] generated/disasm/scidd.Math.CVector3.txt @199602
    }
    return new scidd.Math.CVector3(_loc3_.mX / tvlist.length, _loc3_.mY / tvlist.length, _loc3_.mZ / tvlist.length);
  }

  RotateY(tRads: any): void {
    const _loc3_ = Math.cos(tRads);
    const _loc2_ = Math.sin(tRads);
    const _loc5_ = this.mX * _loc3_ - this.mZ * _loc2_;
    const _loc4_ = this.mZ * _loc3_ + this.mX * _loc2_;
    this.mX = _loc5_;
    this.mZ = _loc4_;
  }

  toString(): string {
    return '{mX=' + this.mX + ', mY=' + this.mY + ', mZ=' + this.mZ + '}';
  }
}
proto(CVector3, { _CLASSID_: 'scidd.Math.CVector3' });

registerGameClass('scidd.Math.CVector3', CVector3);
