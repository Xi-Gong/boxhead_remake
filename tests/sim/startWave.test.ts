// Deviation START_WAVE_SELECTOR (v0.1.9), core (no UI yet): the armed start wave is applied at world build through
// the CUpgrades.SetDifficulty scope wrapper - the ORIGINAL head-start mechanism (silent HUD, __set__mLevel, then the
// multiplier stepped one index at a time so every crossed threshold unlocks its tier). Wave 1 (or nothing armed) is
// bit-identical to today's behaviour; the override is consumed exactly once, only ever raises the multiplier, and
// Death Match (no waves) is immune.
import { describe, expect, it } from 'vitest';
import { seedRandom } from '../../src/engine/flash/rng.ts';
import { CMain, CSaveData } from '../../src/game/packages.ts';
import { _resetForTests as resetStartWaveForTests, armStartWave, consumeArmedWave, setSelectedStartWave } from '../../src/game/local/StartWave.ts';
import { createHeadlessGame, type HeadlessGame } from './harness.ts';

/** The harness tail of createHeadlessGame after menuOnly:'Select' - start the room through the level icon button. */
function startSelectedRoom(g: HeadlessGame, seed = 1): void {
  const m = g.main();
  const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection, 0);
  seedRandom(seed ^ 0x5eed);
  icons._Button.onRelease.call(icons._Button);
  if (!g.waitRunning()) throw new Error(`room did not start (${g.state()}, ${g.errors[0] ?? ''})`);
}

describe('start wave (deviation START_WAVE_SELECTOR, core)', () => {
  it('the armed override is consumed exactly once', () => {
    resetStartWaveForTests();
    expect(consumeArmedWave()).toBe(1); // nothing armed: today's behaviour
    armStartWave(7);
    expect(consumeArmedWave()).toBe(7);
    expect(consumeArmedWave()).toBe(1); // consumed
    resetStartWaveForTests();
  });

  it('wave 1 (nothing armed) starts exactly like before: level 1, multiplier 1, pistol only', () => {
    resetStartWaveForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 5, menuOnly: 'Select' });
    startSelectedRoom(g, 5);
    const s = g.snapshot();
    expect(s.level).toBe(1);
    expect(s.multiplier).toBe(1);
    expect(s.players[0]!.weapons).toEqual(['pistol']);
  });

  it('wave 20 starts at LEVEL 20 with multiplier 30 and the tiers up to x30 already unlocked', () => {
    resetStartWaveForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 6, menuOnly: 'Select' });
    setSelectedStartWave(20); // the production path: the screen value, armed by LoadLevel
    startSelectedRoom(g, 6);
    const s = g.snapshot();
    expect(s.level).toBe(20);
    expect(s.multiplier).toBe(30);
    // The multiplier-30 tier set (CUpgrades.InitLists): uzi x5, shotgun x10, barrel x15, grenade x20, fakewall x30.
    expect(s.players[0]!.weapons).toEqual(['pistol', 'uzi', 'shotgun', 'barrel', 'grenade', 'fakewall']);
    expect(g.players()[0].mWeapons.uzi.mThing.mAmmo).toBe(g.players()[0].mWeapons.uzi.mThing.mTotalAmmo); // full magazine
    // The wave itself: wave 20's spawn table (Zombie_Count 105 capped at 60, total 105) and sped-up zombies.
    expect(s.zombies).toBe(0);
    expect(s.zombieTotal).toBe(105);
  });

  it('difficulty 3 + wave 10: level steps DOWN to 10 but the multiplier never drops below the difficulty grant', () => {
    resetStartWaveForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 7, menuOnly: 'Select' });
    (CMain as any).mSaveData.mDifficulty = 3; // difficulty 3 alone would be wave 35 / multiplier 50
    setSelectedStartWave(10);
    startSelectedRoom(g, 7);
    const s = g.snapshot();
    expect(s.level).toBe(10);
    expect(s.multiplier).toBe(50); // max(anchor(10)=10, difficulty's 50) - tiers are never revoked
  });

  it('Death Match is immune (no waves; the original multiplier-200 full loadout stands)', () => {
    resetStartWaveForTests();
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 8, menuOnly: 'Select' });
    setSelectedStartWave(20);
    startSelectedRoom(g, 8);
    const s = g.snapshot();
    expect(s.level).toBe(1); // Death Match never advances waves
    expect(s.multiplier).toBe(200); // the original DM branch of SetDifficulty
  });

  it('a later fresh run without arming is back to level 1 (no leakage between games)', () => {
    resetStartWaveForTests();
    const g1 = createHeadlessGame({ mode: 'Single', room: 1, seed: 9, menuOnly: 'Select' });
    setSelectedStartWave(20);
    startSelectedRoom(g1, 9);
    expect(g1.snapshot().level).toBe(20);
    const g2 = createHeadlessGame({ mode: 'Single', room: 1, seed: 9, menuOnly: 'Select' });
    startSelectedRoom(g2, 9);
    expect(g2.snapshot().level).toBe(1);
    expect(g2.snapshot().multiplier).toBe(1);
  });
});

describe('start wave cycler UI (Single/Coop level selection)', () => {
  it('is visible on Single and Coop, hidden on Death Match, and cycles 1..100 with wraparound', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 41, menuOnly: 'Select' });
    const mc = g.main().mcScreen.mcStartWave;
    expect(mc).toBeDefined();
    expect(mc._visible).toBe(true);
    expect(mc.mcValue.text).toBe('1');
    mc.bRight.onRelease.call(mc.bRight);
    mc.bRight.onRelease.call(mc.bRight);
    expect(mc.mcValue.text).toBe('3');
    mc.bLeft.onRelease.call(mc.bLeft);
    expect(mc.mcValue.text).toBe('2');
    mc.bLeft.onRelease.call(mc.bLeft);
    expect(mc.mcValue.text).toBe('1');
    mc.bLeft.onRelease.call(mc.bLeft); // wraps 1 -> 100
    expect(mc.mcValue.text).toBe('100');
    mc.bRight.onRelease.call(mc.bRight); // wraps 100 -> 1
    expect(mc.mcValue.text).toBe('1');

    const gc = createHeadlessGame({ mode: 'Coop', room: 1, seed: 41, menuOnly: 'Select' });
    expect(gc.main().mcScreen.mcStartWave?._visible).toBe(true);

    const gd = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 41, menuOnly: 'Select' });
    expect(gd.main().mcScreen.mcStartWave).toBeUndefined(); // not even built for Death Match
  });

  it('never writes the save data and resets to 1 on every screen entry', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 42, menuOnly: 'Select' });
    const before = JSON.stringify(CSaveData.mSharedObject.data);
    const mc = g.main().mcScreen.mcStartWave;
    for (let i = 0; i < 19; i++) mc.bRight.onRelease.call(mc.bRight);
    expect(mc.mcValue.text).toBe('20');
    expect(JSON.stringify(CSaveData.mSharedObject.data)).toBe(before); // NOT persisted, unlike the map choice
    // Re-enter the screen through the real route (main menu and back, like debrief EXIT).
    g.main().SetState('State_Main');
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    g.main().SetState('State_SelectWorld_Single');
    expect(g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld')).toBe(true);
    expect(g.main().mcScreen.mcStartWave.mcValue.text).toBe('1'); // "didn't touch it = LEVEL 1"
  });

  it('a wave chosen through the real UI arms the run: level 20, multiplier 30, tiers unlocked', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 43, menuOnly: 'Select' });
    const mc = g.main().mcScreen.mcStartWave;
    for (let i = 0; i < 19; i++) mc.bRight.onRelease.call(mc.bRight);
    startSelectedRoom(g, 43);
    const s = g.snapshot();
    expect(s.level).toBe(20);
    expect(s.multiplier).toBe(30);
    for (const p of s.players) {
      expect(p.weapons).toEqual(['pistol', 'uzi', 'shotgun', 'barrel', 'grenade', 'fakewall']);
    }
  });
});
