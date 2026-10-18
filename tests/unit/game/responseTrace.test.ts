import { expect, it } from 'vitest';
import { ResponseTrace } from '../../../src/game/local/Net/ResponseTrace.ts';

it('response diagnostics are opt-in, bounded, and release their records when disabled', () => {
  const trace = new ResponseTrace();
  trace.record('sample', 0, 0, 8);
  expect(trace.read()).toEqual([]);
  trace.setEnabled(true);
  for (let tick = 0; tick < 3000; tick++) trace.record('apply', tick, 1, 8);
  expect(trace.read()).toHaveLength(2048);
  expect(trace.read()[0]?.tick).toBe(952);
  expect(trace.read().at(-1)).toMatchObject({ tick: 2999, role: 1, stage: 'apply', detail: 8 });
  trace.setEnabled(false);
  expect(trace.read()).toEqual([]);
});
