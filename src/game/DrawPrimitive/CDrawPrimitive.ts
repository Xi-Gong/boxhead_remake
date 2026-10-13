// Port of assets/projects/boxhead4/DrawPrimitive/CDrawPrimitive.as
// The .as text is a raw class prologue; structure from generated/disasm/DrawPrimitive.CDrawPrimitive.txt top-level
// script @169864..@171394.
import { _root, flash, proto } from '../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../packages.ts';

export class CDrawPrimitive {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mBackQuality: any;

  static mGlobalScale: number = 1;
  static mDrawMatrix = new flash.geom.Matrix();
  static mDrawColorTransform = new flash.geom.ColorTransform(1, 1, 1, 1, 0, 0, 0, 0);
  static dPoint = new flash.geom.Point(0, 0);
  static zPoint = new flash.geom.Point(0, 0);
  static PI360 = 6.283185307179586;
  static mRadsTo256 = 256 / CDrawPrimitive.PI360;
  static PI360x100 = 628.3185307179587;

  constructor() {
  }

  /** Inverts the alpha channel of `bm` in place (decal mask: opaque scenery -> transparent, empty floor -> opaque). */
  static InvertAlpha(bm: any): void {
    const _loc2_: number[] = new Array();
    for (let _loc1_ = 0; _loc1_ <= 255; _loc1_++) { // [BC] generated/disasm/DrawPrimitive.CDrawPrimitive.txt @169960
      _loc2_[_loc1_] = (255 - _loc1_) << 24; // [BC] generated/disasm/DrawPrimitive.CDrawPrimitive.txt @170007
    }
    bm.paletteMap(bm, bm.rectangle, DrawPrimitive.CDrawPrimitive.zPoint, null, null, null, _loc2_);
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  StartRender(tScale?: any): void {
    DrawPrimitive.CDrawPrimitive.mGlobalScale = tScale != undefined ? tScale : 1;
    this.mBackQuality = this.mBackQuality != undefined ? this.mBackQuality : _root._quality;
    _root._quality = 'BEST';
  }

  EndRender(): void {
    _root._quality = this.mBackQuality;
    delete this.mBackQuality;
  }

  /**
   * Rasterises `mc` (optionally at frame `frameIndex`, with `tFilters`) into a transparent BitmapData sized from
   * getBounds(mc) * mGlobalScale, inflated by 1 px; returns {sBMD, mDisp, XSI_Info} (mDisp = top-left offset).
   */
  static RenderMovieClipAsBitmapObject(mc: any, frameIndex?: any, tFilters?: any): any {
    if (frameIndex) {
      mc.gotoAndStop(frameIndex);
    }
    if (tFilters != undefined) {
      mc.filters = tFilters;
    }
    const _loc2_ = mc.getBounds(mc);
    const _loc1_ = new flash.geom.Rectangle(Math.floor(_loc2_.xMin), Math.floor(_loc2_.yMin), Math.ceil(_loc2_.xMax) - Math.floor(_loc2_.xMin), Math.ceil(_loc2_.yMax) - Math.floor(_loc2_.yMin));
    _loc1_.width *= DrawPrimitive.CDrawPrimitive.mGlobalScale;
    _loc1_.height *= DrawPrimitive.CDrawPrimitive.mGlobalScale;
    _loc1_.inflate(1, 1);
    const _loc6_ = new flash.display.BitmapData(Math.ceil(_loc1_.width), Math.ceil(_loc1_.height), true, 16711680);
    const _loc5_ = new flash.geom.Point(Math.floor(_loc1_.x * DrawPrimitive.CDrawPrimitive.mGlobalScale), Math.floor(_loc1_.y * DrawPrimitive.CDrawPrimitive.mGlobalScale));
    const _loc4_ = new flash.geom.Matrix();
    _loc4_.scale(DrawPrimitive.CDrawPrimitive.mGlobalScale, DrawPrimitive.CDrawPrimitive.mGlobalScale);
    _loc4_.translate(0 - _loc5_.x, 0 - _loc5_.y);
    _loc6_.draw(mc, _loc4_, undefined, 'normal', undefined, false);
    const _loc7_ = { sBMD: _loc6_, mDisp: _loc5_, XSI_Info: undefined };
    return _loc7_;
  }
}
proto(CDrawPrimitive, { _CLASSID_: 'CDrawPrimitive', _BASECLASSID_: 'CDrawPrimitive' });

registerGameClass('DrawPrimitive.CDrawPrimitive', CDrawPrimitive);
