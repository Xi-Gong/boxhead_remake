import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH, FLA_PATH } from '../../../tools/paths.ts';
import { extractRegisterClasses, extractRegisterClassEntries, registerClassesFromFla } from '../../../tools/avm1/registerClass.ts';

describe.skipIf(!existsSync(SWF_PATH))('Object.registerClass extraction', () => {
  const swf = SwfFile.fromPath(SWF_PATH);
  const map = extractRegisterClasses(swf);

  it('finds all 27 registerClass calls (one per non-class DoInitAction)', () => {
    expect(Object.keys(map)).toHaveLength(27);
    expect(extractRegisterClassEntries(swf)).toHaveLength(27);
  });

  it('maps the known linkages', () => {
    expect(map).toMatchObject({
      Main: 'CMain',
      World: 'World.CWorld',
      'Piece.WallPost': 'World.Init.CWorld_Init_Piece',
      'Piece.Wall1': 'World.Init.CWorld_Init_Piece',
      'Piece.FallenColumn1': 'World.Init.CWorld_Init_Piece',
      World_Init_CollisionSolid: 'World.Init.CWorld_Init_CollisionSolid',
      World_Init_Player1: 'World.Init.CWorld_Init_Player1',
      World_Init_Player2: 'World.Init.CWorld_Init_Player2',
      World_Init_Zombie: 'World.Init.CWorld_Init_Zombie',
      World_Init_Devil: 'World.Init.CWorld_Init_Devil',
      World_Init_Barrel: 'World.Init.CWorld_Init_Barrel',
      World_Init_Wall: 'World.Init.CWorld_Init_Wall',
      World_Init_Pickup: 'World.Init.CWorld_Init_Pickup',
      Screen_Init: 'Screen.CScreen_Init',
      Screen_Intro: 'Screen.CScreen_Intro',
      Screen_Main: 'Screen.CScreen_Main',
      Screen_SelectWorld: 'Screen.CScreen_SelectWorld',
      Screen_LoadingWorld: 'Screen.CScreen_LoadingWorld',
      Screen_Debrief: 'Screen.CScreen_Debrief',
      Screen_Debrief_Winner: 'Screen.CScreen_Debrief_Winner',
      'Screen.SubmitHighScore': 'External.CHighscore_Submit',
    });
  });

  it.skipIf(!existsSync(FLA_PATH))('agrees with the FLA (#initclip scripts)', () => {
    expect(registerClassesFromFla()).toEqual(map);
  });
});
