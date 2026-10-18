import { expect, it } from 'vitest';
import { PauseBarrier } from '../../../src/game/local/Net/PauseBarrier.ts';

it('pauses at the greater frozen head and waits for corrections and confirmation', () => {
  const hostOut: any[] = [], guestOut: any[] = [];
  const host = new PauseBarrier(0, m => hostOut.push(m)), guest = new PauseBarrier(1, m => guestOut.push(m));
  guest.request(true, 12);
  host.receive(guestOut.shift(), 10);
  expect(host.blocks(10)).toBe(true);
  guest.receive(hostOut.shift(), 13);
  expect(guest.blocks(13)).toBe(true);
  host.receive(guestOut.shift(), 10);
  expect(host.blocks(10)).toBe(false);
  guest.receive(hostOut.shift(), 13);
  expect(host.blocks(13)).toBe(true);
  expect(host.settled(13, 11, false)).toBe(false);
  expect(host.settled(13, 12, true)).toBe(false);
  expect(host.settled(13, 12, false)).toBe(true);
  expect(guest.settled(13, 12, false)).toBe(true);
  guest.request(false, 13); host.receive(guestOut.shift(), 13); guest.receive(hostOut.shift(), 13);
  expect(host.blocks(13)).toBe(false); expect(guest.blocks(13)).toBe(false);
});

it('a late ready cannot reinstate a cancelled barrier', () => {
  const out: any[] = [];
  const host = new PauseBarrier(0, m => out.push(m));
  host.request(true, 10); host.request(false, 10);
  host.receive({ t: 'pause-barrier', stage: 'ready', id: 1, tick: 12 }, 10);
  expect(host.blocks(10)).toBe(false);
  expect(out.map(m => m.stage)).toEqual(['freeze', 'resume']);
});
