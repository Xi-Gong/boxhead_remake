// Port of assets/projects/boxhead4/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Static.as
import { _root, flash, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_MovieClip } from './CDrawPrimitive_MovieClip.ts';

export class CDrawPrimitive_MovieClip_Static extends CDrawPrimitive_MovieClip {
  static override dPoint = new flash.geom.Point(0, 0);
  declare bmObject: any;

  constructor(mcLink?: any) {
    super();
    this.Buffer(_root.attachMovie(mcLink, '_TEMP' + _root.getNextHighestDepth(), _root.getNextHighestDepth()));
  }

  Render(bmDraw: any, pos: any, tAlpha: any): boolean {
    const _loc3_ = this.bmObject;
    const _loc2_ = _loc3_.mDisp;
    if (tAlpha >= 100) {
      const _loc5_ = _loc3_.sBMD;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static.dPoint.x = pos.x + _loc2_.x;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static.dPoint.y = pos.y + _loc2_.y;
      bmDraw.copyPixels(_loc5_, _loc5_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static.dPoint, undefined, undefined, true);
    } else {
      // (no mDrawMatrix.identity() here in the original: scale/rotation left over from a previous user stay)
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.tx = pos.x + _loc2_.x;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.ty = pos.y + _loc2_.y;
      DrawPrimitive.CDrawPrimitive.mDrawColorTransform.alphaMultiplier = tAlpha / 100;
      bmDraw.draw(_loc3_.sBMD, DrawPrimitive.CDrawPrimitive.mDrawMatrix, DrawPrimitive.CDrawPrimitive.mDrawColorTransform);
    }
    return true;
  }

  Buffer(mc: any): void {
    this.StartRender();
    this.bmObject = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc);
    mc?.removeMovieClip();
    this.EndRender();
  }
}
proto(CDrawPrimitive_MovieClip_Static, { _CLASSID_: 'CDrawPrimitive_MovieClip_Static' });

registerGameClass('DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static', CDrawPrimitive_MovieClip_Static);
