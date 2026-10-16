/**
 * DYNAMIC_VIEWPORT (engine side, deviation DYNAMIC_VIEWPORT): lay the ROOT timeline out on the live, window-grown
 * stage. The platform Presenter derives the stage size (never below the authored 640x480); Player.setStageSize
 * writes it here and Player.render re-applies this layout every frame (the root timeline places children with
 * their authored matrices, so a one-shot transform would be overwritten during the intro frames).
 *
 *   - Children placed by the ROOT TIMELINE (any frame's place op) are stage content: content children get the
 *     centring offset ADDED to their authored position (differential, via WeakMap - never a hard set), so the
 *     640x480-authored screens stay centred in any window shape. Mask layers (clipDepth > 0, e.g. root frame 62's
 *     640x480 clip rect) are STRETCHED to the live stage so their clip keeps covering it.
 *   - Runtime-attached root children (XSI raster caches, HUD pre-render MCs at getNextHighestDepth) are NOT stage
 *     content and are never touched (a +dx on a cache MC would shift its BitmapData.draw output).
 *   - At the authored 640x480 stage every write is guarded to a no-op: rendering is bit-identical to the 4:3
 *     letterbox of v0.2.1.
 */
import type { MovieClip } from './DisplayObject.ts';
import { engine } from './state.ts';

/** The offset/scale each treated child currently carries (differential apply). */
interface Applied { dx: number; dy: number; sx: number; sy: number }
const NOOP: Applied = { dx: 0, dy: 0, sx: 1, sy: 1 };
const appliedBy = new WeakMap<object, Applied>();
/** Depths the root timeline itself places (per root def; runtime attachments are always above/absent). */
const timelineDepthsBy = new WeakMap<object, Set<number>>();

function timelineDepths(def: unknown): Set<number> {
  let set = timelineDepthsBy.get(def as object);
  if (!set) {
    set = new Set<number>();
    for (const fr of (def as { frames?: Array<{ ops?: Array<{ op: string; depth: number }> }> }).frames ?? []) {
      for (const o of fr?.ops ?? []) if (o.op === 'place') set.add(o.depth);
    }
    timelineDepthsBy.set(def as object, set);
  }
  return set;
}

/**
 * Apply the stage layout to the root clip (cheap; guards every write). Content children move by the centring
 * offset, mask children scale to the stage. Call every rendered frame.
 */
export function applyStageLayout(root: MovieClip | undefined, stageW: number, stageH: number): void {
  if (!root || !root.$def) return;
  const authored = engine.library?.json.stage;
  const w0 = authored?.w ?? 640, h0 = authored?.h ?? 480;
  const dx = (stageW - w0) / 2;
  const dy = (stageH - h0) / 2;
  const sx = stageW / w0;
  const sy = stageH / h0;
  const depths = timelineDepths(root.$def);
  for (const c of root.$list) {
    if (!depths.has(c.$depth)) continue; // runtime-attached: not stage content
    const prev = appliedBy.get(c) ?? NOOP;
    if (c.$clipDepth > 0) {
      // Mask layer (root frame 62): stretch its fill geometry to the live stage.
      if (sx !== prev.sx) c._xscale = (c._xscale * sx) / prev.sx;
      if (sy !== prev.sy) c._yscale = (c._yscale * sy) / prev.sy;
      appliedBy.set(c, { dx: prev.dx, dy: prev.dy, sx, sy });
    } else {
      if (dx !== prev.dx) c._x = c._x - prev.dx + dx;
      if (dy !== prev.dy) c._y = c._y - prev.dy + dy;
      appliedBy.set(c, { dx, dy, sx: prev.sx, sy: prev.sy });
    }
  }
}
