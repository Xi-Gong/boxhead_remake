/**
 * Visual reference scenes for the ORIGINAL game: compiles a scene of src/dev/sceneList.ts to an AS1 driver and injects
 * it (DoAction before root frame 62's ShowFrame, like probe P8) into a COPY of ../boxhead_2play_rooms.swf.
 *                                                                                    OWNER: lane V (visual)
 * The driver semantics are documented in src/dev/sceneList.ts; src/dev/scenes.ts implements the same for the remake.
 * Results go through the SharedObject channel (tools/oracle/sol.ts): step frame numbers, final state, then END().
 */
import { compileAS } from '../as1c.ts';
import { encodeTag, reserializeWithInjections } from '../swfWrite.ts';
import { soPrelude } from '../sol.ts';
import { SwfFile, TAG } from '../../swf/SwfFile.ts';
import { SWF_PATH } from '../../paths.ts';
import { PROLOGUE, type SceneDef, type SceneStep } from '../../../src/dev/sceneList.ts';

const lit = (v: number | string | boolean): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const ident = (s: string): string => {
  if (!/^[A-Za-z_$][\w$]*$/.test(s)) throw new Error(`not an identifier: ${s}`);
  return s;
};

/** AS body of one step: `return true` when the step is complete. M = CMain._this. */
function stepAS(s: SceneStep): string {
  switch (s.op) {
    case 'state': return `M.SetState(${lit(s.state)}); return true;`;
    case 'screenCall': return `M.mcScreen.${ident(s.fn)}(${(s.args ?? []).map(lit).join(', ')}); return true;`;
    case 'save': return `_global.CMain.mSaveData.${ident(s.field)} = ${lit(s.value)}; return true;`;
    case 'noSpawn': return `_global.World.CWorld.prototype.Spawn_Zombie = __noSpawn; _global.World.CWorld.prototype.Spawn_Devil = __noSpawn; return true;`;
    case 'pause': return `var w = M.mcWorld; w.mPaused = true; w.mHud.Pause(true); return true;`;
    case 'complete': return `M.mcWorld.mCompleteState = ${lit(s.value)}; return true;`;
    case 'waitScreen': return `return M.mcScreen.idScreen == ${lit(s.id)} && M.mcScreen.mNormal == true;`;
    case 'waitState': return `return M.fState == M.${ident(s.state)};`;
    case 'waitTick': return `return M.mcWorld.mTick >= ${s.tick};`;
    case 'waitFrames': return `if (__wait < ${s.n}) { __wait++; return false; } __wait = 0; return true;`;
  }
}

export function sceneSoName(scene: SceneDef): string {
  return `oracle_vis_${scene.id.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** The full AS1 source of a scene driver (SO prelude included). */
export function sceneSource(scene: SceneDef): string {
  const steps = scene.steps.map((s, i) => `  if (i == ${i}) { ${stepAS(s)} }`).join('\n');
  const prologue = PROLOGUE.map((p) => `_global.CMain.mSaveData.${ident(p.field)} = ${lit(p.value)};`).join(' ');
  return soPrelude(sceneSoName(scene)) + `
var __snd = new Sound(); __snd.setVolume(0);
// the projector window takes the keyboard focus when it starts: ignore real key presses (CInput only uses Key.isDown)
Key.isDown = function (k) { return false; };
var __drv = _root.createEmptyMovieClip("__vis_driver", 1048000);
var __frames = 0; var __step = 0; var __wait = 0; var __started = false;
function __noSpawn() { return false; }
function cmainReady() { return _global.CMain._this != undefined && _global.CMain.mInput != undefined; }
function freeze(mc) {
  mc.stop();
  delete mc.onEnterFrame;
  for (var k in mc) { var c = mc[k]; if (typeof c == "movieclip" && c._parent == mc) freeze(c); }
}
function runStep(i) {
  var M = _global.CMain._this;
${steps}
  return true;
}
function report(M) {
  P("frames", __frames);
  P("screen", M.mcScreen.idScreen + "|normal=" + M.mcScreen.mNormal + "|visible=" + M.mcScreen._visible);
  var w = M.mcWorld;
  if (w != undefined) {
    P("world", "tick=" + w.mTick + "|paused=" + w.mPaused + "|loaded=" + w.mLoaded + "|draw=" + w.mDrawPosition.x + "," + w.mDrawPosition.y);
    var pl = w.mThing_Collection.mPlayerThings; var k;
    for (k in pl) P("player" + k, pl[k].mPosition.mX + "," + pl[k].mPosition.mY + "|a=" + pl[k].mAngle.mAngle);
  }
  P("quality", _root._quality);
  P("keyIsDownOverridden", Key.isDown(83) === false && Key.isDown(0) === false);
}
__drv.onEnterFrame = function () {
  __frames++;
  if (!cmainReady()) { if (__frames > 5000) { P("error", "CMain never initialised"); delete this.onEnterFrame; END(); } return; }
  var M = _global.CMain._this;
  if (!__started) { __started = true; M.mSingleFrame = true; ${prologue} P("start", __frames); }
  while (__step < ${scene.steps.length}) {
    if (!runStep(__step)) { if (__frames > 6000) { P("error", "timeout at step " + __step); report(M); delete this.onEnterFrame; END(); } return; }
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

/** The game SWF with the scene driver injected at root frame 62. */
export function buildSceneSwf(scene: SceneDef): Uint8Array {
  const swf = SwfFile.fromPath(SWF_PATH);
  const code = compileAS(sceneSource(scene));
  return reserializeWithInjections(swf, [{ frame: 62, tags: [encodeTag(TAG.DoAction, code, true)] }], { compress: true });
}
