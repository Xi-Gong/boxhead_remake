import { fork, type Serializable } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('independent asynchronous peers converge with different inputs and delayed delivery', async () => {
  const children = [0, 1].map(role => fork(fileURLToPath(new URL('./net-peer.worker.ts', import.meta.url)), [String(role)], {
    execArgv: ['--experimental-transform-types'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
  }));
  const receive = (i: number): Promise<any> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('peer response timed out')); }, 15000);
    const onMessage = (m: any) => { cleanup(); m.error ? reject(new Error(m.stack ?? m.error)) : resolve(m); };
    const onExit = (code: unknown) => { cleanup(); reject(new Error(`peer exited ${code}`)); };
    const cleanup = () => { clearTimeout(timer); children[i]!.off('message', onMessage); children[i]!.off('exit', onExit); };
    children[i]!.once('message', onMessage); children[i]!.once('exit', onExit);
  });
  const ask = (i: number, message: Serializable) => { const reply = receive(i); children[i]!.send(message); return reply; };
  const queues: { at: number; message: any }[][] = [[], []];
  try {
    const ready = await Promise.all([receive(0), receive(1)]);
    for (let i = 0; i < 2; i++) for (const message of ready[i].sent) queues[1 - i]!.push({ at: 0, message });
    const total = 300;
    let responses: any[] = [];
    for (let frame = 0; frame < total * 4; frame++) {
      responses = await Promise.all([0, 1].map(i => {
        const due = queues[i]!.filter(x => x.at <= frame);
        queues[i] = queues[i]!.filter(x => x.at > frame);
        return ask(i, { step: true, total, extraDraws: i * 2, messages: due.map(x => x.message) });
      }));
      for (let i = 0; i < 2; i++) {
        expect(responses[i].errors).toEqual([]);
        expect(responses[i].phase, JSON.stringify(responses[i].desync)).toBe('playing');
        for (const message of responses[i].sent) queues[1 - i]!.push({ at: frame + 2 + (frame % 5), message });
      }
      if (responses.every(r => r.tick >= total)) break;
    }
    expect(responses.map(r => r.tick)).toEqual([total, total]);
    const final = await Promise.all([0, 1].map(i => ask(i, { settle: true, messages: queues[i]!.map(x => x.message) })));
    expect(final[0].digest).toEqual(final[1].digest);
    expect(final[0].events).toEqual(final[1].events);
    for (const r of final) { expect(r.stats.corrections).toBeGreaterThan(0); expect(r.errors).toEqual([]); }
  } finally { for (const child of children) child.kill(); }
}, 120000);
