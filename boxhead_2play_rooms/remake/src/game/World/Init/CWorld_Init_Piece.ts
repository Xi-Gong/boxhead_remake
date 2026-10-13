// Port of projects/boxhead4/World/Init/CWorld_Init_Piece.as
// Scenery piece (Piece.Wall1, Piece.Slab, ...): Draw() stamps it into the floor and the decal mask with a
// translation-only matrix (BitmapData.draw ignores the clip's own transform/visibility — Flash semantics) and its
// `_Cover` child into the cover bitmap.
import { flash, proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CWorld_Init } from './CWorld_Init.ts';

export class CWorld_Init_Piece extends CWorld_Init {
  override ctor(): void {
    super.ctor();
  }

  Draw(): void {
    let _loc2_ = this.__get__mPosition();
    let _loc3_ = new flash.geom.Matrix(1, 0, 0, 1, _loc2_.mX, _loc2_.mY);
    this.mWorld.bmFloor.draw(this, _loc3_);
    this.mWorld.bmDecalMask.draw(this, _loc3_);
    _loc2_ = this.GetPosition(this._Cover);
    _loc3_ = new flash.geom.Matrix(1, 0, 0, 1, _loc2_.mX, _loc2_.mY);
    this.mWorld.bmCover.draw(this._Cover, _loc3_);
  }
}
proto(CWorld_Init_Piece, { _CLASSID_: 'CWorld_Init_Piece' });

registerGameClass('World.Init.CWorld_Init_Piece', CWorld_Init_Piece);
