/**
 * Audio failure recovery (v0.1.10): preload retries, on-demand heal of missing buffers, startVoice crash fallback.
 * MockAudioContext follows the virtual clock (currentTime = nowMs()/1000) so voice timing stays deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAudioForTests, _setAudioContextForTests, activeVoiceCount, healSound, preloadSounds, pumpSoundEvents,
  registerBuffer, startVoice,
} from '../../../src/engine/platform/AudioEngine.ts';
import { advanceVirtual, nowMs, useRealClock, useVirtualClock } from '../../../src/engine/flash/clock.ts';
import type { SoundDef } from '../../../src/shared/assetSchema.ts';

const def = (id: number): SoundDef =>
  ({ t: 'sound', id, file: `sounds/${id}.mp3`, format: 'mp3', rate: 22050, stereo: false, sampleCount: 22050 });

class MockAudioParam {
  value = 1;
  setValueAtTime(v: number): this { this.value = v; return this; }
  linearRampToValueAtTime(v: number): this { this.value = v; return this; }
}
class MockNode {
  connect(): this { return this; }
  disconnect(): void { /* noop */ }
}
class MockGainNode extends MockNode { readonly gain = new MockAudioParam(); }
class MockBufferSource extends MockNode {
  buffer: unknown; loop = false; loopStart = 0; loopEnd = 0; onended: (() => void) | null = null;
  start(): void { /* noop */ }
  stop(): void { /* noop */ }
}
class MockAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new MockNode();
  throwOnBufferSource = false;
  get currentTime(): number { return nowMs() / 1000; }
  createGain(): MockGainNode { return new MockGainNode(); }
  createChannelSplitter(): MockNode { return new MockNode(); }
  createChannelMerger(): MockNode { return new MockNode(); }
  createBufferSource(): MockBufferSource {
    if (this.throwOnBufferSource) throw new Error('node graph exploded');
    return new MockBufferSource();
  }
  decodeAudioData(_data: ArrayBuffer): Promise<{ duration: number }> { return Promise.resolve({ duration: 1 }); }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
  addEventListener(): void { /* noop */ }
  removeEventListener(): void { /* noop */ }
}

/** fetch stub keyed by `sounds/<id>.mp3`; ids in `failingIds` get a 404. */
function controlledFetch(failingIds: ReadonlySet<number>) {
  return vi.fn(async (input: unknown) => {
    const m = /sounds\/(\d+)\.mp3/.exec(String(input));
    const id = m ? Number(m[1]) : -1;
    if (failingIds.has(id)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
  });
}

const asCtx = (c: MockAudioContext): AudioContext => c as unknown as AudioContext;

describe('audio failure recovery (v0.1.10)', () => {
  beforeEach(() => { _resetAudioForTests(); useVirtualClock(0); });
  afterEach(() => { vi.unstubAllGlobals(); _resetAudioForTests(); });
  afterEach(() => useRealClock());

  it('preload retries a failed sound and heals it before resolving', async () => {
    _setAudioContextForTests(asCtx(new MockAudioContext()));
    // only the FIRST 558 fetch fails (transient boot-window hiccup)
    let calls558 = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      if (/sounds\/558\.mp3/.test(String(input)) && ++calls558 === 1) {
        return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await preloadSounds(
      { exports: {}, chars: { 558: def(558), 563: def(563) } }, 'https://game.test/assets/',
    );
    expect(res.failed).toEqual([]);
    expect(res.loaded).toBe(2);
    expect(res.total).toBe(2);
    expect(calls558).toBe(2); // one initial attempt + one retry
  });

  it('preload reports a permanently failing sound after the retry rounds and never rejects', async () => {
    _setAudioContextForTests(asCtx(new MockAudioContext()));
    const fetchMock = controlledFetch(new Set([558]));
    vi.stubGlobal('fetch', fetchMock);
    const res = await preloadSounds(
      { exports: {}, chars: { 558: def(558), 563: def(563) } }, 'https://game.test/assets/',
    );
    expect(res.loaded).toBe(1);
    expect(res.failed).toEqual([558]);
    // 1 first-pass attempt + 2 retry rounds for 558; one call for 563
    expect(fetchMock.mock.calls.filter(([u]) => /558\.mp3/.test(String(u)))).toHaveLength(3);
  });

  it('startVoice falls back to silent timing when node creation throws (caller not aborted, completion fires)', () => {
    const c = new MockAudioContext();
    c.throwOnBufferSource = true;
    _setAudioContextForTests(asCtx(c));
    registerBuffer(558, { duration: 1 } as unknown as AudioBuffer);
    let done = 0;
    const v = startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1, onComplete: () => { done++; } });
    expect((v as { src?: unknown }).src).toBeUndefined();
    advanceVirtual(999);
    pumpSoundEvents();
    expect(done).toBe(0);
    advanceVirtual(1);
    pumpSoundEvents();
    expect(done).toBe(1);
    expect(activeVoiceCount()).toBe(0);
  });

  it('on-demand heal: a missing buffer refetches once (deduped) and the next startVoice plays', async () => {
    _setAudioContextForTests(asCtx(new MockAudioContext()));
    const failing = new Set<number>([558]);
    const fetchMock = controlledFetch(failing);
    vi.stubGlobal('fetch', fetchMock);
    const res = await preloadSounds({ exports: {}, chars: { 558: def(558) } }, 'https://game.test/assets/');
    expect(res.failed).toEqual([558]);
    const afterBoot = fetchMock.mock.calls.length; // 3 attempts
    // first play: silent voice; the background heal is fired and deduped with an explicit join
    const v1 = startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1 });
    expect((v1 as { src?: unknown }).src).toBeUndefined();
    await healSound(558);
    await healSound(558); // cadence-limited: no extra fetch
    expect(fetchMock.mock.calls.length).toBe(afterBoot + 1);
    // route fixed; next cadence window heals the sound for good
    failing.delete(558);
    advanceVirtual(5000);
    const v2 = startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1 });
    expect((v2 as { src?: unknown }).src).toBeUndefined(); // still silent: heal is async
    await healSound(558);
    const v3 = startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1 });
    expect((v3 as { src?: unknown }).src).toBeDefined();
    expect(fetchMock.mock.calls.length).toBe(afterBoot + 2);
    void v2;
  });

  it('headless heal is a no-op without a context or library base (harness safety)', async () => {
    // no _setAudioContextForTests, no preloadSounds: startVoice on an unknown id must not throw or fetch
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const v = startVoice({ charId: 999, owner: undefined, offsetSec: 0, loops: 1 });
    expect((v as { src?: unknown }).src).toBeUndefined();
    await healSound(999);
    expect(fetchMock).not.toHaveBeenCalled();
    advanceVirtual(2000);
    pumpSoundEvents();
    expect(activeVoiceCount()).toBe(0);
  });
});
