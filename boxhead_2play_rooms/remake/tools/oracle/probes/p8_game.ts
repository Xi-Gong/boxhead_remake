/**
 * P8: hooks injected into a COPY of the real game SWF (../boxhead_2play_rooms.swf is never modified).
 *
 * A DoAction is appended to root frame 62 (where `Main` (CMain) is placed and the timeline stops; all 114 AS2
 * classes and the 26 registerClass init actions have run by then). It creates an empty clip whose onEnterFrame
 * drives the probe once CMain has initialised (CMain._this and CMain.mInput exist). Global sound volume is set to 0.
 *
 * The FP32 projectors on this machine stop content after ~100 ms (EOL/region kill switch), so P8 runs in the
 * pre-EOL release projector FlashPlayer28.exe and reports through the SharedObject channel (tools/oracle/sol.ts;
 * ~100 KB per run → the work is split into parts):
 *   p8a_tables     (b) World.CUpgrades level tables (levels 1..100) + multiplier list, built with
 *                      `new World.CUpgrades(fakeWorld)` (InitLists runs in the constructor; CMain.mFPS = 25,
 *                      default save data: mDevilsActive = 1), (c) Thing.Math.CThing_Angle.mLookup256 rows 1..32.
 *   p8b_init_1_9   (a) World.CWorld mInitList order for rooms 1..9 (p8c_init_10_14, p8e_init_15_18 for the rest): each room is
 *                      attached directly (`_root.attachMovie("World", ..., {mWorldLibLink: "ROOM_Single_00NN"})`, its
 *                      onEnterFrame (CWorld.Init) removed so the game logic does not start); the CWorld constructor
 *                      attaches the room, whose CWorld_Init_* children register via AddInitObject — hooked to record WHEN
 *                      (inside attachMovie "A" or at driver tick "t<n>"), whether mcRoomData was already assigned (+/-)
 *                      and whether the world's onEnterFrame existed (1/0). The list is dumped on the next frame(s).
 *   p8d_nav18      (d) the real game flow on room 18 (BIG ONE, Single): CMain state machine is switched to
 *                      State_LoadWorld; CWorld.prototype.InitThings is wrapped to dump mInitList as seen by the game,
 *                      World.Map.CMap_Cell.Nav_Update is wrapped to record, per call (= per world tick), the BFS state
 *                      before/after, nSDist (layers completed), nList/pList lengths and the ms spent.
 *
 * Init entry encoding: <code><depthPath>:<x>,<y>[,<x2>,<y2>][|r<rotation>] with code Z zombie, D devil, 1 player1,
 * 2 player2, B barrel, W wall, K pickup, C collision solid (x2,y2 = mPosition2), S piece; depthPath = getDepth()+16384
 * (= the PlaceObject depth in the SWF) of the marker and of its ancestors below the room clip, outermost first, joined
 * by '/'; x,y = mPosition (world px).
 */
import { compileAS } from '../as1c.ts';
import { encodeTag, reserializeWithInjections } from '../swfWrite.ts';
import { soPrelude } from '../sol.ts';
import { SwfFile, TAG } from '../../swf/SwfFile.ts';
import { SWF_PATH } from '../../paths.ts';
import { resolve } from 'node:path';
import type { ProbeDef } from './index.ts';

export const FP28 = resolve(SWF_PATH, '..', '..', 'flash_player', 'FlashPlayer28.exe');

const COMMON = `
var __snd = new Sound(); __snd.setVolume(0);
var __drv = _root.createEmptyMovieClip("__oracle_driver", 1048000);
var __ticks = 0;
function cmainReady() { return _global.CMain._this != undefined && _global.CMain.mInput != undefined; }
function code(cls) {
  var m = {CWorld_Init_Zombie: "Z", CWorld_Init_Devil: "D", CWorld_Init_Player1: "1", CWorld_Init_Player2: "2", CWorld_Init_Barrel: "B",
    CWorld_Init_Wall: "W", CWorld_Init_Pickup: "K", CWorld_Init_CollisionSolid: "C", CWorld_Init_Piece: "S"};
  return m[cls] != undefined ? m[cls] : "?" + cls;
}
function depthPath(mc, room) { var s = ""; var p = mc; while (p != undefined && p != room) { s = (p.getDepth() + 16384) + (s == "" ? "" : "/" + s); p = p._parent; } return s; }
function entry(e, room) {
  var p = e.mPosition;
  var s = code(e._CLASSID_) + depthPath(e, room) + ":" + p.mX + "," + p.mY;
  if (e._CLASSID_ == "CWorld_Init_CollisionSolid") { var p2 = e.mPosition2; s += "," + p2.mX + "," + p2.mY; }
  if (e._rotation != 0) s += "|r" + e._rotation;
  return s;
}
function dumpList(prefix, list, room) {
  P(prefix + ".n", list.length);
  var line = ""; var k; var chunk = 0;
  for (k = 0; k < list.length; k++) {
    line += (line == "" ? "" : ";") + entry(list[k], room);
    if ((k + 1) % 40 == 0 || k == list.length - 1) { P(prefix + ".l" + chunk, line); line = ""; chunk++; }
  }
}
`;

const TABLES = `
function runTables() {
  P("mFPS", _global.CMain.mFPS);
  P("mDevilsActive", _global.CMain.mSaveData.mDevilsActive);
  var u = new _global.World.CUpgrades({mHud: {}});
  var L; var k; var e; var keys1 = ""; var same = true;
  for (L = 0; L <= 101; L++) {
    var lv = u.mLevels[L];
    if (lv == undefined) { if (L == 0 || L == 101) P("level" + L, "undefined"); continue; }
    var ks = ""; var vs = "";
    for (k = 0; k < lv.length; k++) { e = lv[k]; ks += (k ? ";" : "") + e.mClassID + "." + e.mProp; vs += (k ? ";" : "") + e.mValue; }
    if (L == 1) { keys1 = ks; P("levelKeys", ks); }
    else if (ks != keys1) { same = false; P("levelKeys" + L, ks); }
    P("level" + L, vs);
  }
  P("levelKeysSame", same);
  var m = u.mMultipliers; var s = ""; var cnt = 0;
  for (L = 0; L <= 200; L++) {
    if (m[L] == undefined) continue;
    for (k = 0; k < m[L].length; k++) { e = m[L][k]; P("mult" + L + "." + k, e.mClassID + "." + e.mProp + "=" + e.mValue + "|" + e.mName); cnt++; }
  }
  P("multCount", cnt);
  P("upgrades.keysOf", keysOf(u));
  var A = _global.Thing.Math.CThing_Angle;
  A.Create_LookupTables();
  var T = A.mLookup256; var D = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
  P("lookup.length", T.length + "|row0=" + T[0] + "|row33=" + T[33]);
  var n; var a;
  for (n = 1; n <= 32; n++) {
    var row = T[n]; var enc = "";
    for (a = 0; a < row.length; a++) { var v = row[a]; enc += (v >= 0 && v < 32 && v == Math.floor(v)) ? D.charAt(v) : "(" + v + ")"; }
    P("lookup" + n, row.length + ":" + enc);
  }
  P("Deg2Rad", A.Deg2Rad); P("RadsTo256", A.RadsTo256);
}
`;

function initRooms(from: number, to: number): string {
  return `
var __order = new Array();
var __WP = _global.World.CWorld.prototype;
var __origAdd = __WP.AddInitObject;
var __inAttach = false;
__WP.AddInitObject = function (t) {
  __order.push((__inAttach ? "A" : "t" + __ticks) + (this.mcRoomData == undefined ? "-" : "+") + (this.onEnterFrame == undefined ? "0" : "1"));
  return __origAdd.apply(this, arguments);
};
function pad4(n) { var s = "" + n; while (s.length < 4) s = "0" + s; return s; }
var __room = ${from}; var __w = undefined; var __attachTick = 0;
function stepRooms() {
  if (__w == undefined) {
    __order = new Array();
    __inAttach = true;
    __w = _root.attachMovie("World", "__w" + __room, 1047000 + __room, {mWorldLibLink: "ROOM_Single_" + pad4(__room)});
    __inAttach = false;
    __attachTick = __ticks;
    P("room" + __room + ".afterAttach", (__w.mInitList == undefined ? "undefined" : __w.mInitList.length) + "|calls=" + __order.length + "|roomData=" + (__w.mcRoomData != undefined));
    __w.__keepInit = __w.onEnterFrame;
    delete __w.onEnterFrame;
    return false;
  }
  if (__w.mInitList == undefined && __ticks - __attachTick < 5) return false;
  var list = __w.mInitList;
  var calls = __order.join(",");
  P("room" + __room + ".ctorCalls", (__ticks - __attachTick) + "|" + (calls.length > 120 ? calls.substr(0, 120) + "..." : calls));
  var allSame = true; var k; for (k = 1; k < __order.length; k++) if (__order[k] != __order[0]) allSame = false;
  P("room" + __room + ".ctorCallsUniform", allSame + "|" + __order[0] + "|n=" + __order.length);
  P("room" + __room + ".area", __w.mcRoomData._Size._width + "x" + __w.mcRoomData._Size._height);
  if (list == undefined) P("room" + __room + ".n", "undefined"); else dumpList("room" + __room, list, __w.mcRoomData);
  __w.removeMovieClip();
  __w = undefined;
  CHECKPOINT();
  __room++;
  return __room > ${to};
}
`;
}

const NAV = `
var __navCalls = 0; var __navMax = 450; var __navDone = false; var __initDumped = false;
var __C = _global.World.Map.CMap_Cell;
var __origNav = __C.Nav_Update;
__C.Nav_Update = function (cells) {
  var s0 = __C.nState; var t0 = getTimer();
  var r = __origNav.apply(__C, arguments);
  var t1 = getTimer();
  if (__navCalls < __navMax) {
    P("nav" + __navCalls, s0 + ">" + __C.nState + "|d=" + __C.nSDist + "|n=" + __C.nList.length + "|p=" + __C.pList.length + "|ms=" + (t1 - t0) + "|cells=" + cells.length + "|tick=" + _global.CMain._this.mcWorld.mTick);
  }
  __navCalls++;
  if (__navCalls == __navMax) __navDone = true;
  return r;
};
var __WP = _global.World.CWorld.prototype;
var __origInit = __WP.InitThings;
__WP.InitThings = function () {
  if (!__initDumped) { __initDumped = true; dumpList("room18real", this.mInitList, this.mcRoomData); P("room18real.area", this.mArea.width + "x" + this.mArea.height); }
  return __origInit.apply(this, arguments);
};
var __navStarted = false; var __t0 = 0;
function startNav() {
  var M = _global.CMain._this;
  _global.World.CWorld.mGameMode = "Single";
  _global.Thing.Creature.CThing_Creature.mDamageActive = _global.CMain.mSaveData.mDamageActive;
  M.mWorldLibLink = "ROOM_Single_0018";
  M.mReturn_SelectWorld = "State_SelectWorld_Single";
  M.SetState("State_LoadWorld");
  __t0 = getTimer();
  P("nav.start", __t0 + "|nInterations=" + __C.nInterations + "|nTimeOut=" + __C.nTimeOut);
}
`;

function driver(body: string, ready: string): string {
  return `
__drv.onEnterFrame = function () {
  __ticks++;
  if (!cmainReady()) { if (__ticks > 3000) { P("error", "CMain never initialised"); delete this.onEnterFrame; END(); } return; }
  ${body}
};
P("injected", getTimer() + "|frame=" + _root._currentframe);
${ready}
`;
}

function buildPart(soName: string, src: string): Uint8Array {
  const swf = SwfFile.fromPath(SWF_PATH);
  const code = compileAS(soPrelude(soName) + COMMON + src);
  return reserializeWithInjections(swf, [{ frame: 62, tags: [encodeTag(TAG.DoAction, code, true)] }], { compress: true });
}

const once = (fn: string): string => `P("ready", getTimer() + "|state=" + (_global.CMain._this.fState == _global.CMain._this.State_Intro ? "Intro" : "other")); ${fn}(); delete this.onEnterFrame; END();`;

export const p8a: ProbeDef = {
  id: 'p8a_tables', title: 'Game hooks: CUpgrades level/multiplier tables, CThing_Angle.mLookup256', channel: 'so', player: FP28,
  timeoutMs: 90000,
  build: () => buildPart('oracle_p8a_tables', TABLES + driver(once('runTables'), '')),
};

export const p8b: ProbeDef = {
  id: 'p8b_init_1_9', title: 'Game hooks: CWorld mInitList order, rooms 1-9 (direct attach)', channel: 'so', player: FP28,
  timeoutMs: 90000,
  build: () => buildPart('oracle_p8b_init_1_9', initRooms(1, 9) + driver(`if (stepRooms()) { delete this.onEnterFrame; END(); }`, '')),
};

export const p8c: ProbeDef = {
  id: 'p8c_init_10_14', title: 'Game hooks: CWorld mInitList order, rooms 10-14 (direct attach)', channel: 'so', player: FP28,
  timeoutMs: 90000,
  build: () => buildPart('oracle_p8c_init_10_14', initRooms(10, 14) + driver(`if (stepRooms()) { delete this.onEnterFrame; END(); }`, '')),
};

export const p8e: ProbeDef = {
  id: 'p8e_init_15_18', title: 'Game hooks: CWorld mInitList order, rooms 15-18 (direct attach)', channel: 'so', player: FP28,
  timeoutMs: 90000,
  build: () => buildPart('oracle_p8e_init_15_18', initRooms(15, 18) + driver(`if (stepRooms()) { delete this.onEnterFrame; END(); }`, '')),
};

export const p8d: ProbeDef = {
  id: 'p8d_nav18', title: 'Game hooks: real game flow on room 18 — InitThings order + per-tick nav BFS layers', channel: 'so', player: FP28,
  timeoutMs: 240000,
  notes: ['Timing data (ms, layers per Nav_Update call) is machine dependent: FlashPlayer28 release projector on the dev PC.'],
  build: () => buildPart('oracle_p8d_nav18', NAV + driver(`
  if (!__navStarted) { __navStarted = true; startNav(); return; }
  if (__navDone || getTimer() - __t0 > 200000) { P("nav.calls", __navCalls); P("nav.end", getTimer() - __t0); delete this.onEnterFrame; END(); }
`, '')),
};
