/**
 * AS2 Key and Mouse globals.                                   OWNER: lane D (platform)
 *
 * Key codes are Flash/Windows virtual key codes (same as DOM KeyboardEvent.keyCode in Chromium on Windows:
 * arrows 37-40, A-Z 65-90, 0-9 48-57, Space 32, ',' 188, '.' 190, '/' 191, P 80, Esc 27, numpad 96-111 ...).
 * The platform keyboard (engine/platform/Keyboard.ts) feeds DOM events into `Key._down/_up`; the platform mouse
 * (engine/platform/Pointer.ts) calls `Mouse._dispatch`.
 *
 * Flash semantics kept:
 *   - Key events are broadcast between frames, as they arrive (not queued to the next enterFrame).
 *   - Auto-repeat calls onKeyDown again (no onKeyUp in between).
 *   - getCode()/getAscii() return the key of the most recent key event (down OR up).
 *   - Listener broadcast = AsBroadcaster.broadcastMessage: the listener COUNT is captured when the broadcast starts and
 *     the live array is indexed (a listener that removes itself makes the next one shift into its slot and be skipped,
 *     exactly like Flash/Ruffle). addListener never adds duplicates.
 *   - Losing focus releases every key without events (Key._clear()).
 */

export interface KeyListener { onKeyDown?: () => void; onKeyUp?: () => void; [k: string]: any }
export interface MouseListener {
  onMouseDown?: () => void; onMouseUp?: () => void; onMouseMove?: () => void;
  onMouseWheel?: (delta: number, scrollTarget?: unknown) => void;
  [k: string]: any;
}

const down = new Set<number>();
const toggled = new Map<number, boolean>();
let lastCode = 0;
let lastAscii = 0;
const keyListeners: KeyListener[] = [];
const mouseListeners: MouseListener[] = [];
let mouseVisible = true;

/** AsBroadcaster.broadcastMessage semantics (count captured, live indexing). */
function broadcast(list: Array<Record<string, any>>, method: string, args: unknown[] = []): void {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const l = list[i];
    if (l == null) continue;
    const fn = l[method];
    if (typeof fn === 'function') fn.apply(l, args);
  }
}

function addTo<T>(list: T[], l: T): boolean {
  if (l == null) return false;
  if (!list.includes(l)) list.push(l);
  return true;
}

function removeFrom<T>(list: T[], l: T): boolean {
  const i = list.indexOf(l);
  if (i >= 0) list.splice(i, 1);
  return i >= 0;
}

export const Key = {
  BACKSPACE: 8, CAPSLOCK: 20, CONTROL: 17, DELETEKEY: 46, DOWN: 40, END: 35, ENTER: 13, ESCAPE: 27, HOME: 36,
  INSERT: 45, LEFT: 37, PGDN: 34, PGUP: 33, RIGHT: 39, SHIFT: 16, SPACE: 32, TAB: 9, UP: 38,
  isDown(code: number): boolean { return down.has(code); },
  /** AS2 Key.isToggled (Caps Lock 20 / Num Lock 144 / Scroll Lock 145). */
  isToggled(code: number): boolean { return toggled.get(code) ?? false; },
  getCode(): number { return lastCode; },
  getAscii(): number { return lastAscii; },
  addListener(l: KeyListener): boolean { return addTo(keyListeners, l); },
  removeListener(l: KeyListener): boolean { return removeFrom(keyListeners, l); },
  /** Platform: a key went down (auto-repeat also calls this, like Flash). */
  _down(code: number, ascii = 0): void {
    lastCode = code; lastAscii = ascii;
    down.add(code);
    broadcast(keyListeners, 'onKeyDown');
  },
  /** Platform: a key went up. */
  _up(code: number, ascii = 0): void {
    lastCode = code; lastAscii = ascii;
    down.delete(code);
    broadcast(keyListeners, 'onKeyUp');
  },
  /** Platform: lock-key state from the OS (KeyboardEvent.getModifierState). */
  _setToggled(code: number, on: boolean): void { toggled.set(code, on); },
  /** Platform: window lost focus — release everything (no events, like Flash losing focus). */
  _clear(): void { down.clear(); },
  /** Tests: forget listeners and state. */
  _reset(): void { down.clear(); toggled.clear(); keyListeners.length = 0; lastCode = 0; lastAscii = 0; },
};

export const Mouse = {
  addListener(l: MouseListener): boolean { return addTo(mouseListeners, l); },
  removeListener(l: MouseListener): boolean { return removeFrom(mouseListeners, l); },
  /** Returns 1 if the pointer was visible before the call, 0 if it was hidden (AS2 docs). */
  show(): number { const was = mouseVisible ? 1 : 0; mouseVisible = true; return was; },
  hide(): number { const was = mouseVisible ? 1 : 0; mouseVisible = false; return was; },
  /** Platform: true when AS2 code hid the pointer (Presenter shows cursor: none over the stage). */
  get _visible(): boolean { return mouseVisible; },
  _dispatch(ev: 'onMouseDown' | 'onMouseUp' | 'onMouseMove'): void { broadcast(mouseListeners, ev); },
  /** Platform: wheel notch(es); Flash passes +3 per notch away from the user on Windows. */
  _dispatchWheel(delta: number, scrollTarget?: unknown): void { broadcast(mouseListeners, 'onMouseWheel', [delta, scrollTarget]); },
  /** Tests: forget listeners and state. */
  _reset(): void { mouseListeners.length = 0; mouseVisible = true; },
};
