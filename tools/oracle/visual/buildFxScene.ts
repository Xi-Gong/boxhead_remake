/**
 * EFFECT reference scenes for the ORIGINAL game (lane X2): compiles a scene of src/dev/fxSceneList.ts to an AS1 driver
 * and injects it (DoAction before root frame 62's ShowFrame) into a COPY of assets/boxhead_2play_rooms.swf. Twin of
 * src/dev/fxScenes.ts (remake); same structure as buildScene.ts (lane V). SharedObject channel: oracle_fx_<scene>.
 */
import { compileAS } from '../as1c.ts';
import { encodeTag, reserializeWithInjections } from '../swfWrite.ts';
import { soPrelude } from '../sol.ts';
import { SwfFile, TAG } from '../../swf/SwfFile.ts';
import { SWF_PATH } from '../../paths.ts';
import { PROLOGUE } from '../../../src/dev/sceneList.ts';
import type { FxSceneDef, FxStep, FxValue } from '../../../src/dev/fxSceneList.ts';

const ident = (s: string): string => {
  if (!/^[A-Za-z_$][\w$]*$/.test(s)) throw new Error(`not an identifier: ${s}`);
  return s;
};
const dotted = (s: string): string => s.split('.').map(ident).join('.');
const num = (n: number): string => {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  return n < 0 ? `(${String(n)})` : String(n);
};

/** AS1 expression of a value (see FxValue in fxSceneList.ts). */
export function valAS(v: FxValue): string {
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if ('pos' in v) return `__pos(${num(v.pos[0])}, ${num(v.pos[1])}, ${num(v.pos[2] ?? 0)})`;
  if ('angle' in v) return `__ang(${num(v.angle)})`;
  if ('pt' in v) return `new flash.geom.Point(${num(v.pt[0])}, ${num(v.pt[1])})`;
  const args = (a?: FxValue[]): string => (a ?? []).map(valAS).join(', ');
  if ('g' in v) return `_global.${dotted(v.g)}${v.call ? `.${ident(v.call)}(${args(v.args)})` : ''}`;
  const base = `__ref(${JSON.stringify(v.ref)})${v.path ? `.${dotted(v.path)}` : ''}`;
  return v.call ? `${base}.${ident(v.call)}(${args(v.args)})` : base;
}

/** AS body of one step: `return true` when the step is complete. M = CMain._this. */
function stepAS(s: FxStep): string {
  switch (s.op) {
    case 'save': return `_global.CMain.mSaveData.${ident(s.field)} = ${typeof s.value === 'number' ? num(s.value) : String(s.value)}; return true;`;
    case 'room': return `
    if (__phase == 0) { _global.World.CWorld.prototype.Spawn_Zombie = __noSpawn; _global.World.CWorld.prototype.Spawn_Devil = __noSpawn; M.SetState("State_SelectWorld_${ident(s.mode)}"); __phase = 1; return false; }
    if (__phase == 1) { if (M.mcScreen.idScreen == "Screen_SelectWorld" && M.mcScreen.mNormal == true) __phase = 2; return false; }
    if (__phase == 2 || __phase == 3) { __phase++; return false; }
    if (__phase == 4) { M.mcScreen.LoadLevel(${num(s.room - 1)}); __phase = 5; return false; }
    if (__phase == 5) { if (M.fState == M.State_RunWorld) __phase = 6; return false; }
    if (M.mcWorld.mTick >= ${num(s.tick)}) { __phase = 0; return true; }
    return false;`;
    case 'waitTick': return `return M.mcWorld.mTick >= ${num(s.tick)};`;
    case 'waitFrames': return `if (__wait < ${num(s.n)}) { __wait++; return false; } __wait = 0; return true;`;
    case 'seed': return `__lcg = ${num(s.seed)}; ASSetPropFlags(Math, "random", 0, 7); Math.random = __lcgRandom; return true;`;
    case 'multiplier': return `__multiplier(${num(s.value)}); return true;`;
    case 'new': {
      const sets = (s.set ?? []).map(([p, v]) => `o.${dotted(p)} = ${valAS(v)};`).join(' ');
      const add = s.add === 'none' ? '' : `M.mcWorld.mThing_Collection.AddThing(o);${s.add === 'show' ? ' o.Process = __noop; M.mcWorld.mMap.mMapwho.MoveThing(o);' : ''}`;
      return `var C = _global.${dotted(s.cls)}; var o = new C(${s.args.map(valAS).join(', ')}); ${sets} ${add}${s.name ? ` __refs[${JSON.stringify(s.name)}] = o;` : ''} return true;`;
    }
    case 'set': return `__ref(${JSON.stringify(s.ref)}).${dotted(s.path)} = ${valAS(s.value)}; return true;`;
    case 'call': {
      const call = `__ref(${JSON.stringify(s.ref)}).${dotted(s.path)}(${(s.args ?? []).map(valAS).join(', ')})`;
      return s.name ? `__refs[${JSON.stringify(s.name)}] = ${call}; return true;` : `${call}; return true;`;
    }
    case 'noDecals': return `_global.World.Map.CMap_Decal.prototype.Draw_BloodSplat = __noop; _global.World.Map.CMap_Decal.prototype.Draw_ScorchMark = __noop; return true;`;
    case 'decal': return `__decal(${JSON.stringify(s.kind)}, ${num(s.x)}, ${num(s.y)}, ${num(s.dir)}, ${num(s.frame)}); return true;`;
    case 'xsi': return `__xsi(${JSON.stringify(s.coll)}, ${JSON.stringify(s.anim)}, ${num(s.frame)}, ${num(s.angle)}, ${num(s.x)}, ${num(s.y)}); return true;`;
  }
}

export function fxSoName(scene: FxSceneDef): string {
  return `oracle_fx_${scene.id.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** Steps per runStep_<k> function (an AVM1 DefineFunction body is limited to 64 KB). */
const CHUNK = 40;

/** The full AS1 source of an fx scene driver (SO prelude included). */
export function fxSceneSource(scene: FxSceneDef): string {
  const chunks: string[] = [];
  for (let c = 0; c * CHUNK < scene.steps.length; c++) {
    const body = scene.steps.slice(c * CHUNK, (c + 1) * CHUNK).map((s, j) => `  if (i == ${c * CHUNK + j}) { ${stepAS(s)} }`).join('\n');
    chunks.push(`function runStep_${c}(i) {\n  var M = _global.CMain._this;\n${body}\n  return true;\n}`);
  }
  const steps = chunks.map((_, c) => `  if (i < ${(c + 1) * CHUNK}) return runStep_${c}(i);`).join('\n');
  const prologue = PROLOGUE.map((p) => `_global.CMain.mSaveData.${ident(p.field)} = ${typeof p.value === 'number' ? num(p.value) : String(p.value)};`).join(' ');
  return soPrelude(fxSoName(scene)) + `
var __snd = new Sound(); __snd.setVolume(0);
Key.isDown = function (k) { return false; };
var __drv = _root.createEmptyMovieClip("__vis_driver", 1048000);
var __frames = 0; var __step = 0; var __wait = 0; var __phase = 0; var __started = false;
var __refs = new Object();
var __lcg = -1;
function __lcgRandom() { __lcg = __lcg * 16807 % 2147483647; return __lcg / 2147483647; }
function __noSpawn() { return false; }
function __noop() { }
function __pos(x, y, z) { var C = _global.Thing.Math.CThing_Position; return new C(x, y, z); }
function __ang(a) { var C = _global.Thing.Math.CThing_Angle; return new C(a); }
function __ref(name) {
  var M = _global.CMain._this;
  if (name == "M") return M;
  if (name == "world") return M.mcWorld;
  if (name == "player0" || name == "player1") {
    var pl = M.mcWorld.mThing_Collection.mPlayerThings; var k; var idx = Number(name.substr(6));
    for (k in pl) { if (pl[k].mPlayerIndex == idx) return pl[k]; }
    return undefined;
  }
  return __refs[name];
}
function cmainReady() { return _global.CMain._this != undefined && _global.CMain.mInput != undefined; }
function freeze(mc) {
  mc.stop();
  delete mc.onEnterFrame;
  for (var k in mc) { var c = mc[k]; if (typeof c == "movieclip" && c._parent == mc) freeze(c); }
}
${chunks.join('\n')}
function runStep(i) {
${steps}
  return true;
}
function __multiplier(m) {
  var w = _global.CMain._this.mcWorld; var u = w.mUpgrades; w.mHud.mSilentMessages = true;
  while (u.__get__mMultiplier() < m) u.__set__mMultiplier(u.__get__mMultiplier() + 1);
  w.mHud.mSilentMessages = false; u.mMultiplierTick = 100000000; u.mMultipleKillsTick = 100000000;
}
function __decal(kind, x, y, dir, frame) {
  var D = _global.World.Map.CMap_Decal; var key = kind == "blood" ? "bmBloodSplat" : "bmScorchMark";
  if (!D[key]) {
    _global.DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x = 1;
    _global.DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 0.6;
    var C = _global.DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional;
    D[key] = new C(kind == "blood" ? "Effect.BloodSplat" : "Effect.ScorchMark", 3);
  }
  var c = D[key]; c.mAnimationPosition = frame; var w = _global.CMain._this.mcWorld;
  c.QRender_Mask(w.bmFloor, new flash.geom.Point(x * 32, y * 32), dir, w.bmDecalMask);
}
function __xsi(collName, anim, frame, angle, x, y) {
  var w = _global.CMain._this.mcWorld; var coll;
  if (collName == "zombie") coll = _global.Thing.Creature.CThing_Creature_Zombie.mXSI_Collection;
  else if (collName == "devil") coll = _global.Thing.Creature.CThing_Creature_Devil.mXSI_Collection;
  else coll = __ref(collName).mXSI_Collection;
  var X = _global.DrawPrimitive.XSI.CDrawPrimitive_XSI; var keep = X.bmDraw; X.bmDraw = w.bmFloor;
  var A = _global.DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation; var a = A.CreateAnimationObject(coll);
  a.SetAnimation(anim, frame);
  a.Render(new flash.geom.Point(x * 32, y * 32), __ang(angle), 100);
  X.bmDraw = keep;
}
function report(M) {
  P("frames", __frames);
  P("screen", M.mcScreen.idScreen + "|normal=" + M.mcScreen.mNormal + "|visible=" + M.mcScreen._visible);
  var w = M.mcWorld;
  if (w != undefined) {
    P("world", "tick=" + w.mTick + "|paused=" + w.mPaused + "|loaded=" + w.mLoaded + "|draw=" + w.mDrawPosition.x + "," + w.mDrawPosition.y + "|shake=" + w.mShake.x + "," + w.mShake.y + "|bright=" + w.mBrightness);
    var pl = w.mThing_Collection.mPlayerThings; var k;
    for (k in pl) P("player" + pl[k].mPlayerIndex, pl[k].mPosition.mX + "," + pl[k].mPosition.mY + "|vis=" + pl[k].mVisible);
  }
  P("quality", _root._quality);
  P("lcg", __lcg);
}
__drv.onEnterFrame = function () {
  __frames++;
  if (!cmainReady()) { if (__frames > 5000) { P("error", "CMain never initialised"); delete this.onEnterFrame; END(); } return; }
  var M = _global.CMain._this;
  if (!__started) { __started = true; M.mSingleFrame = true; ${prologue} P("start", __frames); }
  while (__step < ${scene.steps.length}) {
    if (!runStep(__step)) { if (__frames > 8000) { P("error", "timeout at step " + __step); report(M); delete this.onEnterFrame; END(); } return; }
    P("step" + __step, __frames);
    __step++;
  }
  delete this.onEnterFrame;
  delete M.onEnterFrame;
  freeze(_root);
  report(M);
  END();
};
P("injected", getTimer() + "|frame=" + _root._currentframe);
`;
}

/** The game SWF with the fx scene driver injected at root frame 62. */
export function buildFxSceneSwf(scene: FxSceneDef): Uint8Array {
  const swf = SwfFile.fromPath(SWF_PATH);
  const code = compileAS(fxSceneSource(scene));
  return reserializeWithInjections(swf, [{ frame: 62, tags: [encodeTag(TAG.DoAction, code, true)] }], { compress: true });
}
