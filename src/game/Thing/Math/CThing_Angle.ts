// Port of assets/projects/boxhead4/Thing/Math/CThing_Angle.as
// Structure (static vs prototype members, property list) from generated/disasm/Thing.Math.CThing_Angle.txt
// top-level script @178907..@182989.
import { mathRandom, proto, random, toAS2String } from '../../../engine/runtime.ts';
import { Thing, registerGameClass } from '../../packages.ts';

export class CThing_Angle {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mRadians: number;

  static PI = 3.141592653589793;
  static PI360 = CThing_Angle.PI * 2;
  static PI360x100 = CThing_Angle.PI360 * 100;
  static Deg2Rad = CThing_Angle.PI / 180;
  static Rad2Deg = 180 / CThing_Angle.PI;
  static RadsTo256 = 256 / CThing_Angle.PI360;
  static mDirection_E = 0;
  static mDirection_SE = 1;
  static mDirection_S = 2;
  static mDirection_SW = 3;
  static mDirection_W = 4;
  static mDirection_NW = 5;
  static mDirection_N = 6;
  static mDirection_NE = 7;
  static mDirection_Amount = 8;
  static mDirection_Amountx100 = CThing_Angle.mDirection_Amount * 100;
  static mRadsToDirection = (CThing_Angle.PI * 2) / CThing_Angle.mDirection_Amount;
  static mDirection_Angles = [
    CThing_Angle.PI * 0, CThing_Angle.PI * 0.25, CThing_Angle.PI * 0.5, CThing_Angle.PI * 0.75,
    CThing_Angle.PI * 1, CThing_Angle.PI * 1.25, CThing_Angle.PI * 1.5, CThing_Angle.PI * 1.75,
  ];
  /** Filled by Create_LookupTables(): mLookup256[n][a] for n = 1..32 (index 0 never filled). */
  static mLookup256: any;

  // AS2 builds mDirection_Deltas in the class prologue (@182393) with `new Thing.Math.CThing_Position(...)`. The
  // package namespace is not populated at ES-module evaluation time, so the table is created lazily on first access
  // (same identity forever after, like the AS2 static array).
  static _mDirection_Deltas: any[];
  static get mDirection_Deltas(): any[] {
    if (CThing_Angle._mDirection_Deltas === undefined) {
      CThing_Angle._mDirection_Deltas = [
        new Thing.Math.CThing_Position(1, 0, 0), new Thing.Math.CThing_Position(1, 1, 0),
        new Thing.Math.CThing_Position(0, 1, 0), new Thing.Math.CThing_Position(-1, 1, 0),
        new Thing.Math.CThing_Position(-1, 0, 0), new Thing.Math.CThing_Position(-1, -1, 0),
        new Thing.Math.CThing_Position(0, -1, 0), new Thing.Math.CThing_Position(1, -1, 0),
      ];
    }
    return CThing_Angle._mDirection_Deltas;
  }
  static set mDirection_Deltas(v: any[]) { CThing_Angle._mDirection_Deltas = v; }

  constructor(a?: any) {
    this.mRadians = Thing.Math.CThing_Angle.Correct(a);
  }

  Clone(rads?: any): CThing_Angle {
    return new Thing.Math.CThing_Angle(this.mRadians);
  }

  toString(): string {
    return this._CLASSID_ + ':{mRadians=' + toAS2String(this.mRadians) + ', mDirection=' + toAS2String(this.__get__mDirection()) + '}';
  }

  __get__mAngle(): number {
    return this.mRadians;
  }

  __set__mAngle(a: any): number {
    this.mRadians = Thing.Math.CThing_Angle.Correct(a);
    return this.__get__mAngle();
  }

  __get__mRotation(): number {
    return this.mRadians * Thing.Math.CThing_Angle.Rad2Deg;
  }

  __set__mRotation(a: any): number {
    this.mRadians = a * Thing.Math.CThing_Angle.Deg2Rad;
    return this.__get__mRotation();
  }

  Add(a: any): this {
    this.mRadians = Thing.Math.CThing_Angle.Correct(this.mRadians + a);
    return this;
  }

  Sub(a: any): this {
    this.mRadians = Thing.Math.CThing_Angle.Correct(this.mRadians - a);
    return this;
  }

  Random(): this {
    this.mRadians = mathRandom() * Thing.Math.CThing_Angle.PI360;
    return this;
  }

  RandomDirection(): this {
    this.__set__mDirection(random(4) * 2);
    return this;
  }

  TurnAngle(targetAngle: any): number {
    if (targetAngle.mRadians == this.mRadians) {
      return 0;
    }
    const _loc2_ = Math.abs(targetAngle.mRadians - this.mRadians) <= Thing.Math.CThing_Angle.PI ? 1 : -1;
    return targetAngle.mRadians <= this.mRadians ? 0 - _loc2_ : _loc2_;
  }

  TurnDirection(d2: any): number {
    const _loc2_ = this.__get__mDirection();
    if (_loc2_ == d2) {
      return 0;
    }
    const _loc3_ = Math.abs(d2 - _loc2_) <= 4 ? 1 : -1;
    return d2 <= _loc2_ ? 0 - _loc3_ : _loc3_;
  }

  AngleDifference(targetAngle: any): number {
    const _loc2_ = targetAngle.mRadians - this.mRadians;
    return _loc2_ >= 0 - Thing.Math.CThing_Angle.PI
      ? (_loc2_ <= Thing.Math.CThing_Angle.PI ? _loc2_ : _loc2_ - Thing.Math.CThing_Angle.PI360)
      : _loc2_ + Thing.Math.CThing_Angle.PI360;
  }

  static Correct(a: any): number {
    return (a + Thing.Math.CThing_Angle.PI360x100) % Thing.Math.CThing_Angle.PI360;
  }

  static CorrectDirection(d: any): number {
    return d & 7;
  }

  __get__mDirection(): number {
    return Math.round(this.mRadians / Thing.Math.CThing_Angle.mRadsToDirection) & 7;
  }

  __set__mDirection(d: any): number {
    this.mRadians = Thing.Math.CThing_Angle.mDirection_Angles[d & 7];
    return this.__get__mDirection();
  }

  __get__mDirectionOpposite(): number {
    return Math.round(this.mRadians / Thing.Math.CThing_Angle.mRadsToDirection + Thing.Math.CThing_Angle.mDirection_Amount / 2) & 7;
  }

  ToDirectionN(tNumberOfDirections: any): number {
    return Math.round(this.mRadians / (Thing.Math.CThing_Angle.PI360 / tNumberOfDirections)) % tNumberOfDirections;
  }

  static GetDirection(rads: any): number {
    return Math.round(rads / Thing.Math.CThing_Angle.mRadsToDirection) & 7;
  }

  __get__mDelta(): any {
    return new Thing.Math.CThing_Position(Math.cos(this.mRadians), Math.sin(this.mRadians), 0);
  }

  __set__mDelta(d: any): any {
    this.mRadians = Thing.Math.CThing_Angle.Correct(Math.atan2(d.mY, d.mX));
    return this.__get__mDelta();
  }

  __get__mDirectionDelta(): any {
    return Thing.Math.CThing_Angle.mDirection_Deltas[this.__get__mDirection()];
  }

  __set__mDirectionDelta(d: any): any {
    this.mRadians = Thing.Math.CThing_Angle.Correct(Math.atan2(d.mY, d.mX));
    return this.__get__mDirectionDelta();
  }

  __get__mDirectionDeltaOpposite(): any {
    return Thing.Math.CThing_Angle.mDirection_Deltas[this.__get__mDirectionOpposite()];
  }

  __get__mAngle256(): number {
    return (this.mRadians * Thing.Math.CThing_Angle.RadsTo256) & 255;
  }

  static Create_LookupTables(): void {
    if (Thing.Math.CThing_Angle.mLookup256 == undefined) {
      Thing.Math.CThing_Angle.mLookup256 = new Array();
      for (let _loc2_ = 32; _loc2_; _loc2_--) { // [BC] generated/disasm/Thing.Math.CThing_Angle.txt @181389
        Thing.Math.CThing_Angle.mLookup256[_loc2_] = new Array(); // [BC] generated/disasm/Thing.Math.CThing_Angle.txt @181446
        for (let _loc1_ = 255; _loc1_ >= 0; _loc1_--) { // [BC] generated/disasm/Thing.Math.CThing_Angle.txt @181455
          Thing.Math.CThing_Angle.mLookup256[_loc2_][_loc1_] = Math.round(_loc1_ / (256 / _loc2_)) % _loc2_; // [BC] generated/disasm/Thing.Math.CThing_Angle.txt @181551
        }
      }
    }
  }

  // addProperty(...) — properties with a getter and either a real or an EMPTY (no-op) setter.
  get mAngle(): number { return this.__get__mAngle(); }
  set mAngle(v: number) { this.__set__mAngle(v); }
  get mAngle256(): number { return this.__get__mAngle256(); }
  set mAngle256(_v: number) { /* AS2 empty setter */ }
  get mDelta(): any { return this.__get__mDelta(); }
  set mDelta(v: any) { this.__set__mDelta(v); }
  get mDirection(): number { return this.__get__mDirection(); }
  set mDirection(v: number) { this.__set__mDirection(v); }
  get mDirectionDelta(): any { return this.__get__mDirectionDelta(); }
  set mDirectionDelta(v: any) { this.__set__mDirectionDelta(v); }
  get mDirectionDeltaOpposite(): any { return this.__get__mDirectionDeltaOpposite(); }
  set mDirectionDeltaOpposite(_v: any) { /* AS2 empty setter */ }
  get mDirectionOpposite(): number { return this.__get__mDirectionOpposite(); }
  set mDirectionOpposite(_v: number) { /* AS2 empty setter */ }
  get mRotation(): number { return this.__get__mRotation(); }
  set mRotation(v: number) { this.__set__mRotation(v); }
}
proto(CThing_Angle, { _CLASSID_: 'CThing_Angle', _BASECLASSID_: 'CThing_Angle' });

registerGameClass('Thing.Math.CThing_Angle', CThing_Angle);
