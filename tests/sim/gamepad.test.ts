// Deviation GAMEPAD_INPUT (M5): the game-side translator turns pad state into the game's own inputs. The engine
// polling (edges, deadzone, dpad) is covered by tests/unit/platform/gamepad.test.ts; here the REAL game reacts:
// movement = the keyboard key slots (rebinding respected), FIRE/NEXT/PREV/PAUSE through the slot latches,
// Key._clear() self-healing, the menu virtual cursor + A click through the engine's own button picking.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { Key, Mouse } from '../../src/engine/flash/input.ts';
import { engine } from '../../src/engine/swf/state.ts';
import { installGamepad } from '../../src/game/local/Gamepad.ts';
import { CMain } from '../../src/game/packages.ts';
import { createHeadlessGame, KEYS, type HeadlessGame } from './harness.ts';

interface PadSpec { axes?: number[]; pressed?: number[]; connected?: boolean }

const mkPad = (spec: PadSpec, index: number) => ({
  index,
  connected: spec.connected !== false,
  axes: spec.axes ?? [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (spec.pressed ?? []).includes(i) })),
});

/** A mutable two-slot fake pad provider. */
function fakePads() {
  const pads: (ReturnType<typeof mkPad> | null)[] = [null, null];
  return {
    provider: () => pads,
    set(slot: 0 | 1, spec: PadSpec | null): void { pads[slot] = spec ? mkPad(spec, slot) : null; },
  };
}

describe('gamepad -> game (scope wiring)', () => {
  it('stick and d-pad drive the player through the CInput key slots', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 3, difficulty: 0 });
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider });
    const p = g.players()[0]!;
    const x0 = p.mPosition.mX;
    pads.set(0, { axes: [0.9, 0] });
    gp.poll(false);
    expect(Key.isDown(KEYS.P1.RIGHT)).toBe(true);
    g.tick(2);
    expect(p.mPosition.mX).toBeCloseTo(x0 + 0.32, 9); // 2 ticks x the player's 0.16 step, like the arrow key
    pads.set(0, { axes: [0, 0] });
    gp.poll(false);
    expect(Key.isDown(KEYS.P1.RIGHT)).toBe(false);
    pads.set(0, { pressed: [12, 14] }); // d-pad up + left
    gp.poll(false);
    expect(Key.isDown(KEYS.P1.UP)).toBe(true);
    expect(Key.isDown(KEYS.P1.LEFT)).toBe(true);
    gp.dispose();
    expect(g.errors).toEqual([]);
  });

  it('A fires, RB tap cycles weapons, Start pauses', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 4, difficulty: 0 });
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider });
    const p = g.players()[0]!;
    // FIRE: A press edge -> the pistol's IsPressed latch fires.
    pads.set(0, { pressed: [0] });
    gp.poll(false);
    g.tick(1);
    expect(p.mWeapon_Current.mFire).toBe(true);
    // Weapons: unlock the uzi, then RB press ... release -> NEXT_WEAPON.IsReleased fires.
    p.NewWeapon('uzi');
    pads.set(0, { pressed: [0, 5] });
    gp.poll(false);
    g.tick(1);
    pads.set(0, { pressed: [0] }); // RB released
    gp.poll(false);
    g.tick(1);
    expect(p.mWeapon_Current.mNameID).toBe('uzi');
    // Pause: Start press toggles the pause screen.
    pads.set(0, { pressed: [0, 9] });
    gp.poll(false);
    g.tick(2);
    expect(g.world().mPaused).toBe(true);
    gp.dispose();
    expect(g.errors).toEqual([]);
  });

  it('follows rebinding (the slot keycode is re-read every poll) and survives Key._clear()', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 5, difficulty: 0 });
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider });
    (CMain as any).mInput.KEY_FIRE.mKeycode = 75; // what a rebinding ends up writing
    pads.set(0, { pressed: [0] });
    gp.poll(false);
    expect(Key.isDown(75)).toBe(true);
    expect(Key.isDown(KEYS.P1.FIRE)).toBe(false);
    // Window blur / context menu clears everything; the next poll re-pushes still-held buttons.
    Key._clear();
    expect(Key.isDown(75)).toBe(false);
    gp.poll(false);
    expect(Key.isDown(75)).toBe(true);
    // Blocked (context menu open): the pad releases its keys.
    gp.poll(true);
    expect(Key.isDown(75)).toBe(false);
    gp.dispose();
    expect(g.errors).toEqual([]);
  });

  it('pad 1 drives player 2 in Coop and player 1 in Single', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 2, seed: 6, difficulty: 0 });
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider });
    pads.set(1, { axes: [0, -0.9] });
    gp.poll(false);
    expect(Key.isDown(KEYS.P2.UP)).toBe(true);
    expect(Key.isDown(KEYS.P1.UP)).toBe(false);
    gp.dispose();
    const g2 = createHeadlessGame({ mode: 'Single', room: 1, seed: 6, difficulty: 0 });
    const pads2 = fakePads();
    const gp2 = installGamepad({ player: g2.player, provider: pads2.provider });
    pads2.set(1, { axes: [0, -0.9] });
    gp2.poll(false);
    expect(Key.isDown(KEYS.P1.UP)).toBe(true); // no player 2 in Single
    gp2.dispose();
    expect(g.errors).toEqual([]);
    expect(g2.errors).toEqual([]);
  });

  it('menu: the virtual cursor moves, the physical mouse wins, and A clicks the real buttons', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 7, menuOnly: 'Main' });
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider });
    // Steering moves the engine mouse (logical coordinates); the cursor starts centred (320, 240).
    pads.set(0, { axes: [-0.9, 0.9] });
    for (let i = 0; i < 3; i++) gp.poll(false);
    expect(engine.mouseX).toBeGreaterThan(200);
    expect(engine.mouseX).toBeLessThan(320);
    expect(engine.mouseY).toBeGreaterThan(240);
    // Physical mouse wins: the cursor snaps to its position.
    const mouse = { x: 320, y: 240 };
    const gpMouse = installGamepad({ player: g.player, provider: pads.provider, mouse });
    pads.set(0, { axes: [0, 0] });
    gpMouse.poll(false);
    expect(engine.mouseX).toBe(320);
    // A press + release at the SINGLE PLAYER button = a real click through the engine's picking (getBounds without
    // a target space is LOCAL, so click the button's position - its origin is inside the hit area).
    const b = g.main().mcScreen.mcSinglePlay;
    mouse.x = b._x;
    mouse.y = b._y;
    pads.set(0, { pressed: [0] });
    gpMouse.poll(false); // snaps the cursor, presses the mouse
    pads.set(0, {});
    gpMouse.poll(false); // releases over the button -> onRelease
    expect(g.stepUntil(() => g.state() === 'State_SelectWorld_Single', 40)).toBe(true);
    gp.dispose();
    gpMouse.dispose();
    expect(g.errors).toEqual([]);
  });
});

// v0.1.8: the pad arrow must mirror the OS cursor (GAME_CURSOR_HIDE) — hidden while the world runs, back for
// menus and the pause menu. Before, it slid over the gameplay whenever the stick moved (user-reported).
describe('gamepad virtual cursor vs GAME_CURSOR_HIDE (v0.1.8)', () => {
  /** Minimal element: only what updateCursorDom touches (style props, cssText, appendChild, rect, remove). */
  class ShimEl {
    style: Record<string, string> = {};
    children: ShimEl[] = [];
    parentNode: ShimEl | null = null;
    appendChild(c: ShimEl): ShimEl { c.parentNode = this; this.children.push(c); return c; }
    getBoundingClientRect(): { left: number; top: number } { return { left: 0, top: 0 }; }
    remove(): void {
      if (!this.parentNode) return;
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }

  const makeDom = (): { container: ShimEl; created: ShimEl[] } => {
    const container = new ShimEl();
    const created: ShimEl[] = [];
    vi.stubGlobal('document', { createElement: () => { const el = new ShimEl(); created.push(el); return el; } });
    return { container, created };
  };

  const presenter = { logicalToClient: (x: number, y: number) => ({ x, y }) };

  afterEach(() => { vi.unstubAllGlobals(); });

  it('gameplay: no pad arrow while the world runs, even with the stick moving', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 8 });
    expect(g.state()).toBe('State_RunWorld');
    expect(Mouse._visible).toBe(false); // precondition: gameplay hides the OS cursor
    const dom = makeDom();
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider, presenter, container: dom.container as unknown as HTMLElement });
    pads.set(0, { axes: [0.9, 0.9] });
    for (let i = 0; i < 5; i++) gp.poll(false);
    expect(dom.container.children.length).toBe(0); // the arrow must NOT appear over gameplay
    gp.dispose();
    expect(g.errors).toEqual([]);
  });

  it('menus: the pad arrow still shows and follows the stick', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 8, menuOnly: 'Main' });
    const dom = makeDom();
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider, presenter, container: dom.container as unknown as HTMLElement });
    pads.set(0, { axes: [-0.9, 0] });
    gp.poll(false);
    gp.poll(false);
    expect(dom.container.children.length).toBe(1);
    const el = dom.container.children[0]!;
    expect(el.style.left).toBeTruthy();
    expect(parseFloat(el.style.left)).toBeLessThan(320); // two polls of -0.9*8 px from the centre
    gp.dispose();
    expect(dom.container.children.length).toBe(0); // dispose detaches
    expect(g.errors).toEqual([]);
  });

  it('pause: the arrow returns with the pause menu and hides again on resume', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 8 });
    const dom = makeDom();
    const pads = fakePads();
    const gp = installGamepad({ player: g.player, provider: pads.provider, presenter, container: dom.container as unknown as HTMLElement });
    pads.set(0, { axes: [0.9, 0] });
    gp.poll(false);
    expect(dom.container.children.length).toBe(0); // hidden during play
    // Pause: the OS cursor comes back for the pause menu - the pad arrow must too.
    g.keyDown(KEYS.PAUSE);
    expect(g.stepUntil(() => g.world()?.mPaused === true, 20)).toBe(true);
    g.keyUp(KEYS.PAUSE);
    expect(Mouse._visible).toBe(true);
    gp.poll(false);
    expect(dom.container.children.length).toBe(1);
    // Resume: hidden again for gameplay.
    g.keyDown(KEYS.PAUSE);
    expect(g.stepUntil(() => g.world()?.mPaused === false, 20)).toBe(true);
    g.keyUp(KEYS.PAUSE);
    expect(Mouse._visible).toBe(false);
    gp.poll(false);
    expect(dom.container.children.length).toBe(0);
    gp.dispose();
    expect(g.errors).toEqual([]);
  });
});
