// Port of assets/projects/boxhead4/DrawPrimitive/XSI/CDrawPrimitive_XSI_Animation.as
// One loaded character animation (mAnimationObject = {mDirections[d].mFrames[f] = {sBMD, mDisp, XSI_Info}}) plus the
// per-creature playback state (mCurrentFrameID, mCurrentDirection, mCurrentFrame). RenderToBitmap is the character
// rasteriser used by CDrawPrimitive_XSI_DI: getBounds -> BitmapData (inflate(2,2) quirk) -> draw -> GlowFilter outline.
import { _root, flash, forIn, proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_XSI } from './CDrawPrimitive_XSI.ts';

export class CDrawPrimitive_XSI_Animation extends CDrawPrimitive_XSI {
  static mReturnFlag_EndOfAnimation = 1;
  static mReturnFlag_NewFrame = 2;

  declare mCollection: any;
  declare mAnimationObject: any;
  declare mFrameCount: number;
  declare mCurrentFrameID: number;
  declare mAnimEnd: boolean;
  declare mCurrentDirection: any;
  declare mCurrentFrame: any;
  declare mPreUpdate: boolean;
  declare mXSI_Info: any;
  declare mID: any;

  constructor(..._args: any[]) {
    super();
  }

  static CreateAnimationObject(tXSI_Collection: any): CDrawPrimitive_XSI_Animation {
    const _loc1_ = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation();
    _loc1_.mCollection = tXSI_Collection;
    return _loc1_;
  }

  SetAnimation(animID: any, tFrameID?: any): void {
    if (this.mAnimationObject != this.mCollection.mItems[animID].mAnimationObject) {
      this.mAnimationObject = this.mCollection.mItems[animID].mAnimationObject;
      this.mFrameCount = this.mAnimationObject.mFrameCount;
      this.mCurrentFrameID = tFrameID != undefined ? tFrameID : 0;
      this.Animate(0);
    }
  }

  SetAnimation_FORCED(animID: any, tFrameID?: any): void {
    this.mAnimationObject = this.mCollection.mItems[animID].mAnimationObject;
    this.mFrameCount = this.mAnimationObject.mFrameCount;
    this.mCurrentFrameID = tFrameID != undefined ? tFrameID : 0;
    this.Animate(0);
  }

  Animate(tSpeed: any): boolean {
    if (this.mAnimationObject == undefined) {
      return false;
    }
    const _loc3_ = this.mCurrentFrameID;
    const _loc2_ = this.mCurrentFrameID + tSpeed;
    this.mCurrentFrameID = _loc2_ % this.mFrameCount;
    this.mAnimEnd = _loc2_ >= this.mFrameCount && _loc2_ > _loc3_;
    return this.mAnimEnd;
  }

  QAnimate(tSpeed: any): void {
    this.mCurrentFrameID = (this.mCurrentFrameID + tSpeed) % this.mFrameCount;
  }

  Animate_RetObj(tSpeed: any): any {
    if (this.mAnimationObject == undefined) {
      return false;
    }
    const _loc4_ = this.mCurrentFrameID;
    const _loc2_ = this.mCurrentFrameID + tSpeed;
    this.mCurrentFrameID = _loc2_ % this.mFrameCount;
    const _loc3_: any = { mAnimEnd: _loc2_ >= this.mFrameCount && _loc2_ > _loc4_ };
    _loc3_.mNewFrame = (_loc4_ & 16777215) != (_loc2_ & 16777215);
    _loc3_.mFrameIndex = this.mCurrentFrameID & 16777215;
    return _loc3_;
  }

  // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @261589..@261636. AS2 null-safety: a
  // fresh animation object (CreateAnimationObject, e.g. CThing_Creature_Player.State_Respawn) has no
  // mAnimationObject until SetAnimation; the player's weapon Update can call GetWeaponPosition -> Update_CurrentFrame
  // before that (latched FIRE on the respawn tick). AS2 reads undefined (bullet from the player centre); JS threw and
  // aborted State_Respawn half-way (life / weapons / Process never restored).
  Update_CurrentFrame(tAngle: any): void {
    this.mCurrentDirection = this.mAnimationObject?.mDirections[this.mAnimationObject.mLookup256[tAngle.__get__mAngle256()]];
    this.mCurrentFrame = this.mCurrentDirection?.mFrames[this.mCurrentFrameID & 16777215];
    this.mPreUpdate = true;
  }

  Render(pos: any, tAngle: any, tAlpha: any): boolean {
    if (this.mPreUpdate == true) {
      this.mPreUpdate = false;
    } else {
      this.mCurrentDirection = this.mAnimationObject?.mDirections[this.mAnimationObject.mLookup256[tAngle.__get__mAngle256() & 255]];
      this.mCurrentFrame = this.mCurrentDirection?.mFrames[this.mCurrentFrameID & 16777215];
    }
    this._Render(this.mCurrentFrame, pos, tAlpha);
    return true;
  }

  // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @261888..@262288. oBMD is undefined when
  // Update_CurrentFrame ran without an animation (see above) and Render keeps that frame (mPreUpdate): AS2 reads
  // undefined members and copyPixels/draw of an undefined source do nothing.
  _Render(oBMD: any, pos: any, tAlpha: any): void {
    const _loc1_ = oBMD?.mDisp;
    const _loc2_ = oBMD?.sBMD;
    if (tAlpha >= 100) {
      DrawPrimitive.CDrawPrimitive.dPoint.x = pos.x + _loc1_?.x;
      DrawPrimitive.CDrawPrimitive.dPoint.y = pos.y + _loc1_?.y;
      if (_loc2_ != undefined) DrawPrimitive.XSI.CDrawPrimitive_XSI.bmDraw.copyPixels(_loc2_, _loc2_.rectangle, DrawPrimitive.CDrawPrimitive.dPoint, undefined, undefined, true);
    } else {
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.identity();
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.tx = pos.x + _loc1_?.x;
      DrawPrimitive.CDrawPrimitive.mDrawMatrix.ty = pos.y + _loc1_?.y;
      DrawPrimitive.CDrawPrimitive.mDrawColorTransform.alphaMultiplier = tAlpha / 100;
      if (_loc2_ != undefined) DrawPrimitive.XSI.CDrawPrimitive_XSI.bmDraw.draw(_loc2_, DrawPrimitive.CDrawPrimitive.mDrawMatrix, DrawPrimitive.CDrawPrimitive.mDrawColorTransform);
    }
  }

  __get__XSI_Info(): any {
    return this.mCurrentFrame?.XSI_Info; // [BC] @262322 (undefined frame: see Update_CurrentFrame)
  }

  static Load(linkID: any, tRetrieveID: any): CDrawPrimitive_XSI_Animation {
    const _loc1_ = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation(tRetrieveID);
    _loc1_.mID = tRetrieveID;
    if (!DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.LoadAnimation(_loc1_, linkID, tRetrieveID)) {
      // (empty in the shipped bytecode: debug trace stripped)
    }
    return _loc1_;
  }

  /** Unused legacy loader (pre-rendered XSI_Rotation<i> timeline clips); kept for completeness. */
  _Load(linkID: any): void {
    const pMC: any = _root;
    const d = pMC.getNextHighestDepth();
    const mc: any = pMC.attachMovie(linkID, linkID + d, d, { _visible: false });
    mc?.stop();
    if (mc == undefined) {
      return;
    }
    mc.parentClass = this;
    mc.onEnterFrame = function (this: any): void {
      this.parentClass.Propagate_XSI_Info(this.XSI_Info);
      this.removeMovieClip();
    };
    this.Init_AnimationObject(mc._totalframes);
    for (let i = 0; i < this.mAnimationObject.mDirections.length; i++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @262737
      mc.gotoAndStop(i + 1);
      const mcAnim = mc['XSI_Rotation' + i]; // AS2: eval("mc.XSI_Rotation" + i)
      this.mAnimationObject.mDirections[i] = { mFrames: new Array(mcAnim?._totalframes) };
      const oDirection = this.mAnimationObject.mDirections[i];
      this.mAnimationObject.mFrameCount = oDirection.mFrames.length;
      for (let f = 0; f < oDirection.mFrames.length; f++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @262955
        oDirection.mFrames[f] = this.RenderToBitmap(mcAnim, f + 1);
      }
    }
  }

  Init_AnimationObject(nDirections: any): any {
    if (!Thing.Math.CThing_Angle.mLookup256) {
      Thing.Math.CThing_Angle.Create_LookupTables();
    }
    this.mXSI_Info = new Object();
    this.mAnimationObject = { XSI_Info: this.mXSI_Info };
    this.mAnimationObject.mDirections = new Array(nDirections);
    this.mAnimationObject.mDirectionAmount = nDirections;
    this.mAnimationObject.mLookup256 = Thing.Math.CThing_Angle.mLookup256[nDirections];
    this.mAnimationObject.divDir = 1 / (DrawPrimitive.CDrawPrimitive.PI360 / nDirections);
    this.mAnimationObject.roundDir = DrawPrimitive.CDrawPrimitive.PI360 / nDirections / 2;
    return this.mAnimationObject;
  }

  /** Only reached from the unused _Load path. */
  Propagate_XSI_Info(XSI_Info: any): void {
    this.mAnimationObject.XSI_Info.Tilt = (XSI_Info.Tilt * 3.141592653589793) / 180;
    this.mAnimationObject.XSI_Info.Light = XSI_Info.Light;
    this.mAnimationObject.XSI_Info.PFactor = 0 - Math.sin(this.mAnimationObject.XSI_Info.Tilt);
    for (let _loc5_ = 0; _loc5_ < this.mAnimationObject.mDirections.length; _loc5_++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @263567
      const _loc4_ = this.mAnimationObject.mDirections[_loc5_]; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @263621
      for (let _loc3_ = 0; _loc3_ < _loc4_.mFrames.length; _loc3_++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @263638
        _loc4_.mFrames[_loc3_].XSI_Info = XSI_Info.Positions[_loc5_][_loc3_]; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.txt @263702
        _loc4_.mFrames[_loc3_].XSI_Info.Tilt = this.mAnimationObject.XSI_Info.Tilt;
        _loc4_.mFrames[_loc3_].XSI_Info.PFactor = this.mAnimationObject.XSI_Info.PFactor;
        for (const _loc6_ of forIn(_loc4_.mFrames[_loc3_].XSI_Info)) {
          const _loc2_ = _loc4_.mFrames[_loc3_].XSI_Info[_loc6_];
          const vPos = new Thing.Math.CThing_Position(_loc2_?.vPosition?.mX, _loc2_?.vPosition?.mY, _loc2_?.vPosition?.mZ).ScaleN(DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale);
          // AS2: member writes on a primitive (the Tilt/PFactor numbers are enumerated too) are silently ignored.
          if (typeof _loc2_ === 'object' && _loc2_ !== null) _loc2_.vPosition = vPos;
          const nPos = new Thing.Math.CThing_Position(_loc2_?.vPosition?.mX, this.mAnimationObject.XSI_Info.PFactor * _loc2_?.vPosition?.mY, 0 - _loc2_?.vPosition?.mZ).ScaleN(1 / World.Map.CMap_Cell.mCellSize);
          if (typeof _loc2_ === 'object' && _loc2_ !== null) _loc2_.nPosition = nPos;
        }
      }
    }
    Thing.Math.CThing_Position.mPFactor = this.mAnimationObject.XSI_Info.PFactor;
  }

  /**
   * Rasterise `mc` (the XSI_DI container) at mGlobalScale: bounds floor/ceil -> scale -> inflate(2, 2) (quirk: the
   * inflation is in already-scaled units while mDisp scales the inflated x/y again) -> draw -> GlowFilter(0, 1, 4, 4, 2, 1).
   */
  RenderToBitmap(mc: any, frameIndex?: any, tBlendMode?: any): any {
    const _loc2_ = DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale;
    if (frameIndex != undefined && frameIndex != 1) {
      mc.gotoAndStop(frameIndex);
    }
    const _loc3_ = mc.getBounds(mc);
    const _loc1_ = new flash.geom.Rectangle(Math.floor(_loc3_.xMin), Math.floor(_loc3_.yMin), Math.ceil(_loc3_.xMax) - Math.floor(_loc3_.xMin), Math.ceil(_loc3_.yMax) - Math.floor(_loc3_.yMin));
    _loc1_.width *= _loc2_;
    _loc1_.height *= _loc2_;
    _loc1_.inflate(2, 2);
    const _loc4_ = new flash.display.BitmapData(Math.ceil(_loc1_.width), Math.ceil(_loc1_.height), true, 16711680);
    const _loc6_ = new flash.geom.Point(Math.floor(_loc1_.x * _loc2_), Math.floor(_loc1_.y * _loc2_));
    const _loc5_ = new flash.geom.Matrix();
    _loc5_.scale(_loc2_, _loc2_);
    _loc5_.translate(0 - _loc6_.x, 0 - _loc6_.y);
    _loc4_.draw(mc, _loc5_);
    _loc4_.applyFilter(_loc4_, _loc4_.rectangle, new flash.geom.Point(0, 0), new flash.filters.GlowFilter(0, 1, 4, 4, 2, 1));
    const _loc9_ = { sBMD: _loc4_, mDisp: _loc6_, XSI_Info: undefined };
    return _loc9_;
  }

  // addProperty("XSI_Info", __get__XSI_Info, function () {}) — getter with an empty setter.
  get XSI_Info(): any { return this.__get__XSI_Info(); }
  set XSI_Info(_v: any) { /* AS2 empty setter */ }
}
proto(CDrawPrimitive_XSI_Animation, { _CLASSID_: 'CDrawPrimitive_XSI_Animation' });

registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation', CDrawPrimitive_XSI_Animation);
