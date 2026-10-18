import { fork, type Serializable } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const scenarios = [
  { name: 'personal growth under correction and recovery', growth: true, rtt: 100, jitter: 20, reconnect: true, total: 360 },
  { name: 'asymmetric jitter' }, { name: 'shared pause', pause: true }, { name: 'history recovery', reconnect: true },
  { name: 'renderer gap catches up', rtt: 60, renderGap: true },
  ...[0,30,60,100,200].map(rtt => ({ name: `RTT ${rtt}ms`, rtt })),
  { name: '20ms jitter, 1% primary loss', rtt: 60, jitter: 20, loss: 1 },
  { name: '50ms jitter, 3% primary loss, 500ms outage', rtt: 100, jitter: 50, loss: 3, outage: 500 },
  ...[0,1,2].map(speed => ({ name: `all weapons speed ${speed}`, speed, weapons: true, total: 360 })),
  { name: 'deathmatch low detail', mode: 'DeathMatch', detail: false, weapons: true, total: 360 },
  { name: 'deathmatch confirmed checkpoint', mode: 'DeathMatch', total: 1550 },
];
it.each(scenarios)('independent asynchronous peers converge: $name', async (scenario: any) => {
  const {pause,reconnect} = scenario;
  const children = [0, 1].map(role => fork(fileURLToPath(new URL('./net-peer.worker.ts', import.meta.url)), [String(role), JSON.stringify(scenario)], {
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
    const total = scenario.total ?? 300;
    let responses: any[] = [];
    for (let frame = 0; frame < total * 7; frame++) {
      responses = await Promise.all([0, 1].map(i => {
        const limit = scenario.outage && frame >= 120 && frame < 120 + scenario.outage / 20 ? -1 : frame;
        const due = queues[i]!.filter(x => x.at <= limit);
        queues[i] = queues[i]!.filter(x => x.at > limit);
        return ask(i, { step: true, total, extraDraws: i * 2, messages: due.map(x => x.message),
          renderGap: scenario.renderGap && i === 1 && frame >= 80 && frame < 90,
          disconnect: reconnect && frame === 80, reconnect: reconnect && frame === 130,
          ...(pause && frame === 80 && i === 0 ? { pause: true } : {}),
          ...(pause && frame === 140 && i === 1 ? { pause: false } : {}) });
      }));
      if (responses.some(r => r.phase === 'desync')) {
        const tick = responses.find(r => r.desync)?.desync?.tick;
        const evidence = await Promise.all([0,1].map(i => ask(i, { dumpTick: tick })));
        mkdirSync('generated/reports/netcode', { recursive: true });
        writeFileSync('generated/reports/netcode/divergence.json', JSON.stringify({ scenario, tick, evidence }, null, 2));
      }
      for (let i = 0; i < 2; i++) {
        expect(responses[i].errors).toEqual([]);
        if (reconnect && frame >= 80 && frame < 160) expect(['playing','reconnecting']).toContain(responses[i].phase);
        else if (scenario.weapons && responses[i].phase === 'ended') {
          expect(responses[i].complete).toBe('player dead');
          expect(responses[i].desync).toBeUndefined();
          expect(responses[i].endReason).toBeUndefined();
        } else expect(responses[i].phase, JSON.stringify(responses[i])).toBe('playing');
        expect(responses[i].sameWorld).toBe(true);
        for (const message of responses[i].sent) {
          const delay = scenario.rtt === undefined ? 2 + frame % 5 : Math.max(0, Math.ceil((scenario.rtt / 2 + (scenario.jitter ?? 0) * Math.sin(frame * 7 + i)) / 20));
          const lostPrimary = message.t === 'in' && (message.tick * 17 + i) % 100 < (scenario.loss ?? 0);
          queues[1 - i]!.push({ at: frame + delay + (lostPrimary ? 8 : 0), message });
          if (message.t === 'in' && !lostPrimary) queues[1 - i]!.push({ at: frame + delay + 3, message });
        }
      }
      if (pause && frame === 125) {
        expect(responses.map(r => r.paused)).toEqual([true, true]);
        expect(responses[0].tick).toBe(responses[1].tick);
      }
      if(scenario.renderGap && frame===220)expect(Math.abs(responses[0].tick-responses[1].tick)).toBeLessThanOrEqual(2);
      if (responses.every(r => r.tick >= total || r.phase === 'ended')) break;
    }
    if (responses.some(r => r.phase === 'ended')) {
      expect(responses.map(r => r.phase)).toEqual(['ended','ended']);
      expect(responses[0].tick).toBe(responses[1].tick);
      expect(responses[0].tick).toBeGreaterThan(0);
    } else expect(responses.map(r => r.tick)).toEqual([total, total]);
    const final = await Promise.all([0, 1].map(i => ask(i, { settle: true, messages: queues[i]!.map(x => x.message) })));
    expect(final[0].digest).toEqual(final[1].digest);
    expect(final[0].events).toEqual(final[1].events);
    expect(final[0].decals).toEqual(final[1].decals);
    if (scenario.growth) {
      expect(final[0].growth).toEqual(final[1].growth);
      expect(final[0].growth.players.some((p:any)=>p.level>1)).toBe(true);
    }
    for (const r of final) {
      if (scenario.rtt === undefined || scenario.rtt > 0) expect(r.stats.corrections).toBeGreaterThan(0);
      expect(r.errors).toEqual([]);
      if (scenario.weapons) expect(r.weapons).toHaveLength(10);
      if (scenario.total === 1550) expect(r.checkpoint - r.startTick).toBe(1500);
    }
  } finally { for (const child of children) child.kill(); }
}, 120000);
