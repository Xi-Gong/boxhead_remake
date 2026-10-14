import { describe, expect, it } from 'vitest';
import { GamepadWatcher, navigatorPadProvider, type PadDirs, type PadProvider, type RawPad } from '../../../src/engine/platform/Gamepad.ts';

interface PadSpec { axes?: number[]; pressed?: number[] }

const pad = (spec: PadSpec, index = 0): RawPad => ({
  index,
  connected: true,
  axes: spec.axes ?? [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (spec.pressed ?? []).includes(i) })),
});

const provider = (...pads: (RawPad | null)[]): PadProvider => () => pads;

describe('GamepadWatcher (engine gamepad polling)', () => {
  it('reports button edges once per press/release and no repeats while held', () => {
    const w = new GamepadWatcher(provider(pad({ pressed: [0] })), 0);
    const first = w.poll();
    expect(first.present).toBe(true);
    expect([...first.down]).toEqual([0]);
    const held = w.poll();
    expect(held.down.size).toBe(0);
    expect(held.up.size).toBe(0);
    const released = w.poll(); // same provider state still pressed: no edge
    expect(released.up.size).toBe(0);
  });

  it('quantizes the left stick with the deadzone (8 directions via flag combos)', () => {
    const w = new GamepadWatcher(provider(pad({ axes: [0.5, 0] })), 0);
    expect(w.poll().stick).toEqual({ left: false, right: true, up: false, down: false });
    const diag = new GamepadWatcher(provider(pad({ axes: [-0.4, 0.4] })), 0);
    const d = diag.poll().stick;
    expect([d.left, d.down, d.right, d.up]).toEqual([true, true, false, false]);
    const none = new GamepadWatcher(provider(pad({ axes: [0.2, -0.2] })), 0);
    expect(none.poll().stick).toEqual({ left: false, right: false, up: false, down: false });
    const up = new GamepadWatcher(provider(pad({ axes: [0, -0.9] })), 0);
    expect(up.poll().stick.up).toBe(true);
  });

  it('quantizes radially into eight EVEN sectors at any magnitude past engage (v0.1.7)', () => {
    // v0.1.4 thresholded each axis independently, so the wedges changed shape with the deflection: at half push a
    // diagonal needed a ~1-degree window around 45 degrees while cardinals got +/-44 degrees. The radial snap
    // gives every direction the same +/-22.5 degrees regardless of magnitude.
    const dirs = (deg: number, m = 0.55): PadDirs => {
      const w = new GamepadWatcher(provider(pad({ axes: [m * Math.cos(deg * Math.PI / 180), m * Math.sin(deg * Math.PI / 180)] })), 0);
      return w.poll().stick;
    };
    expect(dirs(0)).toMatchObject({ right: true, up: false, down: false });
    expect(dirs(20)).toMatchObject({ right: true, up: false, down: false }); // inside the cardinal wedge
    expect(dirs(25)).toMatchObject({ right: true, down: true }); // just past the boundary: the diagonal counts
    expect(dirs(65)).toMatchObject({ right: true, down: true }); // inside the diagonal wedge
    expect(dirs(70)).toMatchObject({ down: true, right: false });
    expect(dirs(90)).toMatchObject({ down: true, right: false });
    expect(dirs(180)).toMatchObject({ left: true, right: false });
    expect(dirs(-90)).toMatchObject({ up: true, down: false });
  });

  it('holds the direction through the 30-40 % release band; below 30 % it stops (no flicker)', () => {
    let current: RawPad = pad({ axes: [0, -0.9] });
    const w = new GamepadWatcher(() => [current], 0);
    expect(w.poll().stick.up).toBe(true);
    current = pad({ axes: [0.25, -0.25] }); // releasing diagonally through the band
    const held = w.poll().stick;
    expect([held.up, held.down, held.left, held.right]).toEqual([true, false, false, false]); // still UP: no diagonal flicker on release
    current = pad({ axes: [0.2, -0.2] }); // below the release threshold
    expect(w.poll().stick).toEqual({ left: false, right: false, up: false, down: false });
  });

  it('keeps the sector through boundary wobble but follows a real turn (angular stickiness)', () => {
    const polar = (deg: number, m = 0.9): RawPad =>
      pad({ axes: [m * Math.cos(deg * Math.PI / 180), m * Math.sin(deg * Math.PI / 180)] });
    let current: RawPad = polar(-20);
    const w = new GamepadWatcher(() => [current], 0);
    const r1 = w.poll().stick;
    expect([r1.right, r1.up]).toEqual([true, false]); // 20 degrees: RIGHT (sector 0)
    current = polar(-23);
    const r2 = w.poll().stick;
    expect([r2.right, r2.up]).toEqual([true, false]); // 3 degrees of wobble past the 22.5 boundary: still RIGHT
    current = polar(-27);
    const r3 = w.poll().stick;
    expect([r3.right, r3.up]).toEqual([true, true]); // a real 7-degree turn: the diagonal is taken
  });

  it('re-engages fresh after the stick centred (drift does not resurrect a direction)', () => {
    let current: RawPad = pad({ axes: [0.9, 0] });
    const w = new GamepadWatcher(() => [current], 0);
    expect(w.poll().stick.right).toBe(true);
    current = pad({ axes: [0, 0] });
    expect(w.poll().stick.right).toBe(false);
    current = pad({ axes: [0.05, 0.05] }); // 45 degrees but far below engage
    expect(w.poll().stick).toEqual({ left: false, right: false, up: false, down: false });
    current = pad({ axes: [0.32, 0.32] }); // 45 degrees past engage: a clean diagonal
    const d = w.poll().stick;
    expect([d.right, d.down]).toEqual([true, true]);
  });

  it('reads the d-pad hold flags from buttons 12-15', () => {
    const w = new GamepadWatcher(provider(pad({ pressed: [12, 14] })), 0);
    const p = w.poll();
    expect(p.dpad).toEqual({ left: true, right: false, up: true, down: false });
    expect([...p.down]).toEqual([12, 14]);
  });

  it('a disconnect releases every held button and reports absent', () => {
    let current: RawPad | null = pad({ pressed: [0, 9] });
    const w = new GamepadWatcher(() => [current], 0);
    w.poll();
    current = null as unknown as RawPad;
    const p = w.poll();
    expect(p.present).toBe(false);
    expect([...p.up].sort((a, b) => a - b)).toEqual([0, 9]);
  });

  it('missing / empty slots report absent without edges', () => {
    const w = new GamepadWatcher(provider(null, pad({}, 1)), 0);
    const p = w.poll();
    expect(p.present).toBe(false);
    expect(p.up.size).toBe(0);
    const second = new GamepadWatcher(provider(null, pad({}, 1)), 1);
    expect(second.poll().present).toBe(true);
  });

  it('navigatorPadProvider returns no pads in Node (no navigator.getGamepads)', () => {
    expect(navigatorPadProvider()()).toEqual([]);
  });
});
