/**
 * DOM pointer events -> AS2 Mouse listeners + Player mouse input (logical stage coords).   OWNER: lane D
 *
 *     const detach = attachMouse({ player, presenter, isBlocked: () => menu.isOpen });
 *
 * Order per event (Flash 8 / Ruffle): position update, Mouse listeners (onMouseMove/onMouseDown/onMouseUp),
 * then the player (clip events + button states). Only the primary button is a Flash mouse button; the right
 * button opens the context menu (ContextMenu.ts). Pointer capture keeps a drag/release outside the window reported.
 * Coordinates are NOT clamped: over the letterbox bars they are < 0 or > 640/480 (Flash reports those too).
 */
import { Mouse } from '../flash/input.ts';
import type { Presenter } from './Presenter.ts';

export interface PointerPlayer {
  mouseMove(x: number, y: number): void;
  mouseDown(): void;
  mouseUp(): void;
  readonly cursor: string;
}

export interface MouseOptions {
  player: PointerPlayer;
  presenter: Pick<Presenter, 'clientToLogical' | 'setCursor' | 'container' | 'canvas'>;
  /** True while an overlay (HTML context menu) owns the mouse. */
  isBlocked?: () => boolean;
}

/** Flash onMouseWheel delta for a WheelEvent: +3 per notch when scrolling away from the user (up). */
export function flashWheelDelta(deltaY: number): number {
  return deltaY < 0 ? 3 : deltaY > 0 ? -3 : 0;
}

export interface MouseHandle {
  detach(): void;
  /** Re-evaluate the CSS cursor (call after each rendered frame: buttons may move under a still pointer). */
  updateCursor(): void;
  /** Last logical position. */
  readonly x: number;
  readonly y: number;
}

export function attachMouse(opts: MouseOptions): MouseHandle {
  const { player, presenter } = opts;
  const el = presenter.container;
  let x = 0, y = 0;
  let pressed = false;

  const safe = (fn: () => void): void => { try { fn(); } catch (e) { console.error('[mouse]', e); } };
  const updateCursor = (): void => {
    let c = 'default';
    safe(() => { c = Mouse._visible ? (player.cursor || 'default') : 'none'; });
    presenter.setCursor(c);
  };
  const move = (e: PointerEvent | MouseEvent): boolean => {
    const p = presenter.clientToLogical(e.clientX, e.clientY);
    const changed = p.x !== x || p.y !== y;
    x = p.x; y = p.y;
    safe(() => player.mouseMove(x, y));
    return changed;
  };

  const onMove = (e: PointerEvent): void => {
    if (opts.isBlocked?.()) return;
    if (!move(e)) return; // Player.mouseMove broadcasts onMouseMove to clips + Mouse listeners
    updateCursor();
  };
  const onDown = (e: PointerEvent): void => {
    if (opts.isBlocked?.() || e.button !== 0) return;
    // A DOM text widget (the LAN IP input) owns its clicks: preventDefault + canvas.focus() would steal the
    // focus it needs for typing, and feeding the click into the game would press the canvas button UNDER it.
    if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    e.preventDefault();
    presenter.canvas.focus({ preventScroll: true });
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pressed = true;
    move(e);
    safe(() => player.mouseDown()); // also broadcasts onMouseDown to clips + Mouse listeners (Player.broadcast)
    updateCursor();
  };
  const onUp = (e: PointerEvent): void => {
    if (e.button !== 0 && e.type === 'pointerup') return;
    if (!pressed) return;
    pressed = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    move(e);
    safe(() => player.mouseUp()); // also broadcasts onMouseUp to clips + Mouse listeners (Player.broadcast)
    updateCursor();
  };
  const onWheel = (e: WheelEvent): void => {
    if (opts.isBlocked?.()) return;
    e.preventDefault();
    const d = flashWheelDelta(e.deltaY);
    if (d !== 0) safe(() => Mouse._dispatchWheel(d));
  };
  const noSelect = (e: Event): void => e.preventDefault();

  el.style.userSelect = 'none';
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('selectstart', noSelect);
  el.addEventListener('dragstart', noSelect);

  return {
    detach(): void {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('selectstart', noSelect);
      el.removeEventListener('dragstart', noSelect);
    },
    updateCursor,
    get x(): number { return x; },
    get y(): number { return y; },
  };
}
