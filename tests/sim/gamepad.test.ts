// Deviation GAMEPAD_INPUT (M5): the game-side translator turns pad state into the game's own inputs. The engine
// polling (edges, deadzone, dpad) is covered by tests/unit/platform/gamepad.test.ts; here the REAL game reacts:
// movement = the keyboard key slots (rebinding respected), FIRE/NEXT/PREV/PAUSE through the slot latches,
// Key._clear() self-healing, the menu virtual cursor + A click through the engine's own button picking.
import { describe, expect, it } from 'vitest';
import { Key } from '../../src/engine/flash/input.ts';
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
