import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sockets = vi.hoisted(() => [] as any[]);
vi.mock('node:dgram', async () => {
  const { EventEmitter } = await import('node:events');
  return { createSocket: () => {
    const socket = new EventEmitter() as any;
    socket.setBroadcast = vi.fn();
    socket.close = vi.fn(() => { socket.closed = true; socket.emit('close'); });
    socket.send = vi.fn((_body, _port, _target, callback) => { callback?.(null); });
    sockets.push(socket);
    return socket;
  } };
});
vi.mock('node:net', () => ({
  connect: vi.fn(),
  createServer: () => ({ listening: false, once() {}, off() {},
    listen(_options: unknown, callback: () => void) { this.listening = true; callback(); },
    close() { this.listening = false; },
  }),
}));
vi.mock('node:os', () => ({ hostname: () => 'QA', networkInterfaces: () => ({
  ethernet: [{ family: 'IPv4', internal: false, address: '192.168.10.2', netmask: '255.255.255.0' }],
}) }));
import { LanTransport, type LanEvent } from '../../../electron/lan.ts';

let host: LanTransport;
let events: LanEvent[];
beforeEach(() => {
  vi.useFakeTimers(); sockets.length = 0; events = [];
  host = new LanTransport({ identity: 'beacon-lifetime', hostName: 'QA' });
  host.onEvent(event => events.push(event));
});
afterEach(() => { host.shutdown(); vi.useRealTimers(); });

describe('host beacon lifetime', () => {
  it('stops the current target loop when sending re-enters shutdown', async () => {
    await host.startHost();
    const socket = sockets[0]; socket.send.mockClear();
    socket.send.mockImplementation(() => host.stopHost());
    expect(() => host.setHostStatus('playing')).not.toThrow();
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(host.hosting).toBe(false);
  });

  it('enables directed broadcast only on the current listening socket', async () => {
    await host.startHost(); const old = sockets[0];
    host.stopHost(); await host.startHost(); const current = sockets[1];
    old.emit('listening'); current.emit('listening');
    expect(old.setBroadcast).not.toHaveBeenCalled();
    expect(current.setBroadcast).toHaveBeenCalledWith(true);
  });

  it('keeps the host alive and reports UDP failures once without throwing', async () => {
    await host.startHost(); const socket = sockets[0];
    const error = Object.assign(new Error('interface unavailable'), { code: 'EACCES' });
    socket.send.mockImplementation((_body, _port, _target, callback) => callback(error));
    expect(() => host.setHostStatus('playing')).not.toThrow();
    expect(() => socket.emit('error', error)).not.toThrow();
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    expect(events.filter(event => event.kind === 'error')).toHaveLength(1);
    expect(host.hosting).toBe(true);
  });

  it('contains synchronous send and broadcast-option errors', async () => {
    await host.startHost(); const socket = sockets[0];
    socket.send.mockImplementation(() => { throw new Error('socket unavailable'); });
    socket.setBroadcast.mockImplementation(() => { throw new Error('broadcast unavailable'); });
    expect(() => socket.emit('listening')).not.toThrow();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(events.filter(event => event.kind === 'error')).toHaveLength(1);
  });

  it('ignores old send callbacks and errors after a new room starts', async () => {
    await host.startHost(); const old = sockets[0];
    let complete: (error: Error) => void;
    old.send.mockImplementation((_body, _port, _target, callback) => { complete = callback; });
    host.setHostStatus('playing'); host.stopHost(); await host.startHost();
    expect(() => complete(new Error('late UDP completion'))).not.toThrow();
    expect(() => old.emit('error', new Error('late socket error'))).not.toThrow();
    expect(events).toEqual([]);
    expect(host.hosting).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('detaches the socket before close callbacks and makes shutdown idempotent', async () => {
    await host.startHost(); const socket = sockets[0]; socket.send.mockClear();
    socket.on('close', () => host.setHostStatus('playing'));
    host.stopHost(); host.stopHost();
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
