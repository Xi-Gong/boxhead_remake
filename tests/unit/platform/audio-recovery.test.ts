/**
 * Audio failure recovery (v0.1.10): preload retries, on-demand heal of missing buffers, startVoice crash fallback.
 * MockAudioContext follows the virtual clock (currentTime = nowMs()/1000) so voice timing stays deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAudioForTests, _setAudioContextFactoryForTests, _setAudioContextForTests, activeVoiceCount,
  audioDiagnostics, getAudioContext, healSound, preloadSounds, pumpSoundEvents, registerBuffer, SoundEngine,
  startVoice, tickAudioWatchdog, installAudioUnlock, resumeAudio,
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
  /** 'fix': resume() flips to running; 'stuck': resume() resolves but the state never recovers. */
  resumeBehavior: 'fix' | 'stuck' = 'fix';
  decodeCalls = 0;
  frozenClock = false;
  get currentTime(): number { return this.frozenClock ? 0 : nowMs() / 1000; }
  createGain(): MockGainNode { return new MockGainNode(); }
  createChannelSplitter(): MockNode { return new MockNode(); }
  createChannelMerger(): MockNode { return new MockNode(); }
  createBufferSource(): MockBufferSource {
    if (this.throwOnBufferSource) throw new Error('node graph exploded');
    return new MockBufferSource();
  }
  decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
    this.decodeCalls++;
    return Promise.resolve({ duration: 1 } as AudioBuffer);
  }
  resume(): Promise<void> { if (this.resumeBehavior === 'fix') this.state = 'running'; return Promise.resolve(); }
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

describe('audio context watchdog (v0.1.10)', () => {
  beforeEach(() => { _resetAudioForTests(); useVirtualClock(0); });
  afterEach(() => { vi.unstubAllGlobals(); _resetAudioForTests(); useRealClock(); });

  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('arms recovery before first construction fails, without requiring another game launch', () => {
    let beat: (() => void) | undefined, attempts=0;
    vi.stubGlobal('window', {});
    const timer=vi.spyOn(globalThis,'setInterval').mockImplementation(((fn:()=>void)=>{beat=fn;return 1;}) as any);
    try {
      _setAudioContextFactoryForTests(()=>{
        expect(beat).toBeDefined();
        if(++attempts===1)throw new Error('first construction unavailable');
        return asCtx(new MockAudioContext());
      });
      expect(getAudioContext()).toBeUndefined(); beat!();
      expect(SoundEngine.context?.state).toBe('running'); expect(attempts).toBe(2);
    } finally { _resetAudioForTests();timer.mockRestore(); }
  });

  it('keeps gesture retries after construction failure and removes them only after successful resume', async () => {
    let attempts=0;const target=new EventTarget(),remove=vi.spyOn(target,'removeEventListener');
    _setAudioContextFactoryForTests(()=>{
      if(++attempts===1)throw new Error('first construction unavailable');
      const c=new MockAudioContext();c.state='suspended';return asCtx(c);
    });
    const cleanup=installAudioUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));await flush();expect(remove).not.toHaveBeenCalled();
    target.dispatchEvent(new Event('keydown'));await flush();expect(SoundEngine.context?.state).toBe('running');
    expect(remove).toHaveBeenCalledTimes(4);cleanup();
  });

  it('shares resume attempts and rejects stale completion after context replacement', async () => {
    const made:MockAudioContext[]=[];let finish!:()=>void,calls=0;
    _setAudioContextFactoryForTests(()=>{const c=new MockAudioContext();made.push(c);return asCtx(c);});
    getAudioContext();const old=made[0]!;old.state='suspended';
    old.resume=()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});};
    const a=resumeAudio(),b=resumeAudio();tickAudioWatchdog();expect(calls).toBe(1);
    old.state='closed';tickAudioWatchdog();expect(made).toHaveLength(2);
    old.state='running';finish();expect(await a).toBe(false);expect(await b).toBe(false);
    expect(SoundEngine.context).toBe(asCtx(made[1]!));
  });

  it('rebuilds after three node failures and clears completion latches without replaying old sounds', () => {
    const made:MockAudioContext[]=[];let done=0;
    _setAudioContextFactoryForTests(()=>{const c=new MockAudioContext();c.throwOnBufferSource=made.length===0;made.push(c);return asCtx(c);});
    getAudioContext();registerBuffer(558,{duration:1} as AudioBuffer);
    for(let n=0;n<3;n++)startVoice({charId:558,owner:undefined,offsetSec:0,loops:1,onComplete:()=>done++});
    tickAudioWatchdog();expect(made).toHaveLength(2);expect(done).toBe(3);expect(activeVoiceCount()).toBe(0);
    const next=startVoice({charId:558,owner:undefined,offsetSec:0,loops:1});expect((next as any).src).toBeDefined();
  });

  it('recovers a running context whose playback clock stalls, but leaves an idle clock alone', () => {
    const made:MockAudioContext[]=[];let done=0;
    _setAudioContextFactoryForTests(()=>{const c=new MockAudioContext();c.frozenClock=made.length===0;made.push(c);return asCtx(c);});
    getAudioContext();advanceVirtual(10000);tickAudioWatchdog();expect(made).toHaveLength(1);
    registerBuffer(558,{duration:1} as AudioBuffer);
    startVoice({charId:558,owner:undefined,offsetSec:0,loops:60,onComplete:()=>done++});
    advanceVirtual(3100);tickAudioWatchdog();expect(made).toHaveLength(2);expect(done).toBe(1);
  });

  it('ignores old decode completion after recovery instead of replacing the new buffer', async () => {
    const made:MockAudioContext[]=[];let finish!:(value:AudioBuffer)=>void;
    _setAudioContextFactoryForTests(()=>{
      const c=new MockAudioContext();
      if(!made.length)c.decodeAudioData=()=>new Promise(resolve=>{finish=resolve;});
      made.push(c);return asCtx(c);
    });
    vi.stubGlobal('fetch',controlledFetch(new Set()));
    const loading=preloadSounds({exports:{},chars:{558:def(558)}},'https://game.test/assets/');await flush();
    made[0]!.state='closed';tickAudioWatchdog();await flush();
    finish({duration:999} as AudioBuffer);await loading;
    const next=startVoice({charId:558,owner:undefined,offsetSec:0,loops:1});
    expect(next.totalSec).toBe(1);expect(audioDiagnostics().failed).toEqual([]);
  });

  it('retires suspended sources rather than playing accumulated effects when resume succeeds', async () => {
    const c=new MockAudioContext();_setAudioContextForTests(asCtx(c));registerBuffer(558,{duration:1} as AudioBuffer);
    let done=0;startVoice({charId:558,owner:undefined,offsetSec:0,loops:1,onComplete:()=>done++});
    c.state='suspended';expect(await resumeAudio()).toBe(true);
    expect(done).toBe(1);expect(activeVoiceCount()).toBe(0);
  });

  it('releases silent fallback voices when the first context recovers with a different clock origin', () => {
    advanceVirtual(60000);registerBuffer(558,{duration:1} as AudioBuffer);
    let done=0;startVoice({charId:558,owner:undefined,offsetSec:0,loops:1,onComplete:()=>done++});
    _setAudioContextFactoryForTests(()=>{const c=new MockAudioContext();c.frozenClock=true;return asCtx(c);});
    getAudioContext();expect(done).toBe(1);expect(activeVoiceCount()).toBe(0);
  });

  it('no sticky latch: a failed construction is retried on the next call', () => {
    let calls = 0;
    _setAudioContextFactoryForTests(() => {
      calls++;
      if (calls === 1) throw new Error('audio service busy');
      return asCtx(new MockAudioContext());
    });
    expect(getAudioContext()).toBeUndefined();
    expect(getAudioContext()).toBeDefined();
    expect(calls).toBe(2);
  });

  it('watchdog resumes a suspended context (no recreation)', async () => {
    const c = new MockAudioContext();
    _setAudioContextForTests(asCtx(c));
    c.state = 'suspended';
    tickAudioWatchdog();
    await flush();
    expect(c.state).toBe('running');
    tickAudioWatchdog();
    expect(audioDiagnostics().recoveries).toBe(0);
  });

  it('watchdog recreates a wedged context: voices complete naturally, buffers re-decode on the new context', async () => {
    const made: MockAudioContext[] = [];
    _setAudioContextFactoryForTests(() => { const c = new MockAudioContext(); made.push(c); return asCtx(c); });
    const fetchMock = controlledFetch(new Set());
    vi.stubGlobal('fetch', fetchMock);
    const res = await preloadSounds({ exports: {}, chars: { 558: def(558) } }, 'https://game.test/assets/');
    expect(res.failed).toEqual([]);
    let done = 0;
    startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1, onComplete: () => { done++; } });
    expect(activeVoiceCount()).toBe(1);
    // the context wedges: suspended, and resume() no longer helps
    made[0]!.resumeBehavior = 'stuck';
    made[0]!.state = 'suspended';
    for (let i = 0; i < 5; i++) { tickAudioWatchdog(); await flush(); }
    expect(made).toHaveLength(2);
    expect(done).toBe(1); // natural completion -> CSound mPlaying latches clear (ambience channels unstick)
    expect(activeVoiceCount()).toBe(0);
    expect(audioDiagnostics().recoveries).toBe(1);
    expect(audioDiagnostics().state).toBe('running');
    await flush();
    expect(made[1]!.decodeCalls).toBe(1); // re-decoded from the retained raw bytes...
    expect(fetchMock.mock.calls).toHaveLength(1); // ...without a refetch
    // and the new context plays
    const v = startVoice({ charId: 558, owner: undefined, offsetSec: 0, loops: 1 });
    expect((v as { src?: unknown }).src).toBeDefined();
  });

  it('watchdog recreates a closed context immediately', () => {
    const made: MockAudioContext[] = [];
    _setAudioContextFactoryForTests(() => { const c = new MockAudioContext(); made.push(c); return asCtx(c); });
    getAudioContext();
    expect(made).toHaveLength(1);
    made[0]!.state = 'closed';
    tickAudioWatchdog();
    expect(made).toHaveLength(2);
    expect(audioDiagnostics().recoveries).toBe(1);
    expect(audioDiagnostics().state).toBe('running');
  });

  it('mute survives context recreation', () => {
    const made: MockAudioContext[] = [];
    _setAudioContextFactoryForTests(() => { const c = new MockAudioContext(); made.push(c); return asCtx(c); });
    getAudioContext();
    SoundEngine.muted = true;
    made[0]!.state = 'closed';
    tickAudioWatchdog();
    expect(audioDiagnostics().muted).toBe(true);
    expect(audioDiagnostics().state).toBe('running');
    SoundEngine.muted = false;
  });

  it('watchdog sweep heals failed loads, cadence-limited', async () => {
    const c = new MockAudioContext();
    _setAudioContextForTests(asCtx(c));
    const failing = new Set<number>([558]);
    const fetchMock = controlledFetch(failing);
    vi.stubGlobal('fetch', fetchMock);
    await preloadSounds({ exports: {}, chars: { 558: def(558) } }, 'https://game.test/assets/');
    expect(audioDiagnostics().failed).toEqual([558]);
    const bootCalls = fetchMock.mock.calls.length;
    tickAudioWatchdog(); // a heal attempt fires
    await flush();
    expect(fetchMock.mock.calls.length).toBe(bootCalls + 1);
    tickAudioWatchdog(); // cadence-limited: same virtual second -> no fetch
    await flush();
    expect(fetchMock.mock.calls.length).toBe(bootCalls + 1);
    advanceVirtual(5000);
    failing.delete(558); // the file reappears
    tickAudioWatchdog();
    await flush();
    expect(fetchMock.mock.calls.length).toBe(bootCalls + 2);
    expect(audioDiagnostics().failed).toEqual([]);
  });
});
