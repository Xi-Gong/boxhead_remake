/**
 * DOM keyboard -> AS2 Key (Flash/Windows virtual key codes).          OWNER: lane D (platform)
 *
 *     const detach = attachKeyboard({ player, isBlocked: () => menu.isOpen });
 *
 * - keydown/keyup -> Key._down/_up(vk, ascii). Auto-repeat keydowns also call Key._down (Flash repeats onKeyDown).
 * - When an input TextField has focus, `player.keyInput()` sees the key first (returns true if it consumed it).
 *   Key listeners are still notified afterwards, exactly like Flash (Key events are global, focus-independent).
 * - preventDefault for every key except F1..F24, Alt/Meta combos and Ctrl combos (browser/OS shortcuts keep working;
 *   Electron has no application menu, so nothing else steals keys).
 * - Alt+Enter toggles fullscreen in a browser (Electron handles F11/Alt+Enter in the main process).
 * - window blur / tab hidden -> Key._clear() (releases everything without events, like Flash losing focus).
 */
import { Key } from '../flash/input.ts';
import { isElectron, toggleFullscreen } from './desktop.ts';

export interface KeyEventLike {
  keyCode: number;
  code: string;
  key: string;
}

/** Physical key (KeyboardEvent.code) -> Windows virtual key code (US layout), used when keyCode is 0/229. */
export const CODE_TO_VK: Readonly<Record<string, number>> = (() => {
  const t: Record<string, number> = {
    Backspace: 8, Tab: 9, Enter: 13, NumpadEnter: 13, ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
    AltLeft: 18, AltRight: 18, Pause: 19, CapsLock: 20, Escape: 27, Space: 32, PageUp: 33, PageDown: 34, End: 35,
    Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, PrintScreen: 44, Insert: 45, Delete: 46,
    MetaLeft: 91, MetaRight: 92, ContextMenu: 93, NumpadMultiply: 106, NumpadAdd: 107, NumpadComma: 108,
    NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111, NumLock: 144, ScrollLock: 145,
    Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
    BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, IntlBackslash: 226, NumpadEqual: 187,
  };
  for (let i = 0; i < 26; i++) t[`Key${String.fromCharCode(65 + i)}`] = 65 + i;
  for (let i = 0; i < 10; i++) { t[`Digit${i}`] = 48 + i; t[`Numpad${i}`] = 96 + i; }
  for (let i = 1; i <= 24; i++) t[`F${i}`] = 111 + i;
  return t;
})();

/** Non-Windows-VK keyCodes some browsers (Gecko) report -> Windows VK. Chromium on Windows already reports VK. */
const KEYCODE_FIXUPS: Readonly<Record<number, number>> = {
  59: 186, // ';' (Gecko)
  61: 187, // '=' (Gecko)
  173: 189, // '-' (Gecko)
  224: 91, // Meta (Gecko on macOS)
};

/** Flash Key.getCode() value for a DOM key event (Windows virtual key code, layout-dependent like Flash on Windows). */
export function flashKeyCode(e: KeyEventLike): number {
  let kc = e.keyCode | 0;
  if (kc === 0 || kc === 229) kc = CODE_TO_VK[e.code] ?? 0; // unidentified / IME composition
  return KEYCODE_FIXUPS[kc] ?? kc;
}

const NAMED_ASCII: Readonly<Record<string, number>> = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 127 };

/** Flash Key.getAscii() value: the character produced by the key (0 for non-character keys). */
export function flashAscii(e: Pick<KeyEventLike, 'key'>): number {
  const k = e.key;
  if (typeof k !== 'string' || k.length === 0) return 0;
  if ([...k].length === 1) return k.codePointAt(0) ?? 0;
  return NAMED_ASCII[k] ?? 0;
}

/** Whether the browser default action should be suppressed (pure; tested). */
export function shouldPreventDefault(e: KeyEventLike & { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  const vk = flashKeyCode(e);
  if (vk >= 112 && vk <= 135) return false; // F1..F24 (F5 reload, F11 fullscreen, F12 devtools)
  if (e.altKey || e.metaKey) return false; // Alt+F4, Alt+Tab, Cmd+Q ...
  if (e.ctrlKey && vk !== 17) return false; // Ctrl+R, Ctrl+Shift+I ...
  return true;
}

export interface KeyInputSink {
  keyInput(e: { key: string; keyCode: number; type: 'down' | 'up' }): boolean;
}

export interface KeyboardOptions {
  /** Gets keys first when an input TextField has focus. */
  player?: KeyInputSink;
  /** Event target (default window). */
  target?: Window;
  /** True while an overlay (HTML context menu) owns the keyboard: no Key events are generated. */
  isBlocked?: () => boolean;
}

/** Wires DOM keyboard events into Key. Returns a detach function. */
export function attachKeyboard(opts: KeyboardOptions = {}): () => void {
  const target = opts.target ?? window;

  const syncLocks = (e: KeyboardEvent): void => {
    if (typeof e.getModifierState !== 'function') return;
    Key._setToggled(20, e.getModifierState('CapsLock'));
    Key._setToggled(144, e.getModifierState('NumLock'));
    Key._setToggled(145, e.getModifierState('ScrollLock'));
  };

  const onKey = (e: KeyboardEvent): void => {
    if (opts.isBlocked?.()) return;
    // A focused DOM text widget (the LAN IP input) owns the keys: no preventDefault (it would swallow the
    // characters), no Key events (typing must not drive the game).
    if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.isComposing) return;
    const down = e.type === 'keydown';
    syncLocks(e);
    // Browser: Alt+Enter = fullscreen (Electron's main process intercepts F11/Alt+Enter before we see them).
    if (down && e.altKey && e.key === 'Enter' && !isElectron()) {
      e.preventDefault();
      if (!e.repeat) toggleFullscreen();
      return;
    }
    const vk = flashKeyCode(e);
    const ascii = flashAscii(e);
    let consumed = false;
    try {
      consumed = opts.player?.keyInput({ key: e.key, keyCode: vk, type: down ? 'down' : 'up' }) ?? false;
    } catch (err) { console.error('[keyboard] keyInput', err); }
    if (consumed || shouldPreventDefault(e)) e.preventDefault();
    if (down) Key._down(vk, ascii);
    else Key._up(vk, ascii);
  };

  const release = (): void => Key._clear();
  const onVisibility = (): void => { if (document.hidden) Key._clear(); };

  target.addEventListener('keydown', onKey);
  target.addEventListener('keyup', onKey);
  target.addEventListener('blur', release);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('keyup', onKey);
    target.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
