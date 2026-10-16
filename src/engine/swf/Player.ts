/**
 * The display-list player: library loading, class/frame-script registries, enterFrame, mouse, rendering.
 * OWNER: lane E. This file is part of the contract used by src/main.ts and src/game.
 *
 * FRAME MODEL (one call of `enterFrame()` = one Flash enterFrame at 50 fps), following Ruffle's AVM1 model:
 *   1. Every live MovieClip is visited in REVERSE instantiation order (newest first — children before their
 *      parents, Ruffle's AVM1 "exec list"): its `onEnterFrame` is QUEUED, then, if it is playing, its timeline
 *      advances one frame (looping to frame 1 with a rebuild). Timeline advances place/remove children immediately
 *      (new clips are built and constructed synchronously, parent ctor() first — oracle P11), start the frame's
 *      sounds and QUEUE its DoAction.
 *   2. The onLoad events of the clips constructed in step 1 are appended to the queue (after all its actions).
 *   3. The action queue runs in FIFO order (onEnterFrame handlers and frame scripts interleaved per clip, actions of
 *      removed clips dropped). Actions queued while it runs are executed in the same pass. Constructors deferred by
 *      an onEnterFrame handler (e.g. the children of a clip it attached) run right after that handler.
 *   The very first call only executes frame 1 of the root (Flash's first frame has no enterFrame advance).
 *
 * MOUSE: `mouseMove/mouseDown/mouseUp` take stage (logical) coordinates. The topmost interactive object under the
 * pointer (button-mode MovieClip = one with any of onPress/onRelease/onReleaseOutside/onRollOver/onRollOut/
 * onDragOver/onDragOut, DefineButton2 instance, or input TextField) receives onRollOver/onRollOut/onPress/
 * onRelease/onReleaseOutside/onDragOut/onDragOver with Flash rules (while pressed, only the pressed object gets
 * drag events). Disabled (`enabled = false`) objects still block the objects below but receive no events.
 * After the button events, `onMouseDown/onMouseUp/onMouseMove` are broadcast to every clip defining them and to the
 * AS2 `Mouse` listeners (Mouse._dispatch) — the platform must NOT dispatch Mouse listeners separately.
 */
import type { LibraryJson } from '../../shared/assetSchema.ts';
import { Mouse } from '../flash/input.ts';
import {
  Button, DisplayObject, MovieClip, TextField, buildFirstFrame, createRootClip, listHasMask, siblingMaskOf,
} from './DisplayObject.ts';
import { Library } from './Library.ts';
import { drainActions, engine, flushConstructors, queueAction, releaseLoadQueue, resetEngine, runScript } from './state.ts';
import { getButtonActionHandler, reportScriptError } from './registry.ts';
import { renderStage } from './render/renderer.ts';
import { applyStageLayout } from './stageLayout.ts';

export { Library } from './Library.ts';
export {
  registerClass, getRegisteredClass, registerFrameScript, getFrameScript, setInstanceHook, getInstanceHook,
  setTimelineSoundHandler, getTimelineSoundHandler, setButtonActionHandler, setScriptErrorHandler,
  clearRegisteredClasses, clearFrameScripts,
} from './registry.ts';
export type { MovieClipClass, FrameScript, InstanceHook, TimelineSoundHandler, ButtonActionHandler } from './registry.ts';

/** Root clip (AS2 `_root`). Live ES binding: set when a Player is created. */
// eslint-disable-next-line import/no-mutable-exports
export let _root: MovieClip = undefined as unknown as MovieClip;
export function setRoot(mc: MovieClip): void { _root = mc; }

/** `_root._quality` equivalent lives on the root clip; this is the engine-side mirror ("HIGH" | "LOW" | "BEST" ...). */
export function getQuality(): string { return engine.quality; }

export interface PlayerOptions {
  /** Device pixels per logical pixel for cached rasterisation (1 or 2). */
  renderScale: number;
  stageWidth?: number;
  stageHeight?: number;
}

type Interactive = MovieClip | Button | TextField;

/** Button condition bits (SWF ButtonCondAction). */
const COND = { rollOver: 1, rollOut: 2, press: 4, release: 8, dragOut: 16, dragOver: 32, releaseOutside: 64 } as const;

export class Player {
  readonly library: Library;
  readonly options: PlayerOptions;
  private readonly rootClip: MovieClip;
  private started = false;
  private hovered: Interactive | null = null;
  private pressed: Interactive | null = null;
  private mouseIsDown = false;
  private cursorName = 'default';
  /** Number of enterFrame calls processed. */
  frameCount = 0;

  constructor(library: Library, options: PlayerOptions) {
    this.library = library;
    this.options = options;
    resetEngine(library);
    engine.stageWidth = options.stageWidth ?? library.json.stage.w;
    engine.stageHeight = options.stageHeight ?? library.json.stage.h;
    this.rootClip = createRootClip(library.json.root);
    engine.root = this.rootClip;
    setRoot(this.rootClip);
  }

  /** Node/tests: build a player straight from parsed JSON. */
  static fromJson(json: LibraryJson, options: PlayerOptions = { renderScale: 1 }): Player {
    return new Player(new Library(json), options);
  }

  /** The root MovieClip (built from library.root; plays from frame 1). */
  get root(): MovieClip { return this.rootClip; }

  /**
   * One Flash enterFrame: advance playing timelines (place/remove ops, StartSound), run queued constructors and
   * frame scripts, then dispatch onEnterFrame handlers (Ruffle/Flash 8 order — see the file header).
   */
  enterFrame(): void {
    this.frameCount++;
    if (!this.started) {
      this.started = true;
      buildFirstFrame(this.rootClip);
      drainActions();
      this.updateHover();
      return;
    }
    engine.scriptDepth++;
    engine.inAdvance = true;
    try {
      const list = engine.execList;
      for (let i = list.length - 1; i >= 0; i--) {
        const mc = list[i]!;
        if (mc.$removed) continue;
        queueAction(mc, () => {
          const f = mc.onEnterFrame;
          if (typeof f === 'function') f.call(mc);
        }, 'onEnterFrame', 'handler');
        if (mc.$playing && mc.$total > 1) {
          try { mc.$advance(); } catch (e) { reportScriptError(e, `timeline of ${mc.$spriteId}`); }
        }
      }
    } finally {
      engine.inAdvance = false;
      engine.scriptDepth--;
    }
    // [ORACLE P11] onLoad of clips constructed during the timeline phase runs after all actions of the phase
    releaseLoadQueue();
    compactExecList();
    drainActions();
    compactExecList();
    this.updateHover();
  }

  /** Run queued actions now (tests / tools that call display-list APIs outside enterFrame). */
  flushActions(): void { drainActions(); }

  /**
   * DYNAMIC_VIEWPORT: set the live stage size (>= the authored 640x480; the platform Presenter derives it from the
   * window). Writes the engine state (render bg, mouse bounds) and takes effect for rendering in the next
   * render(), which re-applies the root stage layout (content centred, masks stretched).
   */
  setStageSize(stageW: number, stageH: number): void {
    engine.stageWidth = stageW;
    engine.stageHeight = stageH;
  }

  /** Render the stage (live size, >= 640x480 logical) into ctx; ctx transform must map logical px -> device px. */
  render(ctx: CanvasRenderingContext2D, deviceScale: number): void {
    applyStageLayout(this.rootClip, engine.stageWidth, engine.stageHeight);
    const bg = this.library.json.stage.bg;
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    ctx.fillRect(0, 0, engine.stageWidth, engine.stageHeight);
    renderStage(this.rootClip, ctx, deviceScale);
  }

  /** Mouse input in stage (logical) coordinates. */
  mouseMove(x: number, y: number): void {
    engine.mouseX = x;
    engine.mouseY = y;
    this.updateHover();
    this.broadcast('onMouseMove');
  }

  mouseDown(): void {
    this.mouseIsDown = true;
    const t = this.pick();
    this.hovered = t;
    // text focus
    if (t instanceof TextField && t.$type === 'input' && t.$selectable) {
      engine.focus = t;
      const [lx, ly] = localPoint(t, engine.mouseX, engine.mouseY);
      engine.caretIndex = t.$indexAt(lx, ly);
      engine.caretT0 = now();
      t.$inv();
    } else if (engine.focus) {
      const f = engine.focus;
      engine.focus = null;
      f.$inv();
    }
    if (t && !(t instanceof TextField) && isEnabled(t)) {
      this.pressed = t;
      if (t instanceof Button) t.$setState('down');
      this.fire(t, 'onPress', COND.press);
    }
    this.updateCursor();
    this.broadcast('onMouseDown');
  }

  mouseUp(): void {
    this.mouseIsDown = false;
    const p = this.pressed;
    this.pressed = null;
    const t = this.pick();
    if (p && !p.$removed) {
      if (t === p) {
        if (p instanceof Button) p.$setState('over');
        this.fire(p, 'onRelease', COND.release);
        this.hovered = p;
      } else {
        if (p instanceof Button) p.$setState('up');
        this.fire(p, 'onReleaseOutside', COND.releaseOutside);
        this.hovered = null;
      }
    }
    this.updateHover();
    this.broadcast('onMouseUp');
  }

  /** CSS cursor to show ('pointer' over enabled buttons with useHandCursor). */
  get cursor(): string { return this.cursorName; }

  /**
   * Text input for focused input TextFields (returns true if consumed). Handles printable characters (e.key of
   * length 1), Backspace, Delete, ArrowLeft/Right, Home, End. Key listeners (AS2 `Key`) are not affected — like
   * Flash, the platform may still feed the key to `Key`.
   */
  keyInput(e: { key: string; keyCode: number; type: 'down' | 'up' }): boolean {
    const tf = engine.focus;
    if (!tf || tf.$removed || tf.$type !== 'input') return false;
    if (e.type !== 'down') return false;
    const text = tf.text;
    let changed = false;
    let handled = true;
    switch (e.key) {
      case 'Backspace':
        if (engine.caretIndex > 0) { tf.$deleteRange(engine.caretIndex - 1, engine.caretIndex); changed = true; }
        break;
      case 'Delete':
        if (engine.caretIndex < text.length) { tf.$deleteRange(engine.caretIndex, engine.caretIndex + 1); changed = true; }
        break;
      case 'ArrowLeft': engine.caretIndex = Math.max(0, engine.caretIndex - 1); break;
      case 'ArrowRight': engine.caretIndex = Math.min(text.length, engine.caretIndex + 1); break;
      case 'Home': case 'ArrowUp': engine.caretIndex = 0; break;
      case 'End': case 'ArrowDown': engine.caretIndex = text.length; break;
      case 'Enter':
        if (tf.$multiline) { tf.$insert('\r'); changed = true; }
        break;
      default:
        if (e.key.length === 1) {
          const before = tf.text;
          tf.$insert(e.key);
          changed = tf.text !== before;
        } else handled = false;
    }
    engine.caretT0 = now();
    tf.$inv();
    if (changed && typeof tf.onChanged === 'function') runScript(tf.onChanged, tf, 'onChanged');
    return handled;
  }

  // ------------------------------------------------------------------ internals

  private fire(o: Interactive, name: string, cond: number): void {
    const f = o[name];
    if (typeof f === 'function') runScript(f, o, name);
    if (o instanceof Button) {
      const h = getButtonActionHandler();
      const refs = o.$def.actions;
      if (h && refs) {
        for (const idx of refs) {
          const ref = this.library.json.actions[idx] as { cond?: number } | undefined;
          if (ref && ref.cond !== undefined && (ref.cond & cond)) {
            try { h(o, o.$charId, idx, cond); } catch (e) { reportScriptError(e, `button action ${o.$charId}`); }
          }
        }
        drainActions();
      }
    }
  }

  private updateHover(): void {
    const t = this.pick();
    if (t !== this.hovered) {
      const old = this.hovered;
      if (this.mouseIsDown && this.pressed) {
        const p = this.pressed;
        if (old === p && t !== p) {
          if (p instanceof Button) p.$setState('over');
          if (!p.$removed) this.fire(p, 'onDragOut', COND.dragOut);
        } else if (t === p && old !== p) {
          if (p instanceof Button) p.$setState('down');
          this.fire(p, 'onDragOver', COND.dragOver);
        }
        this.hovered = t;
      } else {
        this.hovered = t;
        if (old && !old.$removed && isEnabled(old) && !(old instanceof TextField)) {
          if (old instanceof Button) old.$setState('up');
          this.fire(old, 'onRollOut', COND.rollOut);
        }
        if (t && isEnabled(t) && !(t instanceof TextField)) {
          if (t instanceof Button) t.$setState('over');
          this.fire(t, 'onRollOver', COND.rollOver);
        }
      }
    }
    this.updateCursor();
  }

  private updateCursor(): void {
    const t = this.hovered;
    if (!t || t.$removed) this.cursorName = 'default';
    else if (t instanceof TextField) this.cursorName = 'text';
    else this.cursorName = isEnabled(t) && t.useHandCursor !== false && asBoolish(t.useHandCursor) ? 'pointer' : 'default';
  }

  private broadcast(ev: 'onMouseDown' | 'onMouseUp' | 'onMouseMove'): void {
    const list = engine.execList.slice();
    for (const mc of list) {
      if (mc.$removed) continue;
      const f = mc[ev];
      if (typeof f === 'function') runScript(f, mc, ev);
    }
    engine.scriptDepth++;
    engine.ctx.push('handler');
    try {
      Mouse._dispatch(ev);
    } catch (e) {
      reportScriptError(e, `Mouse.${ev}`);
    } finally {
      engine.ctx.pop();
      engine.scriptDepth--;
    }
    flushConstructors();
    drainActions();
  }

  /** Topmost interactive object under the mouse. */
  private pick(): Interactive | null {
    return pickIn(this.rootClip, engine.mouseX, engine.mouseY);
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);
const asBoolish = (v: unknown): boolean => v === undefined || !!v;

function isEnabled(o: Interactive): boolean {
  return (o as { enabled?: unknown }).enabled !== false && (o as { enabled?: unknown }).enabled !== 0;
}

function localPoint(o: DisplayObject, gx: number, gy: number): [number, number] {
  const pt = { x: gx, y: gy };
  o.globalToLocal(pt);
  return [pt.x, pt.y];
}

/** Mouse picking (Ruffle mouse_pick_avm1): topmost first; button-mode clips capture their whole content. */
export function pickIn(mc: MovieClip, gx: number, gy: number): Interactive | null {
  const list = mc.$list;
  const anyMask = listHasMask(list);
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]!;
    if (!c.$visible || c.$clipDepth > 0 || c.$maskOf) continue;
    const mask = siblingMaskOf(list, i, anyMask);
    if (mask && !mask.$hitGlobal(gx, gy, false)) continue;
    if (c.$maskedBy && !c.$maskedBy.$hitGlobal(gx, gy, false)) continue;
    if (c instanceof MovieClip) {
      if (c.$isButtonMode()) {
        const ha = c.hitArea;
        const hit = ha instanceof DisplayObject ? ha.$hitGlobal(gx, gy, false) : c.$hitGlobal(gx, gy, true);
        if (hit) return c;
        continue;
      }
      const r = pickIn(c, gx, gy);
      if (r) return r;
    } else if (c instanceof Button) {
      if (c.$hitGlobal(gx, gy, true)) return c;
    } else if (c instanceof TextField) {
      // Lane X1: a non-selectable field (e.g. the debrief name after SEND SCORE: selectable = false) takes no mouse
      // focus and shows no I-beam in Flash; the mouse passes through it.
      if (c.$type === 'input' && c.$selectable && c.$hitGlobal(gx, gy, true)) return c;
    }
  }
  return null;
}

function compactExecList(): void {
  if (!engine.execDirty) return;
  engine.execDirty = false;
  const list = engine.execList;
  let w = 0;
  for (let r = 0; r < list.length; r++) { const mc = list[r]!; if (!mc.$removed) list[w++] = mc; }
  list.length = w;
}
