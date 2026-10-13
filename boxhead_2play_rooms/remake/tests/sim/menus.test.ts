// Lane Q: menu screens of the REAL game driven through their own button handlers (headless): level / character
// arrows, the options window (difficulty, speed, devils, collisions, damage, game amount, RESET), the controls window
// (key rebinding through a Key listener, Esc cancels, invalid keys), the local instructions page and the local
// highscores (debrief SEND SCORE -> table; level icon "View Highscores").
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import { Bot, runBots } from './bots.ts';
import { CMain, CSaveData } from '../../src/game/packages.ts';
import { getTable } from '../../src/game/local/Highscores.ts';

const release = (mc: any): void => { mc.onRelease.call(mc); };

/** A game parked on the level selection of `mode` (quit from a running room -> EXIT on the debrief). */
function atSelection(mode: 'Single' | 'Coop' | 'DeathMatch' = 'Single') {
  const g = createHeadlessGame({ mode, room: 1, seed: 1 });
  g.quit();
  if (mode !== 'DeathMatch') {
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.exit();
  }
  expect(g.waitScreen(`State_SelectWorld_${mode}`, 'Screen_SelectWorld')).toBe(true);
  return g;
}

describe('level selection screen', () => {
  it('level arrows wrap over the 18 rooms and the icon starts the shown room; character arrows cycle 4 characters', () => {
    const g = atSelection('Coop');
    const s = g.main().mcScreen;
    const sel = s.mcSubScreen.mcLevel_Selection;
    const sd = CMain.mSaveData;
    expect(sd.mLevelIndex_Coop).toBe(0);
    release(sel.bLeft);
    expect(sd.mLevelIndex_Coop).toBe(17);
    expect(sel.mcLevelIcons._currentframe).toBe(18);
    release(sel.bRight);
    release(sel.bRight);
    expect(sd.mLevelIndex_Coop).toBe(1);
    const c1 = s.mcSubScreen.mcPlayer1_Character;
    const before = sd.mPlayer1_CharacterIndex;
    for (let i = 0; i < 4; i++) release(c1.bRight);
    expect(sd.mPlayer1_CharacterIndex).toBe(before);
    release(c1.bLeft);
    expect(sd.mPlayer1_CharacterIndex).toBe((before + 3) % 4);
    release(sel.mcLevelIcons._Button);
    expect(g.waitRunning()).toBe(true);
    expect(g.world().mWorldLibLink).toBe('ROOM_Single_0002');
    expect(g.errors).toEqual([]);
  });

  it('options window buttons write the save; RESET restores the defaults; the next room uses them', () => {
    const g = atSelection('Single');
    const s = g.main().mcScreen;
    const win = s.mcWindow_Options;
    const sd = CMain.mSaveData;
    release(s._Game_Options._Button);
    expect(win._visible).toBe(true);
    release(win._Level_Nightmare._Button);
    release(win._Speed_Fast._Button);
    release(win._Devils_Off._Button);
    release(win._Damage_Off._Button);
    expect([sd.mDifficulty, sd.mGameSpeed, sd.mDevilsActive, sd.mDamageActive]).toEqual([3, 2, 0, 0]);
    expect(win._Level_Nightmare._Selected._visible).toBe(true);
    expect(win._Level_Beginner._Selected._visible).toBe(false);
    release(win._Button_Reset._Button);
    expect([sd.mDifficulty, sd.mGameSpeed, sd.mDevilsActive, sd.mCollisionsActive, sd.mDamageActive, sd.mGameAmount]).toEqual([0, 1, 1, 1, 1, 1]);
    release(win._Level_Expert._Button);
    release(win._Button_Close._Button);
    expect(win._visible).toBe(false);
    release(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button);
    expect(g.waitRunning()).toBe(true);
    expect(g.snapshot().level).toBe(20); // Expert
    expect(g.errors).toEqual([]);
  });

  it('controls window: rebinding P1 fire through the key listener (Esc cancels, invalid keys are refused)', () => {
    const g = atSelection('Single');
    const s = g.main().mcScreen;
    const win = s.mcWindow_Controls;
    const sd = CMain.mSaveData;
    release(s._Game_Controls._Button);
    const shoot = win.mcPlayer1.mcChangeKey_Shoot;
    // Esc cancels
    release(shoot);
    expect(win.mcPressKey._visible).toBe(true);
    g.keyDown(27); g.keyUp(27);
    expect(win.mcPressKey._visible).toBe(false);
    expect(sd.mPlayer1_KeyShoot).toBe(191);
    // an invalid key code shows "invalid", a valid one ('K' = 75) is stored
    release(shoot);
    g.keyDown(255); g.keyUp(255);
    expect(win.mcPressKey.mcInvalidKey._visible).toBe(true);
    g.step(5);
    g.keyDown(75); g.keyUp(75);
    expect(win.mcPressKey._visible).toBe(false);
    expect(sd.mPlayer1_KeyShoot).toBe(75);
    expect(shoot.tbKey.text).toBe("'K'"); // CInput.mValidKeys names letters with quotes
    // the next room fires with K (CInput reads the save when the world is loaded)
    release(win._Button_Close._Button);
    release(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button);
    expect(g.waitRunning()).toBe(true);
    expect(CMain.mInput.KEY_FIRE.mKeycode).toBe(75);
    const shots0 = g.things().filter((t) => t._CLASSID_ === 'CThing_Shot_Bullet').length;
    g.keyDown(75);
    g.tick(1);
    expect(g.things().filter((t) => t._CLASSID_ === 'CThing_Shot_Bullet').length).toBeGreaterThan(shots0);
    g.keyUp(75);
    expect(g.errors).toEqual([]);
  });

  it('controls window RESET restores the default bindings (P1 arrows / , . ; P2 WASD Space Q E)', () => {
    const g = atSelection('Coop');
    const s = g.main().mcScreen;
    const sd = CMain.mSaveData;
    sd.mPlayer1_KeyShoot = 75;
    sd.mPlayer2_KeyMoveUp = 73;
    release(s.mcWindow_Controls._Button_Reset._Button);
    const p1 = KEYS.P1, p2 = KEYS.P2;
    expect([sd.mPlayer1_KeyMoveUp, sd.mPlayer1_KeyMoveDown, sd.mPlayer1_KeyMoveLeft, sd.mPlayer1_KeyMoveRight, sd.mPlayer1_KeyShoot, sd.mPlayer1_KeyNextWeapon, sd.mPlayer1_KeyPrevWeapon])
      .toEqual([p1.UP, p1.DOWN, p1.LEFT, p1.RIGHT, p1.FIRE, p1.NEXT, p1.PREV]);
    expect([sd.mPlayer2_KeyMoveUp, sd.mPlayer2_KeyMoveDown, sd.mPlayer2_KeyMoveLeft, sd.mPlayer2_KeyMoveRight, sd.mPlayer2_KeyShoot, sd.mPlayer2_KeyNextWeapon, sd.mPlayer2_KeyPrevWeapon])
      .toEqual([p2.UP, p2.DOWN, p2.LEFT, p2.RIGHT, p2.FIRE, p2.NEXT, p2.PREV]);
    expect(s.mcWindow_Controls.mcPlayer1.mcChangeKey_Shoot.tbKey.text).toBe("'/'");
    expect(g.errors).toEqual([]);
  });
});

describe('local screens (scope)', () => {
  it('main menu INSTRUCTIONS -> local instructions screen -> back to the main menu', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1, fullBoot: true });
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    // "Back to menu" tab of the debrief screen
    const back = g.main().mcScreen._Icon_Back;
    back.onPress.call(back);
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    const ins = g.main().mcScreen.mcInstructions;
    ins.onRelease.call(ins);
    expect(g.waitScreen('State_Instructions', 'Screen_Instructions')).toBe(true);
    const back2 = g.main().mcScreen._Icon_Back;
    back2.onPress.call(back2);
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('debrief SEND SCORE stores the HUD total in the local table of the room and shows it', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 4, seed: 8, difficulty: 1 });
    const w = g.world();
    runBots(g, [new Bot(0)], 3000);
    if (g.state() === 'State_RunWorld') g.quit();
    const score = w.mHud.nTotalScore;
    expect(score).toBeGreaterThan(0);
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    const s = g.main().mcScreen;
    s.mUsername.text = 'QA BOT';
    s._SendScore.onRelease.call(s._SendScore);
    const table = getTable('Single', 3);
    expect(table[0]).toEqual({ mName: 'QA BOT', mScore: score });
    expect(CSaveData._this.__get__mUsername()).toBe('QA BOT');
    expect(s._SendScore.enabled).toBe(false);
    g.step(10);
    expect(g.errors).toEqual([]);
  });
});
