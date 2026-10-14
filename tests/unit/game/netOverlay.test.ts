// v0.1.7 net overlay unit tests with a minimal DOM shim (the sim harness runs without a document, and the
// overlay's live-ping / stall-grace logic deserves pinning independent of the packaged E2E): sync() is driven
// through the bridge's netOverlaySync hook exactly like the real page does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, installNetOverlay } from '../../../src/game/local/Net/overlay.ts';
import { netOverlaySync, setNetOverlaySync } from '../../../src/game/local/Net/bridge.ts';
import type { NetSession } from '../../../src/game/local/Net/NetSession.ts';

/** Minimal element: only what overlay.ts touches (style props, textContent, appendChild). */
class FakeEl {
  style: Record<string, string> = {};
  textContent = '';
  children: FakeEl[] = [];
  appendChild(c: FakeEl): FakeEl { this.children.push(c); return c; }
}

const makeDom = (): { body: FakeEl; created: FakeEl[] } => {
  const body = new FakeEl();
  const created: FakeEl[] = [];
  const doc = {
    createElement: () => { const el = new FakeEl(); created.push(el); return el; },
    getElementById: () => undefined,
    body,
  };
  vi.stubGlobal('document', doc);
  return { body, created };
};

/** A session-shaped object with only the fields sync() reads. */
const fakeSession = (over: Record<string, unknown>): NetSession => ({ reconnectSecondsLeft: () => 0, ...over } as unknown as NetSession);

describe('net overlay sync (v0.1.7)', () => {
  beforeEach(() => { _resetForTests(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetForTests();
    setNetOverlaySync(() => {}); // drop the shim's sync so later imports re-install cleanly
  });

  it('ping readout: live while playing, hidden once the game ends (the E2E residue regression)', () => {
    const dom = makeDom();
    installNetOverlay();

    // In game: the ping is visible and refreshes with every heartbeat sync (the elements are created lazily).
    netOverlaySync(fakeSession({ phase: 'playing', role: 0, rttMs: 514 }));
    const strip = dom.created[0]!;
    const ping = dom.created[1]!;
    expect(ping.style.display).toBe('block');
    expect(ping.textContent).toBe('514 ms');
    netOverlaySync(fakeSession({ phase: 'playing', role: 0, rttMs: 0 }));
    expect(ping.textContent).toBe('<1 ms');

    // Concede -> ended: RUN OVER shows briefly, and the ping readout is GONE.
    netOverlaySync(fakeSession({ phase: 'ended', role: 0, rttMs: 0, endReason: 'concede', mode: 'Coop' }));
    expect(strip.textContent).toBe('RUN OVER');
    expect(ping.style.display).toBe('none');

    // A post-end heartbeat must not resurrect it (ended sessions stay silent).
    netOverlaySync(fakeSession({ phase: 'ended', role: 0, rttMs: 0, endReason: 'concede', mode: 'Coop' }));
    expect(ping.style.display).toBe('none');
  });

  it('WAITING strip: a stall inside the grace window shows nothing yet; a persistent one shows', () => {
    vi.useFakeTimers();
    const dom = makeDom();
    installNetOverlay();
    const since = Date.now() - 50; // 50 ms into the stall
    netOverlaySync(fakeSession({ phase: 'playing', role: 0, rttMs: 30, stallReason: 'peer', stallSince: since }));
    const strip = dom.created[0]!;
    expect(strip.textContent).toBe(''); // not yet due: no flash
    vi.advanceTimersByTime(160); // the grace elapses while the stall persists
    expect(strip.textContent).toBe('WAITING FOR PLAYER 2...');
    // The frame arrives: the strip is scheduled to hide.
    netOverlaySync(fakeSession({ phase: 'playing', role: 0, rttMs: 30 }));
    vi.advanceTimersByTime(700);
    expect(strip.style.display).toBe('none');
    vi.useRealTimers();
  });

  it('a micro-stall that clears inside the grace window never shows the strip', () => {
    vi.useFakeTimers();
    const dom = makeDom();
    installNetOverlay();
    netOverlaySync(fakeSession({ phase: 'playing', role: 1, rttMs: 30, stallReason: 'peer', stallSince: Date.now() }));
    const strip = dom.created[0]!;
    netOverlaySync(fakeSession({ phase: 'playing', role: 1, rttMs: 30 })); // cleared 0 ms later
    vi.advanceTimersByTime(400);
    expect(strip.textContent).toBe('');
    vi.useRealTimers();
  });
});
