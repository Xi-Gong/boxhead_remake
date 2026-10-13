// Port of projects/boxhead4/DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.as
// The character renderer: compiles `_global.mXSI_Data.mItems` (see xsiData.ts) into animation sets, queues frames
// (LoadAnimation -> AddToRenderStack) and renders them later with the MovieClip drawing API into an invisible
// container (mcShadow + one plane clip per model), which CDrawPrimitive_XSI_Animation.RenderToBitmap rasterises.
// Statement order follows generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt (@241979..@249776).
import { _root, flash, forIn, getTimer, proto, toNumber } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CDrawPrimitive_XSI } from './CDrawPrimitive_XSI.ts';
import { xsiForIn } from './xsiData.ts';

export class CDrawPrimitive_XSI_DI extends CDrawPrimitive_XSI {
  static mAnimationSets: any = new Object();
  static mGroups: any = new Object();
  static mShader_Contrast = 0.5;
  static mContrast = 0.5;
  static mQuiet = true;
  static mRenderCount_Frames: number;
  static mRenderStack: any[];

  declare mRenderFlag_Shadow: number;
  declare mRenderFlag_Edge: number;
  declare mRenderFlag_ProfileEdge: number;
  declare mRenderFlag_ModelEdge: number;
  declare mRenderFlag_Texture: number;
  declare mRenderFlag_Shader: number;
  declare mRenderFlag_All: number;
  declare mRenderFlags: number;

  declare mMasterMaterials: any;
  declare mModels: any;
  declare mTotalFrames: number;
  declare mTotalPixels: number;
  declare mVertex_Count: number;
  declare mcContainer: any;
  declare mcShadow: any;
  declare mcGraphic: any;
  declare mcPlanes: any[];
  declare mStyleSheet: any;
  declare mMaterials: any;

  constructor(tXSI_List: any) {
    super();
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI = this;
    this.mMasterMaterials = new Object();
    this.mModels = new Object();
    this.mTotalFrames = 0;
    this.mTotalPixels = 0;
    this.mVertex_Count = 0;
    DI.mRenderCount_Frames = 0;
    DI.mRenderStack = new Array();
    const _loc8_ = getTimer(); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @242339 (only used by stripped traces)
    void _loc8_;
    for (const _loc7_ of forIn(tXSI_List)) {
      const _loc5_ = tXSI_List[_loc7_];
      const _loc4_: any = new Object();
      _loc4_.mGroupID = _loc5_.mGroupID;
      _loc4_.mAnimID = _loc5_.mAnimID;
      _loc4_.mID = _loc5_.mGroupID + '_' + _loc5_.mAnimID;
      _loc4_.mDimensions = 0;
      _loc4_.pClass = this;
      this.Register_Materials(_loc5_.mXSI.mMaterials);
      _loc4_.mDirections = this.CompileXSIData(_loc5_.mXSI, _loc4_.mAnimID, _loc5_.mRenderPartner);
      _loc4_.mTilt = (_loc5_.mXSI.mXSIInfo.mTilt * 3.141592653589793) / 180;
      _loc4_.mLight = _loc5_.mXSI.mXSIInfo.mLight;
      _loc4_.mFrameSequence = _loc5_.mFrameSquence;
      if (!DI.mGroups[_loc4_.mGroupID]) {
        DI.mGroups[_loc4_.mGroupID] = new Object();
      }
      DI.mGroups[_loc4_.mGroupID][_loc4_.mAnimID] = _loc4_;
      DI.mAnimationSets[_loc4_.mID] = _loc4_;
      if (!DI.mQuiet) {
        // (empty in the shipped bytecode: trace stripped)
      }
    }
    if (!DI.mQuiet) {
      // (empty in the shipped bytecode: trace stripped)
    }
    this.LoadMaterials(this.mMasterMaterials);
    if (!DI.mQuiet) {
      // (empty)
    }
    if (!DI.mQuiet) {
      // (empty)
    }
    this.mcContainer = _root.createEmptyMovieClip('CDrawPrimitive_XSI_DI_mcContainer', _root.getNextHighestDepth());
    this.mcShadow = this.mcContainer.createEmptyMovieClip('CDrawPrimitive_XSI_DI_Shadow', this.mcContainer.getNextHighestDepth());
    this.mcGraphic = this.mcContainer.createEmptyMovieClip('CDrawPrimitive_XSI_DI_Graphics', this.mcContainer.getNextHighestDepth());
    this.mcPlanes = new Array();
    this.mcShadow.filters = [new flash.filters.DropShadowFilter(0, 0, 0, 1, 4, 4, 0.25, 1, false, false, true)];
    this.mcContainer._visible = false;
  }

  CompileXSIData(tXSIData: any, animID: any, tPartner: any): any {
    const _loc4_ = tXSIData.mRotations;
    for (const _loc8_ of forIn(_loc4_)) {
      const _loc3_ = _loc4_[_loc8_];
      for (const _loc7_ of forIn(_loc3_)) {
        const _loc2_ = _loc3_[_loc7_];
        _loc2_.mDirection = toNumber(_loc8_);
        _loc2_.mFrameIndex = toNumber(_loc7_);
        _loc2_.mAnimID = animID;
        _loc2_.rPartner = tPartner;
        this.mTotalFrames++;
      }
    }
    return tXSIData.mRotations;
  }

  GetStyleSheet(tAnimationSetID: any): any {
    const _loc3_: any = new Object();
    let _loc10_: any = undefined;
    _loc10_ = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets[tAnimationSetID];
    if (_loc10_) {
      _loc3_.mDirectionCount = _loc10_.mDirections.length;
      _loc3_.mFrameCount = _loc10_.mDirections[0].length;
      _loc3_.mModels = new Object();
      const _loc6_ = _loc10_.mDirections[0][0].Models;
      for (const _loc9_ of forIn(_loc6_)) {
        const _loc8_ = _loc6_[_loc9_];
        void _loc8_;
        _loc3_.mModels[_loc9_] = new Object();
        _loc3_.mModels[_loc9_].mGroup_Remap = undefined;
        _loc3_.mModels[_loc9_].mVisible = true;
      }
      const _loc5_ = this.mMasterMaterials;
      _loc3_.mMaterials = new Object();
      for (const _loc9_ of forIn(_loc5_)) {
        const _loc2_ = _loc5_[_loc9_];
        const _loc4_: any = new Object();
        for (const _loc7_ of forIn(_loc2_)) {
          _loc4_[_loc7_] = _loc2_[_loc7_];
        }
        _loc3_.mMaterials[_loc9_] = _loc4_;
      }
      _loc3_.mScale = 0.35;
      return _loc3_;
    }
    if (!DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mQuiet) {
      // (empty in the shipped bytecode: trace stripped)
    }
    return undefined;
  }

  ApplyStyleSheet(tStyleSheet?: any): void {
    if (this.mStyleSheet == tStyleSheet) {
      return;
    }
    this.mStyleSheet = tStyleSheet;
    this.LoadMaterials(!this.mStyleSheet ? this.mMasterMaterials : this.mStyleSheet.mMaterials);
  }

  static LoadAnimation(oXSI_Animation: any, linkID: any, tRetrieveID?: any): boolean {
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    const _loc13_ = getTimer(); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244258 (only used by stripped traces)
    void _loc13_;
    const _loc4_ = DI.mAnimationSets[linkID];
    if (!_loc4_) {
      return false;
    }
    const _loc8_ = _loc4_.pClass;
    const _loc6_ = oXSI_Animation.Init_AnimationObject(_loc4_.mDirections.length);
    _loc6_.XSI_Info.Tilt = _loc4_.mTilt;
    _loc6_.XSI_Info.Light = _loc4_.mLight;
    _loc6_.XSI_Info.PFactor = 0 - Math.sin(_loc4_.mTilt);
    Thing.Math.CThing_Position.mPFactor = _loc6_.XSI_Info.PFactor;
    for (let _loc5_ = 0; _loc5_ < _loc6_.mDirections.length; _loc5_++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244492
      const _loc3_ = _loc4_.mDirections[_loc5_]; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244534
      const _loc11_ = (_loc6_.mDirections[_loc5_] = { mFrames: new Array(_loc3_.length) }); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244589
      void _loc11_;
      const _loc7_ = !_loc4_.mFrameSequence ? _loc3_.length : _loc4_.mFrameSequence.length; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244634
      _loc6_.mFrameCount = _loc7_;
      for (let _loc1_ = 0; _loc1_ < _loc7_; _loc1_++) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244661
        let _loc2_: any = undefined;
        if (_loc4_.mFrameSequence && _loc4_.mFrameSequence[_loc1_] != _loc1_) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244727
          _loc2_ = _loc6_.mDirections[_loc5_].mFrames[_loc4_.mFrameSequence[_loc1_]]; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244767
        }
        if (!_loc2_) {
          _loc2_ = DI.AddToRenderStack(_loc8_, _loc3_[_loc1_], oXSI_Animation); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244825
          _loc2_.XSI_Info = new Object();
          DI.FillXSIInfo(_loc3_[_loc1_].Models, _loc2_, 'Hand_Right'); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244897
          DI.FillXSIInfo(_loc3_[_loc1_].Models, _loc2_, 'Hand_Left'); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244945
          DI.FillXSIInfo(_loc3_[_loc1_].Models, _loc2_, 'GunPosition_Right'); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @244993
        }
        _loc6_.mDirections[_loc5_].mFrames[_loc1_] = _loc2_; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @245021
        // sBMD is still undefined for a frame waiting in the render stack: NaN in AS2 as well.
        _loc8_.mTotalPixels = _loc8_.mTotalPixels + _loc2_.sBMD?.width * _loc2_.sBMD?.height; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @245064
      }
    }
    if (!DI.mQuiet) {
      // (empty)
    }
    if (!DI.mQuiet) {
      // (empty)
    }
    if (!DI.mQuiet) {
      // (empty)
    }
    return true;
  }

  /**
   * Copies Models[mprop].XSIInfo.vPosition into oFrame.XSI_Info["XSI_Model_" + mprop] (scaled by mGlobalScale; nPosition
   * in cells). When the anchor model is Empty/absent the AS2 code reads undefined members and stores NaN positions.
   */
  static FillXSIInfo(tModels: any, oFrame: any, mprop: any): void {
    const _loc2_ = tModels[mprop]?.XSIInfo;
    const _loc1_: any = (oFrame.XSI_Info['XSI_Model_' + mprop] = new Object());
    _loc1_.vPosition = new Thing.Math.CThing_Position(_loc2_?.vPosition?.mX, _loc2_?.vPosition?.mY, _loc2_?.vPosition?.mZ).ScaleN(DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale);
    _loc1_.nPosition = new Thing.Math.CThing_Position(_loc1_.vPosition.mX, Thing.Math.CThing_Position.mPFactor * _loc1_.vPosition.mY, 0 - _loc1_.vPosition.mZ).ScaleN(1 / World.Map.CMap_Cell.mCellSize);
  }

  static AddToRenderStack(asParent: any, oFrame: any, oXSI_Animation: any): any {
    const _loc7_ = { asParent: asParent, oFrame: oFrame, oXSI_Animation: oXSI_Animation, mStyleSheet: asParent.mStyleSheet };
    const _loc1_ = { sBMD: undefined, mDisp: undefined, XSI_Info: undefined, renderInfo: _loc7_ };
    DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mRenderStack.push(_loc1_);
    return _loc1_;
  }

  /** Renders queued frames (LIFO) until the stack is empty or getTimer() - timeStamp >= timeAmount. */
  static RenderStack_Process(timeStamp: any, timeAmount: any): boolean {
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.StartRender();
    let _loc4_ = 0; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @245803
    while (DI.mRenderStack.length) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @245808
      const _loc2_ = DI.mRenderStack.pop();
      const _loc1_ = _loc2_.renderInfo;
      DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_APPLY(_loc1_.mStyleSheet);
      _loc1_.asParent.Render(_loc1_.oFrame);
      const _loc3_ = _loc1_.asParent.RenderToBitmap(_loc1_.oXSI_Animation);
      _loc2_.sBMD = _loc3_.sBMD;
      _loc2_.mDisp = _loc3_.mDisp;
      _loc4_ = _loc4_ + 1; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @246031
      if (getTimer() - timeStamp >= timeAmount) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @246051
        DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.EndRender();
        return true;
      }
    }
    DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.EndRender();
    return false;
  }

  static RenderStack_Finished(): boolean {
    return DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mRenderStack.length == 0;
  }

  RenderToBitmap(oXSI_Animation: any): any {
    const _loc2_ = oXSI_Animation.RenderToBitmap(this.mcContainer);
    return _loc2_;
  }

  CombineRenderObjects(oBMD1: any, oBMD2: any): void {
  }

  Register_Materials(XSIMaterials: any): void {
    for (const _loc3_ of forIn(XSIMaterials)) {
      this.mMasterMaterials[_loc3_] = XSIMaterials[_loc3_];
    }
  }

  ConvertVLIST(mvListX: any, mvListY: any, vList: any): void {
    for (const _loc5_ of forIn(vList)) {
      vList[_loc5_] = { x: mvListX[vList[_loc5_]], y: mvListY[vList[_loc5_]] };
      this.mVertex_Count++;
    }
  }

  /**
   * Draws one direction-frame into mcShadow and the per-model planes (plane i at depth 10000 - i: the first enumerated
   * model is in front). Model and polygon enumeration use xsiForIn (newest-first, see xsiData.ts).
   */
  Render(oFrame: any): void {
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    if (!oFrame) {
      if (!DI.mQuiet) {
        // (empty)
      }
      return;
    }
    DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale = !this.mStyleSheet?.mScale ? DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale : this.mStyleSheet.mScale;
    this.mcShadow.clear();
    for (const _loc29_ of forIn(this.mcPlanes)) {
      this.mcPlanes[_loc29_ as any].clear();
    }
    const _loc34_ = 0; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @246783 (unused)
    void _loc34_;
    const _loc17_ = this.mMaterials;
    let _loc18_: any = undefined;
    const _loc22_ = this.mStyleSheet?.mModels;
    const _loc32_ = oFrame.mDirection;
    const _loc31_ = oFrame.mFrameIndex;
    const _loc30_ = oFrame.mAnimID;
    const _loc27_ = DI.mGroups[this.mStyleSheet?.mGroup_Remap]?.[_loc30_]?.mDirections[_loc32_]?.[_loc31_]?.Models;
    const _loc26_ = DI.mGroups[oFrame.rPartner]?.[_loc30_]?.mDirections[_loc32_]?.[_loc31_]?.Models;
    const _loc33_ = this.mStyleSheet?.mScalarMatrix;
    void _loc33_;
    const _loc23_ = oFrame.Models;
    let _loc9_ = -1; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247050
    for (const _loc29_ of xsiForIn(_loc23_)) { // paint order: see xsiData.ts
      let _loc5_ = _loc23_[_loc29_];
      const _loc24_ = _loc5_;
      void _loc24_;
      const _loc16_ = _loc29_;
      _loc9_ = _loc9_ + 1; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247124
      if (!this.mcPlanes[_loc9_]) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247145
        this.mcPlanes[_loc9_] = this.mcGraphic.createEmptyMovieClip('_Plane' + _loc9_, 10000 - _loc9_); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247198
      }
      const _loc2_ = this.mcPlanes[_loc9_]; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247213
      if (_loc5_.Empty) {
        _loc18_ = _loc26_?.[_loc16_];
        _loc5_ = !_loc18_ ? _loc5_ : _loc18_;
      }
      if (_loc22_) {
        const _loc15_ = _loc22_[_loc16_];
        if (_loc15_) {
          if (!_loc15_.mVisible) {
            continue;
          }
          if (_loc15_.mGroup_Remap) {
            _loc18_ = _loc27_?.[_loc16_];
            _loc5_ = !_loc18_ ? _loc5_ : _loc18_;
          }
        }
      }
      let _loc3_: number;
      let _loc4_: any;
      let _loc7_: number;
      let _loc10_: any;
      if (this.mRenderFlags & this.mRenderFlag_ProfileEdge) {
        _loc10_ = _loc17_.PEdge;
        _loc2_.lineStyle(_loc10_?.mThickness, _loc10_?.mColor, _loc10_?.mAlpha);
        const _loc14_ = _loc5_.PEdge;
        for (const _loc25_ of xsiForIn(_loc14_)) {
          _loc4_ = _loc14_[_loc25_];
          _loc2_.moveTo(_loc4_[0], _loc4_[1]);
          _loc3_ = 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247553
          _loc7_ = _loc4_.length; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247566
          while (_loc3_ < _loc7_) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247571
            _loc2_.lineTo(_loc4_[_loc3_], _loc4_[_loc3_ + 1]); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247620
            _loc3_ = _loc3_ + 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247632
          }
        }
        _loc2_.beginFill(0, 0);
        _loc2_.lineStyle(0, 0, 0);
        _loc2_.endFill();
      }
      const _loc11_ = _loc5_.Shape_vList;
      const _loc19_ = _loc5_.Shape_Matrix;
      const _loc13_ = _loc5_.Shape_Material;
      const _loc21_ = _loc5_.Shape_Brightness;
      for (const _loc29b_ of xsiForIn(_loc11_)) {
        _loc4_ = _loc11_[_loc29b_];
        const _loc8_ = _loc19_[_loc29b_];
        const _loc20_ = _loc13_[_loc29b_];
        void _loc20_;
        const _loc6_ = _loc21_[_loc29b_];
        _loc10_ = _loc17_[_loc13_[_loc29b_]];
        if (_loc8_) {
          _loc2_.beginBitmapFill(_loc10_?.sBMD, _loc8_, true, true);
        } else {
          _loc2_.beginFill(_loc10_?.mColor, _loc10_?.mAlpha);
        }
        _loc2_.moveTo(_loc4_[0], _loc4_[1]);
        _loc3_ = 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248010
        _loc7_ = _loc4_.length;
        while (_loc3_ < _loc7_) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248028
          _loc2_.lineTo(_loc4_[_loc3_], _loc4_[_loc3_ + 1]); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248077
          _loc3_ = _loc3_ + 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248089
        }
        _loc2_.endFill();
        if (this.mRenderFlags & this.mRenderFlag_Shader && _loc6_) {
          _loc2_.beginFill(_loc6_ >= 0 ? 16777215 : 0, 100 * Math.abs(_loc6_) * DI.mShader_Contrast);
          _loc2_.moveTo(_loc4_[0], _loc4_[1]);
          _loc3_ = 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248310
          _loc7_ = _loc4_.length;
          while (_loc3_ < _loc7_) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248328
            _loc2_.lineTo(_loc4_[_loc3_], _loc4_[_loc3_ + 1]); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248377
            _loc3_ = _loc3_ + 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248389
          }
          _loc2_.endFill();
        }
      }
      if (this.mRenderFlags & this.mRenderFlag_Shadow) {
        _loc10_ = _loc17_.Shadow;
        const _loc12_ = _loc5_.Shadow;
        for (const _loc29c_ of xsiForIn(_loc12_)) {
          _loc4_ = _loc12_[_loc29c_];
          this.mcShadow.beginFill(_loc10_?.mColor, _loc10_?.mAlpha);
          this.mcShadow.moveTo(_loc4_[0], _loc4_[1]);
          _loc3_ = 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248604
          _loc7_ = _loc4_.length;
          while (_loc3_ < _loc7_) { // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248622
            this.mcShadow.lineTo(_loc4_[_loc3_], _loc4_[_loc3_ + 1]); // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248677
            _loc3_ = _loc3_ + 2; // [BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @248689
          }
          this.mcShadow.endFill();
        }
      }
    }
    DI.mRenderCount_Frames = DI.mRenderCount_Frames + 1;
  }

  LoadMaterials(tMaterials: any): void {
    for (const _loc4_ of forIn(tMaterials)) {
      const _loc2_ = tMaterials[_loc4_];
      this.LoadMaterial(_loc2_);
    }
    this.mMaterials = tMaterials;
  }

  /** Bitmap materials: attach the `mcLinkID` symbol (hidden) and draw it into a 64x64 transparent BitmapData. */
  LoadMaterial(tMat: any): void {
    if (tMat.mcLinkID) {
      if (tMat.mcLinkID != tMat.mcBMD?.LoadedID) {
        tMat.mcBMD?.removeMovieClip();
        tMat.mcBMD = _root.attachMovie(tMat.mcLinkID, '_temp', _root.getNextHighestDepth(), { _visible: false });
        // AS2: member write on undefined (linkage not exported, e.g. {Bond,GIJOE,Swat}_Head_*) is a silent no-op.
        if (tMat.mcBMD != undefined) {
          tMat.mcBMD.LoadedID = tMat.mcLinkID;
        }
      }
      tMat.sBMD = !tMat.sBMD ? new flash.display.BitmapData(tMat.mSize.x, tMat.mSize.y, true, 0) : tMat.sBMD;
      // AS2: draw(undefined) is ignored; the bitmap keeps its previous content (or stays transparent).
      if (tMat.mcBMD != undefined) {
        tMat.sBMD.draw(tMat.mcBMD);
      }
    }
  }

  DP(mc: any, p: any, c: any, s: any): void {
    mc.lineStyle(s / 2.5, c, 100);
    mc.moveTo(p.x - s, p.y - s);
    mc.lineTo(p.x + s, p.y + s);
    mc.moveTo(p.x + s, p.y - s);
    mc.lineTo(p.x - s, p.y + s);
  }
}
proto(CDrawPrimitive_XSI_DI, {
  _CLASSID_: 'CDrawPrimitive_XSI_DI',
  _BASECLASSID_: 'CDrawPrimitive_XSI_DI',
  mRenderFlag_Shadow: 1,
  mRenderFlag_Edge: 2,
  mRenderFlag_ProfileEdge: 4,
  mRenderFlag_ModelEdge: 8,
  mRenderFlag_Texture: 16,
  mRenderFlag_Shader: 32,
  mRenderFlag_All: 255,
});
// r2.mRenderFlags = proto.mRenderFlag_Shadow | proto.mRenderFlag_Texture | proto.mRenderFlag_Shader | proto.mRenderFlag_ProfileEdge
// ([BC] generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @249734)
proto(CDrawPrimitive_XSI_DI, {
  mRenderFlags: CDrawPrimitive_XSI_DI.prototype.mRenderFlag_Shadow | CDrawPrimitive_XSI_DI.prototype.mRenderFlag_Texture |
    CDrawPrimitive_XSI_DI.prototype.mRenderFlag_Shader | CDrawPrimitive_XSI_DI.prototype.mRenderFlag_ProfileEdge,
});

registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_DI', CDrawPrimitive_XSI_DI);
