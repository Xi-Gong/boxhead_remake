import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetAudioForTests, activeVoiceCount, defaultTransform, matrixToPan, monoOutputLevels, normalizeLoops, panToMatrix,
  playTimelineSound, playWindow, pumpSoundEvents, registerSoundLibrary, soundDefDurationMs, SoundEngine, toInt32,
  transformGains,
} from '../../../src/engine/platform/AudioEngine.ts';
import { Sound } from '../../../src/engine/flash/Sound.ts';
import { advanceVirtual, useRealClock, useVirtualClock } from '../../../src/engine/flash/clock.ts';
import type { SoundDef } from '../../../src/shared/assetSchema.ts';

const def = (id: number, rate: number, sampleCount: number): SoundDef =>
  ({ t: 'sound', id, file: `sounds/${id}.mp3`, format: 'mp3', rate, stereo: false, sampleCount });

describe('Flash sound transform maths', () => {
  it('ToInt32 truncation like setVolume/setPan', () => {
    expect(toInt32(14.8)).toBe(14);
    expect(toInt32(-45.9)).toBe(-45);
    expect(toInt32(undefined)).toBe(0);
    expect(toInt32(Number.NaN)).toBe(0);
    expect(toInt32('70')).toBe(70);
  });

  it('setPan is a linear balance, getPan round-trips', () => {
    expect(panToMatrix(0)).toEqual({ ll: 100, lr: 0, rr: 100, rl: 0 });
    expect(panToMatrix(30)).toEqual({ ll: 70, lr: 0, rr: 100, rl: 0 });
    expect(panToMatrix(-45)).toEqual({ ll: 100, lr: 0, rr: 55, rl: 0 });
    expect(panToMatrix(100)).toEqual({ ll: 0, lr: 0, rr: 100, rl: 0 });
    for (const p of [-100, -63, -1, 0, 1, 42, 99, 100]) expect(matrixToPan(panToMatrix(p))).toBe(p);
    expect(matrixToPan(panToMatrix(37.9))).toBe(37);
  });

  it('output levels of a mono sample: volume x balance, target then global', () => {
    const t = { ...defaultTransform(), volume: 40, ...panToMatrix(50) };
    const [l, r] = monoOutputLevels(t);
    expect(l).toBeCloseTo(0.2, 12); // 0.4 * 0.5
    expect(r).toBeCloseTo(0.4, 12);
    const global = { ...defaultTransform(), volume: 50 };
    const [l2, r2] = monoOutputLevels(t, global);
    expect(l2).toBeCloseTo(0.1, 12);
    expect(r2).toBeCloseTo(0.2, 12);
    expect(transformGains(defaultTransform())).toEqual({ lToL: 1, rToL: 0, lToR: 0, rToR: 1 });
  });

  it('duration from the SWF sample count, play window and loop normalisation', () => {
    expect(soundDefDurationMs({ rate: 22050, sampleCount: 22050 })).toBe(1000);
    expect(soundDefDurationMs({ rate: 44100, sampleCount: 12345 })).toBe(280);
    expect(playWindow(2, 0.5)).toEqual({ offset: 0.5, end: 2 });
    expect(playWindow(2, 5)).toEqual({ offset: 2, end: 2 });
    expect(playWindow(2, -1, 1.5)).toEqual({ offset: 0, end: 1.5 });
    expect(normalizeLoops(undefined)).toBe(1);
    expect(normalizeLoops(0)).toBe(1);
    expect(normalizeLoops(100000)).toBe(100000);
  });
});

describe('AS2 Sound object (headless, virtual clock)', () => {
  beforeEach(() => {
    _resetAudioForTests();
    useVirtualClock(0);
    registerSoundLibrary({
      exports: { 'Weapon.Pistol.Fire.wav': 558, 'World.End.wav': 563, 'Not.A.Sound': 1 },
      chars: { 558: def(558, 22050, 22050), 563: def(563, 44100, 88200) },
    });
  });
  afterAll(() => { _resetAudioForTests(); useRealClock(); });

  it('attachSound / duration / onSoundComplete with this = the Sound object', () => {
    const s = new Sound({});
    expect(s.duration).toBeUndefined();
    s.attachSound('Not.A.Sound');
    expect(s.duration).toBeUndefined();
    s.attachSound('Weapon.Pistol.Fire.wav');
    expect(s.duration).toBe(1000);
    s.attachSound('Missing.wav'); // ignored, keeps the previous sound
    expect(s.duration).toBe(1000);
    expect(s.position).toBe(0);
    let calls = 0;
    let self: unknown;
    s.pClass = { mPlaying: true };
    s.onSoundComplete = function (this: Sound) { calls++; self = this; this.pClass.mPlaying = false; };
    s.start();
    advanceVirtual(400);
    pumpSoundEvents();
    expect(s.position).toBe(400);
    expect(calls).toBe(0);
    advanceVirtual(600);
    pumpSoundEvents();
    expect(calls).toBe(1);
    expect(self).toBe(s);
    expect(s.pClass.mPlaying).toBe(false);
    expect(s.position).toBe(1000);
    expect(activeVoiceCount()).toBe(0);
  });

  it('stop() never fires onSoundComplete and freezes position', () => {
    const s = new Sound({});
    s.attachSound('Weapon.Pistol.Fire.wav');
    let calls = 0;
    s.onSoundComplete = () => { calls++; };
    s.start();
    advanceVirtual(250);
    s.stop();
    advanceVirtual(2000);
    pumpSoundEvents();
    expect(calls).toBe(0);
    expect(s.position).toBe(250);
  });

  it('secondOffset and loops (each loop restarts at the offset)', () => {
    const s = new Sound({});
    s.attachSound('Weapon.Pistol.Fire.wav');
    let done = 0;
    s.onSoundComplete = () => { done++; };
    s.start(0.25);
    advanceVirtual(100);
    expect(s.position).toBe(350);
    advanceVirtual(650);
    pumpSoundEvents();
    expect(done).toBe(1);

    s.start(0, 3);
    advanceVirtual(1500);
    expect(s.position).toBe(500);
    pumpSoundEvents();
    expect(done).toBe(1);
    advanceVirtual(1500);
    pumpSoundEvents();
    expect(done).toBe(2);
  });

  it('Sound objects of the same target share one transform; other targets and the global one are separate', () => {
    const mc = {};
    const a = new Sound(mc);
    const b = new Sound(mc);
    const other = new Sound({});
    const global = new Sound();
    a.setVolume(37 * 0.4);
    expect(b.getVolume()).toBe(14);
    b.setPan(-60);
    expect(a.getPan()).toBe(-60);
    expect(other.getVolume()).toBe(100);
    expect(other.getPan()).toBe(0);
    expect(global.getVolume()).toBe(100);
    a.setTransform({ ll: 50, lr: 10, rr: 80, rl: 0 });
    expect(b.getTransform()).toEqual({ ll: 50, lr: 10, rr: 80, rl: 0 });
    // CSound.Process fade-out arithmetic on getVolume()
    a.setVolume(b.getVolume() - 5 >= 0 ? b.getVolume() - 5 : 0);
    expect(a.getVolume()).toBe(9);
  });

  it('stop(): target only; stop(id): every instance of that sound; global stop(): everything', () => {
    const t1 = {}, t2 = {};
    const a = new Sound(t1); a.attachSound('Weapon.Pistol.Fire.wav');
    const b = new Sound(t2); b.attachSound('Weapon.Pistol.Fire.wav');
    const c = new Sound(t2); c.attachSound('World.End.wav');
    a.start(); b.start(); c.start();
    expect(activeVoiceCount()).toBe(3);
    new Sound(t1).stop();
    expect(activeVoiceCount()).toBe(2);
    a.start();
    c.stop('Weapon.Pistol.Fire.wav');
    expect(activeVoiceCount()).toBe(1);
    playTimelineSound(563, {});
    expect(activeVoiceCount()).toBe(2);
    new Sound().stop();
    expect(activeVoiceCount()).toBe(0);
  });

  it('timeline StartSound: noMultiple, stop, in/out points and loops', () => {
    playTimelineSound(563, {});
    playTimelineSound(563, { noMultiple: true });
    expect(activeVoiceCount()).toBe(1);
    playTimelineSound(563, {});
    expect(activeVoiceCount()).toBe(2);
    playTimelineSound(563, { stop: true });
    expect(activeVoiceCount()).toBe(0);
    // 2 s sound, window [0.5 s, 1.5 s) x 2 loops = 2 s total
    playTimelineSound(563, { inPoint: 22050, outPoint: 66150, loops: 2, envelope: [{ pos44: 0, left: 0, right: 0 }] });
    advanceVirtual(1999);
    pumpSoundEvents();
    expect(activeVoiceCount()).toBe(1);
    advanceVirtual(1);
    pumpSoundEvents();
    expect(activeVoiceCount()).toBe(0);
  });

  it('master mute flag', () => {
    expect(SoundEngine.muted).toBe(false);
    SoundEngine.muted = true;
    expect(SoundEngine.muted).toBe(true);
    SoundEngine.muted = false;
  });
});
