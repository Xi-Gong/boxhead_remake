// Lane X1: the sound cue of every menu control, checked against the original handlers (generated/disasm/Screen.*):
// Click = World.End.wav, Click2 = CLICK.wav. Recorded at CSound.PlaySound (the sample clip that starts), so the
// test sees exactly what the player would hear (also: nothing while "Sound: OFF").
import { afterEach, describe, expect, it } from 'vitest';
import { createHeadlessGame, type HeadlessGame } from './harness.ts';
import { CMain, CSaveData, CSound } from '../../src/game/packages.ts';

const release = (mc: any): void => { mc.onRelease.call(mc); };
const press = (mc: any): void => { mc.onPress.call(mc); };

/** Record the names of the CSound samples started from now on. */
function recordSounds(): { log: string[]; stop: () => void } {
  const names = new Map<any, string>();
  for (const k of Object.keys(CSound.mSamples)) names.set(CSound.mSamples[k], k);
  const log: string[] = [];
  const snd = CSound.mSound;
  const orig = snd.PlaySound;
  snd.PlaySound = function (this: any, item: any, ...a: any[]): void {
    const before = item.mPlaying;
    orig.call(this, item, ...a);
    if (item.mPlaying || before) log.push(names.get(item) ?? item.mLinkID);
  };
  return { log, stop: () => { snd.PlaySound = orig; } };
}

/** The sounds one UI action plays. */
function soundsOf(action: () => void): string[] {
  const r = recordSounds();
  try { action(); } finally { r.stop(); }
  return r.log;
}

afterEach(() => { CSound.mSFXActive = true; });

describe('menu sound cues (original handlers)', () => {
  it('main menu, instructions, level selection, options and controls windows', () => {
    const g: HeadlessGame = createHeadlessGame({ mode: 'Coop', seed: 1, menuOnly: 'Main' });
    let s = g.main().mcScreen;
    expect(soundsOf(() => release(s.mcInstructions))).toEqual(['Click2']);
    expect(g.waitScreen('State_Instructions', 'Screen_Instructions')).toBe(true);
    expect(soundsOf(() => press(g.main().mcScreen._Icon_Back))).toEqual(['Click']); // CScreen: "Back to menu"
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    s = g.main().mcScreen;
    expect(soundsOf(() => release(s.mcCoopPlay))).toEqual(['Click']);
    expect(g.waitScreen('State_SelectWorld_Coop', 'Screen_SelectWorld')).toBe(true);
    s = g.main().mcScreen;
    const sel = s.mcSubScreen.mcLevel_Selection;
    expect(soundsOf(() => release(sel.bLeft))).toEqual(['Click2']);
    expect(soundsOf(() => release(sel.bRight))).toEqual(['Click2']);
    expect(soundsOf(() => release(s.mcSubScreen.mcPlayer1_Character.bLeft))).toEqual(['Click2']);
    expect(soundsOf(() => release(s.mcSubScreen.mcPlayer2_Character.bRight))).toEqual(['Click2']);
    expect(soundsOf(() => release(sel.mcLevelIcons._ViewHighScore))).toEqual(['Click2']);
    expect(soundsOf(() => release(s._LocalHighscores._Button_Close._Button))).toEqual(['Click2']);
    const W = s.mcWindow_Options;
    expect(soundsOf(() => release(s._Game_Options._Button))).toEqual(['Click2']);
    for (const n of ['_Level_Expert', '_Speed_Fast', '_Devils_Off', '_Collide_Off', '_Damage_Off', '_Game3']) {
      expect(soundsOf(() => release(W[n]._Button)), n).toEqual(['Click2']);
    }
    expect(soundsOf(() => release(W._Button_Reset._Button))).toEqual(['Click2']);
    expect(soundsOf(() => release(W._Button_Close._Button))).toEqual(['Click2']);
    const C = s.mcWindow_Controls;
    expect(soundsOf(() => release(s._Game_Controls._Button))).toEqual(['Click2']);
    expect(soundsOf(() => release(C.mcPlayer2.mcChangeKey_NextWeapon))).toEqual(['Click2']);
    expect(soundsOf(() => { g.keyDown(27); g.keyUp(27); })).toEqual([]); // Esc: silent
    expect(soundsOf(() => release(C._Button_Reset._Button))).toEqual(['Click2']);
    expect(soundsOf(() => release(C._Button_Close._Button))).toEqual(['Click2']);
    // the level icon: Click, then the loading screen
    expect(soundsOf(() => release(sel.mcLevelIcons._Button))).toEqual(['Click']);
    expect(g.waitRunning()).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('pause QUIT is silent; the debrief opens with World.End; SEND / RETRY / EXIT click; View Highscores is silent', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1 });
    g.step(10);
    const r = recordSounds();
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    r.stop();
    expect(r.log.filter((x) => x === 'World_End_wav' || x.startsWith('Click'))).toEqual(['World_End_wav']);
    const s = g.main().mcScreen;
    expect(soundsOf(() => release(s._ViewHighscores))).toEqual([]); // [BC] Screen.CScreen_Debrief @621585: no sound
    s._LocalHighscores?._Button_Close._Button.onRelease();
    s.mUsername.text = 'ZED';
    expect(soundsOf(() => release(s._SendScore))).toEqual(['Click']);
    expect(soundsOf(() => press(s._Retry))).toEqual(['Click']);
    expect(g.waitRunning()).toBe(true);
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    expect(soundsOf(() => press(g.main().mcScreen._Exit))).toEqual(['Click']);
    expect(g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld')).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('Death Match: side switch silent; winner screen World.End; Replay / Select new level click', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 1 });
    expect(soundsOf(() => release(g.world().mHud.mcPlayerFrags.mcSwitchSides))).toEqual([]);
    const r = recordSounds();
    g.world().mCompleteState = 'player2 wins';
    expect(g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner')).toBe(true);
    r.stop();
    expect(r.log.filter((x) => x === 'World_End_wav' || x.startsWith('Click'))).toEqual(['World_End_wav']);
    expect(soundsOf(() => press(g.main().mcScreen._Retry))).toEqual(['Click']);
    expect(g.waitRunning()).toBe(true);
    g.world().mCompleteState = 'player1 wins';
    expect(g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner')).toBe(true);
    expect(soundsOf(() => press(g.main().mcScreen._Exit))).toEqual(['Click']);
    expect(g.errors).toEqual([]);
  });

  it('Sound: OFF silences every cue (CSaveData.mSoundActive -> CSound.SoundActive)', () => {
    const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Select' });
    CSaveData._this.__set__mSoundActive(false);
    const s = g.main().mcScreen;
    expect(soundsOf(() => release(s._Game_Options._Button))).toEqual([]);
    expect(soundsOf(() => release(s.mcSubScreen.mcLevel_Selection.bLeft))).toEqual([]);
    CSaveData._this.__set__mSoundActive(true);
    expect(soundsOf(() => release(s.mcSubScreen.mcLevel_Selection.bRight))).toEqual(['Click2']);
    expect(CMain.mSaveData.mSoundActive).toBe(true);
    expect(g.errors).toEqual([]);
  });
});
