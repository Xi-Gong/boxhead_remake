// Dynamic viewport (deviation DYNAMIC_VIEWPORT): the world view grows with the window. The engine stage and the
// menu centring are handled platform/engine-side (Presenter.computeFill + swf/stageLayout); this module owns the
// GAME side, all render-state only (determinism untouched - mScreenSize / camera / bmDraw are not checksummed):
//
//   CWorld.Init            - after the original, the world adopts the live stage as its view size (mScreenSize), so
//                            InitDrawPlanes allocates bmDraw and the DeathMatch split geometry for the real window
//                            shape, and the world clip counter-offsets the menu centring (world space == stage space,
//                            bmDraw fills the window exactly).
//   CWorld.Draw            - lazily reallocates bmDraw (and recomputes mSplitScreen) after a window resize while
//                            playing; on views that can exceed the map, bmDraw is cleared to the stage black each
//                            frame (the original never clears non-DM because its camera clamp guaranteed full cover).
//   CWorld.Process_Tracking- OUTERMOST (installed after NetScope's, whose prediction bias it must not disturb): when
//                            the view is larger than the map minus the two 32px insets, the original CMath.Range
//                            clamp inverts; that dimension is instead centred on the map (r.x = (area-w)/2, negative
//                            = black void both sides). The existing clampCopy / world-mDrawPosition math then lands
//                            floor and things consistently; only the void shows through.
//   CHud.Pause             - keeps the wide view: the pause art is shifted to the centred 640x480 and wrapper-drawn
//                            bands (the art's own shape 21 colours: #993300 @ 80% over y<65.75, black @ 85% below)
//                            dim the rest of the stage, so pausing looks exactly like the original, just wider.
//   CScreen_Transition     - snapshots (bmOUT.draw(_root)) cover the full stage; the incoming screen is drawn centred
//                            (its children are shifted for the snapshot - BitmapData.draw ignores the source's own
//                            _x) and the fading container is counter-offset so the cross-fade spans the window.
//
// Presenter wiring: applyScope() installs the wrappers; main.ts calls setViewportPresenter() once the platform
// exists (the LAN bridge setPresenter pattern). Everything is a no-op at 640x480 / headless (no presenter).
import { flash } from '../../engine/runtime.ts';
import type { Presenter } from '../../engine/platform/Presenter.ts';
import { Screen, World } from '../packages.ts';

let presenter: Presenter | undefined;
/** The live CWorld (render-side reference for resize; cleared on Dispose). */
let currentWorld: any;

/** The centring offset the engine stage layout applies to 640x480 content (0,0 when not wide / headless). */
function contentOffset(): { x: number; y: number } {
  if (!presenter) return { x: 0, y: 0 };
  return { x: (presenter.stageW - 640) / 2, y: (presenter.stageH - 480) / 2 };
}

/** Apply the live view to a world instance (view size + clip counter-offset). Idempotent. */
function applyToWorld(world: any): void {
  if (!presenter || !world) return;
  const off = contentOffset();
  world._x = -off.x;
  world._y = -off.y;
  if (world.mScreenSize != undefined) world.mScreenSize = new flash.geom.Point(presenter.stageW, presenter.stageH);
  layoutPause(world, off);
}

/** Late presenter wiring (main.ts, after startPlatform - the lanBridge().setPresenter pattern). */
export function setViewportPresenter(p: Presenter): void {
  if (presenter === p) return;
  presenter = p;
  p.onResize(() => { if (currentWorld) applyToWorld(currentWorld); });
  if (currentWorld) applyToWorld(currentWorld);
}

/** Install the DYNAMIC_VIEWPORT wrappers (applyScope; AFTER installNetScope so Tracking runs outermost). */
export function installViewport(): void {
  const worldProto = (World as any).CWorld.prototype;

  // ---- CWorld.Init: adopt the live stage as the view ------------------------------------------
  const initPrev = worldProto.Init;
  worldProto.Init = function (this: any): void {
    initPrev.call(this);
    currentWorld = this;
    applyToWorld(this);
  };
  const disposePrev = worldProto.Dispose;
  worldProto.Dispose = function (this: any, ...args: any[]): any {
    if (currentWorld === this) currentWorld = undefined;
    return disposePrev.apply(this, args);
  };

  // ---- CWorld.Draw: lazy bmDraw/mSplitScreen realloc after a resize + void clearing -------------
  const drawPrev = worldProto.Draw;
  worldProto.Draw = function (this: any, ...args: any[]): any {
    ensureView(this);
    return drawPrev.apply(this, args);
  };

  // ---- CWorld.Process_Tracking: centre the map when the view exceeds it (outermost) -------------
  const trackingPrev = worldProto.Process_Tracking;
  worldProto.Process_Tracking = function (this: any, ...args: any[]): any {
    const r = trackingPrev.apply(this, args);
    const area = this.mArea;
    if (area != undefined && r != undefined) {
      // The original clamps to [32, area-(w+32)]; when w > area-64 that range inverts. Centre instead.
      if (r.width > area.width - 64) r.x = (area.width - r.width) / 2;
      if (r.height > area.height - 64) r.y = (area.height - r.height) / 2;
    }
    return r;
  };

  // ---- CHud.Pause: centred pause art + wrapper-drawn side bands ----------------------------------
  const hudProto = (World as any).CHud.prototype;
  const pausePrev = hudProto.Pause;
  hudProto.Pause = function (this: any, tState: any): void {
    pausePrev.call(this, tState);
    if (tState === true) {
      layoutPause(this.mWorld, contentOffset());
    } else {
      removePauseBands(this.mWorld);
    }
  };

  // ---- CScreen_Transition: full-stage snapshots, centred incoming screen ------------------------
  const transProto = (Screen as any).CScreen_Transition.prototype;
  const transInPrev = transProto.TransitionIn_Process;
  transProto.TransitionIn_Process = function (this: any): boolean {
    const off = contentOffset();
    if ((off.x === 0 && off.y === 0) || this.bmIN != undefined) return transInPrev.call(this);
    const st = Screen.CScreen_Transition;
    const savedSize = st.mScreenSize;
    st.mScreenSize = new flash.geom.Point(presenter!.stageW, presenter!.stageH);
    // BitmapData.draw ignores the source's own _x/_y (identity override) but renders its children's transforms:
    // shift mcIN's children so the incoming screen lands centred in the stage-sized snapshot.
    const kids = this.mcIN ? this.mcIN.$list.slice() : [];
    for (const k of kids) { k._x += off.x; k._y += off.y; }
    let done: boolean;
    try {
      done = transInPrev.call(this);
    } finally {
      for (const k of kids) { k._x -= off.x; k._y -= off.y; }
      st.mScreenSize = savedSize;
    }
    if (this.mcContainer) {
      this.mcContainer._x -= off.x; // Main-space (0,0) -> stage-space (0,0): the fade covers the whole window
      this.mcContainer._y -= off.y;
    }
    return done;
  };
}

/** The pause art's own overlay geometry (HUD.Paused shape 21): #993300 @ 80% over y<65.75, black @ 85% below. */
const BAND_TOP_COLOR = 0x993300;
const BAND_TOP_ALPHA = 80; // AS2 drawing-API alpha: percent - 80% = 204/255, as the pause art's own shape
const BAND_TOP_Y = 65.75;
const BAND_COLOR = 0x000000;
const BAND_ALPHA = 85;   // 85% = 217/255, as the pause art's own shape
const BANDS_NAME = '_WidePauseBands';

/** Reconcile pause chrome on entry AND resize, without advancing the frozen simulation. */
function layoutPause(world: any, off: { x: number; y: number }): void {
  const pause = world?.mHud?.mcScreenPause;
  if (!pause) return;
  pause._x = off.x;
  pause._y = off.y;
  if (off.x || off.y) attachPauseBands(world, off);
  else removePauseBands(world);
}

/** Dim everything on the stage outside the centred 640x480 pause art (called after Pause(true)). */
function attachPauseBands(world: any, off: { x: number; y: number }): void {
  removePauseBands(world);
  if (!presenter || !world) return;
  const vw = presenter.stageW, vh = presenter.stageH;
  const mc = world.createEmptyMovieClip(BANDS_NAME, world.getNextHighestDepth());
  const rect = (x: number, y: number, w: number, h: number, color: number, alpha: number): void => {
    mc.beginFill(color, alpha);
    mc.moveTo(x, y);
    mc.lineTo(x + w, y);
    mc.lineTo(x + w, y + h);
    mc.lineTo(x, y + h);
    mc.lineTo(x, y);
    mc.endFill();
  };
  const bandRect = (x: number, y: number, w: number, h: number): void => {
    const top = off.y, bottom = top + BAND_TOP_Y, end = y + h;
    if (y < top) rect(x, y, w, Math.min(end, top) - y, BAND_COLOR, BAND_ALPHA);
    const a = Math.max(y, top), b = Math.min(end, bottom);
    if (b > a) rect(x, a, w, b - a, BAND_TOP_COLOR, BAND_TOP_ALPHA);
    if (end > bottom) rect(x, Math.max(y, bottom), w, end - Math.max(y, bottom), BAND_COLOR, BAND_ALPHA);
  };
  if (off.x > 0) { bandRect(0, 0, off.x, vh); bandRect(640 + off.x, 0, vw - 640 - off.x, vh); }
  if (off.y > 0) { bandRect(off.x, 0, 640, off.y); bandRect(off.x, 480 + off.y, 640, vh - 480 - off.y); }
}

function removePauseBands(world: any): void {
  world?.[BANDS_NAME]?.removeMovieClip();
}

/** Called before every CWorld.Draw (also while the net stack is active): keep the view allocation in step. */
function ensureView(world: any): void {
  if (!presenter || !world || world.mScreenSize == undefined) return;
  const w = presenter.stageW, h = presenter.stageH;
  if (world.mScreenSize.x !== w || world.mScreenSize.y !== h) world.mScreenSize = new flash.geom.Point(w, h);
  let bm = world.bmDraw;
  if (bm != undefined && (bm.width !== w || bm.height !== h)) {
    // Resize while playing: swap the attached Bitmap's data in place (same depth, same child), dispose the old.
    const attached = (world.$list ?? []).find((c: any) => c.$bmd === bm);
    const fresh = new flash.display.BitmapData(w, h, World.CWorld.mGameMode !== 'DeathMatch', 0xff000000);
    if (world.mPaused) fresh.copyPixels(bm, bm.rectangle, new flash.geom.Point((w - bm.width) / 2, (h - bm.height) / 2));
    if (attached) attached.$bmd = fresh;
    bm.dispose();
    world.bmDraw = fresh;
    bm = fresh;
    if (attached) attached.$inv?.();
  }
  if (world.mSplitScreen != undefined && !world.mPaused) {
    // Mirror CWorld.InitDrawPlanes' split geometry for the new view (the 480x480 per-view bitmap stays).
    const sp = world.mSplitScreen;
    const scalar = (w / 2) / sp.mScreenSize.x;
    const top = (h - sp.mScreenSize.y * scalar) / 2;
    if (sp.mScalar !== scalar || sp.mOffsets[0].y !== top) {
      sp.mScalar = (w / 2) / sp.mScreenSize.x;
      sp.mOffsets = [new flash.geom.Point(0, top), new flash.geom.Point(sp.mScreenSize.x * sp.mScalar, top)];
      sp.mMatrix.a = sp.mScalar;
      sp.mMatrix.d = sp.mScalar;
    }
  }
  if (!world.mPaused && bm != undefined && world.mArea != undefined) {
    // The view can exceed the map: clear to the stage black each frame (the original's copyPixels always covered
    // bmDraw fully; DeathMatch already clears transparent itself).
    if (World.CWorld.mGameMode !== 'DeathMatch' && (bm.width > world.mArea.width - 64 || bm.height > world.mArea.height - 64)) {
      bm.fillRect(bm.rectangle, 0xff000000);
    }
  }
}
