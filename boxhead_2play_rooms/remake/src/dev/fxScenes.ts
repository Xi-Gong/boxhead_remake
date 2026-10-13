// Dev-only EFFECT visual-fidelity scene driver (lane X2). Loaded by src/main.ts ONLY in dev builds when the URL has
// `?fxscene=<id>` (ids: src/dev/fxSceneList.ts). Same driver semantics as src/dev/scenes.ts (lane V); the AS1 twin is
// tools/oracle/visual/buildFxScene.ts. It drives the remake through the same calls, freezes the stage and sets
// window.__vis.ready for tests/visual/captureFxRemake.ts.
import { MovieClip, _root, flash, toAS2String } from '../engine/runtime.ts';
import { getFrameScript, registerFrameScript } from '../engine/swf/Player.ts';
import { SoundEngine } from '../engine/platform/AudioEngine.ts';
import { seedRandom, setMathRandomSource } from '../engine/flash/rng.ts';
import * as P from '../game/packages.ts';
import { PROLOGUE } from './sceneList.ts';
import { getFxScene, type FxSceneDef, type FxStep, type FxValue } from './fxSceneList.ts';
import type { VisState } from './scenes.ts';

const { CMain, World, Thing, DrawPrimitive } = P;

function freeze(mc: MovieClip): void {
  mc.stop();
  delete (mc as any).onEnterFrame;
  for (const c of mc.$list) if (c instanceof MovieClip) freeze(c);
}

function noSpawn(): boolean { return false; }
function noop(): void {}

/** _global dotted path ("Thing.Weapon.CThing_Weapon_Pistol.mcMuzzleFlash"). */
function g(path: string): any {
  const parts = path.split('.');
  let o: any = parts[0] === 'flash' ? flash : (P as any)[parts[0]!];
  for (let i = 1; i < parts.length; i++) o = o?.[parts[i]!];
  return o;
}

function walk(o: any, path: string | undefined): any {
  if (!path) return o;
  for (const k of path.split('.')) o = o?.[k];
  return o;
}

class FxDriver {
  frames = 0;
  step = 0;
  wait = 0;
  started = false;
  roomPhase = 0;
  /** Park-Miller LCG state (-1 until a 'seed' step), reported like the AS1 driver's __lcg */
  lcg = -1;
  readonly refs = new Map<string, any>();
  readonly scene: FxSceneDef;
  readonly vis: VisState;

  constructor(scene: FxSceneDef, vis: VisState) { this.scene = scene; this.vis = vis; }

  P(k: string, v: unknown): void { this.vis.report[k] = typeof v === 'string' ? v : toAS2String(v); }

  ref(name: string): any {
    const M: any = CMain._this;
    if (name === 'M') return M;
    if (name === 'world') return M.mcWorld;
    if (name === 'player0' || name === 'player1') {
      const pl = M.mcWorld.mThing_Collection.mPlayerThings;
      for (const k of Object.keys(pl)) if (pl[k].mPlayerIndex === Number(name.slice(6))) return pl[k];
      return undefined;
    }
    return this.refs.get(name);
  }

  val(v: FxValue): any {
    if (typeof v !== 'object' || v === null) return v;
    if ('pos' in v) return new Thing.Math.CThing_Position(v.pos[0], v.pos[1], v.pos[2] ?? 0);
    if ('angle' in v) return new Thing.Math.CThing_Angle(v.angle);
    if ('pt' in v) return new flash.geom.Point(v.pt[0], v.pt[1]);
    if ('g' in v) {
      if (!v.call) return g(v.g);
      const parts = v.g.split('.');
      const owner = g(parts.slice(0, -1).join('.'));
      const obj = owner[parts[parts.length - 1]!];
      return obj[v.call](...(v.args ?? []).map((a) => this.val(a)));
    }
    const base = walk(this.ref(v.ref), v.path);
    return v.call ? base[v.call](...(v.args ?? []).map((a) => this.val(a))) : base;
  }

  /** true when the step is complete (mirror of buildFxScene.ts stepAS). */
  runStep(s: FxStep): boolean {
    const M: any = CMain._this;
    switch (s.op) {
      case 'save': (CMain.mSaveData as any)[s.field] = s.value; return true;
      case 'room': {
        // phases: 0 noSpawn + SetState, 1 wait for the screen, 2..3 two frames, 4 LoadLevel, 5 wait RunWorld, 6 wait tick
        switch (this.roomPhase) {
          case 0: {
            const p = World.CWorld.prototype as any;
            p.Spawn_Zombie = noSpawn;
            p.Spawn_Devil = noSpawn;
            M.SetState(`State_SelectWorld_${s.mode}`);
            this.roomPhase = 1;
            return false;
          }
          case 1:
            if (M.mcScreen?.idScreen == 'Screen_SelectWorld' && M.mcScreen.mNormal == true) this.roomPhase = 2;
            return false;
          case 2: case 3: this.roomPhase++; return false;
          case 4: M.mcScreen.LoadLevel(s.room - 1); this.roomPhase = 5; return false;
          case 5: if (M.fState == M.State_RunWorld) this.roomPhase = 6; return false;
          default:
            if (M.mcWorld?.mTick >= s.tick) { this.roomPhase = 0; return true; }
            return false;
        }
      }
      case 'waitTick': return M.mcWorld?.mTick >= s.tick;
      case 'waitFrames':
        if (this.wait < s.n) { this.wait++; return false; }
        this.wait = 0;
        return true;
      case 'seed': {
        this.lcg = s.seed;
        setMathRandomSource(() => { this.lcg = (this.lcg * 16807) % 2147483647; return this.lcg / 2147483647; });
        return true;
      }
      case 'multiplier': {
        const w = M.mcWorld;
        const u = w.mUpgrades;
        w.mHud.mSilentMessages = true;
        while (u.__get__mMultiplier() < s.value) u.__set__mMultiplier(u.__get__mMultiplier() + 1);
        w.mHud.mSilentMessages = false;
        u.mMultiplierTick = 100000000;
        u.mMultipleKillsTick = 100000000;
        return true;
      }
      case 'new': {
        const C = g(s.cls);
        const o = new C(...s.args.map((a) => this.val(a)));
        for (const [path, v] of s.set ?? []) {
          const parts = path.split('.');
          walk(o, parts.slice(0, -1).join('.') || undefined)[parts[parts.length - 1]!] = this.val(v);
        }
        if (s.add !== 'none') {
          M.mcWorld.mThing_Collection.AddThing(o);
          if (s.add === 'show') {
            o.Process = noop;
            M.mcWorld.mMap.mMapwho.MoveThing(o);
          }
        }
        if (s.name) this.refs.set(s.name, o);
        return true;
      }
      case 'set': {
        const parts = s.path.split('.');
        walk(this.ref(s.ref), parts.slice(0, -1).join('.') || undefined)[parts[parts.length - 1]!] = this.val(s.value);
        return true;
      }
      case 'call': {
        const parts = s.path.split('.');
        const owner = walk(this.ref(s.ref), parts.slice(0, -1).join('.') || undefined);
        const r = owner[parts[parts.length - 1]!](...(s.args ?? []).map((a) => this.val(a)));
        if (s.name) this.refs.set(s.name, r);
        return true;
      }
      case 'noDecals': {
        const p = World.Map.CMap_Decal.prototype as any;
        p.Draw_BloodSplat = noop;
        p.Draw_ScorchMark = noop;
        return true;
      }
      case 'decal': {
        const D: any = World.Map.CMap_Decal;
        const key = s.kind === 'blood' ? 'bmBloodSplat' : 'bmScorchMark';
        if (!D[key]) {
          DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x = 1;
          DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 0.6;
          D[key] = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional(s.kind === 'blood' ? 'Effect.BloodSplat' : 'Effect.ScorchMark', 3);
        }
        const c = D[key];
        c.mAnimationPosition = s.frame;
        const w = M.mcWorld;
        c.QRender_Mask(w.bmFloor, new flash.geom.Point(s.x * 32, s.y * 32), s.dir, w.bmDecalMask);
        return true;
      }
      case 'xsi': {
        const w = M.mcWorld;
        const coll = s.coll === 'zombie' ? (Thing.Creature.CThing_Creature_Zombie as any).mXSI_Collection
          : s.coll === 'devil' ? (Thing.Creature.CThing_Creature_Devil as any).mXSI_Collection
            : this.ref(s.coll).mXSI_Collection;
        const X: any = DrawPrimitive.XSI.CDrawPrimitive_XSI;
        const keep = X.bmDraw;
        X.bmDraw = w.bmFloor;
        const a = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(coll);
        a.SetAnimation(s.anim, s.frame);
        a.Render(new flash.geom.Point(s.x * 32, s.y * 32), new Thing.Math.CThing_Angle(s.angle), 100);
        X.bmDraw = keep;
        return true;
      }
    }
  }

  report(M: any): void {
    this.P('frames', this.frames);
    this.P('screen', `${M.mcScreen?.idScreen}|normal=${M.mcScreen?.mNormal}|visible=${M.mcScreen?._visible}`);
    const w = M.mcWorld;
    if (w != undefined) {
      this.P('world', `tick=${w.mTick}|paused=${w.mPaused}|loaded=${w.mLoaded}|draw=${w.mDrawPosition?.x},${w.mDrawPosition?.y}|shake=${w.mShake?.x},${w.mShake?.y}|bright=${w.mBrightness}`);
      const n = (v: unknown): string => toAS2String(v);
      const pl = w.mThing_Collection?.mPlayerThings ?? {};
      for (const k of Object.keys(pl)) this.P(`player${pl[k].mPlayerIndex}`, `${n(pl[k].mPosition.mX)},${n(pl[k].mPosition.mY)}|vis=${pl[k].mVisible}`);
    }
    this.P('quality', (_root as any)._quality);
    this.P('lcg', this.lcg);
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
      let done: boolean;
      try {
        done = this.runStep(this.scene.steps[this.step]!);
      } catch (e) {
        this.finish(driverClip, M, `step ${this.step} (${this.scene.steps[this.step]!.op}): ${String(e)}`);
        return;
      }
      if (!done) {
        if (this.frames > 8000) this.finish(driverClip, M, `timeout at step ${this.step}`);
        return;
      }
      this.P(`step${this.step}`, this.frames);
      this.step++;
    }
    this.finish(driverClip, M);
  }
}

/** Install the fx scene driver (see installScene in scenes.ts: wraps root frame 62's script). */
export function installFxScene(id: string, opts: { seed?: number } = {}): VisState {
  const scene = getFxScene(id);
  const vis: VisState = { scene: id, ready: false, report: {} };
  window.__vis = vis;
  if (!scene) { vis.error = `unknown fx scene ${id}`; vis.ready = true; return vis; }
  if (opts.seed !== undefined && Number.isFinite(opts.seed)) seedRandom(opts.seed);
  SoundEngine.muted = true;
  const driver = new FxDriver(scene, vis);
  const frame62 = getFrameScript(0, 62);
  registerFrameScript(0, 62, function (this: any): void {
    frame62?.call(this);
    const clip: any = _root.createEmptyMovieClip('__vis_driver', 1048000);
    clip.onEnterFrame = function (this: any): void { driver.onEnterFrame(this); };
    vis.report.injected = `frame=${(_root as any)._currentframe}`;
  });
  return vis;
}
