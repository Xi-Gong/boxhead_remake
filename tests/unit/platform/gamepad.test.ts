import { describe, expect, it } from 'vitest';
import { GamepadWatcher, navigatorPadProvider, STICK_DEADZONE, type PadProvider, type RawPad } from '../../../src/engine/platform/Gamepad.ts';

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
    const none = new GamepadWatcher(provider(pad({ axes: [STICK_DEADZONE * 0.9, -STICK_DEADZONE * 0.9] })), 0);
    expect(none.poll().stick).toEqual({ left: false, right: false, up: false, down: false });
    const up = new GamepadWatcher(provider(pad({ axes: [0, -0.9] })), 0);
    expect(up.poll().stick.up).toBe(true);
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
