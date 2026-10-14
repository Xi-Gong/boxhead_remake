// LAN protocol + transport unit tests (v0.1.3 L0): pure framing/beacon/watchdog, then the real node transport
// over localhost sockets (the LanTransport itself has no Electron dependency).
import { afterAll, describe, expect, it } from 'vitest';
import { connect as tcpConnect } from 'node:net';
import {
  decodeBeacon, encodeBeacon, encodeFrame, FrameDecoder, LinkWatchdog,
  LAN_FRAME_MAX, LAN_MAGIC, LAN_PROTOCOL_VERSION,
} from '../../../src/game/local/Net/protocol.ts';
import { LanTransport, type LanEvent } from '../../../electron/lan.ts';

const ID = '0.1.3-test+chromium';

describe('LAN TCP framing', () => {
  it('round-trips whole frames, split chunks and pipelined frames', () => {
    const msgs = [
      { t: 'hello', proto: 1, app: 'a', name: 'n', char: 2 },
      { t: 'in', tick: 1234, bits: 0b1010101 },
      { t: 'ready', ready: true },
      { t: 'setup', sel: { mode: 'Coop', charP1: 3, charP2: 1, levelIdx: 8, difficulty: 2, gameAmount: 1 } },
      { t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0009', cfg: { charP1: 3, charP2: 1 }, seed: 7, inputDelay: 2 },
    ];
    const blob = msgs.map((m) => encodeFrame(m));
    const whole = new FrameDecoder();
    expect(whole.push(concat(blob))).toEqual(msgs);
    // Same bytes in 3-byte dribbles.
    const dribbled = new FrameDecoder();
    const all = concat(blob);
    const out: unknown[] = [];
    for (let i = 0; i < all.length; i += 3) out.push(...dribbled.push(all.subarray(i, i + 3)));
    expect(out).toEqual(msgs);
  });

  it('rejects oversize frames instead of buffering forever', () => {
    const d = new FrameDecoder();
    const oversize = new Uint8Array(4);
    new DataView(oversize.buffer).setUint32(0, LAN_FRAME_MAX + 1, true);
    expect(() => d.push(oversize)).toThrow(/too large/);
  });

  it('rejects non-JSON bodies', () => {
    const d = new FrameDecoder();
    const body = new TextEncoder().encode('{{{');
    const frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, true);
    frame.set(body, 4);
    expect(() => d.push(frame)).toThrow();
  });
});

describe('LAN UDP beacon', () => {
  it('round-trips (incl. the player count)', () => {
    const text = encodeBeacon({ app: 'x', name: 'HOST-PC', status: 'lobby', players: 2, port: 47631 });
    const b = decodeBeacon(text)!;
    expect(b).not.toBeNull();
    expect({ name: b.name, status: b.status, players: b.players, port: b.port })
      .toEqual({ name: 'HOST-PC', status: 'lobby', players: 2, port: 47631 });
    // A beacon without the players field (v0.1.3 sender) reads as one player.
    const legacy = decodeBeacon(JSON.stringify({ magic: LAN_MAGIC, proto: LAN_PROTOCOL_VERSION, app: 'x', name: 'OLD', status: 'lobby', port: 47631 }))!;
    expect(legacy.players).toBe(1);
  });

  it('ignores foreign datagrams', () => {
    expect(decodeBeacon('not json')).toBeNull();
    expect(decodeBeacon(JSON.stringify({ magic: 'OTHER', proto: LAN_PROTOCOL_VERSION, status: 'lobby', port: 1 }))).toBeNull();
    expect(decodeBeacon(JSON.stringify({ magic: LAN_MAGIC, proto: 99, status: 'lobby', port: 1 }))).toBeNull();
    expect(decodeBeacon(JSON.stringify({ magic: LAN_MAGIC, proto: LAN_PROTOCOL_VERSION, status: 'weird', port: 1 }))).toBeNull();
  });
});

describe('LinkWatchdog', () => {
  it('declares silence exactly once and resets on traffic', () => {
    let t = 0;
    const w = new LinkWatchdog(() => t, 3500);
    expect(w.check()).toBe(false);
    t = 2000;
    expect(w.check()).toBe(false);
    t = 3600;
    expect(w.check()).toBe(true);
    expect(w.check()).toBe(false); // fires once
    w.heard();
    t = 5000;
    expect(w.check()).toBe(false);
    t = 9000;
    expect(w.check()).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------- real sockets

const cleanups: (() => void)[] = [];
afterAll(() => { for (const c of cleanups) c(); });

function pair(opts?: { identity?: string; linkDeadMs?: number }): { host: LanTransport; client: LanTransport; port: number } {
  const host = new LanTransport({ identity: opts?.identity ?? ID, hostName: 'host-pc', linkDeadMs: opts?.linkDeadMs });
  const client = new LanTransport({ identity: ID, hostName: 'client-pc' });
  cleanups.push(() => host.shutdown(), () => client.shutdown());
  return { host, client, port: -1 };
}

describe('LanTransport over localhost', () => {
  it('hosts, handshakes, relays messages both ways and echoes heartbeats', { timeout: 20000 }, async () => {
    const { host, client } = pair();
    const port = await host.startHost();
    expect(port).toBeGreaterThan(0);

    const hostSeen: any[] = [];
    const clientSeen: any[] = [];
    const hostEvents: LanEvent[] = [];
    host.onMessage((m) => hostSeen.push(m));
    client.onMessage((m) => clientSeen.push(m));
    host.onEvent((e) => hostEvents.push(e));

    const r = await client.connect('127.0.0.1', { name: 'client-pc', char: 3 }, port);
    expect(r.ok).toBe(true);
    // The host forwarded the hello (with a generated sid) to its renderer side.
    const hello = hostSeen.find((m) => m.t === 'hello');
    expect(hello?.char).toBe(3);
    expect(typeof hello?.sid).toBe('string');

    client.send({ t: 'lobby' });
    host.send({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0009', cfg: { charP1: 3, charP2: 3 } as any, seed: 42 });
    await waitUntil(() => hostSeen.some((m) => m.t === 'lobby') && clientSeen.some((m) => m.t === 'start'));
    expect(clientSeen.find((m) => m.t === 'start')?.seed).toBe(42);

    // Heartbeats echo back to the sender with the same ts.
    client.send({ t: 'hb', ts: 7777 });
    await waitUntil(() => clientSeen.some((m) => m.t === 'hb' && m.ts === 7777));
    expect(hostSeen.some((m) => m.t === 'hb')).toBe(false); // echoes do not reach the opposite renderer
  });

  it('rejects a different build (version) and reports the reason', { timeout: 20000 }, async () => {
    const { host, client } = pair({ identity: 'other-build+chromium' });
    const port = await host.startHost();
    const r = await client.connect('127.0.0.1', { name: 'c', char: 0 }, port);
    expect(r).toEqual({ ok: false, reason: 'version' });
  });

  it('rejects a second client while one is connected (busy), then accepts after closePeer', { timeout: 20000 }, async () => {
    const { host, client } = pair();
    const port = await host.startHost();
    expect((await client.connect('127.0.0.1', { name: 'first', char: 0 }, port)).ok).toBe(true);

    const second = new LanTransport({ identity: ID, hostName: 'second-pc' });
    cleanups.push(() => second.shutdown());
    expect((await second.connect('127.0.0.1', { name: 'second', char: 1 }, port)).reason).toBe('busy');

    host.closePeer();
    await new Promise((r) => setTimeout(r, 100)); // let the close land
    expect((await second.connect('127.0.0.1', { name: 'second', char: 1 }, port)).ok).toBe(true);
  });

  it('declares a silent link lost (watchdog) while staying ready for a reconnect', { timeout: 20000 }, async () => {
    const { host } = pair({ linkDeadMs: 400 });
    const port = await host.startHost();
    const events: LanEvent[] = [];
    host.onEvent((e) => events.push(e));

    // A raw client that handshakes then goes silent (never echoes the heartbeat).
    const raw = tcpConnect({ host: '127.0.0.1', port });
    raw.on('connect', () => raw.write(encodeFrame({ t: 'hello', proto: LAN_PROTOCOL_VERSION, app: ID, name: 'ghost', char: 0 })));
    await waitUntil(() => events.some((e) => e.kind === 'peer' && e.connected));
    await waitUntil(() => events.some((e) => e.kind === 'peer' && !e.connected && e.reason === 'lost'), 5000);
    cleanups.push(() => raw.destroy());

    // The host server is still listening: a well-behaved client can take the slot.
    const client = new LanTransport({ identity: ID, hostName: 'client-pc' });
    cleanups.push(() => client.shutdown());
    expect((await client.connect('127.0.0.1', { name: 'c2', char: 0 }, port)).ok).toBe(true);
  });

  it('scans the port range when no port is given (manual-IP join)', { timeout: 30000 }, async () => {
    // The earlier tests leave hosts holding ports WITH connected peers; a scan would rightly stop at their 'busy'.
    for (const c of cleanups.splice(0)) c();
    const { host, client } = pair();
    await host.startHost();
    const r = await client.connect('127.0.0.1', { name: 'c', char: 0 });
    expect(r.ok).toBe(true);
  });
});

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function waitUntil(pred: () => boolean, timeout = 3000): Promise<void> {
  const end = Date.now() + timeout;
  while (!pred()) {
    if (Date.now() > end) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}
