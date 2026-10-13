// Lane F3: CInput latch semantics and CSaveData defaults / persistence.
import { freshSaveData } from './f3Setup.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { Key } from '../../../../src/engine/flash/input.ts';
import { SharedObject } from '../../../../src/engine/flash/SharedObject.ts';
import { _root } from '../../../../src/engine/swf/Player.ts';
import { CInput, CMain, CSaveData } from '../../../../src/game/packages.ts';

describe('CSaveData', () => {
  beforeEach(() => { freshSaveData(); });

  it('defaults of the BXHD_2PLAY_6 save', () => {
    const sd: any = (CMain as any).mSaveData;
    expect(CSaveData.mSharedObject).toBe(SharedObject.getLocal('BXHD_2PLAY_6'));
    expect(sd.mLevelIndex_Single).toBe(8);
    expect(sd.mLevelIndex_Coop).toBe(0);
    expect(sd.mLevelIndex_DeathMatch).toBe(0);
    expect(sd.mPlayer1_CharacterIndex).toBe(3);
    expect(sd.mPlayer2_CharacterIndex).toBe(0);
    expect(sd.mViewSide_DeathMatch).toBe(1);
    expect([sd.mDifficulty, sd.mGameSpeed, sd.mDevilsActive, sd.mCollisionsActive, sd.mDamageActive, sd.mGameAmount]).toEqual([0, 1, 1, 1, 1, 1]);
    expect([sd.mMusicActive, sd.mSoundActive, sd.mDetail]).toEqual([true, true, true]);
    expect(sd.mUsername).toBeUndefined();
    expect(sd.mPlayCount).toBe(0);
  });

  it('default keys: P1 arrows / . , and P2 W S A D Space E Q', () => {
    const sd: any = (CMain as any).mSaveData;
    expect([sd.mPlayer1_KeyMoveUp, sd.mPlayer1_KeyMoveDown, sd.mPlayer1_KeyMoveLeft, sd.mPlayer1_KeyMoveRight]).toEqual([38, 40, 37, 39]);
    expect([sd.mPlayer1_KeyShoot, sd.mPlayer1_KeyNextWeapon, sd.mPlayer1_KeyPrevWeapon]).toEqual([191, 190, 188]);
    expect([sd.mPlayer2_KeyMoveUp, sd.mPlayer2_KeyMoveDown, sd.mPlayer2_KeyMoveLeft, sd.mPlayer2_KeyMoveRight]).toEqual([87, 83, 65, 68]);
    expect([sd.mPlayer2_KeyShoot, sd.mPlayer2_KeyNextWeapon, sd.mPlayer2_KeyPrevWeapon]).toEqual([32, 69, 81]);
  });

  it('LoadData stores the sound/music/detail flags; setters persist and return the getter value', () => {
    const sd: any = (CMain as any).mSaveData;
    const data = CSaveData.mSharedObject.data;
    expect([data.mMusicActive, data.mSoundActive, data.mDetail]).toEqual([true, true, true]);
    expect(sd.__set__mLevelIndex_Single(4)).toBe(4);
    sd.mPlayer1_KeyShoot = 32;
    // simulate a restart: a new SharedObject instance reads the stored JSON
    SharedObject._forgetInstances();
    const sd2: any = new (CSaveData as any)();
    sd2.LoadData('morerooms_default');
    expect(sd2.mLevelIndex_Single).toBe(4);
    expect(sd2.mPlayer1_KeyShoot).toBe(32);
  });

  it('detail off switches _root._quality to LOW once QualityActive (in game)', () => {
    const sd: any = (CMain as any).mSaveData;
    sd.mDetail = false;
    expect(_root._quality).toBe('HIGH'); // menus: mQualityActive false -> default quality
    CSaveData.QualityActive(true);
    expect(_root._quality).toBe('LOW');
    sd.mDetail = true;
    expect(_root._quality).toBe('HIGH');
    CSaveData.QualityActive(false);
  });

  it('ResetData empties the save (getters fall back to the defaults)', () => {
    const sd: any = (CMain as any).mSaveData;
    sd.mLevelIndex_Single = 2;
    sd.ResetData();
    expect(CSaveData.mSharedObject.data.mLevelIndex_Single).toBeUndefined();
    expect(sd.mLevelIndex_Single).toBe(2); // backing field _LevelIndex_Single was written by the setter
  });
});

describe('CInput latches', () => {
  let input: any;
  beforeEach(() => {
    freshSaveData();
    input = new (CInput as any)();
  });

  it('ResetKeys builds 256 key objects with mKeycode = index', () => {
    expect(input.mKey_List).toHaveLength(256);
    for (let i = 0; i < 256; i++) expect(input.mKey_List[i].mKeycode).toBe(i);
    expect(input.KEY_UP).toBe(input.mKey_List[38]);
    expect(input.KEY_FIRE2).toBe(input.mKey_List[32]);
    expect(input.KEY_PAUSE).toBe(input.mKey_List[80]);
    expect(input.KEY_SELECT0).toBe(input.mKey_List[48]);
    expect(input.mKey_List_Registered).toHaveLength(25);
  });

  it('IsDown follows the live key state', () => {
    expect(input.KEY_UP.IsDown()).toBe(false);
    Key._down(38);
    expect(input.KEY_UP.IsDown()).toBe(true);
    expect(input.KEY_UP.IsUp()).toBe(false);
    Key._up(38);
    expect(input.KEY_UP.IsDown()).toBe(false);
  });

  it('IsPressed is true once per press (consumed); auto-repeat does not re-latch', () => {
    Key._down(80);
    expect(input.KEY_PAUSE.IsPressed()).toBe(true);
    expect(input.KEY_PAUSE.IsPressed()).toBe(false);
    Key._down(80); // auto-repeat while held
    input.ProcessAllKeys();
    expect(input.KEY_PAUSE.IsPressed()).toBe(false);
    Key._up(80);
    Key._down(80);
    expect(input.KEY_PAUSE.IsPressed()).toBe(true);
  });

  it('IsReleased is true once per release and also consumes the press', () => {
    Key._down(191);
    Key._up(191);
    expect(input.KEY_FIRE.mPressed).toBe(true);
    expect(input.KEY_FIRE.IsReleased()).toBe(true);
    expect(input.KEY_FIRE.mPressed).toBe(false);
    expect(input.KEY_FIRE.IsReleased()).toBe(false);
    expect(input.KEY_FIRE.IsPressed()).toBe(false);
  });

  it('stamps press/release times and Renew clears the latches', () => {
    Key._down(37);
    expect(input.KEY_LEFT.mDown).toBe(true);
    expect(typeof input.KEY_LEFT.mTimePressed).toBe('number');
    Key._up(37);
    expect(input.KEY_LEFT.mReleased).toBe(true);
    input.KEY_LEFT.Renew();
    expect([input.KEY_LEFT.mPressed, input.KEY_LEFT.mReleased, input.KEY_LEFT.mDown]).toEqual([false, false, false]);
  });

  it('AnyKeyPressed / AddAdditionKeyCode', () => {
    expect(input.AnyKeyPressed()).toBe(false);
    Key._down(87);
    expect(input.AnyKeyPressed()).toBe(true);
    Key._up(87);
    input.AddAdditionKeyCode(input.KEY_FIRE, 32);
    Key._down(32);
    expect(input.KEY_FIRE.IsDown()).toBe(true);
    Key._up(32);
  });

  it('valid-key table (controls window): Caps/Num/Scroll lock are unknown, ; [ ] invalid', () => {
    expect(CInput.isValidKey(38)).toEqual({ mValid: true, mName: 'ARROW UP' });
    expect(CInput.isValidKey(191)).toEqual({ mValid: true, mName: "'/'" });
    expect(CInput.isValidKey(186)).toEqual({ mValid: false, mName: "';'" });
    expect(CInput.isValidKey(20)).toBeUndefined();
    expect(CInput.isValidKey(80)).toBeUndefined(); // 'P' (pause) cannot be bound
    expect(CInput.ToAscii('W')).toBe(87);
  });
});
