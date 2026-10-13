// Port of assets/projects/boxhead4/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_OmniDirectional.as
// Muzzle flashes: the symbol's `_Top` child is squashed (y/2 + skew) and `_Front` sheared for each of tDirections
// angles, each pose rasterised once (bmList[i]); Render picks the pose via CThing_Angle.mLookup256[n][angle256].
import { _root, flash, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_MovieClip } from './CDrawPrimitive_MovieClip.ts';

export class CDrawPrimitive_MovieClip_OmniDirectional extends CDrawPrimitive_MovieClip {
  static override mGlobalScale = 1;
  static override dPoint = new flash.geom.Point(0, 0);
  declare bmList: any[];

  constructor(mcLink?: any, tDirections?: any) {
    super();
    this.Buffer(_root.attachMovie(mcLink, '_TEMP' + _root.getNextHighestDepth(), _root.getNextHighestDepth()), tDirections);
  }

  Render(bmDraw: any, pos: any, tAngle: any, tAlpha: any): boolean {
    const _loc3_ = this.bmList[Thing.Math.CThing_Angle.mLookup256[this.bmList.length][(tAngle.__get__mAngle() * DrawPrimitive.CDrawPrimitive.mRadsTo256) & 255]];
    const _loc2_ = _loc3_.mDisp;
    if (tAlpha >= 100) {
      const _loc5_ = _loc3_.sBMD;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional.dPoint.x = pos.x + _loc2_.x;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional.dPoint.y = pos.y + _loc2_.y;
      bmDraw.copyPixels(_loc5_, _loc5_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional.dPoint, undefined, undefined, true);
    } else {
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.identity();
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.tx = pos.x + _loc2_.x;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.ty = pos.y + _loc2_.y;
      DrawPrimitive.CDrawPrimitive.mDrawColorTransform.alphaMultiplier = tAlpha / 100;
      bmDraw.draw(_loc3_.sBMD, DrawPrimitive.CDrawPrimitive.mDrawMatrix, DrawPrimitive.CDrawPrimitive.mDrawColorTransform);
    }
    return true;
  }

  Buffer(mc: any, tDirections: any): void {
    this.StartRender();
    this.bmList = new Array();
    for (let _loc2_ = 0; _loc2_ < 6.283185307179586; _loc2_ += 6.283185307179586 / tDirections) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional.txt @413380
      this.bmList.push(this._Buffer(mc, _loc2_)); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional.txt @413442
    }
    mc?.removeMovieClip();
    this.EndRender();
  }

  _Buffer(mc: any, tAngle: any): any {
    const _loc3_ = new flash.geom.Matrix();
    _loc3_.rotate(tAngle);
    const _loc2_ = _loc3_.transformPoint(new flash.geom.Point(1, 0));
    const _loc1_ = _loc3_.transformPoint(new flash.geom.Point(0, 1));
    _loc2_.y /= 2;
    _loc1_.y /= 2;
    const _loc4_ = new flash.geom.Matrix();
    const _loc5_ = _loc2_.x;
    const _loc6_ = _loc1_.y;
    _loc4_.b = _loc2_.y / _loc5_;
    _loc4_.c = _loc1_.x / _loc6_;
    let _loc7_ = new flash.geom.Matrix();
    _loc7_.scale(_loc5_, _loc6_);
    _loc7_.concat(_loc4_);
    mc._Top.transform.matrix = _loc7_.clone();
    const _loc8_ = tAngle + 1.5707963267948966;
    _loc7_ = new flash.geom.Matrix(Math.cos(_loc8_), Math.sin(_loc8_), 0, 1, 0, 0);
    _loc7_.scale(1, 0.5);
    mc._Front.transform.matrix = _loc7_;
    return DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc);
  }
}
proto(CDrawPrimitive_MovieClip_OmniDirectional, { _CLASSID_: 'CDrawPrimitive_MovieClip_OmniDirectional' });

registerGameClass('DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional', CDrawPrimitive_MovieClip_OmniDirectional);
