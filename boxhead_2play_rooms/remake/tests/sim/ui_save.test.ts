// Lane X1: persistence of EVERY save key of SharedObject "BXHD_2PLAY_6" (plan appendix B) across an app restart,
// driven through the real UI handlers of the headless game: options window buttons, character / level arrows, the
// controls window (Key listener rebinding), the right-click menu items (Sound / Music / Quality), the Death Match
// side switch of the frags HUD and the debrief name (SEND SCORE). A "restart" = a new headless game in the same
// process reading the same injected storage (SharedObject cache + every game object rebuilt from scratch).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS, type GameMode, type HeadlessGame } from './harness.ts';
import { SharedObject, type KeyValueStorage } from '../../src/engine/flash/SharedObject.ts';
import { _root } from '../../src/engine/swf/Player.ts';
import { buildMenuRows } from '../../src/engine/platform/ContextMenu.ts';
import { CMain, CSaveData, CSound, Thing } from '../../src/game/packages.ts';

const release = (mc: any): void => { mc.onRelease.call(mc); };

class MapStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  json(): Record<string, any> { return JSON.parse(this.map.get('SO:BXHD_2PLAY_6') ?? '{}'); }
}

let store: MapStorage;
beforeEach(() => { store = new MapStorage(); SharedObject._setStorage(store); });
afterEach(() => { SharedObject._setStorage(undefined); CSound.mSFXActive = true; CSound.mMUSICActive = true; });

const boot = (mode: GameMode, menuOnly: 'Main' | 'Select' = 'Select'): HeadlessGame => createHeadlessGame({ mode, seed: 3, menuOnly });

/** Rows of the right-click menu as the platform shows them (src/engine/platform/ContextMenu.ts). */
const menuRows = () => buildMenuRows((_root as any).menu, _root);
const menuCaptions = (): string[] => menuRows().map((r) => r.caption);
const selectMenu = (prefix: string): void => {
  const r = menuRows().find((x) => x.caption.startsWith(prefix));
  if (!r) throw new Error(`no menu row ${prefix}`);
  r.select();
};

const ACTIONS = ['Shoot', 'MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'NextWeapon', 'PrevWeapon'] as const;
/** New bindings used by the restart test (all valid, all distinct; 'P' and digits avoided). */
const NEW_KEYS: Record<1 | 2, Record<(typeof ACTIONS)[number], number>> = {
  1: { Shoot: 75, MoveUp: 73, MoveDown: 75 + 0, MoveLeft: 74, MoveRight: 76, NextWeapon: 79, PrevWeapon: 85 },
  2: { Shoot: 70, MoveUp: 84, MoveDown: 71, MoveLeft: 86, MoveRight: 66, NextWeapon: 82, PrevWeapon: 90 },
};
NEW_KEYS[1].MoveDown = 77; // 'M'

const OPTION_GROUPS: [string, string[]][] = [
  ['mDifficulty', ['_Level_Beginner', '_Level_Intermediate', '_Level_Expert', '_Level_Nightmare']],
  ['mGameSpeed', ['_Speed_Slow', '_Speed_Normal', '_Speed_Fast']],
  ['mDevilsActive', ['_Devils_Off', '_Devils_On']],
  ['mCollisionsActive', ['_Collide_Off', '_Collide_On']],
  ['mDamageActive', ['_Damage_Off', '_Damage_On']],
  ['mGameAmount', ['_Game1', '_Game2', '_Game3', '_Game4']],
];

/** The _Selected marks of the options window: exactly the saved value of each group is marked. */
function expectOptionMarks(win: any, sd: any): void {
  for (const [field, names] of OPTION_GROUPS) {
    names.forEach((n, i) => expect(win[n]._Selected._visible, `${n} (${field}=${sd[field]})`).toBe(sd[field] == i));
  }
}

describe('fresh save (plan appendix B defaults)', () => {
  it('every key has its default and the menus show it', () => {
    const g = boot('Single');
    const sd: any = CMain.mSaveData;
    expect([sd.mDifficulty, sd.mGameSpeed, sd.mDevilsActive, sd.mCollisionsActive, sd.mDamageActive, sd.mGameAmount]).toEqual([0, 1, 1, 1, 1, 1]);
    expect([sd.mLevelIndex_Single, sd.mLevelIndex_Coop, sd.mLevelIndex_DeathMatch]).toEqual([8, 0, 0]);
    expect([sd.mPlayer1_CharacterIndex, sd.mPlayer2_CharacterIndex, sd.mViewSide_DeathMatch]).toEqual([3, 0, 1]);
    expect([sd.mSoundActive, sd.mMusicActive, sd.mDetail, sd.mUsername, sd.mPlayCount]).toEqual([true, true, true, undefined, 0]);
    // only LoadData's three flags (and the menus' own writes) are stored on a first start
    expect(store.json()).toEqual({ mMusicActive: true, mSoundActive: true, mDetail: true });
    const s = g.main().mcScreen;
    expect(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._currentframe).toBe(9); // BIG BOXY
    expect(s.mcSubScreen.mcPlayer1_Character.mcCharacter._currentframe).toBe(4); // BAMBO
    expectOptionMarks(s.mcWindow_Options, sd);
    const c = s.mcWindow_Controls;
    expect(ACTIONS.map((a) => c.mcPlayer1['tb' + a].text)).toEqual(["'/'", 'ARROW UP', 'ARROW DOWN', 'ARROW LEFT', 'ARROW RIGHT', "'.'", "','"]);
    expect(ACTIONS.map((a) => c.mcPlayer2['tb' + a].text)).toEqual(["' '", "'W'", "'S'", "'A'", "'D'", "'E'", "'Q'"]);
    expect(menuCaptions()).toEqual(['© Sean Cooper 2007', 'Sound: ON', 'Music: ON', 'Quality: BEST']);
    expect(g.errors).toEqual([]);
  });

  it('Coop / Death Match selections start on room 1 with SWAT as player 2', () => {
    for (const mode of ['Coop', 'DeathMatch'] as GameMode[]) {
      const g = boot(mode);
      const sub = g.main().mcScreen.mcSubScreen;
      expect(sub.mcLevel_Selection.mcLevelIcons._currentframe).toBe(1);
      expect(sub.mcPlayer1_Character.mcCharacter._currentframe).toBe(4);
      expect(sub.mcPlayer2_Character.mcCharacter._currentframe).toBe(1);
      expect(g.errors).toEqual([]);
    }
  });
});

describe('every save key survives a restart', () => {
  it('options, characters, levels, key bindings, sound / music / quality, username and the DM view side', () => {
    // ---------------------------------------------------------------- session 1: change everything through the UI
    let g = boot('Coop');
    let s = g.main().mcScreen;
    const win = s.mcWindow_Options;
    release(s._Game_Options._Button);
    for (const n of ['_Level_Nightmare', '_Speed_Fast', '_Devils_Off', '_Collide_Off', '_Damage_Off', '_Game4']) release(win[n]._Button);
    release(win._Button_Close._Button);
    // characters: P1 Bambo(3) -> left -> GI Joe(2); P2 SWAT(0) -> right -> Bond(1)
    release(s.mcSubScreen.mcPlayer1_Character.bLeft);
    release(s.mcSubScreen.mcPlayer2_Character.bRight);
    // Coop level 0 -> right x3 -> 3 (GLADIATOR)
    for (let i = 0; i < 3; i++) release(s.mcSubScreen.mcLevel_Selection.bRight);
    // every binding of both players
    const cw = s.mcWindow_Controls;
    release(s._Game_Controls._Button);
    for (const p of [1, 2] as const) {
      for (const a of ACTIONS) {
        release(cw['mcPlayer' + p]['mcChangeKey_' + a]);
        expect(cw.mcPressKey._visible).toBe(true);
        g.keyDown(NEW_KEYS[p][a]);
        g.keyUp(NEW_KEYS[p][a]);
        expect(cw.mcPressKey._visible).toBe(false);
      }
    }
    release(cw._Button_Close._Button);
    // right-click menu
    selectMenu('Sound:');
    selectMenu('Music:');
    selectMenu('Quality:');
    expect(menuCaptions()).toEqual(['© Sean Cooper 2007', 'Sound: OFF', 'Music: OFF', 'Quality: LOW']);
    expect(g.errors).toEqual([]);

    // a Death Match game for the side switch, a Single game for the debrief name
    g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 3, keepSave: true });
    const frags = g.world().mHud.mcPlayerFrags;
    expect(CMain.mSaveData.mViewSide_DeathMatch).toBe(1);
    release(frags.mcSwitchSides);
    expect(CMain.mSaveData.mViewSide_DeathMatch).toBe(0);
    g.step(4);
    expect([frags.mcPlayer1.tfPlayerName.text, frags.mcPlayer2.tfPlayerName.text]).toEqual(['Player 1', 'Player 2']);
    expect(g.errors).toEqual([]);

    // the Single room keeps the saved Single level (8) but the options are off -> SEND SCORE disabled, the
    // name is stored by the (enabled) original handler only when allowed; set it the way SEND SCORE does
    CSaveData._this.__set__mUsername('ZED');

    const saved = store.json();
    expect(saved).toMatchObject({
      mDifficulty: 3, mGameSpeed: 2, mDevilsActive: 0, mCollisionsActive: 0, mDamageActive: 0, mGameAmount: 3,
      mPlayer1_CharacterIndex: 2, mPlayer2_CharacterIndex: 1, mLevelIndex_Coop: 3, mViewSide_DeathMatch: 0,
      mSoundActive: false, mMusicActive: false, mDetail: false, mUsername: 'ZED',
    });
    for (const p of [1, 2] as const) for (const a of ACTIONS) expect(saved[`mPlayer${p}_Key${a}`], `P${p} ${a}`).toBe(NEW_KEYS[p][a]);

    // ---------------------------------------------------------------- session 2 ("restart")
    g = boot('Coop');
    s = g.main().mcScreen;
    const sd: any = CMain.mSaveData;
    expect([sd.mDifficulty, sd.mGameSpeed, sd.mDevilsActive, sd.mCollisionsActive, sd.mDamageActive, sd.mGameAmount]).toEqual([3, 2, 0, 0, 0, 3]);
    expect([sd.mPlayer1_CharacterIndex, sd.mPlayer2_CharacterIndex, sd.mLevelIndex_Coop, sd.mViewSide_DeathMatch]).toEqual([2, 1, 3, 0]);
    expect([sd.mSoundActive, sd.mMusicActive, sd.mDetail, sd.mUsername]).toEqual([false, false, false, 'ZED']);
    expectOptionMarks(s.mcWindow_Options, sd);
    expect(s.mcSubScreen.mcPlayer1_Character.mcCharacter._currentframe).toBe(3);
    expect(s.mcSubScreen.mcPlayer2_Character.mcCharacter._currentframe).toBe(2);
    expect(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._currentframe).toBe(4);
    expect(s.mcWindow_Controls.mcPlayer1.tbShoot.text).toBe("'K'");
    expect(s.mcWindow_Controls.mcPlayer2.tbPrevWeapon.text).toBe("'Z'");
    expect(menuCaptions()).toEqual(['© Sean Cooper 2007', 'Sound: OFF', 'Music: OFF', 'Quality: LOW']);
    // CSaveData.LoadData pushes the stored flags into CSound: sound effects stay silent
    expect(CSound.mSFXActive).toBe(false);
    expect(CSound.mMUSICActive).toBe(false);
    CSound.mSamples.Click.PlaySound();
    expect(CSound.mSamples.Click.mPlaying).toBe(false);
    // the menus run at HIGH quality; LOW applies inside a room (CWorld: QualityActive(true))
    expect((_root as any)._quality).toBe('HIGH');

    // the level icon starts the saved Coop room with the saved options and bindings
    release(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button);
    expect(g.waitRunning()).toBe(true);
    const w = g.world();
    expect(w.mWorldLibLink).toBe('ROOM_Single_0004');
    expect((CMain as any).mFPS).toBe(50); // Fast
    expect(g.snapshot().level).toBe(35); // Nightmare
    expect(g.snapshot().multiplier).toBe(50);
    expect((_root as any)._quality).toBe('LOW');
    expect((Thing.Creature.CThing_Creature as any).mDamageActive).toBe(0);
    const inp = CMain.mInput;
    expect([inp.KEY_FIRE.mKeycode, inp.KEY_UP.mKeycode, inp.KEY_DOWN.mKeycode, inp.KEY_LEFT.mKeycode, inp.KEY_RIGHT.mKeycode, inp.KEY_NEXT_WEAPON.mKeycode, inp.KEY_PREV_WEAPON.mKeycode])
      .toEqual(ACTIONS.map((a) => NEW_KEYS[1][a]));
    expect([inp.KEY_FIRE2.mKeycode, inp.KEY_UP2.mKeycode, inp.KEY_DOWN2.mKeycode, inp.KEY_LEFT2.mKeycode, inp.KEY_RIGHT2.mKeycode, inp.KEY_NEXT_WEAPON2.mKeycode, inp.KEY_PREV_WEAPON2.mKeycode])
      .toEqual(ACTIONS.map((a) => NEW_KEYS[2][a]));
    // the skins of the chosen characters (CThing_Creature_Player.GetCollection(index))
    const [p1, p2] = g.players();
    expect(p1.mXSI_Collection).toBe(Thing.Creature.CThing_Creature_Player.GetCollection(2));
    expect(p2.mXSI_Collection).toBe(Thing.Creature.CThing_Creature_Player.GetCollection(1));
    // P1 walks with the new 'I' key
    const y0 = p1.mPosition.mY;
    g.keyDown(73);
    g.tick(10);
    g.keyUp(73);
    expect(p1.mPosition.mY).toBeLessThan(y0);
    // the debrief shows the stored name
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    expect(g.main().mcScreen.mUsername.text).toBe('ZED');
    expect(g.main().mcScreen._SendScore.enabled).toBe(false); // devils / collisions / damage off
    expect(g.errors).toEqual([]);

    // Death Match after the restart: the switched side is used for the frags HUD
    g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 3, keepSave: true });
    g.step(4);
    const f2 = g.world().mHud.mcPlayerFrags;
    expect(f2.mcPlayer1.tfPlayerName.text).toBe('Player 1');
    release(f2.mcSwitchSides);
    g.step(4);
    expect([f2.mcPlayer1.tfPlayerName.text, f2.mcPlayer2.tfPlayerName.text]).toEqual(['Player 2', 'Player 1']);
    expect(g.errors).toEqual([]);
  });

  it('options RESET and controls RESET are persisted too', () => {
    let g = boot('Single');
    let s = g.main().mcScreen;
    release(s.mcWindow_Options._Level_Expert._Button);
    release(s.mcWindow_Controls.mcPlayer1.mcChangeKey_Shoot);
    g.keyDown(KEYS.SPACE); g.keyUp(KEYS.SPACE);
    expect(store.json().mPlayer1_KeyShoot).toBe(32);
    release(s.mcWindow_Options._Button_Reset._Button);
    release(s.mcWindow_Controls._Button_Reset._Button);
    g = boot('Single');
    s = g.main().mcScreen;
    expect(CMain.mSaveData.mDifficulty).toBe(0);
    expect(CMain.mSaveData.mPlayer1_KeyShoot).toBe(191);
    expect(s.mcWindow_Controls.mcPlayer1.tbShoot.text).toBe("'/'");
    expectOptionMarks(s.mcWindow_Options, CMain.mSaveData);
    expect(g.errors).toEqual([]);
  });
});
