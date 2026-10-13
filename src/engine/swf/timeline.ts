/**
 * Pure timeline state replay (lane E). A MovieClip keeps a data-level mirror of what its timeline has placed
 * (`depth -> PlacementState`); gotos replay PlaceObject/RemoveObject ops on that mirror and the clip then reconciles
 * its real children against the result (keep / modify / create / remove). No DOM, no display objects: testable.
 *
 * Flash rules modelled (Flash Player 8 / Ruffle `run_goto`):
 *   - forward goto: replay frames current+1..target on the current state (only the TARGET frame's scripts/sounds
 *     run; intermediate ones are skipped);
 *   - backward goto: replay frames 1..target from an empty state; an existing timeline instance survives when the
 *     replayed state has the same character at the same depth and the instance was placed at or before the target
 *     frame (Ruffle converts that Place into a Move);
 *   - a Place onto an occupied depth replaces the object; Move with a character id replaces the character (shapes,
 *     morphs, texts swap their character; movie clips keep theirs).
 */
import type { CX, Filter, Mat, PlaceOp, SpriteDef } from '../../shared/assetSchema.ts';

export const T_MATRIX = 1, T_CX = 2, T_RATIO = 4, T_FILTERS = 8, T_BLEND = 16, T_CACHE = 32, T_CLIP = 64, T_CHAR = 128;

export interface PlacementState {
  charId: number;
  depth: number;
  /** Frame at which this placement (instance) was created. */
  placeFrame: number;
  /** Order of the Place op within the replay (creation order of new instances). */
  order: number;
  name?: string;
  m?: Mat;
  cx?: CX;
  ratio?: number;
  clipDepth?: number;
  filters?: Filter[];
  blend?: number;
  cacheAsBitmap?: boolean;
  /** Properties set by ops during the replay (T_* bits). */
  touched: number;
  /** Existing display object continuing this placement (forward gotos); undefined = needs a new instance. */
  inst?: unknown;
}

export type TimelineState = Map<number, PlacementState>;

/** Shallow copy of a state with `touched` cleared (start of a forward replay). */
export function cloneState(s: TimelineState): TimelineState {
  const out: TimelineState = new Map();
  for (const [d, p] of s) out.set(d, { ...p, touched: 0 });
  return out;
}

/**
 * A fresh placement. Like Ruffle's GotoPlaceObject on rewind, a Place supplies defaults for the properties it does
 * not carry (identity matrix / color transform, ratio 0, normal blend, no bitmap cache) so that an instance kept
 * across a backward goto is reset exactly as a newly placed one would be. Name and clipDepth only apply at creation;
 * filters and visibility persist.
 */
function newPlacement(op: PlaceOp, id: number, f: number, order: number): PlacementState {
  const st: PlacementState = {
    charId: id, depth: op.depth, placeFrame: f, order, touched: T_MATRIX | T_CX | T_RATIO | T_BLEND | T_CACHE,
    m: IDENTITY_MAT, cx: IDENTITY_CX, ratio: 0, blend: 0, cacheAsBitmap: false,
  };
  if (op.name !== undefined) st.name = op.name;
  if (op.clipDepth !== undefined) { st.clipDepth = op.clipDepth; st.touched |= T_CLIP; }
  applyProps(st, op);
  return st;
}

function applyProps(st: PlacementState, op: PlaceOp): void {
  if (op.m) { st.m = op.m; st.touched |= T_MATRIX; }
  if (op.cx) { st.cx = op.cx; st.touched |= T_CX; }
  if (op.ratio !== undefined) { st.ratio = op.ratio; st.touched |= T_RATIO; }
  if (op.filters) { st.filters = op.filters; st.touched |= T_FILTERS; }
  if (op.blend !== undefined) { st.blend = op.blend; st.touched |= T_BLEND; }
  if (op.cacheAsBitmap !== undefined) { st.cacheAsBitmap = op.cacheAsBitmap; st.touched |= T_CACHE; }
}

/**
 * Replay frames [from, to] (1-based, inclusive) of `sprite` on `state` (mutated and returned).
 * `orderBase` seeds the creation order counter.
 */
export function replayFrames(sprite: SpriteDef, state: TimelineState, from: number, to: number, orderBase = 0): TimelineState {
  let order = orderBase;
  for (let f = from; f <= to; f++) {
    const frame = sprite.frames[f - 1];
    if (!frame) continue;
    for (const op of frame.ops) {
      if (op.op === 'remove') { state.delete(op.depth); continue; }
      const cur = state.get(op.depth);
      if (!op.move) {
        if (op.id === undefined) continue;
        state.set(op.depth, newPlacement(op, op.id, f, order++));
      } else if (cur) {
        if (op.id !== undefined && op.id !== cur.charId) { cur.charId = op.id; cur.touched |= T_CHAR; }
        applyProps(cur, op);
      } else if (op.id !== undefined) {
        // Move onto an empty depth with a character: Flash places it.
        state.set(op.depth, newPlacement(op, op.id, f, order++));
      }
    }
  }
  return state;
}

/** Resolve a goto target (1-based number or label) to a frame number in [1, frameCount], or null (bad label). */
export function resolveFrame(sprite: SpriteDef | null, frame: number | string, frameCount: number): number | null {
  if (typeof frame === 'string') {
    const n = Number(frame);
    if (frame.trim() !== '' && Number.isFinite(n)) return clampFrame(n, frameCount);
    if (!sprite) return null;
    const exact = sprite.labels[frame];
    if (exact !== undefined) return exact;
    const lower = frame.toLowerCase();
    for (const [k, v] of Object.entries(sprite.labels)) if (k.toLowerCase() === lower) return v;
    return null;
  }
  const n = Number(frame);
  if (!Number.isFinite(n)) return null;
  return clampFrame(n, frameCount);
}

function clampFrame(n: number, total: number): number {
  const i = Math.trunc(n);
  return Math.max(1, Math.min(Math.max(1, total), i));
}

/** Identity helpers for timeline matrices / color transforms. */
export const IDENTITY_MAT: Mat = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
export const IDENTITY_CX: CX = { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 };
