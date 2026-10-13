// [ORACLE P8 + P11] CWorld.mInitList of all 18 rooms built by the REAL engine + game classes (headless) vs the list
// measured in Flash Player 28 (tests/goldens/flash/p8b/p8c/p8e). Like the probe, "World" is attached from an
// onEnterFrame handler (how CMain.State_LoadWorld attaches it); the CWorld constructor attaches the room, whose
// CWorld_Init_* markers register themselves (AddInitObject) when they are constructed — parent first, pre-order by
// ascending depth (a Piece before its nested collision block), right after the handler returns.
import { freshSaveData, loadLibraryJson } from '../game/f3/f3Setup.ts';
import { describe, expect, it } from 'vitest';
import {
  Player, clearFrameScripts, clearRegisteredClasses, setInstanceHook, setScriptErrorHandler,
} from '../../../src/engine/swf/Player.ts';
import { engine } from '../../../src/engine/swf/state.ts';
import { numberToString } from '../../../src/engine/flash/as2.ts';
import { registerClasses } from '../../../src/game/registerClasses.ts';
import { ROOM_PART, golden } from './golden.ts';

const CODE: Record<string, string> = {
  CWorld_Init_Zombie: 'Z', CWorld_Init_Devil: 'D', CWorld_Init_Player1: '1', CWorld_Init_Player2: '2',
  CWorld_Init_Barrel: 'B', CWorld_Init_Wall: 'W', CWorld_Init_Pickup: 'K', CWorld_Init_CollisionSolid: 'C',
  CWorld_Init_Piece: 'S',
};
const s = numberToString;

/**
 * Same encoding as the probe (tools/oracle/probes/p8_game.ts `entry`). The probe printed getDepth() + 16384 = the
 * PlaceObject depth of timeline instances; the engine keeps timeline instances at their raw PlaceObject depth.
 */
function entry(e: any, room: any): string {
  let path = '';
  for (let p = e; p != undefined && p !== room; p = p._parent) {
    path = String(p.$timeline ? p.$depth : p.getDepth() + 16384) + (path === '' ? '' : '/' + path);
  }
  const p = e.mPosition;
  let out = (CODE[e._CLASSID_] ?? '?' + e._CLASSID_) + path + ':' + s(p.mX) + ',' + s(p.mY);
  if (e._CLASSID_ === 'CWorld_Init_CollisionSolid') { const p2 = e.mPosition2; out += ',' + s(p2.mX) + ',' + s(p2.mY); }
  if (e._rotation != 0) out += '|r' + s(e._rotation);
  return out;
}

function goldenList(room: number): string[] {
  const res = golden(ROOM_PART[room]!).results;
  const out: string[] = [];
  for (let i = 0; res[`room${room}.l${i}`] !== undefined; i++) out.push(...res[`room${room}.l${i}`]!.split(';'));
  return out;
}

interface RoomResult { afterAttach: string; list: string[]; errors: string[] }

/** Attach World (room `room`) from an onEnterFrame handler of a driver clip, like the P8 probe. */
function buildRoom(room: number): RoomResult {
  freshSaveData();
  clearRegisteredClasses();
  clearFrameScripts();
  setInstanceHook(undefined);
  const errors: string[] = [];
  setScriptErrorHandler((e, where) => { errors.push(`${where}: ${e instanceof Error ? e.message : String(e)}`); });
  const missing = registerClasses();
  expect(missing).toEqual([]);
  engine.warned.add('*');
  const p = Player.fromJson(loadLibraryJson());
  p.enterFrame(); // root frame 1
  p.root.stop(); // stay on the loading screen (the root timeline is not under test)
  let w: any;
  let afterAttach = '';
  const drv: any = p.root.createEmptyMovieClip('__oracle_driver', 1048000);
  drv.onEnterFrame = function (this: any): void {
    w = p.root.attachMovie('World', '__w' + room, 1047000 + room, { mWorldLibLink: 'ROOM_Single_' + String(room).padStart(4, '0') });
    afterAttach = `${w.mInitList == undefined ? 'undefined' : w.mInitList.length}|roomData=${w.mcRoomData != undefined}`;
    delete w.onEnterFrame; // CWorld.Init must not start the game
    delete this.onEnterFrame;
  };
  p.enterFrame();
  const list: string[] = (w?.mInitList ?? []).map((e: any) => entry(e, w.mcRoomData));
  return { afterAttach, list, errors };
}

describe('P8 x P11: CWorld mInitList of all 18 rooms (engine + game classes vs Flash)', () => {
  const results = new Map<number, RoomResult>();
  const room = (r: number): RoomResult => { let x = results.get(r); if (!x) { x = buildRoom(r); results.set(r, x); } return x; };

  for (let r = 1; r <= 18; r++) {
    it(`room ${r}: the markers are not constructed yet when attachMovie("World") returns inside the handler`, () => {
      expect(room(r).afterAttach).toBe('undefined|roomData=true');
      expect(room(r).errors).toEqual([]);
    });
    it(`room ${r}: same AddInitObject ORDER (marker class + depth path) as Flash`, () => {
      const key = (e: string): string => e.slice(0, e.indexOf(':'));
      expect(room(r).list.map(key)).toEqual(goldenList(r).map(key));
    });
    it(`room ${r}: same entries incl. positions (mPosition / mPosition2 / rotation) as Flash`, () => {
      expect(room(r).list).toEqual(goldenList(r));
    });
  }
});
