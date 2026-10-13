// Port of assets/projects/boxhead4/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Animation.as
// Every frame of a library symbol (or of its `_Contents` child) rasterised into bmList[frame].
import { _root, flash, proto, random } from '../../../engine/runtime.ts';
import { DrawPrimitive, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_MovieClip } from './CDrawPrimitive_MovieClip.ts';

export class CDrawPrimitive_MovieClip_Animation extends CDrawPrimitive_MovieClip {
  static override dPoint = new flash.geom.Point(0, 0);
  declare bmList: any[];
  declare bmObject: any;
  declare mAnimationPosition: number;

  constructor(mcLink?: any) {
    super();
    if (mcLink) {
      this.Buffer(_root.attachMovie(mcLink, '_TEMP' + _root.getNextHighestDepth(), _root.getNextHighestDepth()));
    }
  }

  Clone(): CDrawPrimitive_MovieClip_Animation {
    const _loc2_ = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation();
    _loc2_.bmList = this.bmList;
    _loc2_.bmObject = this.bmList[0];
    _loc2_.mAnimationPosition = 0;
    return _loc2_;
  }

  Animate(tSpeed: any): boolean {
    this.mAnimationPosition += tSpeed;
    if (this.mAnimationPosition >= this.bmList.length) {
      this.bmObject = this.bmList[this.bmList.length - 1];
      this.mAnimationPosition = this.bmList.length;
      return true;
    }
    this.bmObject = this.bmList[Math.floor(this.mAnimationPosition)];
    return false;
  }

  Animate_Cycle(tSpeed: any): void {
    this.mAnimationPosition = (this.mAnimationPosition + tSpeed) % this.bmList.length;
    this.bmObject = this.bmList[Math.floor(this.mAnimationPosition)];
  }

  Animate_Random(): void {
    this.mAnimationPosition = random(this.bmList.length);
    this.bmObject = this.bmList[Math.floor(this.mAnimationPosition)];
  }

  GotoToFrame(tFrameNumber: any): void {
    this.mAnimationPosition = (tFrameNumber + this.__get__mFrameAmount() * 10) % this.__get__mFrameAmount();
    this.bmObject = this.bmList[Math.floor(this.mAnimationPosition)];
  }

  __get__mFrameAmount(): number {
    return this.bmList.length;
  }

  Render(bmDraw: any, pos: any, tScale: any, tAlpha: any): boolean {
    const _loc4_ = this.bmObject;
    const _loc2_ = _loc4_.mDisp;
    if (tAlpha == 100 && tScale == 1) {
      const _loc6_ = _loc4_.sBMD;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.dPoint.x = pos.x + _loc2_.x;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.dPoint.y = pos.y + _loc2_.y;
      bmDraw.copyPixels(_loc6_, _loc6_.rectangle, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.dPoint, undefined, undefined, true);
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

  Buffer(mc: any): void {
    this.StartRender();
    this.bmList = new Array();
    if (mc?._Contents) {
      for (let _loc2_ = 1; _loc2_ <= mc._Contents._totalframes; _loc2_++) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.txt @299008
        mc._Contents.gotoAndStop(_loc2_); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.txt @299058
        this.bmList[_loc2_ - 1] = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc, _loc2_); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.txt @299111
      }
    } else {
      for (let _loc2_ = 1; _loc2_ <= mc?._totalframes; _loc2_++) { // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.txt @299141
        this.bmList[_loc2_ - 1] = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.RenderMovieClipAsBitmapObject(mc, _loc2_); // [BC] generated/disasm/DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation.txt @299216
      }
    }
    mc?.removeMovieClip();
    this.EndRender();
  }

  // addProperty("mFrameAmount", __get__mFrameAmount, function () {}) — getter with an empty setter.
  get mFrameAmount(): number { return this.__get__mFrameAmount(); }
  set mFrameAmount(_v: number) { /* AS2 empty setter */ }
}
proto(CDrawPrimitive_MovieClip_Animation, { _CLASSID_: 'CDrawPrimitive_MovieClip_Animation' });

registerGameClass('DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation', CDrawPrimitive_MovieClip_Animation);
