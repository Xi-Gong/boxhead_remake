/**
 * WebAudio backend for the AS2 `Sound` object (engine/flash/Sound.ts) and SWF StartSound tags.   OWNER: lane D
 *
 * Boot (src/main.ts):
 *     await preloadSounds(libraryJson, assetsBaseUrl, (done, total) => ...);   // fetch + decode every SoundDef
 *     installAudioUnlock();                                                    // resume on first gesture (browser)
 *     await unlockAudioOverlay(stageElement);                                  // browser only: "click to start"
 * Headless tests: `registerSoundLibrary(lib)` (no decoding) and call `pumpSoundEvents()` once per EF so
 * onSoundComplete fires on the virtual clock.
 *
 * Timeline sounds (lane E): `playTimelineSound(charId, soundInfo, ownerClip)` for every StartSound in a frame.
 *
 * Flash model reproduced here:
 *   - One SoundTransform per TARGET clip (`new Sound(mc)`), shared by every Sound object created for that clip and
 *     applied live to the clip's playing sounds. `new Sound()` (no target) is the global transform (master bus).
 *   - Volume and pan are stored as int32 (Flash truncates: setVolume(14.8) -> getVolume() == 14).
 *   - setPan is a linear BALANCE (not a constant-power pan): pan > 0 attenuates the left channel to (100-pan)%,
 *     pan < 0 attenuates the right channel to (100+pan)%. Implemented with a 2x2 channel matrix
 *     (ChannelSplitter -> 4 gains -> ChannelMerger); mono sources are up-mixed to L = R first.
 *   - Not hierarchical: a target's transform is applied on top of the global one only (enough for this game).
 *   - MP3s are played as decoded (no encoder-delay trimming), like Flash plays the frames from the start.
 *
 * Failure self-healing (v0.1.10): a sound that failed to load plays silently with correct timing until healSound /
 * the watchdog reloads it (preload retries twice first; startVoice fires a deduped background heal on a missing
 * buffer); a suspended AudioContext is resumed, a wedged/closed one is recreated from scratch (voices finish
 * naturally first, buffers re-decode from the retained raw bytes). Watchdog: 1 s interval in a browser/Electron,
 * driven as tickAudioWatchdog() in tests.
 */
import type { LibraryJson, SoundDef, SoundInfo } from '../../shared/assetSchema.ts';
import { nowMs } from '../flash/clock.ts';

export type SoundLibrary = Pick<LibraryJson, 'exports' | 'chars'>;

// =====================================================================================================================
// Pure helpers (unit-tested in tests/unit/platform)
// =====================================================================================================================

/** ECMAScript ToInt32 (what Flash applies to setVolume/setPan arguments). NaN/undefined -> 0. */
export function toInt32(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n | 0;
}

/** Flash SoundTransform in percent: ll/rr = same-side gains, lr = right input -> left speaker, rl = left -> right. */
export interface SoundTransformValues { volume: number; ll: number; lr: number; rr: number; rl: number }

export function defaultTransform(): SoundTransformValues { return { volume: 100, ll: 100, lr: 0, rr: 100, rl: 0 }; }

/** Flash setPan(pan) -> channel matrix (linear balance). */
export function panToMatrix(pan: number): Pick<SoundTransformValues, 'll' | 'lr' | 'rr' | 'rl'> {
  const p = toInt32(pan);
  return p >= 0 ? { ll: 100 - p, lr: 0, rr: 100, rl: 0 } : { ll: 100, lr: 0, rr: 100 + p, rl: 0 };
}

/** Flash getPan() derived from the matrix (mirrors the Flash/Ruffle formula incl. its abs() quirk). */
export function matrixToPan(t: Pick<SoundTransformValues, 'll' | 'rr'>): number {
  return t.ll !== 100 ? 100 - Math.abs(t.ll) : Math.abs(t.rr) - 100;
}

/**
 * Linear output gains (fractions) of a transform, volume included:
 *   left_out  = lToL * left_in + rToL * right_in
 *   right_out = lToR * left_in + rToR * right_in
 * For a mono source left_in = right_in = sample.
 */
export function transformGains(t: SoundTransformValues): { lToL: number; rToL: number; lToR: number; rToR: number } {
  const v = t.volume / 100;
  return { lToL: (t.ll / 100) * v, rToL: (t.lr / 100) * v, lToR: (t.rl / 100) * v, rToR: (t.rr / 100) * v };
}

/** Output [left, right] levels of a mono full-scale sample through a chain of transforms (target, then global). */
export function monoOutputLevels(...chain: SoundTransformValues[]): [number, number] {
  let l = 1, r = 1;
  for (const t of chain) {
    const g = transformGains(t);
    const nl = g.lToL * l + g.rToL * r;
    const nr = g.lToR * l + g.rToR * r;
    l = nl; r = nr;
  }
  return [l, r];
}

/** AS2 Sound.duration in ms for a SoundDef (Flash uses the SWF sample count; rounded to an integer). */
export function soundDefDurationMs(def: Pick<SoundDef, 'sampleCount' | 'rate'>): number {
  return def.rate > 0 ? Math.round((def.sampleCount * 1000) / def.rate) : 0;
}

/** Play window of one loop iteration in seconds: [offset, end). */
export function playWindow(bufferSec: number, offsetSec: number, endSec?: number): { offset: number; end: number } {
  const end = Math.max(0, Math.min(bufferSec, endSec ?? bufferSec));
  const offset = Math.max(0, Math.min(end, Number.isFinite(offsetSec) ? offsetSec : 0));
  return { offset, end };
}

/** Flash `loops` argument: values < 1 (or NaN) play once. */
export function normalizeLoops(loops: unknown): number {
  const n = Math.floor(Number(loops));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// =====================================================================================================================
// Engine state
// =====================================================================================================================

const SAMPLES_44K = 44100;

let ctx: AudioContext | undefined;
const exportsTable = new Map<string, number>();
const defs = new Map<number, SoundDef>();
const buffers = new Map<number, AudioBuffer>();
/** Pristine fetched bytes of every decoded sound, kept so a recreated AudioContext can re-decode without refetching. */
const rawBuffers = new Map<number, ArrayBuffer>();
/** Session dead-list: sounds whose load failed and which currently play silently (healed by healSound). */
const failedIds = new Set<number>();
const healInflight = new Map<number, Promise<void>>();
const healLastAttempt = new Map<number, number>();
/** Library base URL stored by preloadSounds; healSound refetches against it. */
let libraryBase: URL | undefined;
let mutedFlag = false;
let muteNode: GainNode | undefined;

/** Per-target transform bus. The master bus has parent = null. */
class Bus {
  t: SoundTransformValues = defaultTransform();
  input: GainNode | undefined;
  private g: { lToL: GainNode; rToL: GainNode; lToR: GainNode; rToR: GainNode } | undefined;
  readonly parent: Bus | null;
  constructor(parent: Bus | null) { this.parent = parent; }

  /** Lazily builds the node graph once an AudioContext exists. Returns the node voices connect to. */
  node(c: AudioContext): GainNode {
    if (this.input) return this.input;
    const input = c.createGain();
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    input.channelInterpretation = 'speakers'; // mono -> L = R
    const split = c.createChannelSplitter(2);
    const merge = c.createChannelMerger(2);
    const mk = (): GainNode => c.createGain();
    const g = { lToL: mk(), rToL: mk(), lToR: mk(), rToR: mk() };
    input.connect(split);
    split.connect(g.lToL, 0); g.lToL.connect(merge, 0, 0);
    split.connect(g.lToR, 0); g.lToR.connect(merge, 0, 1);
    split.connect(g.rToL, 1); g.rToL.connect(merge, 0, 0);
    split.connect(g.rToR, 1); g.rToR.connect(merge, 0, 1);
    if (this.parent) merge.connect(this.parent.node(c));
    else merge.connect(masterOut(c));
    this.input = input;
    this.g = g;
    this.apply();
    return input;
  }

  apply(): void {
    if (!this.g || !ctx) return;
    const k = transformGains(this.t);
    const now = ctx.currentTime;
    this.g.lToL.gain.setValueAtTime(k.lToL, now);
    this.g.rToL.gain.setValueAtTime(k.rToL, now);
    this.g.lToR.gain.setValueAtTime(k.lToR, now);
    this.g.rToR.gain.setValueAtTime(k.rToR, now);
  }

  /** Drops the lazily built node graph (context recreated / tests). The transform state is kept. */
  resetGraph(): void { this.input = undefined; this.g = undefined; }
}

function masterOut(c: AudioContext): AudioNode {
  if (!muteNode) {
    muteNode = c.createGain();
    muteNode.gain.value = mutedFlag ? 0 : 1;
    muteNode.connect(c.destination);
  }
  return muteNode;
}

const masterBus = new Bus(null);
let targetBuses = new WeakMap<object, Bus>();

// ------------------------------------------------------------------------------------------------ voices

export interface VoiceStart {
  charId: number;
  /** Target clip (AS2 `new Sound(target)` / timeline owner); undefined = global. */
  owner: object | undefined;
  offsetSec: number;
  /** End of the play window in seconds (timeline OutPoint); default: end of the sound. */
  endSec?: number;
  loops: number;
  envelope?: SoundInfo['envelope'];
  /** Natural completion (NOT called when stopped by script). */
  onComplete?: () => void;
}

export interface Voice {
  readonly charId: number;
  readonly owner: object | undefined;
  /** Seconds (engine time) when playback started. */
  readonly startTime: number;
  readonly offsetSec: number;
  readonly loopLenSec: number;
  readonly totalSec: number;
  stopped: boolean;
  done: boolean;
  /** Current playhead in ms within the sound (AS2 Sound.position). */
  positionMs(): number;
}

interface VoiceImpl extends Voice {
  /** Playhead frozen when the voice ended (natural end -> end of window; stop -> where it was). */
  frozenMs?: number;
  src?: AudioBufferSourceNode;
  extra: AudioNode[];
  onComplete?: () => void;
}

const voices = new Set<VoiceImpl>();

function engineTime(): number {
  return ctx ? ctx.currentTime : nowMs() / 1000;
}

function lengthSecOf(charId: number): number {
  const b = buffers.get(charId);
  if (b) return b.duration;
  const d = defs.get(charId);
  return d && d.rate > 0 ? d.sampleCount / d.rate : 0;
}

function finishVoice(v: VoiceImpl, natural: boolean): void {
  if (v.done) return;
  v.frozenMs = natural && !v.stopped ? Math.round((v.offsetSec + v.loopLenSec) * 1000) : v.positionMs();
  v.done = true;
  voices.delete(v);
  try { v.src?.disconnect(); } catch { /* ignore */ }
  for (const n of v.extra) { try { n.disconnect(); } catch { /* ignore */ } }
  if (natural && !v.stopped) v.onComplete?.();
}

function stopVoice(v: VoiceImpl): void {
  if (v.done) return;
  v.stopped = true;
  if (v.src) { try { v.src.stop(); } catch { /* not started / already stopped */ } }
  finishVoice(v, false);
}

/** Starts a voice. Plays silently (but with correct timing/position/completion) when no buffer is decoded. */
export function startVoice(s: VoiceStart): Voice {
  const lenSec = lengthSecOf(s.charId);
  const win = playWindow(lenSec, s.offsetSec, s.endSec);
  const loops = normalizeLoops(s.loops);
  const loopLenSec = win.end - win.offset;
  const startTime = engineTime();
  const v: VoiceImpl = {
    charId: s.charId, owner: s.owner, startTime, offsetSec: win.offset, loopLenSec,
    totalSec: loopLenSec * loops, stopped: false, done: false, extra: [], onComplete: s.onComplete,
    positionMs(this: VoiceImpl): number {
      if (this.frozenMs !== undefined) return this.frozenMs;
      const el = Math.max(0, engineTime() - startTime);
      if (el >= this.totalSec || this.loopLenSec <= 0) return Math.round((win.offset + this.loopLenSec) * 1000);
      return Math.round((win.offset + (el % this.loopLenSec)) * 1000);
    },
  };
  voices.add(v);
  const c = ctx;
  const buf = buffers.get(s.charId);
  if (!buf) void healSound(s.charId); // missing buffer: heal in the background; the NEXT play of it is audible
  if (c && buf && loopLenSec > 0) {
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      let dest: AudioNode = (s.owner ? busFor(s.owner) : masterBus).node(c);
      if (s.envelope && s.envelope.length) dest = buildEnvelope(c, v, s.envelope, dest, startTime);
      src.connect(dest);
      if (loops > 1) {
        src.loop = true;
        src.loopStart = win.offset;
        src.loopEnd = win.end;
        src.start(0, win.offset, v.totalSec);
      } else {
        src.start(0, win.offset, loopLenSec);
      }
      src.onended = () => finishVoice(v, true);
      v.src = src;
    } catch (e) {
      // A node-graph failure must not abort the calling frame script (on one LAN peer that would be a desync):
      // fall back to the silent timed voice; position/completion stay correct via pumpSoundEvents().
      console.warn('[audio] voice start failed:', e);
    }
  }
  return v;
}

/** SWF SOUNDENVELOPE: per-channel gain automation, positions in 44.1 kHz samples from the start of playback. */
function buildEnvelope(c: AudioContext, v: VoiceImpl, env: NonNullable<SoundInfo['envelope']>, dest: AudioNode, t0: number): AudioNode {
  const input = c.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const split = c.createChannelSplitter(2);
  const merge = c.createChannelMerger(2);
  const gl = c.createGain();
  const gr = c.createGain();
  input.connect(split);
  split.connect(gl, 0); gl.connect(merge, 0, 0);
  split.connect(gr, 1); gr.connect(merge, 0, 1);
  merge.connect(dest);
  const first = env[0]!;
  gl.gain.setValueAtTime(first.left / 32768, t0);
  gr.gain.setValueAtTime(first.right / 32768, t0);
  for (const p of env) {
    const t = t0 + p.pos44 / SAMPLES_44K;
    gl.gain.linearRampToValueAtTime(p.left / 32768, t);
    gr.gain.linearRampToValueAtTime(p.right / 32768, t);
  }
  v.extra.push(input, split, merge, gl, gr);
  return input;
}

/** Stops matching voices (no onSoundComplete). */
export function stopVoices(match: (v: Voice) => boolean): void {
  for (const v of [...voices]) if (match(v)) stopVoice(v);
}

/** Stop every playing sound (AS2 global `new Sound().stop()` / stopAllSounds()). */
export function stopAllSounds(): void { stopVoices(() => true); }

/** Stop the sounds owned by a clip (lane E may call this when a clip is removed). */
export function stopSoundsOfOwner(owner: object): void { stopVoices((v) => v.owner === owner); }

export function isSoundPlaying(charId: number): boolean {
  for (const v of voices) if (v.charId === charId && !v.done) return true;
  return false;
}

/** Number of voices currently playing (debug / tests). */
export function activeVoiceCount(): number { return voices.size; }

/**
 * Completes voices that have no WebAudio source (headless, buffer missing, empty window). Real voices complete via
 * `onended`. Called by the Loop every rAF; headless harnesses call it once per EF.
 */
export function pumpSoundEvents(): void {
  if (voices.size === 0) return;
  const t = engineTime();
  for (const v of [...voices]) {
    if (!v.src && !v.done && t - v.startTime >= v.totalSec) finishVoice(v, true);
  }
}

// ------------------------------------------------------------------------------------------------ transforms

/** Bus of a target clip (created on first use). `undefined` -> the global (master) bus. */
function busFor(owner: object | undefined): Bus {
  if (!owner) return masterBus;
  let b = targetBuses.get(owner);
  if (!b) { b = new Bus(masterBus); targetBuses.set(owner, b); }
  return b;
}

export function getTransform(owner: object | undefined): SoundTransformValues { return { ...busFor(owner).t }; }

export function setTransform(owner: object | undefined, t: Partial<SoundTransformValues>): void {
  const b = busFor(owner);
  for (const k of ['volume', 'll', 'lr', 'rr', 'rl'] as const) if (t[k] !== undefined) b.t[k] = toInt32(t[k]);
  b.apply();
}

export function setVolumeOf(owner: object | undefined, volume: number): void {
  const b = busFor(owner);
  b.t.volume = toInt32(volume);
  b.apply();
}

export function setPanOf(owner: object | undefined, pan: number): void {
  const b = busFor(owner);
  Object.assign(b.t, panToMatrix(pan));
  b.apply();
}

// ------------------------------------------------------------------------------------------------ library

/** Registers linkage names and SoundDefs (no decoding). Safe to call more than once. */
export function registerSoundLibrary(lib: SoundLibrary): void {
  for (const [name, id] of Object.entries(lib.exports)) exportsTable.set(name, id);
  for (const ch of Object.values(lib.chars)) if (ch.t === 'sound') defs.set(ch.id, ch);
}

/** Linkage name ("Weapon.Pistol.Fire.wav") -> sound character id, or undefined if not an exported sound. */
export function soundIdForLinkage(name: string): number | undefined {
  const id = exportsTable.get(name);
  return id !== undefined && (defs.has(id) || buffers.has(id)) ? id : undefined;
}

export function getSoundDef(charId: number): SoundDef | undefined { return defs.get(charId); }

/** AS2 Sound.duration (ms) of a character; undefined when unknown. */
export function soundDurationMs(charId: number): number | undefined {
  const d = defs.get(charId);
  if (d) return soundDefDurationMs(d);
  const b = buffers.get(charId);
  return b ? Math.round(b.duration * 1000) : undefined;
}

/** Dev/smoke: register a decoded buffer under an id (and optional linkage) without a library.json. */
export function registerBuffer(charId: number, buffer: AudioBuffer, linkage?: string): void {
  buffers.set(charId, buffer);
  if (linkage) exportsTable.set(linkage, charId);
}

// ------------------------------------------------------------------------------------------------ context

let wedgedTicks = 0;
let resumeInFlight = false;
let recoveryCount = 0;
let watchdogTimer: ReturnType<typeof setInterval> | undefined;
let lastConstructWarn = -Infinity;
let contextFactory: (() => AudioContext) | undefined; // tests only
let deviceChangeInstalled = false;

/** Suspended/interrupted for this many watchdog beats (~1 s each) -> the context is wedged and gets recreated. */
const WATCHDOG_WEDGED_LIMIT = 5;

function constructAudioContext(): AudioContext | undefined {
  if (contextFactory) {
    try { return contextFactory(); } catch { return undefined; }
  }
  const AC: typeof AudioContext | undefined = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!AC) return undefined;
  try {
    return new AC({ latencyHint: 'interactive' });
  } catch {
    try { return new AC(); } catch { return undefined; }
  }
}

/**
 * The shared AudioContext (created on first call in a browser; undefined in Node). No sticky failure latch: a
 * transient construction failure (audio service hiccup, wedged device) is retried on every call, and the watchdog
 * recreates a context that wedges later (tickAudioWatchdog).
 */
export function getAudioContext(): AudioContext | undefined {
  if (ctx) return ctx;
  const c = constructAudioContext();
  if (!c) {
    if (nowMs() - lastConstructWarn > 5000) {
      lastConstructWarn = nowMs();
      console.warn('[audio] AudioContext unavailable; will keep retrying');
    }
    return undefined;
  }
  ctx = c;
  c.addEventListener('statechange', onContextStateChange);
  // Output device hot-swap: Chromium usually migrates the stream itself; nudge the watchdog in case it didn't.
  if (!deviceChangeInstalled && typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
    deviceChangeInstalled = true;
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
  }
  startWatchdog();
  return ctx;
}

function onContextStateChange(): void {
  if (!ctx) return;
  if (ctx.state === 'running') wedgedTicks = 0;
  else tickAudioWatchdog(); // nudge: the first resume attempt starts now, not at the next interval beat
}

const onDeviceChange = (): void => { tickAudioWatchdog(); };

function startWatchdog(): void {
  // Browser/Electron only: headless tests drive tickAudioWatchdog() directly (and never get a live timer).
  if (watchdogTimer !== undefined || typeof window === 'undefined') return;
  watchdogTimer = setInterval(tickAudioWatchdog, 1000);
}

/**
 * One watchdog beat: retry construction when missing, resume a suspended context, recreate a wedged/closed one,
 * and sweep failed sound loads (each heal is cadence-limited inside healSound). Runs once per second in a browser;
 * tests call it directly.
 */
export function tickAudioWatchdog(): void {
  const c = ctx;
  if (!c) {
    void getAudioContext(); // construction failed earlier: retry
  } else if (c.state === 'running') {
    wedgedTicks = 0;
  } else if (c.state === 'closed') {
    wedgedTicks = WATCHDOG_WEDGED_LIMIT; // closed is terminal
  } else {
    // suspended / interrupted
    if (!resumeInFlight) {
      resumeInFlight = true;
      void Promise.race([c.resume(), sleep(500)])
        .catch(() => { /* a rejected resume is counted by the wedged ticks below */ })
        .finally(() => { resumeInFlight = false; });
    }
    // A synchronous resume (mock contexts, some engines) may have flipped the state already: re-read it un-narrowed.
    const stateAfterResume = c.state as AudioContextState;
    if (stateAfterResume !== 'running') wedgedTicks++;
  }
  if (wedgedTicks >= WATCHDOG_WEDGED_LIMIT) void recreateAudioContext();
  for (const id of failedIds) void healSound(id);
}

/** Last-resort recovery: finish voices naturally, close the wedged context, rebuild the graph and the buffers. */
async function recreateAudioContext(): Promise<void> {
  const old = ctx;
  // Finish every voice NATURALLY: onComplete fires and every CSound mPlaying latch clears (otherwise ambience
  // channels wedge forever). Natural completion also keeps position/completion bookkeeping consistent.
  for (const v of [...voices]) {
    if (v.src) { try { v.src.stop(); } catch { /* not started / already stopped */ } }
    finishVoice(v, true);
  }
  ctx = undefined;
  wedgedTicks = 0;
  resumeInFlight = false;
  muteNode = undefined;
  masterBus.resetGraph();
  targetBuses = new WeakMap(); // WeakMap can't be iterated: reassign; CSound re-applies volume/pan on every play
  if (old) void old.close().catch(() => { /* already closed */ });
  const c = getAudioContext();
  if (!c) return; // construction failed: the watchdog retries on the next beat
  recoveryCount++;
  // Re-decode every retained sound into the new context (raw bytes are context-independent). Buffers decoded by the
  // old context stay usable meanwhile; a failed re-decode lands back in failedIds for the watchdog sweep.
  void (async () => {
    for (const [id, raw] of [...rawBuffers.entries()]) {
      try {
        buffers.set(id, await c.decodeAudioData(raw.slice(0)));
        failedIds.delete(id);
      } catch (e) {
        failedIds.add(id);
        console.warn(`[audio] sound ${id} re-decode after context recreation failed:`, e);
      }
    }
  })();
}

export interface PreloadResult { loaded: number; failed: number[]; total: number }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Fetch + decode one sound into `buffers`; on success the pristine bytes are retained and the id leaves failedIds. */
async function loadSound(c: AudioContext, def: SoundDef): Promise<void> {
  const res = await fetch(new URL(def.file, libraryBase));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.arrayBuffer();
  const decoded = await c.decodeAudioData(raw.slice(0)); // decodeAudioData detaches its input: decode a copy
  rawBuffers.set(def.id, raw); // pristine bytes retained so a recreated AudioContext re-decodes without refetching
  buffers.set(def.id, decoded);
  failedIds.delete(def.id);
}

const HEAL_MIN_INTERVAL_MS = 5000;

/**
 * Background re-load of a sound whose buffer is missing (boot failure, or the watchdog sweep after a context
 * recreation). Re-decodes the retained raw bytes when present, otherwise refetches from the library base stored by
 * preloadSounds. Deduped per id and cadence-limited, so a permanently missing file costs one small fetch per
 * HEAL_MIN_INTERVAL_MS. No-op without an AudioContext / library base (headless harnesses). Never rejects.
 */
export function healSound(charId: number): Promise<void> {
  const inflight = healInflight.get(charId);
  if (inflight) return inflight;
  const c = ctx;
  const def = defs.get(charId);
  if (!c || !def || !libraryBase || buffers.has(charId)) return Promise.resolve();
  const now = nowMs();
  const last = healLastAttempt.get(charId);
  if (last !== undefined && now - last < HEAL_MIN_INTERVAL_MS) return Promise.resolve();
  healLastAttempt.set(charId, now);
  const raw = rawBuffers.get(charId);
  const p = (async () => {
    try {
      if (raw) {
        buffers.set(charId, await c.decodeAudioData(raw.slice(0)));
        failedIds.delete(charId);
      } else {
        await loadSound(c, def);
      }
    } catch (e) {
      console.warn(`[audio] sound ${charId} (${def.file}) heal failed:`, e);
    } finally {
      healInflight.delete(charId);
    }
  })();
  healInflight.set(charId, p);
  return p;
}

/**
 * Registers the library and fetches + decodes every SoundDef (`<baseUrl>/<def.file>`, e.g. assets/sounds/539.mp3).
 * Never rejects: failures are retried twice (transient boot-window hiccups), then reported (and those sounds play
 * silently with correct timing until healSound or the watchdog re-loads them).
 */
export async function preloadSounds(
  lib: SoundLibrary, baseUrl: string | URL, onProgress?: (done: number, total: number) => void, concurrency = 8,
): Promise<PreloadResult> {
  registerSoundLibrary(lib);
  libraryBase = typeof baseUrl === 'string' ? new URL(baseUrl, typeof document !== 'undefined' ? document.baseURI : undefined) : baseUrl;
  const list = [...defs.values()].filter((d) => !buffers.has(d.id));
  const total = list.length;
  let done = 0;
  const c = getAudioContext();
  onProgress?.(0, total);
  if (!c) {
    for (const d of list) failedIds.add(d.id);
    return { loaded: 0, failed: list.map((d) => d.id), total };
  }
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const def = list[next++]!;
      try {
        await loadSound(c, def);
      } catch (e) {
        failedIds.add(def.id);
        console.warn(`[audio] sound ${def.id} (${def.file}) failed to load:`, e);
      }
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker));
  // Two retry rounds over just the failures before giving up; a sound that still fails stays in failedIds and is
  // re-attempted in the background on its next play (healSound) / by the watchdog sweep.
  for (let round = 1; round <= 2; round++) {
    const retry = list.filter((d) => failedIds.has(d.id) && !buffers.has(d.id));
    if (!retry.length) break;
    await sleep(250 * round);
    for (const def of retry) {
      try {
        await loadSound(c, def);
      } catch (e) {
        console.warn(`[audio] sound ${def.id} (${def.file}) retry ${round}/2 failed:`, e);
      }
    }
  }
  const failed = list.filter((d) => !buffers.has(d.id)).map((d) => d.id);
  return { loaded: total - failed.length, failed, total };
}

/** Resume the context (needed in browsers after a user gesture). Resolves true when running. */
export async function resumeAudio(timeoutMs = 300): Promise<boolean> {
  const c = getAudioContext();
  if (!c) return false;
  if (c.state === 'running') return true;
  try {
    await Promise.race([c.resume(), new Promise((r) => setTimeout(r, timeoutMs))]);
  } catch { /* ignore */ }
  return (c.state as AudioContextState) === 'running';
}

/** Resume the AudioContext on the first user gesture (pointer/key/touch). Harmless when already running. */
export function installAudioUnlock(target: EventTarget = window): () => void {
  const events = ['pointerdown', 'mousedown', 'keydown', 'touchend'];
  const handler = (): void => {
    const c = getAudioContext();
    if (!c) return remove();
    if (c.state === 'running') return remove();
    void c.resume().then(() => { if (c.state === 'running') remove(); }, () => { /* rejected (autoplay race): the next gesture retries */ });
  };
  const remove = (): void => { for (const e of events) target.removeEventListener(e, handler, true); };
  for (const e of events) target.addEventListener(e, handler, true);
  return remove;
}

/**
 * Browser-only helper: if audio cannot start without a gesture, cover `container` with a "Click to start" overlay
 * and resolve after the click (Electron runs with autoplayPolicy 'no-user-gesture-required' -> resolves at once).
 * A gamepad button also dismisses the overlay: installGamepad (src/game/local/Gamepad.ts) calls dismissAudioOverlay()
 * on the first pad button edge, because gamepads fire no DOM event the overlay could listen to.
 */
let dismissAudioOverlayFn: (() => void) | undefined;

export function dismissAudioOverlay(): void { dismissAudioOverlayFn?.(); }

export async function unlockAudioOverlay(container: HTMLElement, text = 'Click to start'): Promise<void> {
  const c = getAudioContext();
  if (!c || (await resumeAudio())) return;
  await new Promise<void>((resolve) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.setAttribute('role', 'button');
    el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'background:#000;color:#fff;font:bold 22px Arial,Helvetica,sans-serif;cursor:pointer;z-index:10;user-select:none';
    const go = (e: Event): void => {
      e.preventDefault();
      void c.resume();
      el.remove();
      window.removeEventListener('keydown', go, true);
      dismissAudioOverlayFn = undefined;
      resolve();
    };
    dismissAudioOverlayFn = () => go(new Event('gamepad'));
    el.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, true);
    container.appendChild(el);
  });
}

// ------------------------------------------------------------------------------------------------ master / timeline

export const SoundEngine = {
  /** Master mute (e.g. the "Sound: ON/OFF" option). Voices keep running (timing unaffected), output is silenced. */
  get muted(): boolean { return mutedFlag; },
  set muted(v: boolean) {
    mutedFlag = !!v;
    if (muteNode && ctx) muteNode.gain.setValueAtTime(mutedFlag ? 0 : 1, ctx.currentTime);
  },
  get context(): AudioContext | undefined { return ctx; },
  get decodedCount(): number { return buffers.size; },
};

export interface AudioDiagnostics {
  /** AudioContext.state ('none' when no context exists, e.g. headless). */
  state: string;
  /** Decoded sounds. */ decoded: number;
  /** Registered sound defs. */ total: number;
  /** Sounds currently dead-listed (playing silently, heal pending/in progress). */ failed: number[];
  /** Voices in flight (silent-timed ones included). */ voices: number;
  /** Context recreations this session (watchdog recoveries). */ recoveries: number;
  muted: boolean;
}

/** Snapshot of the audio health for `__game.audio()` and the packaged playtest gates. */
export function audioDiagnostics(): AudioDiagnostics {
  return {
    state: ctx?.state ?? 'none',
    decoded: buffers.size,
    total: defs.size,
    failed: [...failedIds].sort((a, b) => a - b),
    voices: voices.size,
    recoveries: recoveryCount,
    muted: mutedFlag,
  };
}

/**
 * StartSound tag handler (lane E calls this from timeline frame processing, in tag order).
 *   info.stop        -> stop every instance of the sound (SyncStop)
 *   info.noMultiple  -> do nothing if an instance is already playing (SyncNoMultiple)
 *   inPoint/outPoint -> 44.1 kHz sample positions of the play window; loops; envelope (44.1 kHz positions, 0..32768)
 * `owner` = the clip whose timeline started it (its Sound(target) transform applies; stop() of that target stops it).
 */
export function playTimelineSound(charId: number, info: SoundInfo = {}, owner?: object): void {
  if (info.stop) { stopVoices((v) => v.charId === charId); return; }
  if (info.noMultiple && isSoundPlaying(charId)) return;
  startVoice({
    charId,
    owner,
    offsetSec: info.inPoint !== undefined ? info.inPoint / SAMPLES_44K : 0,
    endSec: info.outPoint !== undefined ? info.outPoint / SAMPLES_44K : undefined,
    loops: info.loops ?? 1,
    envelope: info.envelope,
  });
}

/** Tests: install (or clear) the AudioContext. Drops the node graph built against any previous context. */
export function _setAudioContextForTests(c: AudioContext | undefined): void {
  ctx = c;
  muteNode = undefined;
  masterBus.resetGraph();
  targetBuses = new WeakMap();
}

/** Tests: install a factory used instead of the window.AudioContext global (construction/recreation). */
export function _setAudioContextFactoryForTests(factory: (() => AudioContext) | undefined): void {
  contextFactory = factory;
}

/** Tests: drop all state (library, buffers, raw bytes, failures, voices, transforms, context, watchdog). */
export function _resetAudioForTests(): void {
  for (const v of [...voices]) finishVoice(v, false);
  exportsTable.clear(); defs.clear(); buffers.clear();
  rawBuffers.clear(); failedIds.clear(); healInflight.clear(); healLastAttempt.clear();
  libraryBase = undefined;
  masterBus.t = defaultTransform();
  mutedFlag = false;
  wedgedTicks = 0;
  resumeInFlight = false;
  recoveryCount = 0;
  lastConstructWarn = -Infinity;
  contextFactory = undefined;
  if (watchdogTimer !== undefined) { clearInterval(watchdogTimer); watchdogTimer = undefined; }
  if (deviceChangeInstalled && typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
    navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }
  deviceChangeInstalled = false;
  _setAudioContextForTests(undefined);
}
