// Test helper (lane F3): headless engine + every ported class module, and small fixtures for the F3 classes.
// Import this FIRST in a test file (it sets BitmapData.headless before the class modules evaluate).
import { BitmapData } from '../../../../src/engine/flash/BitmapData.ts';
BitmapData.headless = true;
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LibraryJson } from '../../../../src/shared/assetSchema.ts';
import { Key, Mouse } from '../../../../src/engine/flash/input.ts';
import { SharedObject } from '../../../../src/engine/flash/SharedObject.ts';
import { Player } from '../../../../src/engine/swf/Player.ts';
import '../../../../src/game/allClasses.ts';
import { CMain, CSaveData } from '../../../../src/game/packages.ts';

const LIBRARY_PATH = fileURLToPath(new URL('../../../../public/assets/library.json', import.meta.url));
let libCache: LibraryJson | undefined;

/** The extracted library.json (public/assets, produced by `npm run extract`). */
export function loadLibraryJson(): LibraryJson {
  libCache ??= JSON.parse(readFileSync(LIBRARY_PATH, 'utf8')) as LibraryJson;
  return JSON.parse(JSON.stringify(libCache)) as LibraryJson;
}

/** A Player over an empty root timeline: gives `_root` (CSaveData.__set__mDetail writes _root._quality). */
export function emptyPlayer(): Player {
  return Player.fromJson({
    v: 1, swfSha256: '', stage: { w: 640, h: 480, bg: [0, 0, 0, 255], frameRate: 50, frameCount: 1, swfVersion: 8 },
    exports: {}, classes: {}, chars: {}, root: { t: 'sprite', id: 0, frameCount: 1, frames: [{ ops: [] }], labels: {} }, actions: [],
  } as unknown as LibraryJson);
}

/** Fresh save data (empty SharedObject storage) installed as CMain.mSaveData, like CMain's ctor does. */
export function freshSaveData(): any {
  SharedObject._reset();
  Key._reset();
  Mouse._reset();
  emptyPlayer();
  (CMain as any).mFPS = 25;
  const sd = new (CSaveData as any)();
  (CMain as any).mSaveData = sd;
  sd.LoadData('morerooms_default');
  return sd;
}

/** Minimal CWorld stand-in for CUpgrades (HUD and thing collection only record calls). */
export function fakeWorld(): any {
  const calls: { level: string[]; upgrade: string[]; newWeapon: unknown[] } = { level: [], upgrade: [], newWeapon: [] };
  const mWeapons: Record<string, object> = {};
  for (const w of ['pistol', 'uzi', 'shotgun', 'barrel', 'grenade', 'fakewall', 'mine', 'rocket', 'chargepack', 'railgun']) mWeapons[w] = {};
  const player = { mWeapons, NewWeapon: (v: unknown) => { calls.newWeapon.push(v); } };
  return {
    calls,
    mHud: {
      mSilentMessages: false,
      // like CHud.AddMessage: nothing is shown while mSilentMessages is set
      AddMessage_Level(this: any, t: string) { if (!this.mSilentMessages) calls.level.push(t); },
      AddMessage_Upgrade(this: any, t: string) { if (!this.mSilentMessages) calls.upgrade.push(t); },
    },
    mThing_Collection: { mPlayerThings: [player], mThingCounters: {} },
    Spawn_Zombie: () => false,
    Spawn_Devil: () => false,
  };
}
