import { describe, expect, it } from 'vitest';
import { getRandomState, mathRandom, random, seedRandom, setRandomState } from '../../../src/engine/flash/rng';

describe('rng state capture/restore (resume feature)', () => {
  it('round-trips the exact generator state', () => {
    seedRandom(0x1234_5678);
    random(100);
    mathRandom();
    const captured = getRandomState();
    // Burn some more state, then restore: outputs must continue from the capture point.
    random(1000);
    mathRandom();
    setRandomState(captured);
    const seqA = [random(1000), mathRandom(), random(7)];
    setRandomState(captured);
    const seqB = [random(1000), mathRandom(), random(7)];
    expect(seqB).toEqual(seqA);
  });

  it('is independent of seedRandom bookkeeping', () => {
    seedRandom(42);
    random(10);
    const s = getRandomState();
    seedRandom(99); // overwrites state
    setRandomState(s);
    expect(getRandomState()).toBe(s);
    expect(random(5)).toBeGreaterThanOrEqual(0);
  });

  it('masks the restored value to u32 like seedRandom does', () => {
    setRandomState(-1); // 0xffffffff
    expect(getRandomState()).toBe(0xffffffff);
    setRandomState(2 ** 32 + 5);
    expect(getRandomState()).toBe(5);
  });
});
