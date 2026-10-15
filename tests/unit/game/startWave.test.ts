// Deviation START_WAVE_SELECTOR (v0.1.9): the wave -> "expected capability" multiplier mapping. The anchors are the
// original's own difficulty pairs (CUpgrades.SetDifficulty: wave/multiplier 1/1, 10/10, 20/30, 35/50), interpolated
// piecewise-linearly between them, the last segment's slope (20/15) extended beyond wave 35, floored and clamped to
// the upgrade table's maximum threshold 125.
import { describe, expect, it } from 'vitest';
import { anchorInterp } from '../../../src/game/local/StartWave.ts';

describe('anchorInterp: starting wave -> starting multiplier', () => {
  it('hits the original difficulty anchors exactly', () => {
    expect(anchorInterp(1)).toBe(1);
    expect(anchorInterp(10)).toBe(10);
    expect(anchorInterp(20)).toBe(30);
    expect(anchorInterp(35)).toBe(50);
  });

  it('interpolates linearly between the anchors (floor)', () => {
    expect(anchorInterp(5)).toBe(5); // slope 1 on 1..10
    expect(anchorInterp(15)).toBe(20); // slope 2 on 10..20
    expect(anchorInterp(30)).toBe(43); // 30 + 10 * (20/15) = 43.33 -> 43
    expect(anchorInterp(36)).toBe(51); // 50 + 1 * (20/15) = 51.33 -> 51
  });

  it('extends the last segment slope beyond wave 35 and clamps to the table maximum 125', () => {
    expect(anchorInterp(50)).toBe(70); // 50 + 15 * (20/15) = 70
    expect(anchorInterp(80)).toBe(110); // 50 + 45 * (20/15) = 110
    expect(anchorInterp(100)).toBe(125); // 136.7 clamped to the highest threshold
    expect(anchorInterp(150)).toBe(125); // out-of-range input clamps like wave 100
  });

  it('clamps low inputs to wave 1', () => {
    expect(anchorInterp(0)).toBe(1);
    expect(anchorInterp(-7)).toBe(1);
  });
});
