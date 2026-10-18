import { describe, expect, it, vi } from 'vitest';
import { EF_MS, FrameScheduler, Loop } from '../../../src/engine/platform/Loop.ts';
import { clock } from '../../../src/engine/flash/clock.ts';

it.each([60, 120, 144])('presents every %i Hz display frame while retaining 50 Hz enterFrame', hz => {
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { callback = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const enterFrame = vi.fn(), render = vi.fn();
  const loop = new Loop({ player: { enterFrame }, render, beforeRender: () => true });
  try {
    loop.start();
    for (let i = 0; i < hz; i++) callback(clock.origin + i * 1000 / hz);
    expect(render).toHaveBeenCalledTimes(hz);
    expect(enterFrame).toHaveBeenCalledTimes(50);
    loop.setPaused(true);
    callback(clock.origin + 1100);
    expect(render).toHaveBeenCalledTimes(hz);
  } finally { loop.stop(); vi.unstubAllGlobals(); }
});

/** Drive a scheduler with rAF timestamps; returns all EF times and the per-rAF EF counts. */
function run(stamps: number[]): { efs: number[]; perRaf: number[]; s: FrameScheduler } {
  const s = new FrameScheduler();
  const efs: number[] = [];
  const perRaf: number[] = [];
  for (const t of stamps) {
    const due = s.plan(t);
    perRaf.push(due.length);
    efs.push(...due);
  }
  return { efs, perRaf, s };
}

const rafs = (hz: number, seconds: number, start = 1000, jitter = 0): number[] => {
  const out: number[] = [];
  const n = Math.round(hz * seconds);
  for (let i = 0; i < n; i++) out.push(start + (i * 1000) / hz + (jitter ? Math.sin(i * 12.9898) * jitter : 0));
  return out;
};

function expectGrid(efs: number[]): void {
  for (let i = 1; i < efs.length; i++) expect(efs[i]! - efs[i - 1]!).toBeCloseTo(EF_MS, 9);
}

describe('FrameScheduler (Flash 50 Hz enterFrame on rAF)', () => {
  it('60 Hz display: 50 EF/s, at most 1 per rAF, exact 20 ms grid', () => {
    const { efs, perRaf } = run(rafs(60, 10));
    expect(efs.length).toBeGreaterThanOrEqual(499);
    expect(efs.length).toBeLessThanOrEqual(501);
    expect(Math.max(...perRaf)).toBe(1);
    expectGrid(efs);
    expect(efs[0]).toBe(1000);
  });

  it('60 Hz with +-1.5 ms rAF jitter still yields 50 EF/s without drops', () => {
    const { efs } = run(rafs(60, 10, 1000, 1.5));
    expect(efs.length).toBeGreaterThanOrEqual(498);
    expect(efs.length).toBeLessThanOrEqual(501);
    expectGrid(efs);
  });

  it('144 Hz display: 50 EF/s, at most 1 per rAF', () => {
    const { efs, perRaf } = run(rafs(144, 10));
    expect(efs.length).toBeGreaterThanOrEqual(499);
    expect(efs.length).toBeLessThanOrEqual(501);
    expect(Math.max(...perRaf)).toBe(1);
    expectGrid(efs);
  });

  it('30 Hz display: still 50 EF/s by running up to 2 EFs per rAF', () => {
    const { efs, perRaf, s } = run(rafs(30, 10));
    expect(efs.length).toBeGreaterThanOrEqual(499);
    expect(efs.length).toBeLessThanOrEqual(501);
    expect(Math.max(...perRaf)).toBe(2);
    expect(s.maxPerRaf).toBe(2);
    expectGrid(efs);
  });

  it('every EF time is <= the rAF time it runs in (never runs early)', () => {
    const s = new FrameScheduler();
    for (const t of rafs(75, 3, 0, 0.7)) for (const ef of s.plan(t)) expect(ef).toBeLessThanOrEqual(t);
  });

  it('hidden tab gap: no catch-up burst, one EF at resume time, then 50 EF/s again', () => {
    const before = rafs(60, 1, 1000);
    const resume = before[before.length - 1]! + 5000;
    const after = rafs(60, 1, resume);
    const s = new FrameScheduler();
    for (const t of before) s.plan(t);
    expect(s.plan(after[0]!)).toEqual([resume]);
    let n = 1;
    for (const t of after.slice(1)) n += s.plan(t).length;
    expect(n).toBeGreaterThanOrEqual(49);
    expect(n).toBeLessThanOrEqual(51);
    // The gap did not pollute the refresh-rate estimate.
    expect(s.maxPerRaf).toBe(1);
  });

  it('jank (one 100 ms frame at 60 Hz) drops the backlog instead of bursting', () => {
    const stamps = rafs(60, 1, 1000);
    const shifted = stamps.map((t, i) => (i >= 30 ? t + 100 : t));
    const s = new FrameScheduler();
    const counts = shifted.map((t) => s.plan(t).length);
    expect(Math.max(...counts)).toBe(1);
    // ~100 ms of time is lost (about 5 EFs), nothing is replayed later.
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(51);
    expect(total).toBeGreaterThanOrEqual(44);
  });

  it('jank at 30 Hz: at most 2 EFs per rAF, grid restarts at the late frame', () => {
    const stamps = rafs(30, 1, 1000);
    const shifted = stamps.map((t, i) => (i >= 10 ? t + 150 : t));
    const s = new FrameScheduler();
    for (let i = 0; i < shifted.length; i++) {
      const due = s.plan(shifted[i]!);
      expect(due.length).toBeLessThanOrEqual(2);
      if (i === 10) expect(due).toEqual([shifted[10]]);
    }
  });

  it('reset() restarts the grid at the next rAF (used after the context-menu pause)', () => {
    const s = new FrameScheduler();
    s.plan(0); s.plan(16.7); s.plan(33.3);
    s.reset();
    expect(s.plan(5000)).toEqual([5000]);
    expect(s.plan(5016.7)).toEqual([]);
    expect(s.plan(5033.3)).toEqual([5020]);
  });
});
