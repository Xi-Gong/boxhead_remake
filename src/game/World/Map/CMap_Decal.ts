// Port of assets/projects/boxhead4/World/Map/CMap_Decal.as
// Structure from generated/disasm/World.Map.CMap_Decal.txt top-level script @521802..@523086.
// Decals are stamped into the world's floor bitmap through the decal mask (alphaBitmap of copyPixels): blood and scorch
// marks only land where the mask is opaque (open floor; see CDrawPrimitive.InvertAlpha / deviations.ts DECAL_MASK_1X).
import { flash, mathRandom, proto, random } from '../../../engine/runtime.ts';
import { DrawPrimitive, World, registerGameClass } from '../../packages.ts';

export class CMap_Decal {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  static dPoint = new flash.geom.Point();
  static bmBloodSplat: any;
  static bmScorchMark: any;
  declare mMap: any;
  declare mWorld: any;

  constructor(tMap: any) {
    this.mMap = tMap;
    this.mWorld = this.mMap.mWorld;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  Draw_BloodSplat(p: any, tAmount?: any): void {
    if (!World.Map.CMap_Decal.bmBloodSplat) {
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x = 1;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 0.6;
      World.Map.CMap_Decal.bmBloodSplat = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional('Effect.BloodSplat', 3);
    }
    let _loc2_ = tAmount != undefined ? tAmount : 1;
    while (_loc2_) {
      // (empty loop body in the original: [BC] generated/disasm/World.Map.CMap_Decal.txt @522153..@522170)
      _loc2_ = _loc2_ - 1;
    }
    World.Map.CMap_Decal.bmBloodSplat.Animate_Random();
    World.Map.CMap_Decal.dPoint.x = (p.mX + (mathRandom() * 0.5 - 0.25)) * World.Map.CMap_Cell.mSize.x;
    World.Map.CMap_Decal.dPoint.y = (p.mY + (mathRandom() * 0.5 - 0.25)) * World.Map.CMap_Cell.mSize.y;
    World.Map.CMap_Decal.bmBloodSplat.QRender_Mask(this.mWorld.bmFloor, World.Map.CMap_Decal.dPoint, random(3), this.mWorld.bmDecalMask);
  }

  Draw_ScorchMark(p: any): void {
    if (!World.Map.CMap_Decal.bmScorchMark) {
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x = 1;
      DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 0.6;
      World.Map.CMap_Decal.bmScorchMark = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional('Effect.ScorchMark', 3);
    }
    World.Map.CMap_Decal.bmScorchMark.Animate_Random();
    World.Map.CMap_Decal.dPoint.x = p.mX * World.Map.CMap_Cell.mSize.x;
    World.Map.CMap_Decal.dPoint.y = p.mY * World.Map.CMap_Cell.mSize.y;
    World.Map.CMap_Decal.bmScorchMark.QRender_Mask(this.mWorld.bmFloor, World.Map.CMap_Decal.dPoint, random(3), this.mWorld.bmDecalMask);
  }
}
proto(CMap_Decal, { _CLASSID_: 'CMap_Decal', _BASECLASSID_: 'CMap_Decal' });

registerGameClass('World.Map.CMap_Decal', CMap_Decal);
