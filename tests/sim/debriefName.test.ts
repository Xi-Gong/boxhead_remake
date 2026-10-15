// Deviation DEBRIEF_NAME_IME_INPUT (v0.1.8): the debrief name field is a canvas SWF input TextField whose raw
// keydown path drops IME input entirely (zh-CN users could not type AT ALL), and needs click-to-focus. A transparent
// DOM input now sits over the field as the typing / focus / IME conduit (the LAN IP box pattern): the canvas keeps
// rendering text + caret, every `input` event syncs el.value -> mUsername.text, and the gamepad's A press focuses
// DOM text widgets natively (the pad synthesizes engine mouse events, not DOM events).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../../src/engine/swf/state.ts';
import { debriefNameInput, initDebriefDom, installDebriefNameInput } from '../../src/game/local/DebriefName.ts';
import { installGamepad } from '../../src/game/local/Gamepad.ts';
import { createHeadlessGame, type HeadlessGame } from './harness.ts';

/** Minimal element: style, children/parentNode, listeners, focus/blur/value/selection, rect, remove. */
class ShimEl {
  style: Record<string, string> = {};
  children: ShimEl[] = [];
  parentNode: ShimEl | null = null;
  listeners = new Map<string, Set<(e?: unknown) => void>>();
  tagName = 'INPUT';
  value = '';
  type = '';
  disabled = false;
  removed = false;
  focusCalls = 0;
  blurCalls = 0;
  selectionStart = 0;
  maxLength: number | undefined = undefined;
  appendChild(c: ShimEl): ShimEl { c.parentNode = this; this.children.push(c); return c; }
  addEventListener(t: string, fn: (e?: unknown) => void): void { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t)!.add(fn); }
  fire(t: string): void { for (const fn of this.listeners.get(t) ?? []) fn({}); }
  focus(): void { this.focusCalls++; }
  blur(): void { this.blurCalls++; }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return { left: 0, top: 0, width: 1280, height: 720 }; }
  remove(): void {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
    this.removed = true;
  }
}

interface PadSpec { axes?: number[]; pressed?: number[] }
const mkPad = (spec: PadSpec, index: number) => ({
  index,
  connected: true,
  axes: spec.axes ?? [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (spec.pressed ?? []).includes(i) })),
});
function fakePads() {
  const pads: (ReturnType<typeof mkPad> | null)[] = [null, null];
  return {
    provider: () => pads,
    set(slot: 0 | 1, spec: PadSpec | null): void { pads[slot] = spec ? mkPad(spec, slot) : null; },
  };
}

/** Full DOM stub for the debrief overlay: stage, createElement, elementFromPoint, activeElement. */
function makeDom(): {
  stage: ShimEl;
  inputs: ShimEl[];
  presenter: { logicalToClient: (x: number, y: number) => { x: number; y: number } };
  setHit(fn: (x: number, y: number) => ShimEl | null): void;
} {
  const stage = new ShimEl();
  stage.tagName = 'DIV';
  const inputs: ShimEl[] = [];
  let hitFn: (x: number, y: number) => ShimEl | null = () => null;
  vi.stubGlobal('document', {
    createElement: () => { const el = new ShimEl(); inputs.push(el); return el; },
    elementFromPoint: (x: number, y: number) => hitFn(x, y),
    get activeElement(): ShimEl | null { return hitFn(0, 0); },
  });
  const resizeFns: (() => void)[] = [];
  const presenter = {
    logicalToClient: (x: number, y: number) => ({ x, y }),
    onResize: (fn: () => void) => { resizeFns.push(fn); return () => { const i = resizeFns.indexOf(fn); if (i >= 0) resizeFns.splice(i, 1); }; },
  };
  initDebriefDom(presenter as never, stage as unknown as HTMLElement);
  return { stage, inputs, presenter, setHit: (fn) => { hitFn = fn; } };
}

/** Drives a real headless game to the debrief screen (pause -> QUIT). */
function toDebrief(): { g: HeadlessGame; screen: any } {
  const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 11 });
  g.quit();
  if (!g.waitScreen('State_Debrief', 'Screen_Debrief', 600)) throw new Error('never reached State_Debrief');
  const screen = g.main().mcScreen;
  expect(screen?.mUsername).toBeTruthy();
  return { g, screen };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('debrief name input overlay (v0.1.8)', () => {
  it('builds over the field, takes the placeholder verbatim, and syncs typing into mUsername (format preserved)', () => {
    const dom = makeDom();
    const { g, screen } = toDebrief();
    const input = debriefNameInput(screen) as unknown as ShimEl;
    expect(input).toBeTruthy();
    expect(dom.stage.children.includes(input)).toBe(true);
    expect(input.value).toBe('<Enter name>'); // the canvas placeholder UX, verbatim
    expect(input.maxLength).toBe(10); // the field's maxChars
    expect(input.style.display).not.toBe('none'); // placed

    // Typing syncs Latin...
    input.value = 'ROY';
    input.fire('input');
    expect(screen.mUsername.text).toBe('ROY');
    // ...and CJK (the IME path the raw-keydown engine dropped), live on every input event.
    input.value = '王roy';
    input.fire('input');
    expect(screen.mUsername.text).toBe('王roy');
    // The plain .text setter resets spans to the field's new-text format - the overlay snapshots the rendered
    // format first (setNewTextFormat(getTextFormat())) so the look does not change when text syncs.
    const fmt0 = screen.mUsername.getTextFormat();
    input.value = 'X';
    input.fire('input');
    expect(screen.mUsername.getTextFormat().letterSpacing).toBe(fmt0.letterSpacing);
    expect(screen.mUsername.getTextFormat().size).toBe(fmt0.size);

    // Focus drives the canvas caret (engine.focus), blur releases it.
    input.fire('focus');
    expect(engine.focus).toBe(screen.mUsername);
    input.fire('blur');
    expect(engine.focus).toBeNull();
    expect(g.errors).toEqual([]);
  });

  it('DisableSubmitScore also disables the DOM input; onUnload tears it down; a rebuild leaves exactly one', () => {
    const dom = makeDom();
    const { g, screen } = toDebrief();
    const input = debriefNameInput(screen) as unknown as ShimEl;
    expect(input.disabled).toBe(false);
    screen.DisableSubmitScore(); // ineligible run / after a successful submit
    expect(input.disabled).toBe(true);
    expect(input.blurCalls).toBe(1);

    screen.onUnload(); // the screen system's removeMovieClip path (Dispose is dead code)
    expect(input.removed).toBe(true);
    expect(dom.stage.children.length).toBe(0);
    expect(debriefNameInput(screen)).toBeUndefined();

    // A rebuilt screen (fresh ctor) carries exactly one input.
    installDebriefNameInput(screen);
    expect(dom.stage.children.length).toBe(1);
    expect(g.errors).toEqual([]);
  });
});

describe('gamepad A-press DOM text bridge (v0.1.8)', () => {
  it('A over a DOM text widget focuses it natively (no engine mouseDown); A elsewhere takes the engine path', () => {
    const dom = makeDom();
    const { g, screen } = toDebrief();
    const input = debriefNameInput(screen) as unknown as ShimEl;
    dom.setHit(() => input); // the pad cursor is over the name input
    const pads = fakePads();
    let mouseDowns = 0;
    const origDown = g.player.mouseDown.bind(g.player);
    (g.player as any).mouseDown = () => { mouseDowns++; origDown(); };
    const gp = installGamepad({ player: g.player, provider: pads.provider, presenter: dom.presenter });

    pads.set(0, { pressed: [0] }); // A down over the input
    gp.poll(false);
    expect(input.focusCalls).toBe(1);
    expect(mouseDowns).toBe(0); // the engine click must NOT also fire under the input
    pads.set(0, {}); // A up
    gp.poll(false);

    dom.setHit(() => null); // cursor elsewhere: normal engine click
    pads.set(0, { pressed: [0] });
    gp.poll(false);
    expect(mouseDowns).toBe(1);
    pads.set(0, {});
    gp.poll(false);
    gp.dispose();
    expect(g.errors).toEqual([]);
  });
});
