import { expect, it } from 'vitest';
import { simulationDigest } from '../../../src/game/local/Net/StateDigest.ts';
import type { WorldSnap } from '../../../src/game/local/Net/WorldSnap.ts';

const state = (): WorldSnap => ({
  things: { t1: { cls: 'CThing_Shot_Bullet', props: [['mPosition', ['pos', 1, 2, 0]], ['mFlags', 1]] } },
  cells: [[0, 0, 1, 0, -1, 0, 0, 0, []]], collection: {}, nav: {}, upgrades: [], slots: [],
  rng: 10, allocID: 2, world: {}, hud: {},
} as unknown as WorldSnap);

it('detects sub-quantisation projectile changes and RNG/navigation differences', () => {
  const original = state();
  const baseline = simulationDigest(original);
  (original.things.t1!.props[0]![1] as any)[1] += 1e-9;
  expect(simulationDigest(original).things).not.toBe(baseline.things);
  original.rng++;
  expect(simulationDigest(original).random).not.toBe(baseline.random);
  original.cells[0]![5]++;
  expect(simulationDigest(original).cells).not.toBe(baseline.cells);
});

it('ignores only the write-only Drawn flag while retaining collision flags and property order', () => {
  const s = state();
  const baseline = simulationDigest(s).things;
  s.things.t1!.props[1]![1] = 9;
  expect(simulationDigest(s).things).toBe(baseline);
  s.things.t1!.props[1]![1] = 8;
  expect(simulationDigest(s).things).not.toBe(baseline);
  s.things.t1!.props[1]![1] = 1;
  s.things.t1!.props.reverse();
  expect(simulationDigest(s).things).not.toBe(baseline);
});
