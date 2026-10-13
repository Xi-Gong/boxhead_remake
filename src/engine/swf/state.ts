/**
 * Shared mutable engine state of the display-list player (lane E): the active library, the AVM1-style action queue,
 * the clip execution list, mouse/focus state. One Player is active at a time (the last one constructed).
 *
 * ACTION MODEL (Flash Player 8 / Ruffle AVM1; construction order measured in Flash by oracle probe P11):
 *   - DoAction frame scripts, onEnterFrame handlers and onLoad events are QUEUED and run in FIFO order when the current
 *     script finishes (`runScript` at depth 0 drains the queue) or at the end of the enterFrame timeline phase.
 *   - Registered-class constructors (`ctor()`), parent FIRST: the clip created by attachMovie / duplicateMovieClip /
 *     createEmptyMovieClip is constructed synchronously inside that call; the constructors of everything a timeline
 *     placed (the new clip's children and grandchildren — pre-order, children by ascending depth — or the new children
 *     of a timeline advance / goto) go to `engine.pendingCtors` and are run by `flushConstructors()`:
 *       - at the end of the display-list call when it was made from a frame script or outside any script (timeline
 *         phase, tests);
 *       - when made from inside a constructor: after that constructor returns (by the outer call or running flush);
 *       - when made from an event handler (onEnterFrame, mouse events, onLoad...): right after the handler returns.
 *     Pending constructors always run before the next queued action. See DisplayObject.ts `constructObject`.
 *   - onLoad is queued when a clip's constructor has run (i.e. after the frame-1 scripts of its tree were queued:
 *     frame scripts children first, then onLoad parent first); for clips constructed during the enterFrame timeline
 *     phase the onLoad events are queued after all actions of that phase.
 *   - Event handlers run synchronously when the event is dispatched.
 *   - Actions queued for a clip that has been removed are dropped.
 */
import type { Library } from './Library.ts';
import type { DisplayObject, MovieClip, TextField } from './DisplayObject.ts';
import { reportScriptError } from './registry.ts';

/** What kind of script is running: a DoAction frame script, an event handler (or onLoad), a class constructor. */
export type ScriptKind = 'frame' | 'handler' | 'ctor';

interface QueuedAction { clip: DisplayObject; run: () => void; where: string; kind: ScriptKind }

export const engine = {
  library: null as Library | null,
  /** Root clip of the active player. */
  root: null as MovieClip | null,
  queue: [] as QueuedAction[],
  draining: false,
  scriptDepth: 0,
  /** Kinds of the scripts currently running (innermost last). */
  ctx: [] as ScriptKind[],
  /** Objects whose constructor (ctor() + onLoad queueing) is still to run, in construction order. */
  pendingCtors: [] as DisplayObject[],
  flushingCtors: false,
  /** True during the enterFrame timeline phase (onLoad of clips constructed there goes to loadQueue). */
  inAdvance: false,
  /** onLoad events of clips constructed during the timeline phase (appended to the queue after the phase). */
  loadQueue: [] as QueuedAction[],
  /** Runs one pending constructor (installed by DisplayObject.ts — avoids an import cycle). */
  ctorRunner: null as ((o: DisplayObject) => void) | null,
  /** All live MovieClips in instantiation order (newest last). enterFrame visits newest first (Ruffle exec list). */
  execList: [] as MovieClip[],
  execDirty: false,
  mouseX: 0,
  mouseY: 0,
  /** Focused input TextField. */
  focus: null as TextField | null,
  caretIndex: 0,
  caretT0: 0,
  /** Global `_quality` ("HIGH" | "LOW" | "BEST" | "MEDIUM"). */
  quality: 'HIGH',
  /** Counter for default instance names ("instance1"...). */
  instanceCounter: 1,
  /** Dev warnings already printed. */
  warned: new Set<string>(),
  stageWidth: 640,
  stageHeight: 480,
};

export function lib(): Library {
  if (!engine.library) throw new Error('[swf] no Library: create a Player first');
  return engine.library;
}

export function warnOnce(key: string, msg: string): void {
  if (engine.warned.has(key)) return;
  engine.warned.add(key);
  const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  if (dev !== false) console.warn(`[swf] ${msg}`);
}

/**
 * Run an EVENT HANDLER (mouse events, onChanged...) with AS2 error semantics. Constructors deferred by the handler run
 * right after it returns [ORACLE P11]; drains the queue at depth 0.
 */
export function runScript(fn: (this: any) => void, self: unknown, where: string): void {
  engine.scriptDepth++;
  engine.ctx.push('handler');
  try {
    fn.call(self);
  } catch (e) {
    reportScriptError(e, where);
  } finally {
    engine.ctx.pop();
    engine.scriptDepth--;
  }
  flushConstructors();
  if (engine.scriptDepth === 0) drainActions();
}

/** Queue an action: a frame script (kind 'frame', the default) or an event handler (kind 'handler'). */
export function queueAction(clip: DisplayObject, run: () => void, where: string, kind: ScriptKind = 'frame'): void {
  engine.queue.push({ clip, run, where, kind });
}

/** Queue a clip's onLoad event (deferred to the end of the timeline phase when constructed there) [ORACLE P11]. */
export function queueLoad(clip: MovieClip): void {
  const a: QueuedAction = {
    clip, where: 'onLoad', kind: 'handler',
    run: () => { const f = clip.onLoad; if (typeof f === 'function') f.call(clip); },
  };
  (engine.inAdvance ? engine.loadQueue : engine.queue).push(a);
}

/** End of the timeline phase: the deferred onLoad events go to the end of the action queue. */
export function releaseLoadQueue(): void {
  if (!engine.loadQueue.length) return;
  engine.queue.push(...engine.loadQueue);
  engine.loadQueue.length = 0;
}

/**
 * May the constructors deferred by the current display-list call run before it returns? Yes from a frame script or
 * from outside any script (engine timeline phase, tests); no from inside a constructor (the outer call / running flush
 * runs them after it) or an event handler (they run right after the handler) [ORACLE P11].
 */
export function canConstructNow(): boolean {
  const top = engine.ctx[engine.ctx.length - 1];
  return top === undefined || top === 'frame';
}

/** Run the pending constructors (FIFO; constructors may add more). Not re-entrant: a running flush picks them up. */
export function flushConstructors(): void {
  if (engine.flushingCtors || !engine.pendingCtors.length) return;
  const run = engine.ctorRunner;
  if (!run) return;
  engine.flushingCtors = true;
  try {
    const q = engine.pendingCtors;
    let i = 0;
    while (i < q.length) {
      const o = q[i++]!;
      run(o);
      if (i > 4096) { q.splice(0, i); i = 0; }
    }
    q.length = 0;
  } finally {
    engine.flushingCtors = false;
  }
}

/** Run queued actions until the queue is empty (actions may queue more). */
export function drainActions(): void {
  if (engine.draining || engine.scriptDepth > 0) return;
  engine.draining = true;
  try {
    flushConstructors();
    let i = 0;
    while (i < engine.queue.length) {
      const a = engine.queue[i++]!;
      if (a.clip.$removed) continue;
      engine.scriptDepth++;
      engine.ctx.push(a.kind);
      try {
        a.run();
      } catch (e) {
        reportScriptError(e, a.where);
      } finally {
        engine.ctx.pop();
        engine.scriptDepth--;
      }
      // constructors deferred by a handler run right after it, before the next queued action [ORACLE P11]
      flushConstructors();
      if (i > 4096) { engine.queue.splice(0, i); i = 0; }
    }
    engine.queue.length = 0;
  } finally {
    engine.draining = false;
  }
}

/** Reset all state (tests / new Player). */
export function resetEngine(library: Library | null): void {
  engine.library = library;
  engine.root = null;
  engine.queue.length = 0;
  engine.draining = false;
  engine.scriptDepth = 0;
  engine.ctx.length = 0;
  engine.pendingCtors.length = 0;
  engine.flushingCtors = false;
  engine.inAdvance = false;
  engine.loadQueue.length = 0;
  engine.execList.length = 0;
  engine.execDirty = false;
  engine.mouseX = 0;
  engine.mouseY = 0;
  engine.focus = null;
  engine.caretIndex = 0;
  engine.quality = 'HIGH';
  engine.instanceCounter = 1;
}
