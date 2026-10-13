// Port of projects/boxhead4/scidd/Draw/CColor.as
// The .as text is a raw class prologue; structure from generated/disasm/scidd.Draw.CColor.txt top-level script
// @566936..@573956.
import { flash, proto, random } from '../../../engine/runtime.ts';
import { scidd, registerGameClass } from '../../packages.ts';

export class CColor {
  declare _CLASSID_: string;
  static _LumR = 0.3086;
  static _LumG = 0.6094;
  static _LumB = 0.082;
  declare mRed: any;
  declare mGreen: any;
  declare mBlue: any;
  declare mAlpha: any;
  declare mBrightness: any;

  constructor(tRed?: any, tGreen?: any, tBlue?: any, tAlpha?: any, tBrightness?: any) {
    this.mRed = scidd.Math.CMath.Define(tRed, 255);
    this.mGreen = scidd.Math.CMath.Define(tGreen, 255);
    this.mBlue = scidd.Math.CMath.Define(tBlue, 255);
    this.mAlpha = scidd.Math.CMath.Define(tAlpha, 255);
    this.mBrightness = scidd.Math.CMath.Define(tBrightness, 0);
  }

  toString(): string {
    return '{R:' + this.mRed + ', G:' + this.mGreen + ', B:' + this.mBlue + ', A:' + this.mAlpha + '}';
  }

  Clone(): CColor {
    return new scidd.Draw.CColor(this.mRed, this.mGreen, this.mBlue, this.mAlpha, this.mBrightness);
  }

  static Red(tAmount?: any): CColor {
    tAmount = scidd.Math.CMath.Define(tAmount, 255);
    return new scidd.Draw.CColor(tAmount, 0, 0);
  }

  static Green(tAmount?: any): CColor {
    tAmount = scidd.Math.CMath.Define(tAmount, 255);
    return new scidd.Draw.CColor(0, tAmount, 0);
  }

  static Blue(tAmount?: any): CColor {
    tAmount = scidd.Math.CMath.Define(tAmount, 255);
    return new scidd.Draw.CColor(0, 0, tAmount);
  }

  static White(tAmount?: any): CColor {
    tAmount = scidd.Math.CMath.Define(tAmount, 255);
    return new scidd.Draw.CColor(tAmount, tAmount, tAmount);
  }

  static Grey(tAmount?: any): CColor {
    tAmount = scidd.Math.CMath.Define(tAmount, 128);
    return new scidd.Draw.CColor(tAmount, tAmount, tAmount);
  }

  static Clear(): CColor {
    return new scidd.Draw.CColor(0, 0, 0, 0);
  }

  static Black(): CColor {
    return new scidd.Draw.CColor(0, 0, 0);
  }

  static Blank(): CColor {
    return new scidd.Draw.CColor(0, 0, 0, 0);
  }

  static Random(): CColor {
    return new scidd.Draw.CColor(random(256), random(256), random(256));
  }

  static FromRGB(tRGB: any): CColor {
    const _loc3_ = (tRGB >> 16) & 255;
    const _loc1_ = (tRGB >> 8) & 255;
    const _loc4_ = (tRGB >> 0) & 255;
    return new scidd.Draw.CColor(_loc3_, _loc1_, _loc4_, 255);
  }

  static FromRGB32(tARGB: any): CColor {
    const _loc4_ = (tARGB >> 16) & 255;
    const _loc2_ = (tARGB >> 8) & 255;
    const _loc5_ = (tARGB >> 0) & 255;
    const _loc3_ = (tARGB >> 24) & 255;
    return new scidd.Draw.CColor(_loc4_, _loc2_, _loc5_, _loc3_);
  }

  Combine(combineColor: any): CColor {
    const _loc2_ = new scidd.Draw.CColor(0, 0, 0, 0);
    _loc2_.mRed = (this.mRed + combineColor.mRed) / 2;
    _loc2_.mGreen = (this.mGreen + combineColor.mGreen) / 2;
    _loc2_.mBlue = (this.mBlue + combineColor.mBlue) / 2;
    _loc2_.mAlpha = (this.mAlpha + combineColor.mAlpha) / 2;
    _loc2_.mBrightness = (this.mBrightness + combineColor.mBrightness) / 2;
    return _loc2_;
  }

  GetBaseColor(): CColor {
    const _loc2_ = this.Clone();
    return _loc2_;
  }

  getRGB(): number {
    let _loc2_: any;
    let _loc3_: any;
    let _loc4_: any;
    if (this.mBrightness < 0) {
      _loc3_ = scidd.Math.CMath.Range(this.mRed + this.mRed * this.mBrightness, 0, 255) << 16;
      _loc2_ = scidd.Math.CMath.Range(this.mGreen + this.mGreen * this.mBrightness, 0, 255) << 8;
      _loc4_ = scidd.Math.CMath.Range(this.mBlue + this.mBlue * this.mBrightness, 0, 255) << 0;
      return _loc3_ | _loc2_ | _loc4_;
    }
    if (this.mBrightness > 0) {
      _loc3_ = scidd.Math.CMath.Range(this.mRed + (255 - this.mRed) * this.mBrightness, 0, 255) << 16;
      _loc2_ = scidd.Math.CMath.Range(this.mGreen + (255 - this.mGreen) * this.mBrightness, 0, 255) << 8;
      _loc4_ = scidd.Math.CMath.Range(this.mBlue + (255 - this.mBlue) * this.mBrightness, 0, 255) << 0;
      return _loc3_ | _loc2_ | _loc4_;
    }
    return (this.mRed << 16) + (this.mGreen << 8) + this.mBlue;
  }

  getRGB32(): number {
    return this.getRGB() + (this.mAlpha << 24);
  }

  __get__mAlpha100(): number {
    return Math.round((this.mAlpha * 100) / 255);
  }

  static GetColorMatrixFilter(dMat: any): any {
    return new flash.filters.ColorMatrixFilter(dMat);
  }

  static ColorMatrix_Identity(): number[] {
    return new Array(1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0);
  }

  static _BlendMatrix(mat1: any, mat2: any, tAmount: any): any[] {
    const _loc3_: any[] = scidd.Draw.CColor.ColorMatrix_Identity();
    for (let _loc1_ = 0; _loc1_ < mat1.length; _loc1_++) { // [BC] generated/disasm/scidd.Draw.CColor.txt @569954
      _loc3_[_loc1_] = scidd.Math.CMath.Tween(mat1[_loc1_], mat2[_loc1_], tAmount); // [BC] generated/disasm/scidd.Draw.CColor.txt @570027
    }
    return _loc3_;
  }

  static ColorMatrix_Colorize(tColor: any, tAmount: any, tLightness?: any): number[] {
    tLightness = scidd.Math.CMath.Define(tLightness, 1);
    const _loc1_ = tAmount;
    const _loc5_ = 1 - _loc1_;
    const _loc3_ = (tColor.mRed / 255) * (tLightness + 1);
    const _loc6_ = (tColor.mGreen / 255) * (tLightness + 1);
    const _loc2_ = (tColor.mBlue / 255) * (tLightness + 1);
    const C = scidd.Draw.CColor;
    const _loc7_ = new Array(
      _loc5_ + _loc1_ * _loc3_ * C._LumR, _loc1_ * _loc3_ * C._LumG, _loc1_ * _loc3_ * C._LumB, 0, 0,
      _loc1_ * _loc6_ * C._LumR, _loc5_ + _loc1_ * _loc6_ * C._LumG, _loc1_ * _loc6_ * C._LumB, 0, 0,
      _loc1_ * _loc2_ * C._LumR, _loc1_ * _loc2_ * C._LumG, _loc5_ + _loc1_ * _loc2_ * C._LumB, 0, 0,
      0, 0, 0, 1, 0,
    );
    return _loc7_;
  }

  static ColorMatrix_Serpia(tAmount?: any): any[] {
    tAmount = scidd.Math.CMath.Define(tAmount, 1);
    const _loc1_ = new Array(0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0);
    return scidd.Draw.CColor._BlendMatrix(scidd.Draw.CColor.ColorMatrix_Identity(), _loc1_, tAmount);
  }

  static ColorMatrix_GreyScale(tAmount?: any): any[] {
    tAmount = scidd.Math.CMath.Define(tAmount, 1);
    const C = scidd.Draw.CColor;
    const _loc1_ = new Array(C._LumR, C._LumG, C._LumB, 0, 0, C._LumR, C._LumG, C._LumB, 0, 0, C._LumR, C._LumG, C._LumB, 0, 0, 0, 0, 0, 1, 0);
    return scidd.Draw.CColor._BlendMatrix(scidd.Draw.CColor.ColorMatrix_Identity(), _loc1_, tAmount);
  }

  static ColorMatrix_HUE(tHue: any): number[] {
    if (tHue != 0) {
      const _loc1_ = Math.cos(tHue);
      const _loc2_ = Math.sin(tHue);
      const _loc5_ = 0.213; // [BC] generated/disasm/scidd.Draw.CColor.txt @571588
      const _loc4_ = 0.715; // [BC] generated/disasm/scidd.Draw.CColor.txt @571605
      const _loc3_ = 0.072; // [BC] generated/disasm/scidd.Draw.CColor.txt @571622
      const _loc6_ = new Array(
        _loc5_ + _loc1_ * (1 - _loc5_) + _loc2_ * (0 - _loc5_), _loc4_ + _loc1_ * (0 - _loc4_) + _loc2_ * (0 - _loc4_), _loc3_ + _loc1_ * (0 - _loc3_) + _loc2_ * (1 - _loc3_), 0, 0,
        _loc5_ + _loc1_ * (0 - _loc5_) + _loc2_ * 0.143, _loc4_ + _loc1_ * (1 - _loc4_) + _loc2_ * 0.14, _loc3_ + _loc1_ * (0 - _loc3_) + _loc2_ * -0.283, 0, 0,
        _loc5_ + _loc1_ * (0 - _loc5_) + _loc2_ * (0 - (1 - _loc5_)), _loc4_ + _loc1_ * (0 - _loc4_) + _loc2_ * _loc4_, _loc3_ + _loc1_ * (1 - _loc3_) + _loc2_ * _loc3_, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 1,
      );
      return _loc6_;
    }
    return scidd.Draw.CColor.ColorMatrix_Identity();
  }

  static ColorMatrix_Saturation(tSaturation: any): number[] {
    if (tSaturation != 0) {
      if (tSaturation > 0) {
        tSaturation = tSaturation * 5 + 1;
      } else if (tSaturation < 0) {
        tSaturation += 1;
      }
      const _loc2_ = (1 - tSaturation) * scidd.Draw.CColor._LumR;
      const _loc3_ = (1 - tSaturation) * scidd.Draw.CColor._LumG;
      const _loc4_ = (1 - tSaturation) * scidd.Draw.CColor._LumB;
      const _loc5_ = new Array(_loc2_ + tSaturation, _loc3_, _loc4_, 0, 0, _loc2_, _loc3_ + tSaturation, _loc4_, 0, 0, _loc2_, _loc3_, _loc4_ + tSaturation, 0, 0, 0, 0, 0, 1, 0);
      return _loc5_;
    }
    return scidd.Draw.CColor.ColorMatrix_Identity();
  }

  static ColorMatrix_Alpha(tAlpha: any): number[] {
    if (tAlpha != 1) {
      const _loc1_ = new Array(1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, tAlpha, 0);
      return _loc1_;
    }
    return scidd.Draw.CColor.ColorMatrix_Identity();
  }

  static ColorMatrix_Contrast(tContrast: any): number[] {
    if (tContrast != 0) {
      if (tContrast > 0) {
        tContrast *= 5;
      }
      tContrast += 1;
      const _loc2_ = new Array(tContrast, 0, 0, 0, 128 * (1 - tContrast), 0, tContrast, 0, 0, 128 * (1 - tContrast), 0, 0, tContrast, 0, 128 * (1 - tContrast), 0, 0, 0, 1, 0);
      return _loc2_;
    }
    return scidd.Draw.CColor.ColorMatrix_Identity();
  }

  static ColorMatrix_Brightness(tBrightness: any): number[] {
    if (tBrightness != 0) {
      tBrightness *= 255;
      const _loc2_ = new Array(1, 0, 0, 0, tBrightness, 0, 1, 0, 0, tBrightness, 0, 0, 1, 0, tBrightness, 0, 0, 0, 1, 0);
      return _loc2_;
    }
    return scidd.Draw.CColor.ColorMatrix_Identity();
  }

  static MatrixMulti(sMat: any, dMat: any): number[] {
    const _loc6_: number[] = new Array();
    let _loc5_ = 0; // [BC] generated/disasm/scidd.Draw.CColor.txt @573526
    let _loc2_ = 0; // [BC] generated/disasm/scidd.Draw.CColor.txt @573543
    while (_loc5_ < 4) { // [BC] generated/disasm/scidd.Draw.CColor.txt @573548
      for (let _loc1_ = 0; _loc1_ < 5; _loc1_++) { // [BC] generated/disasm/scidd.Draw.CColor.txt @573577
        _loc6_[_loc2_ + _loc1_] = sMat[_loc2_] * dMat[_loc1_] + sMat[_loc2_ + 1] * dMat[_loc1_ + 5] + sMat[_loc2_ + 2] * dMat[_loc1_ + 10] + sMat[_loc2_ + 3] * dMat[_loc1_ + 15] + (_loc1_ != 4 ? 0 : sMat[_loc2_ + 4]); // [BC] generated/disasm/scidd.Draw.CColor.txt @573764
      }
      _loc5_++; // [BC] generated/disasm/scidd.Draw.CColor.txt @573794
      _loc2_ += 5; // [BC] generated/disasm/scidd.Draw.CColor.txt @573806
    }
    return _loc6_;
  }

  // addProperty("mAlpha100", __get__mAlpha100, function () {}) — getter with an empty setter.
  get mAlpha100(): number { return this.__get__mAlpha100(); }
  set mAlpha100(_v: number) { /* AS2 empty setter */ }
}
proto(CColor, { _CLASSID_: 'scidd.Draw.CColor' });

registerGameClass('scidd.Draw.CColor', CColor);
