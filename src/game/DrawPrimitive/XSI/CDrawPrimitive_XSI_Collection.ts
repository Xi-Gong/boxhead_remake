// Port of assets/projects/boxhead4/DrawPrimitive/XSI/CDrawPrimitive_XSI_Collection.as
// Game animation names ("stand", "walk", "shothit_1", ...) -> loaded CDrawPrimitive_XSI_Animation objects.
import { _root, proto } from '../../../engine/runtime.ts';
import { CSaveData, DrawPrimitive, registerGameClass } from '../../packages.ts';

export class CDrawPrimitive_XSI_Collection {
  declare _CLASSID_: string;
  static mRenderQuality = 'MEDIUM';
  static mBackQuality: any;
  declare mItems: any;

  constructor() {
    this.mItems = new Object();
  }

  AddItem(tItem: any): void {
    this.mItems[tItem.mID] = tItem;
  }

  MimicItem(tID: any, tMimicItemID: any): void {
    this.mItems[tID] = this.mItems[tMimicItemID];
  }

  static StartRender(tScale?: any): void {
    DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale = tScale != undefined ? tScale : 0.35;
    DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.mBackQuality = DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.mBackQuality != undefined ? DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.mBackQuality : _root._quality;
    if (_root._quality != CSaveData.mDefaultQuality) {
      _root._quality = CSaveData.mDefaultQuality;
    }
  }

  static EndRender(): void {
    if (DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.mBackQuality != _root._quality) {
      _root._quality = DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection.mBackQuality;
    }
    delete (DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection as any).mBackQuality;
  }
}
proto(CDrawPrimitive_XSI_Collection, { _CLASSID_: 'CDrawPrimitive_XSI_Collection' });

registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection', CDrawPrimitive_XSI_Collection);
