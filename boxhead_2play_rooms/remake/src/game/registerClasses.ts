// The 27 `Object.registerClass(linkage, Class)` calls of the original (library.json `classes`, recovered from the
// __Packages / #initclip DoInitAction tags; also in the FLA export). Every linkage instance created from the library
// (timeline placement or attachMovie) is then constructed as the registered AS2 class (ctor()).
// Class paths are resolved through the package namespaces of src/game/packages.ts, so src/game/allClasses.ts must be
// imported first (it registers every ported class).
import { registerClass } from '../engine/runtime.ts';
import type { MovieClipClass } from '../engine/swf/Player.ts';
import * as P from './packages.ts';

/** linkage -> AS2 dotted class path (same content as library.json `classes`). */
export const LINKAGE_CLASSES: Readonly<Record<string, string>> = {
  'Piece.WallPost': 'World.Init.CWorld_Init_Piece',
  'Piece.Wall1': 'World.Init.CWorld_Init_Piece',
  World_Init_Player1: 'World.Init.CWorld_Init_Player1',
  World_Init_Zombie: 'World.Init.CWorld_Init_Zombie',
  World_Init_Devil: 'World.Init.CWorld_Init_Devil',
  World_Init_Barrel: 'World.Init.CWorld_Init_Barrel',
  World_Init_Pickup: 'World.Init.CWorld_Init_Pickup',
  World_Init_Player2: 'World.Init.CWorld_Init_Player2',
  'Piece.Slab': 'World.Init.CWorld_Init_Piece',
  'Piece.Wall2': 'World.Init.CWorld_Init_Piece',
  World_Init_Wall: 'World.Init.CWorld_Init_Wall',
  'Piece.Slab_Large': 'World.Init.CWorld_Init_Piece',
  'Piece.Cube1': 'World.Init.CWorld_Init_Piece',
  'Piece.Column': 'World.Init.CWorld_Init_Piece',
  'Piece.FallenColumn1': 'World.Init.CWorld_Init_Piece',
  'Piece.Column2': 'World.Init.CWorld_Init_Piece',
  World: 'World.CWorld',
  Screen_Init: 'Screen.CScreen_Init',
  Screen_Intro: 'Screen.CScreen_Intro',
  Screen_Main: 'Screen.CScreen_Main',
  Screen_SelectWorld: 'Screen.CScreen_SelectWorld',
  Screen_LoadingWorld: 'Screen.CScreen_LoadingWorld',
  Screen_Debrief: 'Screen.CScreen_Debrief',
  'Screen.SubmitHighScore': 'External.CHighscore_Submit',
  Screen_Debrief_Winner: 'Screen.CScreen_Debrief_Winner',
  World_Init_CollisionSolid: 'World.Init.CWorld_Init_CollisionSolid',
  Main: 'CMain',
};

/** Resolve an AS2 dotted class path ("World.Init.CWorld_Init_Piece", "CMain") through the package namespaces. */
export function resolveClassPath(path: string): MovieClipClass | undefined {
  const parts = path.split('.');
  let node: any = (P as Record<string, any>)[parts[0]!];
  for (let i = 1; i < parts.length && node != undefined; i++) node = node[parts[i]!];
  return typeof node === 'function' ? (node as MovieClipClass) : undefined;
}

/**
 * Register the linkage classes (default: the 27 of the original; pass library.json `classes` to use the extracted
 * table). Returns the linkages whose class could not be resolved (empty when every module is loaded).
 */
export function registerClasses(classes: Readonly<Record<string, string>> = LINKAGE_CLASSES): string[] {
  const missing: string[] = [];
  for (const [linkage, path] of Object.entries(classes)) {
    const cls = resolveClassPath(path);
    if (cls) registerClass(linkage, cls);
    else missing.push(`${linkage} -> ${path}`);
  }
  return missing;
}
