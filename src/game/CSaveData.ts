// Port of assets/projects/boxhead4/CSaveData.as
// Structure from generated/disasm/CSaveData.txt top-level script @219496..@227800 (initaction of sprite 777).
// Every saved field is an AS2 property (addProperty(name, __get__name, __set__name)): the setter writes the
// SharedObject member AND the prototype-default backing field `_Name`, flushes, and returns the getter value; the getter
// prefers the stored value over the backing field. Both the `__get__/__set__` methods (called directly by other classes)
// and TS accessors are provided.
import { SharedObject, _root, forIn, proto } from '../engine/runtime.ts';
import { CInput, CSound, registerGameClass } from './packages.ts';

export class CSaveData {
  [key: string]: any;
  static obj: any;
  static _this: any;
  static mSharedObject: any;
  static mDefaultQuality = 'HIGH';

  constructor() {
    CSaveData.obj = this;
    CSaveData._this = this;
    this._Player1_KeyMoveUp = 38;
    this._Player1_KeyMoveDown = 40;
    this._Player1_KeyMoveLeft = 37;
    this._Player1_KeyMoveRight = 39;
    this._Player1_KeyShoot = 191;
    this._Player1_KeyNextWeapon = 190;
    this._Player1_KeyPrevWeapon = 188;
    this._Player2_KeyMoveUp = CInput.ToAscii('W');
    this._Player2_KeyMoveDown = CInput.ToAscii('S');
    this._Player2_KeyMoveLeft = CInput.ToAscii('A');
    this._Player2_KeyMoveRight = CInput.ToAscii('D');
    this._Player2_KeyShoot = CInput.ToAscii(' ');
    this._Player2_KeyNextWeapon = CInput.ToAscii('E');
    this._Player2_KeyPrevWeapon = CInput.ToAscii('Q');
  }

  Dispose(): void {
  }

  static UpdateDetail(): void {
    CSaveData._this.__set__mDetail(CSaveData._this._Detail);
  }

  static QualityActive(a: any): void {
    CSaveData._this.mQualityActive = a;
    CSaveData._this.__set__mDetail(CSaveData._this._Detail);
  }

  SaveData(): string {
    CSaveData.mSharedObject.flush();
    return 'success';
  }

  LoadData(tUsername?: any): string {
    void tUsername;
    CSaveData.mSharedObject = SharedObject.getLocal('BXHD_2PLAY_6');
    for (const _loc2_ of forIn(CSaveData.mSharedObject.data)) {
      void _loc2_;
    }
    this.__set__mMusicActive(CSaveData.mSharedObject.data.mMusicActive != undefined ? CSaveData.mSharedObject.data.mMusicActive : true);
    this.__set__mSoundActive(CSaveData.mSharedObject.data.mSoundActive != undefined ? CSaveData.mSharedObject.data.mSoundActive : true);
    this.__set__mDetail(CSaveData.mSharedObject.data.mDetail != undefined ? CSaveData.mSharedObject.data.mDetail : true);
    return 'success';
  }

  ResetData(): void {
    CSaveData.mSharedObject.clear();
    for (const _loc2_ of forIn(CSaveData.mSharedObject.data)) {
      delete CSaveData.mSharedObject.data[_loc2_];
      CSaveData.mSharedObject.data[_loc2_] = undefined;
    }
    this.SaveData();
  }

  __set__mUsername(a: any): any {
    CSaveData.mSharedObject.data.mUsername = this._Username = a;
    this.SaveData();
    return this.__get__mUsername();
  }

  __get__mUsername(): any {
    return CSaveData.mSharedObject.data.mUsername != undefined ? CSaveData.mSharedObject.data.mUsername : this._Username;
  }

  __set__mMusicActive(a: any): any {
    CSaveData.mSharedObject.data.mMusicActive = this._MusicActive = a;
    this.SaveData();
    CSound.MusicActive(this._MusicActive);
    return this.__get__mMusicActive();
  }

  __get__mMusicActive(): any {
    return CSaveData.mSharedObject.data.mMusicActive != undefined ? CSaveData.mSharedObject.data.mMusicActive : this._MusicActive;
  }

  __set__mSoundActive(a: any): any {
    CSaveData.mSharedObject.data.mSoundActive = this._SoundActive = a;
    this.SaveData();
    CSound.SoundActive(this._SoundActive);
    return this.__get__mSoundActive();
  }

  __get__mSoundActive(): any {
    return CSaveData.mSharedObject.data.mSoundActive != undefined ? CSaveData.mSharedObject.data.mSoundActive : this._SoundActive;
  }

  __set__mDetail(a: any): any {
    CSaveData.mSharedObject.data.mDetail = this._Detail = a;
    this.SaveData();
    _root._quality = !(this._Detail || !this.mQualityActive) ? 'LOW' : CSaveData.mDefaultQuality;
    return this.__get__mDetail();
  }

  __get__mDetail(): any {
    return CSaveData.mSharedObject.data.mDetail != undefined ? CSaveData.mSharedObject.data.mDetail : this._Detail;
  }

  __set__mDifficulty(a: any): any {
    CSaveData.mSharedObject.data.mDifficulty = this._Difficulty = a;
    this.SaveData();
    return this.__get__mDifficulty();
  }

  __get__mDifficulty(): any {
    return CSaveData.mSharedObject.data.mDifficulty != undefined ? CSaveData.mSharedObject.data.mDifficulty : this._Difficulty;
  }

  __set__mGameSpeed(a: any): any {
    CSaveData.mSharedObject.data.mGameSpeed = this._GameSpeed = a;
    this.SaveData();
    return this.__get__mGameSpeed();
  }

  __get__mGameSpeed(): any {
    return CSaveData.mSharedObject.data.mGameSpeed != undefined ? CSaveData.mSharedObject.data.mGameSpeed : this._GameSpeed;
  }

  __set__mDevilsActive(a: any): any {
    CSaveData.mSharedObject.data.mDevilsActive = this._DevilsActive = a;
    this.SaveData();
    return this.__get__mDevilsActive();
  }

  __get__mDevilsActive(): any {
    return CSaveData.mSharedObject.data.mDevilsActive != undefined ? CSaveData.mSharedObject.data.mDevilsActive : this._DevilsActive;
  }

  __set__mCollisionsActive(a: any): any {
    CSaveData.mSharedObject.data.mCollisionsActive = this._CollisionsActive = a;
    this.SaveData();
    return this.__get__mCollisionsActive();
  }

  __get__mCollisionsActive(): any {
    return CSaveData.mSharedObject.data.mCollisionsActive != undefined ? CSaveData.mSharedObject.data.mCollisionsActive : this._CollisionsActive;
  }

  __set__mDamageActive(a: any): any {
    CSaveData.mSharedObject.data.mDamageActive = this._DamageActive = a;
    this.SaveData();
    return this.__get__mDamageActive();
  }

  __get__mDamageActive(): any {
    return CSaveData.mSharedObject.data.mDamageActive != undefined ? CSaveData.mSharedObject.data.mDamageActive : this._DamageActive;
  }

  __set__mGameAmount(a: any): any {
    CSaveData.mSharedObject.data.mGameAmount = this._GameAmount = a;
    this.SaveData();
    return this.__get__mGameAmount();
  }

  __get__mGameAmount(): any {
    return CSaveData.mSharedObject.data.mGameAmount != undefined ? CSaveData.mSharedObject.data.mGameAmount : this._GameAmount;
  }

  __set__mLevelIndex_Single(a: any): any {
    CSaveData.mSharedObject.data.mLevelIndex_Single = this._LevelIndex_Single = a;
    this.SaveData();
    return this.__get__mLevelIndex_Single();
  }

  __get__mLevelIndex_Single(): any {
    return CSaveData.mSharedObject.data.mLevelIndex_Single != undefined ? CSaveData.mSharedObject.data.mLevelIndex_Single : this._LevelIndex_Single;
  }

  __set__mLevelIndex_Coop(a: any): any {
    CSaveData.mSharedObject.data.mLevelIndex_Coop = this._LevelIndex_Coop = a;
    this.SaveData();
    return this.__get__mLevelIndex_Coop();
  }

  __get__mLevelIndex_Coop(): any {
    return CSaveData.mSharedObject.data.mLevelIndex_Coop != undefined ? CSaveData.mSharedObject.data.mLevelIndex_Coop : this._LevelIndex_Coop;
  }

  __set__mLevelIndex_DeathMatch(a: any): any {
    CSaveData.mSharedObject.data.mLevelIndex_DeathMatch = this._LevelIndex_DeathMatch = a;
    this.SaveData();
    return this.__get__mLevelIndex_DeathMatch();
  }

  __get__mLevelIndex_DeathMatch(): any {
    return CSaveData.mSharedObject.data.mLevelIndex_DeathMatch != undefined ? CSaveData.mSharedObject.data.mLevelIndex_DeathMatch : this._LevelIndex_DeathMatch;
  }

  __set__mPlayer1_CharacterIndex(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_CharacterIndex = this._Player1_CharacterIndex = a;
    this.SaveData();
    return this.__get__mPlayer1_CharacterIndex();
  }

  __get__mPlayer1_CharacterIndex(): any {
    return CSaveData.mSharedObject.data.mPlayer1_CharacterIndex != undefined ? CSaveData.mSharedObject.data.mPlayer1_CharacterIndex : this._Player1_CharacterIndex;
  }

  __set__mPlayer2_CharacterIndex(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_CharacterIndex = this._Player2_CharacterIndex = a;
    this.SaveData();
    return this.__get__mPlayer2_CharacterIndex();
  }

  __get__mPlayer2_CharacterIndex(): any {
    return CSaveData.mSharedObject.data.mPlayer2_CharacterIndex != undefined ? CSaveData.mSharedObject.data.mPlayer2_CharacterIndex : this._Player2_CharacterIndex;
  }

  __set__mViewSide_DeathMatch(a: any): any {
    CSaveData.mSharedObject.data.mViewSide_DeathMatch = this._ViewSide_DeathMatch = a;
    this.SaveData();
    return this.__get__mViewSide_DeathMatch();
  }

  __get__mViewSide_DeathMatch(): any {
    return CSaveData.mSharedObject.data.mViewSide_DeathMatch != undefined ? CSaveData.mSharedObject.data.mViewSide_DeathMatch : this._ViewSide_DeathMatch;
  }

  __set__mPlayer1_KeyMoveUp(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyMoveUp = this._Player1_KeyMoveUp = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyMoveUp();
  }

  __get__mPlayer1_KeyMoveUp(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyMoveUp != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyMoveUp : this._Player1_KeyMoveUp;
  }

  __set__mPlayer1_KeyMoveDown(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyMoveDown = this._Player1_KeyMoveDown = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyMoveDown();
  }

  __get__mPlayer1_KeyMoveDown(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyMoveDown != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyMoveDown : this._Player1_KeyMoveDown;
  }

  __set__mPlayer1_KeyMoveLeft(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyMoveLeft = this._Player1_KeyMoveLeft = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyMoveLeft();
  }

  __get__mPlayer1_KeyMoveLeft(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyMoveLeft != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyMoveLeft : this._Player1_KeyMoveLeft;
  }

  __set__mPlayer1_KeyMoveRight(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyMoveRight = this._Player1_KeyMoveRight = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyMoveRight();
  }

  __get__mPlayer1_KeyMoveRight(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyMoveRight != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyMoveRight : this._Player1_KeyMoveRight;
  }

  __set__mPlayer1_KeyShoot(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyShoot = this._Player1_KeyShoot = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyShoot();
  }

  __get__mPlayer1_KeyShoot(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyShoot != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyShoot : this._Player1_KeyShoot;
  }

  __set__mPlayer1_KeyNextWeapon(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyNextWeapon = this._Player1_KeyNextWeapon = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyNextWeapon();
  }

  __get__mPlayer1_KeyNextWeapon(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyNextWeapon != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyNextWeapon : this._Player1_KeyNextWeapon;
  }

  __set__mPlayer1_KeyPrevWeapon(a: any): any {
    CSaveData.mSharedObject.data.mPlayer1_KeyPrevWeapon = this._Player1_KeyPrevWeapon = a;
    this.SaveData();
    return this.__get__mPlayer1_KeyPrevWeapon();
  }

  __get__mPlayer1_KeyPrevWeapon(): any {
    return CSaveData.mSharedObject.data.mPlayer1_KeyPrevWeapon != undefined ? CSaveData.mSharedObject.data.mPlayer1_KeyPrevWeapon : this._Player1_KeyPrevWeapon;
  }

  __set__mPlayer2_KeyMoveUp(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyMoveUp = this._Player2_KeyMoveUp = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyMoveUp();
  }

  __get__mPlayer2_KeyMoveUp(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyMoveUp != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyMoveUp : this._Player2_KeyMoveUp;
  }

  __set__mPlayer2_KeyMoveDown(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyMoveDown = this._Player2_KeyMoveDown = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyMoveDown();
  }

  __get__mPlayer2_KeyMoveDown(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyMoveDown != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyMoveDown : this._Player2_KeyMoveDown;
  }

  __set__mPlayer2_KeyMoveLeft(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyMoveLeft = this._Player2_KeyMoveLeft = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyMoveLeft();
  }

  __get__mPlayer2_KeyMoveLeft(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyMoveLeft != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyMoveLeft : this._Player2_KeyMoveLeft;
  }

  __set__mPlayer2_KeyMoveRight(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyMoveRight = this._Player2_KeyMoveRight = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyMoveRight();
  }

  __get__mPlayer2_KeyMoveRight(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyMoveRight != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyMoveRight : this._Player2_KeyMoveRight;
  }

  __set__mPlayer2_KeyShoot(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyShoot = this._Player2_KeyShoot = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyShoot();
  }

  __get__mPlayer2_KeyShoot(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyShoot != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyShoot : this._Player2_KeyShoot;
  }

  __set__mPlayer2_KeyNextWeapon(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyNextWeapon = this._Player2_KeyNextWeapon = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyNextWeapon();
  }

  __get__mPlayer2_KeyNextWeapon(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyNextWeapon != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyNextWeapon : this._Player2_KeyNextWeapon;
  }

  __set__mPlayer2_KeyPrevWeapon(a: any): any {
    CSaveData.mSharedObject.data.mPlayer2_KeyPrevWeapon = this._Player2_KeyPrevWeapon = a;
    this.SaveData();
    return this.__get__mPlayer2_KeyPrevWeapon();
  }

  __get__mPlayer2_KeyPrevWeapon(): any {
    return CSaveData.mSharedObject.data.mPlayer2_KeyPrevWeapon != undefined ? CSaveData.mSharedObject.data.mPlayer2_KeyPrevWeapon : this._Player2_KeyPrevWeapon;
  }

  __set__mPlayCount(a: any): any {
    CSaveData.mSharedObject.data.mPlayCount = this._PlayCount = a;
    this.SaveData();
    return this.__get__mPlayCount();
  }

  __get__mPlayCount(): any {
    return CSaveData.mSharedObject.data.mPlayCount != undefined ? CSaveData.mSharedObject.data.mPlayCount : this._PlayCount;
  }

  // addProperty(name, __get__name, __set__name)
  get mUsername(): any { return this.__get__mUsername(); }
  set mUsername(a: any) { this.__set__mUsername(a); }
  get mMusicActive(): any { return this.__get__mMusicActive(); }
  set mMusicActive(a: any) { this.__set__mMusicActive(a); }
  get mSoundActive(): any { return this.__get__mSoundActive(); }
  set mSoundActive(a: any) { this.__set__mSoundActive(a); }
  get mDetail(): any { return this.__get__mDetail(); }
  set mDetail(a: any) { this.__set__mDetail(a); }
  get mDifficulty(): any { return this.__get__mDifficulty(); }
  set mDifficulty(a: any) { this.__set__mDifficulty(a); }
  get mGameSpeed(): any { return this.__get__mGameSpeed(); }
  set mGameSpeed(a: any) { this.__set__mGameSpeed(a); }
  get mDevilsActive(): any { return this.__get__mDevilsActive(); }
  set mDevilsActive(a: any) { this.__set__mDevilsActive(a); }
  get mCollisionsActive(): any { return this.__get__mCollisionsActive(); }
  set mCollisionsActive(a: any) { this.__set__mCollisionsActive(a); }
  get mDamageActive(): any { return this.__get__mDamageActive(); }
  set mDamageActive(a: any) { this.__set__mDamageActive(a); }
  get mGameAmount(): any { return this.__get__mGameAmount(); }
  set mGameAmount(a: any) { this.__set__mGameAmount(a); }
  get mLevelIndex_Single(): any { return this.__get__mLevelIndex_Single(); }
  set mLevelIndex_Single(a: any) { this.__set__mLevelIndex_Single(a); }
  get mLevelIndex_Coop(): any { return this.__get__mLevelIndex_Coop(); }
  set mLevelIndex_Coop(a: any) { this.__set__mLevelIndex_Coop(a); }
  get mLevelIndex_DeathMatch(): any { return this.__get__mLevelIndex_DeathMatch(); }
  set mLevelIndex_DeathMatch(a: any) { this.__set__mLevelIndex_DeathMatch(a); }
  get mPlayer1_CharacterIndex(): any { return this.__get__mPlayer1_CharacterIndex(); }
  set mPlayer1_CharacterIndex(a: any) { this.__set__mPlayer1_CharacterIndex(a); }
  get mPlayer2_CharacterIndex(): any { return this.__get__mPlayer2_CharacterIndex(); }
  set mPlayer2_CharacterIndex(a: any) { this.__set__mPlayer2_CharacterIndex(a); }
  get mViewSide_DeathMatch(): any { return this.__get__mViewSide_DeathMatch(); }
  set mViewSide_DeathMatch(a: any) { this.__set__mViewSide_DeathMatch(a); }
  get mPlayer1_KeyMoveUp(): any { return this.__get__mPlayer1_KeyMoveUp(); }
  set mPlayer1_KeyMoveUp(a: any) { this.__set__mPlayer1_KeyMoveUp(a); }
  get mPlayer1_KeyMoveDown(): any { return this.__get__mPlayer1_KeyMoveDown(); }
  set mPlayer1_KeyMoveDown(a: any) { this.__set__mPlayer1_KeyMoveDown(a); }
  get mPlayer1_KeyMoveLeft(): any { return this.__get__mPlayer1_KeyMoveLeft(); }
  set mPlayer1_KeyMoveLeft(a: any) { this.__set__mPlayer1_KeyMoveLeft(a); }
  get mPlayer1_KeyMoveRight(): any { return this.__get__mPlayer1_KeyMoveRight(); }
  set mPlayer1_KeyMoveRight(a: any) { this.__set__mPlayer1_KeyMoveRight(a); }
  get mPlayer1_KeyShoot(): any { return this.__get__mPlayer1_KeyShoot(); }
  set mPlayer1_KeyShoot(a: any) { this.__set__mPlayer1_KeyShoot(a); }
  get mPlayer1_KeyNextWeapon(): any { return this.__get__mPlayer1_KeyNextWeapon(); }
  set mPlayer1_KeyNextWeapon(a: any) { this.__set__mPlayer1_KeyNextWeapon(a); }
  get mPlayer1_KeyPrevWeapon(): any { return this.__get__mPlayer1_KeyPrevWeapon(); }
  set mPlayer1_KeyPrevWeapon(a: any) { this.__set__mPlayer1_KeyPrevWeapon(a); }
  get mPlayer2_KeyMoveUp(): any { return this.__get__mPlayer2_KeyMoveUp(); }
  set mPlayer2_KeyMoveUp(a: any) { this.__set__mPlayer2_KeyMoveUp(a); }
  get mPlayer2_KeyMoveDown(): any { return this.__get__mPlayer2_KeyMoveDown(); }
  set mPlayer2_KeyMoveDown(a: any) { this.__set__mPlayer2_KeyMoveDown(a); }
  get mPlayer2_KeyMoveLeft(): any { return this.__get__mPlayer2_KeyMoveLeft(); }
  set mPlayer2_KeyMoveLeft(a: any) { this.__set__mPlayer2_KeyMoveLeft(a); }
  get mPlayer2_KeyMoveRight(): any { return this.__get__mPlayer2_KeyMoveRight(); }
  set mPlayer2_KeyMoveRight(a: any) { this.__set__mPlayer2_KeyMoveRight(a); }
  get mPlayer2_KeyShoot(): any { return this.__get__mPlayer2_KeyShoot(); }
  set mPlayer2_KeyShoot(a: any) { this.__set__mPlayer2_KeyShoot(a); }
  get mPlayer2_KeyNextWeapon(): any { return this.__get__mPlayer2_KeyNextWeapon(); }
  set mPlayer2_KeyNextWeapon(a: any) { this.__set__mPlayer2_KeyNextWeapon(a); }
  get mPlayer2_KeyPrevWeapon(): any { return this.__get__mPlayer2_KeyPrevWeapon(); }
  set mPlayer2_KeyPrevWeapon(a: any) { this.__set__mPlayer2_KeyPrevWeapon(a); }
  get mPlayCount(): any { return this.__get__mPlayCount(); }
  set mPlayCount(a: any) { this.__set__mPlayCount(a); }
}
proto(CSaveData, {
  _CLASSID_: 'CSaveData',
  _MusicActive: true,
  _SoundActive: true,
  _Detail: true,
  mQualityActive: false,
  _Difficulty: 0,
  _GameSpeed: 1,
  _DevilsActive: 1,
  _CollisionsActive: 1,
  _DamageActive: 1,
  _GameAmount: 1,
  _LevelIndex_Single: 8,
  _LevelIndex_Coop: 0,
  _LevelIndex_DeathMatch: 0,
  _Player1_CharacterIndex: 3,
  _Player2_CharacterIndex: 0,
  _ViewSide_DeathMatch: 1,
  _PlayCount: 0,
});

registerGameClass('CSaveData', CSaveData);
