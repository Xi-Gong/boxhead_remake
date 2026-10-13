/**
 * AS2 Sound object (WebAudio-backed via engine/platform/AudioEngine.ts).   OWNER: lane D (platform)
 *
 * Flash semantics preserved:
 *   - `new Sound(target)` controls sounds of that clip; `new Sound()` (no target) is the global sound.
 *     All Sound objects created for the same target share ONE transform (volume/pan), applied live.
 *   - attachSound(linkageId) selects an exported library sound (e.g. "Weapon.Pistol.Fire.wav"); unknown ids are
 *     ignored (the previous attachment stays, like Flash).
 *   - start(secondOffset = 0, loops = 1) plays a NEW instance (overlapping instances allowed); every loop restarts at
 *     secondOffset. loops < 1 plays once.
 *   - stop(linkageId?): with an id -> every instance of that sound (any target, as Flash/Ruffle do); without an id ->
 *     the sounds of this target; on the global Sound -> every sound.
 *   - setVolume/setPan store int32 (truncated) values; setPan is a linear balance (see AudioEngine).
 *   - duration (ms, from the SWF sample count) / position (ms, of the most recent instance started by this object).
 *     Both are `undefined` until a sound is attached, like AS2 (arithmetic then yields NaN, as in Flash).
 *   - onSoundComplete() is called with `this` = the Sound object when an instance started by it ends naturally
 *     (never after stop()).
 * The global master switch (CSaveData "Sound: ON/OFF") is `SoundEngine.muted` in AudioEngine.ts.
 */
import {
  getTransform, matrixToPan, setPanOf, setTransform as setBusTransform, setVolumeOf, soundDurationMs,
  soundIdForLinkage, startVoice, stopVoices,
} from '../platform/AudioEngine.ts';
import type { Voice } from '../platform/AudioEngine.ts';

export interface AS2SoundTransform { ll: number; lr: number; rr: number; rl: number }

export class Sound {
  /** AS2 code hangs ad-hoc fields on Sound objects (e.g. CSound sets `oSound.pClass`). */
  [key: string]: any;

  onSoundComplete: (() => void) | undefined;
  declare private __owner: object | undefined;
  declare private __charId: number | undefined;
  declare private __voice: Voice | undefined;
  declare private __lastPos: number;

  constructor(target?: unknown) {
    this.__owner = target !== null && (typeof target === 'object' || typeof target === 'function') ? target as object : undefined;
    this.__charId = undefined;
    this.__voice = undefined;
    this.__lastPos = 0;
    this.onSoundComplete = undefined;
  }

  attachSound(linkageId: string): void {
    const id = soundIdForLinkage(String(linkageId));
    if (id !== undefined) this.__charId = id;
  }

  start(secondOffset: number = 0, loops: number = 1): void {
    const charId = this.__charId;
    if (charId === undefined) return;
    const off = Number(secondOffset);
    this.__voice = startVoice({
      charId,
      owner: this.__owner,
      offsetSec: Number.isFinite(off) && off > 0 ? off : 0,
      loops,
      onComplete: () => { this.onSoundComplete?.call(this); },
    });
  }

  stop(linkageId?: string): void {
    if (this.__voice) this.__lastPos = this.__voice.positionMs();
    if (linkageId !== undefined) {
      const id = soundIdForLinkage(String(linkageId));
      if (id !== undefined) stopVoices((v) => v.charId === id);
      return;
    }
    const owner = this.__owner;
    if (owner) stopVoices((v) => v.owner === owner);
    else stopVoices(() => true);
  }

  setVolume(v: number): void { setVolumeOf(this.__owner, v); }
  getVolume(): number { return getTransform(this.__owner).volume; }
  setPan(p: number): void { setPanOf(this.__owner, p); }
  getPan(): number { return matrixToPan(getTransform(this.__owner)); }

  setTransform(t: Partial<AS2SoundTransform>): void {
    if (t && typeof t === 'object') setBusTransform(this.__owner, t);
  }

  getTransform(): AS2SoundTransform {
    const t = getTransform(this.__owner);
    return { ll: t.ll, lr: t.lr, rr: t.rr, rl: t.rl };
  }

  get duration(): number {
    return this.__charId === undefined ? (undefined as unknown as number) : (soundDurationMs(this.__charId) ?? (undefined as unknown as number));
  }

  get position(): number {
    if (this.__charId === undefined) return undefined as unknown as number;
    return this.__voice ? this.__voice.positionMs() : this.__lastPos;
  }

  // Loading APIs exist in AS2 but this game only uses library sounds.
  loadSound(_url: string, _isStreaming?: boolean): void {}
  getBytesLoaded(): number { return this.__charId === undefined ? 0 : 1; }
  getBytesTotal(): number { return this.__charId === undefined ? 0 : 1; }
}
