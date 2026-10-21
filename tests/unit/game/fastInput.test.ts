import { expect, it } from 'vitest';
import { FastInputPath } from '../../../electron/fastInput.ts';
import type { LanMessage } from '../../../src/game/local/Net/protocol.ts';

const until = async (condition: () => boolean) => {
  const deadline = performance.now() + 3000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('UDP condition timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

it('redundant UDP delivers, deduplicates and rejects stale game epochs without TCP input delivery', async () => {
  const received: LanMessage[][] = [[], []], offers: any[] = [];
  const a = new FastInputPath('127.0.0.1', o => offers[0] = o, m => received[0]!.push(m));
  const b = new FastInputPath('127.0.0.1', o => offers[1] = o, m => received[1]!.push(m));
  try {
    await until(() => offers.length === 2 && offers.every(Boolean));
    a.accept(offers[1]); b.accept(offers[0]);
    a.begin('first'); b.begin('first');
    a.send({ t: 'in', tick: 0, bits: 8 });
    await until(() => received[1]!.length === 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(received[1]).toEqual([{ t: 'in', tick: 0, bits: 8 }]);
    a.send({t:'in',tick:7,bits:0,weaponCommands:[{action:'bind',button:'A',weapon:'pistol'}]});
    expect((a as any).frames.has(7)).toBe(false);
    b.begin('second');
    a.send({ t: 'in', tick: 1, bits: 16 });
    await until(() => b.stats.rejected > 0);
    expect(received[1]).toHaveLength(1);
    a.begin('second');
    a.send({ t: 'in', tick: 0, bits: 16 });
    await until(() => received[1]!.length === 2);
    expect(received[1]![1]).toEqual({ t: 'in', tick: 0, bits: 16 });
    // No new send is needed when the route becomes available: the timer retries recent history.
    b.accept({ ...offers[0], token: 'wrong' });
    b.send({ t: 'in', tick: 2, bits: 1 });
    await until(() => a.stats.rejected > 0);
    expect(received[0]).toEqual([]);
    b.accept(offers[0]);
    await until(() => received[0]!.length === 1);
    expect(received[0]).toEqual([{ t: 'in', tick: 2, bits: 1 }]);
  } finally { a.close(); b.close(); }
});

it('shutdown during bind is idempotent and cannot publish a late offer', async () => {
  const offers: unknown[] = [];
  const path = new FastInputPath('127.0.0.1', o => offers.push(o), () => {});
  path.close(); path.close();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(offers).toEqual([]);
});
