// Gamepad translator unit tests (v0.1.4 L5): pad presence/names feed the input badge, the pad->player
// assignment swaps (the badge's manual connect), and activity edges stamp per pad.
import { describe, expect, it } from 'vitest';
import { installGamepad } from '../../../src/game/local/Gamepad.ts';
import type { RawPad } from '../../../src/engine/platform/Gamepad.ts';

function pad(id: string, pressed = false): RawPad {
  return { index: 0, connected: true, id, axes: [0, 0], buttons: pressed ? [{ pressed: true }] : [{ pressed: false }] };
}

const player = { mouseMove: () => {}, mouseDown: () => {}, mouseUp: () => {} };

describe('gamepad input badge state (v0.1.4)', () => {
  it('reports presence, names and the default automatic assignment', () => {
    const pads: (RawPad | null)[] = [pad('Xbox pad'), null];
    const h = installGamepad({ player, provider: () => pads });
    h.poll(false);
    const s = h.status();
    expect(s.pads[0]!.present).toBe(true);
    expect(s.pads[0]!.id).toBe('Xbox pad');
    expect(s.pads[1]!.present).toBe(false);
    expect(s.assign).toEqual([0, 1]);
    h.dispose();
  });

  it('swapAssignment flips who each pad drives', () => {
    const pads: (RawPad | null)[] = [pad('A'), pad('B')];
    const h = installGamepad({ player, provider: () => pads });
    h.poll(false);
    expect(h.status().assign).toEqual([0, 1]);
    h.swapAssignment();
    expect(h.status().assign).toEqual([1, 0]);
    h.swapAssignment();
    expect(h.status().assign).toEqual([0, 1]);
    h.dispose();
  });

  it('activity is stamped on button edges, not while held', async () => {
    const a = pad('A', true);
    const pads: (RawPad | null)[] = [a, null];
    const h = installGamepad({ player, provider: () => pads });
    h.poll(false);
    const t1 = h.status().pads[0]!.lastActive;
    expect(t1).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 5));
    h.poll(false); // still held, no new edge -> no new activity stamp
    expect(h.status().pads[0]!.lastActive).toBe(t1);
    a.buttons = [{ pressed: false }];
    h.poll(false); // the release edge counts
    expect(h.status().pads[0]!.lastActive).toBeGreaterThan(t1);
    h.dispose();
  });
});
