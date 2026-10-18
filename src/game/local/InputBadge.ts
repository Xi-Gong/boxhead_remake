// Input badge (deviation GAMEPAD_INPUT, v0.1.4): a small DOM strip in the bottom-left corner showing which
// inputs the game sees - KEYBOARD + PAD 1 / PAD 2 chips with presence, the most recently active device
// highlighted, and each pad's player assignment (->P1 / ->P2; in Single player every pad drives player 1).
// Pads connect automatically (Gamepad API, appears after any button press); clicking a pad chip SWAPS the
// assignments (the manual connect). DOM-only like the LAN overlays: it never touches the simulation or the
// visual baselines, and only the pad chips catch clicks - the strip itself is pointer-transparent.
import type { GamepadHandle } from './Gamepad.ts';

const CHIP = 'padding:2px 6px;border:1px solid #aaa;border-radius:8px;background:var(--badge-bg);color:var(--badge-ink);'
  + 'font:inherit;line-height:12px;white-space:nowrap';
const CHIP_OFF = CHIP + ';opacity:.45';
const CHIP_ACTIVE = CHIP + ';border-color:#ef1304';
/** How long a device stays "active" after its last event, and how long the strip stays fully opaque. */
const ACTIVE_MS = 1500;
const VISIBLE_MS = 4000;

let handle: GamepadHandle | undefined;
let el: HTMLDivElement | undefined;
let chips: HTMLButtonElement[] = [];
let hintEl: HTMLDivElement | undefined;
let timer: number | undefined;
let lastKey = '';
let inGame = false;

export function installInputBadge(h: GamepadHandle): void {
  disposeInputBadge();
  handle = h;
  if (typeof document === 'undefined') return;
  const stage = document.getElementById('stage') ?? document.body;
  el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:10px;bottom:4px;z-index:8;display:flex;gap:6px;align-items:center;'
    + 'font:bold 10px Calibri,sans-serif;user-select:none;pointer-events:none;transition:opacity .4s;'
    + '--badge-bg:rgba(245,245,243,.92);--badge-ink:#333';
  stage.appendChild(el);
  chips = [];
  const mk = (label: string, click?: () => void): void => {
    const c = document.createElement('button');
    c.type = 'button';
    c.textContent = label;
    c.style.cssText = CHIP;
    if (click) {
      c.style.pointerEvents = 'auto';
      c.addEventListener('click', (e) => { e.stopPropagation(); click(); });
    }
    el!.appendChild(c);
    chips.push(c);
  };
  mk('KEYBOARD');
  mk('PAD 1', () => handle?.swapAssignment());
  mk('PAD 2', () => handle?.swapAssignment());
  hintEl = document.createElement('div');
  hintEl.style.cssText = 'color:#9e9e9e;font:10px Calibri,sans-serif;white-space:nowrap';
  el.appendChild(hintEl);
  const tick = (): void => {
    draw();
    timer = window.setTimeout(tick, 250) as unknown as number;
  };
  tick();
}

function draw(): void {
  if (!el || !handle) return;
  const s = handle.status();
  const now = Date.now();
  const latest = Math.max(s.keyboardActive, s.pads[0].lastActive, s.pads[1].lastActive);
  // Only touch the DOM when something actually changed (key = the whole visible state).
  const key = JSON.stringify([s.pads.map((p) => [p.present, p.id, p.player, now - p.lastActive < ACTIVE_MS]),
    now - s.keyboardActive < ACTIVE_MS, now - latest < VISIBLE_MS, s.assign, inGame]);
  if (key === lastKey) return;
  lastKey = key;
  el.style.opacity = now - latest < VISIBLE_MS || latest === 0 ? '1' : '0.35';
  const kbActive = now - s.keyboardActive < ACTIVE_MS;
  chips[0]!.style.cssText = kbActive ? CHIP_ACTIVE : CHIP;
  chips[0]!.textContent = 'KEYBOARD';
  for (let i = 0; i < 2; i++) {
    const chip = chips[i + 1]!;
    const p = s.pads[i]!;
    chip.textContent = p.present ? `PAD ${i + 1} →P${p.player + 1}` : `PAD ${i + 1}`;
    chip.style.cssText = p.present && now - p.lastActive < ACTIVE_MS ? CHIP_ACTIVE : p.present ? CHIP : CHIP_OFF;
    chip.style.pointerEvents = 'auto'; // cssText replaces every inline property, including the click opt-in.
  }
  if (hintEl) hintEl.textContent = inGame || s.pads[0].present || s.pads[1].present ? '' : 'press any button on your gamepad to connect it';
}

/** Small neutral menu pills become translucent dark chips over the playing field. */
export function setBadgeInGame(playing: boolean): void {
  inGame = playing;
  el?.style.setProperty('--badge-bg', playing ? 'rgba(0,0,0,.65)' : 'rgba(245,245,243,.92)');
  el?.style.setProperty('--badge-ink', playing ? '#fff' : '#333');
  draw();
}

/** The LAN room view shows this line so both players can confirm their controllers before starting. */
/** v0.2.5: some screens reserve the bottom-left strip for their own text (instructions footer) - hide the badge
 *  there (display, not opacity: it must stop covering the page immediately and not fight the idle fade). */
export function setBadgeHidden(hidden: boolean): void {
  if (el) el.style.display = hidden ? 'none' : 'flex';
}

export function inputSummary(): string {
  if (!handle) return 'KEYBOARD';
  const n = handle.status().pads.filter((p) => p.present).length;
  return n === 0 ? 'KEYBOARD' : n === 1 ? 'KEYBOARD + 1 GAMEPAD' : 'KEYBOARD + 2 GAMEPADS';
}

export function disposeInputBadge(): void {
  if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer);
  timer = undefined;
  el?.remove();
  el = undefined;
  chips = [];
  hintEl = undefined;
  handle = undefined;
  lastKey = '';
  inGame = false;
}
