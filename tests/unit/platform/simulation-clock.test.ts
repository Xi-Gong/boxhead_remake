import { expect, it } from 'vitest';
import { clock, getTimer, frameTime, withTimerValue } from '../../../src/engine/flash/clock.ts';

it('scoped simulation time nests and restores after failure without moving the scheduler', () => {
  const original = { ...clock };
  expect(() => withTimerValue(120.9, () => {
    expect(getTimer()).toBe(120);
    expect(frameTime()).toBe(original.efTime);
    withTimerValue(40, () => expect(getTimer()).toBe(40));
    expect(getTimer()).toBe(120);
    throw new Error('step failed');
  })).toThrow('step failed');
  expect(clock).toEqual(original);
  withTimerValue(90, () => expect(getTimer()).toBe(90));
});
