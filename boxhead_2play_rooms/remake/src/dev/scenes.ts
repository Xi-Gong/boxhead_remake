// Dev-only visual-fidelity scene driver (lane V). Loaded by src/main.ts ONLY in dev builds when the URL has
// `?scene=<id>` (ids: src/dev/sceneList.ts). It drives the remake through the same calls as the AS1 driver injected
// into the original SWF (tools/oracle/visual/buildScene.ts), freezes the stage and sets window.__vis.ready, so
// tests/visual/captureRemake.ts can screenshot the canvas and tests/visual/compare.ts can diff it against the
// reference captured from the real Flash Player. Semantics: see the header of src/dev/sceneList.ts.
import { MovieClip, _root, toAS2String } from '../engine/runtime.ts';
import { getFrameScript, registerFrameScript } from '../engine/swf/Player.ts';
import { SoundEngine } from '../engine/platform/AudioEngine.ts';
import { seedRandom } from '../engine/flash/rng.ts';
import { strokeSnapConfig } from '../engine/flash/strokeSnap.ts';
import { renderConfig } from '../engine/swf/render/renderer.ts';
import { CMain, World } from '../game/packages.ts';
import { PROLOGUE, getScene, type SceneDef, type SceneStep } from './sceneList.ts';

export interface VisState {
  scene: string;
  ready: boolean;
  error?: string;
  /** Same keys as the original driver's SharedObject report (frames, stepN, screen, world, playerN, quality). */
  report: Record<string, string>;
}

declare global {
  interface Window { __vis?: VisState }
}

function freeze(mc: MovieClip): void {
  mc.stop();
  delete (mc as any).onEnterFrame;
  for (const c of mc.$list) if (c instanceof MovieClip) freeze(c);
}

function noSpawn(): boolean { return false; }

class SceneDriver {
  frames = 0;
  step = 0;
  wait = 0;
  started = false;
  readonly scene: SceneDef;
  readonly vis: VisState;

  constructor(scene: SceneDef, vis: VisState) { this.scene = scene; this.vis = vis; }

  P(k: string, v: unknown): void { this.vis.report[k] = typeof v === 'string' ? v : toAS2String(v); }

  /** true when the step is complete (mirror of buildScene.ts stepAS). */
  runStep(s: SceneStep): boolean {
    const M: any = CMain._this;
    switch (s.op) {
      case 'state': M.SetState(s.state); return true;
      case 'screenCall': M.mcScreen[s.fn](...(s.args ?? [])); return true;
      case 'save': (CMain.mSaveData as any)[s.field] = s.value; return true;
      case 'noSpawn': {
        const p = World.CWorld.prototype as any;
        p.Spawn_Zombie = noSpawn;
        p.Spawn_Devil = noSpawn;
        return true;
      }
      case 'pause': { const w = M.mcWorld; w.mPaused = true; w.mHud.Pause(true); return true; }
      case 'complete': M.mcWorld.mCompleteState = s.value; return true;
      case 'waitScreen': return M.mcScreen?.idScreen == s.id && M.mcScreen.mNormal == true;
      case 'waitState': return M.fState == M[s.state];
      case 'waitTick': return M.mcWorld?.mTick >= s.tick;
      case 'waitFrames':
        if (this.wait < s.n) { this.wait++; return false; }
        this.wait = 0;
        return true;
    }
  }

  report(M: any): void {
    this.P('frames', this.frames);
    this.P('screen', `${M.mcScreen?.idScreen}|normal=${M.mcScreen?.mNormal}|visible=${M.mcScreen?._visible}`);
    const w = M.mcWorld;
    if (w != undefined) {
      this.P('world', `tick=${w.mTick}|paused=${w.mPaused}|loaded=${w.mLoaded}|draw=${w.mDrawPosition?.x},${w.mDrawPosition?.y}`);
      const pl = w.mThing_Collection?.mPlayerThings ?? {};
      const n = (v: unknown): string => toAS2String(v);
      for (const k of Object.keys(pl)) this.P(`player${k}`, `${n(pl[k].mPosition.mX)},${n(pl[k].mPosition.mY)}|a=${n(pl[k].mAngle?.mAngle)}`);
    }
    this.P('quality', (_root as any)._quality);
    this.P('keyIsDownOverridden', true);
  }

  finish(driverClip: any, M: any, error?: string): void {
    delete driverClip.onEnterFrame;
    if (error) { this.vis.error = error; this.report(M ?? {}); this.vis.ready = true; return; }
    delete M.onEnterFrame;
    freeze(_root);
    this.report(M);
    this.vis.ready = true;
  }

  onEnterFrame(driverClip: any): void {
    this.frames++;
    const M: any = CMain._this;
    if (!(M != undefined && CMain.mInput != undefined)) {
      if (this.frames > 5000) this.finish(driverClip, M, 'CMain never initialised');
      return;
    }
    if (!this.started) {
      this.started = true;
      M.mSingleFrame = true;
      for (const p of PROLOGUE) (CMain.mSaveData as any)[p.field] = p.value;
      this.P('start', this.frames);
    }
    while (this.step < this.scene.steps.length) {
      if (!this.runStep(this.scene.steps[this.step]!)) {
        if (this.frames > 6000) this.finish(driverClip, M, `timeout at step ${this.step}`);
        return;
      }
      this.P(`step${this.step}`, this.frames);
      this.step++;
    }
    this.finish(driverClip, M);
  }
}

/**
 * Install the scene driver: wraps root frame 62's script (like the DoAction injected into the original) so the
 * driver clip is created right after CMain's clip. Call after the game's frame scripts are registered and before the
 * first Player.enterFrame().
 */
export function installScene(id: string, opts: { seed?: number; legacyRender?: boolean } = {}): VisState {
  const scene = getScene(id);
  const vis: VisState = { scene: id, ready: false, report: {} };
  window.__vis = vis;
  if (!scene) { vis.error = `unknown scene ${id}`; vis.ready = true; return vis; }
  if (opts.seed !== undefined && Number.isFinite(opts.seed)) seedRandom(opts.seed);
  SoundEngine.muted = true;
  if (opts.legacyRender) {
    // the renderer as it was before lane V's fixes (before/after numbers of tests/visual/compare.ts)
    renderConfig.textCache = false;
    renderConfig.filterPixelSnap = true;
    strokeSnapConfig.enabled = false;
  }
  const driver = new SceneDriver(scene, vis);
  const frame62 = getFrameScript(0, 62);
  registerFrameScript(0, 62, function (this: any): void {
    frame62?.call(this);
    const clip: any = _root.createEmptyMovieClip('__vis_driver', 1048000);
    clip.onEnterFrame = function (this: any): void { driver.onEnterFrame(this); };
    vis.report.injected = `frame=${(_root as any)._currentframe}`;
  });
  return vis;
}
