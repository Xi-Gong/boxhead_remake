// Test helper (lane F1): side-effect imports of every lane F1 module (each registers itself in the package
// namespaces), plus minimal stubs for classes owned by other lanes that F1 code reads (Thing.CThing flags, CMain,
// CSaveData). Stubs are only installed where the real class is not registered.
import '../../../../src/game/scidd/CProfiler.ts';
import '../../../../src/game/scidd/Draw/CColor.ts';
import '../../../../src/game/scidd/Math/CLine.ts';
import '../../../../src/game/scidd/Math/CMath.ts';
import '../../../../src/game/scidd/Math/CRandom.ts';
import '../../../../src/game/scidd/Math/CVector3.ts';
import '../../../../src/game/Thing/Math/CThing_Angle.ts';
import '../../../../src/game/Thing/Math/CThing_Navigation.ts';
import '../../../../src/game/Thing/Math/CThing_Position.ts';
import '../../../../src/game/World/Map/CMap.ts';
import '../../../../src/game/World/Map/CMap_Affect.ts';
import '../../../../src/game/World/Map/CMap_Cell.ts';
import '../../../../src/game/World/Map/CMap_Collide.ts';
import '../../../../src/game/World/Map/CMap_Decal.ts';
import '../../../../src/game/World/Map/CMap_Mapwho.ts';
import '../../../../src/game/World/Map/CMap_Math.ts';
import '../../../../src/game/World/Map/CMap_Navigation.ts';
import '../../../../src/game/World/Init/CWorld_Init.ts';
import '../../../../src/game/World/Init/CWorld_Init_Barrel.ts';
import '../../../../src/game/World/Init/CWorld_Init_CollisionSolid.ts';
import '../../../../src/game/World/Init/CWorld_Init_Devil.ts';
import '../../../../src/game/World/Init/CWorld_Init_Pickup.ts';
import '../../../../src/game/World/Init/CWorld_Init_Piece.ts';
import '../../../../src/game/World/Init/CWorld_Init_Player1.ts';
import '../../../../src/game/World/Init/CWorld_Init_Player2.ts';
import '../../../../src/game/World/Init/CWorld_Init_Wall.ts';
import '../../../../src/game/World/Init/CWorld_Init_Zombie.ts';
import '../../../../src/game/DrawPrimitive/CDrawPrimitive.ts';
import '../../../../src/game/DrawPrimitive/CDrawPrimitive_Line.ts';
import '../../../../src/game/DrawPrimitive/CDrawPrimitive_Square.ts';
import '../../../../src/game/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip.ts';
import '../../../../src/game/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Animation.ts';
import '../../../../src/game/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Directional.ts';
import '../../../../src/game/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_OmniDirectional.ts';
import '../../../../src/game/DrawPrimitive/MovieClip/CDrawPrimitive_MovieClip_Static.ts';
import '../../../../src/game/DrawPrimitive/XSI/CDrawPrimitive_XSI.ts';
import '../../../../src/game/DrawPrimitive/XSI/CDrawPrimitive_XSI_Animation.ts';
import '../../../../src/game/DrawPrimitive/XSI/CDrawPrimitive_XSI_Collection.ts';
import '../../../../src/game/DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.ts';
import '../../../../src/game/DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet.ts';
import { CMain, CSaveData, Thing, registerGameClass } from '../../../../src/game/packages.ts';

/** AS2 values of Thing.CThing's static flags (projects/boxhead4/Thing/CThing.as:7-12). */
export const CTHING_FLAGS = {
  mFlag_Collidable: 1, mFlag_WaitForMove: 2, mFlag_CellMoved: 4, mFlag_Drawn: 8, mFlag_SortFloor: 16, mFlag_DEAD: 32,
};

/** Install stubs for other lanes' classes used by F1 code (only if the real ones are not registered). */
export function installStubs(opts: { collisionsActive?: boolean } = {}): void {
  if (!Thing.CThing) registerGameClass('Thing.CThing', { ...CTHING_FLAGS });
  if (!CMain) registerGameClass('CMain', { mSaveData: { mCollisionsActive: true } });
  if (opts.collisionsActive !== undefined) (CMain as any).mSaveData.mCollisionsActive = opts.collisionsActive;
  if (!CSaveData) registerGameClass('CSaveData', { mDefaultQuality: 'HIGH' });
}
