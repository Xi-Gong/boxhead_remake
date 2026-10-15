// Debrief name entry (deviation DEBRIEF_NAME_IME_INPUT, v0.1.8). The name field on Screen_Debrief is a canvas SWF
// input TextField: its raw-keydown path (Pointer click -> engine.focus -> Keyboard -> TextField.$insert) works for
// plain ASCII but DROPS IME input entirely (zh-CN users could not type anything), and the gamepad's A press cannot
// focus DOM widgets. A transparent DOM <input> now sits over the field as the typing / focus / IME conduit - the
// proven LAN IP box pattern (Net/Lobby.ts): glued to the field's logical rect via presenter.onResize, cleaned up on
// the screen's onUnload. The canvas keeps rendering text + blinking caret (FlashType 1:1); every `input` event
// syncs el.value -> mUsername.text (input fires during IME composition too, so committed CJK appears live - the
// glyphs themselves render through the EMBEDDED_FONT_CJK_FALLBACK device-font path).
//
// Page wiring: main.ts calls initDebriefDom(presenter, stage) once; scope.ts's CScreen_Debrief ctor wrapper calls
// installDebriefNameInput(screen) per screen build (nothing is built headless: no document, no overlay).
import { engine } from '../../engine/swf/state.ts';
import type { TextField } from '../../engine/swf/DisplayObject.ts';
import type { Presenter } from '../../engine/platform/Presenter.ts';

/** Page-wide DOM handles (main.ts). Absent headless / before boot -> the overlay never builds. */
let presenter: Presenter | undefined;
let stage: HTMLElement | undefined;

export function initDebriefDom(p: Presenter, s: HTMLElement): void {
  presenter = p;
  stage = s;
}

const inputs = new WeakMap<object, HTMLInputElement>();
const teardowns = new WeakMap<object, () => void>();

/** The overlay input of a debrief screen instance (tests / DisableSubmitScore / the SEND placeholder focus). */
export function debriefNameInput(screen: object): HTMLInputElement | undefined {
  return inputs.get(screen);
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

/** Builds the transparent DOM input over the screen's mUsername field. No-op without a page DOM. */
export function installDebriefNameInput(screen: any): void {
  if (typeof document === 'undefined' || !presenter || !stage || !screen?.mUsername) return;
  teardowns.get(screen)?.(); // a rebuilt instance never carries two inputs

  const tf = screen.mUsername as TextField;
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = (tf as any).maxChars ?? 10;
  // Fully invisible conduit: the canvas field draws the text and the blinking caret (engine.focus + caretIndex).
  // display:none until the first place() has positioned it (the LAN IP box's no-flash lesson).
  input.style.cssText = 'position:absolute;display:none;box-sizing:border-box;background:transparent;border:none;'
    + 'outline:none;padding:0;margin:0;color:transparent;caret-color:transparent;text-align:center;'
    + 'font-family:Arial,sans-serif;z-index:7';
  // The plain .text setter resets spans to the field's NEW text format - snapshot the currently rendered format
  // first so syncing does not change how the text looks (letterSpacing/kerning/size of the placeholder stays).
  tf.setNewTextFormat(tf.getTextFormat());
  input.value = String(tf.text ?? '');

  const apply = (): void => {
    if (input.value !== String(tf.text)) tf.text = input.value;
    engine.focus = tf; // the canvas caret blinks while the conduit holds the DOM focus
    engine.caretIndex = input.selectionStart ?? input.value.length;
    engine.caretT0 = now();
  };
  const syncCaret = (): void => {
    engine.caretIndex = input.selectionStart ?? input.value.length;
    engine.caretT0 = now();
  };
  input.addEventListener('input', apply);
  for (const t of ['keyup', 'click', 'select'] as const) input.addEventListener(t, syncCaret);
  input.addEventListener('focus', () => { engine.focus = tf; engine.caretT0 = now(); });
  input.addEventListener('blur', () => { if (engine.focus === tf) engine.focus = null; });
  input.addEventListener('keydown', (e) => e.stopPropagation()); // the widget owns its keys (Lobby IP pattern)

  stage.appendChild(input);
  const place = (): void => {
    const b = tf.getBounds(engine.root as never);
    if (!b || !(b.xMax < 100000)) return;
    const a = presenter!.logicalToClient(b.xMin, b.yMin);
    const c = presenter!.logicalToClient(b.xMax, b.yMax);
    const s = stage!.getBoundingClientRect();
    input.style.left = `${a.x - s.left}px`;
    input.style.top = `${a.y - s.top}px`;
    input.style.width = `${Math.max(40, c.x - a.x)}px`;
    input.style.height = `${Math.max(12, c.y - a.y)}px`;
    input.style.fontSize = `${Math.max(9, Math.round((c.y - a.y) * 0.55))}px`;
    input.style.display = 'block';
  };
  const unresize = presenter.onResize(place);
  place();

  inputs.set(screen, input);
  teardowns.set(screen, () => {
    unresize();
    input.remove();
    if (engine.focus === tf) engine.focus = null;
    inputs.delete(screen);
    teardowns.delete(screen);
  });
  // The screen system removes replaced screens with removeMovieClip (CScreen.Dispose is never called, v0.1.6):
  // DOM cleanup must ride the clip's onUnload like the LAN screens'.
  (screen as any).onUnload = (): void => teardowns.get(screen)?.();
}
