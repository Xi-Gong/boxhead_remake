// Port of assets/projects/boxhead4/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip.as
// Library symbols are rasterised ONCE (getBounds -> BitmapData -> draw(mc, matrix)), inflated by mInflateBMD = 8 px
// and scaled by pGlobalScale (x, y), then stamped with copyPixels/draw at render time.
import { flash, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive } from '../CDrawPrimitive.ts';

export class CDrawPrimitive_MovieClip extends CDrawPrimitive {
  static mInflateBMD = 8;
  static pGlobalScale = new flash.geom.Point(1, 1);

  constructor() {
    super();
  }

  static override RenderMovieClipAsBitmapObject(mc: any, frameIndex?: any, tFilters?: any): any {
    const MC = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip;
    if (frameIndex) {
      mc.gotoAndStop(frameIndex);
    }
    if (tFilters != undefined) {
      mc.filters = tFilters;
    }
    const _loc2_ = mc.getBounds(mc);
    const _loc1_ = new flash.geom.Rectangle(Math.floor(_loc2_.xMin), Math.floor(_loc2_.yMin), Math.ceil(_loc2_.xMax) - Math.floor(_loc2_.xMin), Math.ceil(_loc2_.yMax) - Math.floor(_loc2_.yMin));
    _loc1_.width *= MC.pGlobalScale.x;
    _loc1_.height *= MC.pGlobalScale.y;
    _loc1_.inflate(MC.mInflateBMD, MC.mInflateBMD);
    const _loc6_ = new flash.display.BitmapData(Math.ceil(_loc1_.width), Math.ceil(_loc1_.height), true, 16711680);
    const _loc5_ = new flash.geom.Point(Math.floor(_loc1_.x * MC.pGlobalScale.x), Math.floor(_loc1_.y * MC.pGlobalScale.y));
    const _loc4_ = new flash.geom.Matrix();
    _loc4_.scale(MC.pGlobalScale.x, MC.pGlobalScale.y);
    _loc4_.translate(0 - _loc5_.x, 0 - _loc5_.y);
    _loc6_.draw(mc, _loc4_, undefined, 'normal', undefined, false);
    const _loc7_ = { sBMD: _loc6_, mDisp: _loc5_, XSI_Info: undefined };
    return _loc7_;
  }
}
proto(CDrawPrimitive_MovieClip, { _CLASSID_: 'CDrawPrimitive_MovieClip', _BASECLASSID_: 'CDrawPrimitive_MovieClip' });

registerGameClass('DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip', CDrawPrimitive_MovieClip);
