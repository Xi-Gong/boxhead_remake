// Port of assets/projects/boxhead4/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Directional.as
// A symbol rasterised at tDirections rotations (bmList[direction][frame]); used for blood splats / scorch marks
// (3 rotations, pGlobalScale.y = 0.6) and stamped through the decal mask with QRender_Mask.
import { _root, flash, proto, random } from '../../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_MovieClip } from './CDrawPrimitive_MovieClip.ts';

export class CDrawPrimitive_MovieClip_Directional extends CDrawPrimitive_MovieClip {
  static override dPoint = new flash.geom.Point(0, 0);
  declare bmList: any[];
  declare mAnimationPosition: number;

  constructor(mcLink?: any, tDirections?: any) {
    super();
    if (mcLink) {
      const _loc4_ = _root.attachMovie(mcLink, '_TEMP' + _root.getNextHighestDepth(), _root.getNextHighestDepth());
      this.Buffer(_loc4_, tDirections);
    }
  }

  Clone(): CDrawPrimitive_MovieClip_Directional {
    const _loc2_ = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional();
    _loc2_.bmList = this.bmList;
    _loc2_.mAnimationPosition = 0;
    return _loc2_;
  }

  Animate(tSpeed: any): boolean {
    this.mAnimationPosition += tSpeed;
    if (this.mAnimationPosition >= this.__get__mFrameAmount()) {
      this.mAnimationPosition = this.__get__mFrameAmount() - 1;
      return true;
    }
    return false;
  }

  Animate_Cycle(tSpeed: any): void {
    this.mAnimationPosition = (this.mAnimationPosition + tSpeed) % this.__get__mFrameAmount();
  }

  Animate_Random(): void {
    this.mAnimationPosition = random(this.__get__mFrameAmount());
  }

  GotoToFrame(tFrameNumber: any): void {
    this.mAnimationPosition = (tFrameNumber + this.__get__mFrameAmount() * 10) % this.__get__mFrameAmount();
  }

  __get__mFrameAmount(): number {
    return this.bmList[0]?.length;
  }

  Render(bmDraw: any, pos: any, tAngle: any, tScale: any, tAlpha: any): boolean {
    const _loc4_ = this.bmList[tAngle.ToDirectionN(this.__get__mFrameAmount())][Math.floor(this.mAnimationPosition)];
    const _loc2_ = _loc4_.mDisp;
    if (tAlpha == 100 && tScale == 1) {
      const _loc6_ = _loc4_.sBMD;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.x = pos.x + _loc2_.x;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.y = pos.y + _loc2_.y;
      bmDraw.copyPixels(_loc6_, _loc6_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint, undefined, undefined, true);
    } else {
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.identity();
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.a = tScale;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.d = tScale;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.tx = pos.x + _loc2_.x * tScale;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.ty = pos.y + _loc2_.y * tScale;
      DrawPrimitive.CDrawPrimitive.mDrawColorTransform.alphaMultiplier = tAlpha / 100;
      bmDraw.draw(_loc4_.sBMD, DrawPrimitive.CDrawPrimitive.mDrawMatrix, DrawPrimitive.CDrawPrimitive.mDrawColorTransform);
    }
    return true;
  }

  QRender(bmDraw: any, pos: any, dir: any): void {
    const _loc3_ = this.bmList[dir][Math.floor(this.mAnimationPosition)];
    const _loc2_ = _loc3_.mDisp;
    const _loc4_ = _loc3_.sBMD;
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.x = pos.x + _loc2_.x;
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.y = pos.y + _loc2_.y;
    bmDraw.copyPixels(_loc4_, _loc4_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint, undefined, undefined, true);
  }

  QRender_Mask(bmDraw: any, pos: any, dir: any, tMask: any): void {
    const _loc3_ = this.bmList[dir][Math.floor(this.mAnimationPosition)];
    const _loc2_ = _loc3_.mDisp;
    const _loc4_ = _loc3_.sBMD;
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.x = pos.x + _loc2_.x;
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint.y = pos.y + _loc2_.y;
    // alphaPoint == destPoint: the mask bitmap is in floor coordinates.
    bmDraw.copyPixels(_loc4_, _loc4_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint, tMask, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.dPoint, true);
  }

  Buffer(mc: any, tDirections: any): void {
    this.bmList = new Array();
    if (tDirections != undefined) {
      this.StartRender();
      for (let _loc4_ = 0; _loc4_ < tDirections; _loc4_++) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292427
        this.bmList[_loc4_] = new Array(); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292471
        if (mc?._Contents) {
          mc._Contents._rotation = (_loc4_ * 360) / tDirections; // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292513
          for (let _loc3_ = 1; _loc3_ <= mc._Contents._totalframes; _loc3_++) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292522
            mc._Contents.gotoAndStop(_loc3_); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292572
            this.bmList[_loc4_][_loc3_ - 1] = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292629
          }
        } else {
          if (mc != undefined) {
            mc._rotation = (_loc4_ * 360) / tDirections; // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292672
          }
          for (let _loc3_ = 1; _loc3_ <= mc?._totalframes; _loc3_++) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292681
            this.bmList[_loc4_][_loc3_ - 1] = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc, _loc3_); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.txt @292762
          }
        }
      }
      this.EndRender();
    }
    mc?.removeMovieClip();
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x = 1;
    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 1;
  }

  // addProperty("mFrameAmount", __get__mFrameAmount, function () {}) — getter with an empty setter.
  get mFrameAmount(): number { return this.__get__mFrameAmount(); }
  set mFrameAmount(_v: number) { /* AS2 empty setter */ }
}
proto(CDrawPrimitive_MovieClip_Directional, { _CLASSID_: 'CDrawPrimitive_MovieClip_Directional' });

registerGameClass('DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional', CDrawPrimitive_MovieClip_Directional);
