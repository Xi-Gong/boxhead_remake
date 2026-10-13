// Port of projects/boxhead4/CSound.as
// Structure from generated/disasm/CSound.txt top-level script @86880..@94211 (initaction of sprite 759).
// Every registered sample is an invisible empty clip on the CMain clip holding its own AS2 Sound(target) object, so
// each sample is one channel (PlaySound_* stop the previous instance first). The sample clips get the PlaySound /
// StopSound function of the registration (CSound.prototype.PlaySound_* with `this` = the sample clip).
import { flash, forIn, getTimer, int, proto, random, Sound } from '../engine/runtime.ts';
import { scidd, registerGameClass } from './packages.ts';

export class CSound {
  [key: string]: any;
  static mSound: any;
  static mSoundList: any;
  static mProcessList: any;
  static mSamples: any;
  static mAmbience: any;
  static mAtmosphere: any;
  static mCurrentAtmosphere: any;
  static mSFXActive = true;
  static mMUSICActive = true;

  constructor(tParent: any) {
    CSound.mSound = this;
    const _loc2_ = new Sound();
    void _loc2_;
    CSound.mSoundList = new Array();
    CSound.mProcessList = new Array();
    this.mcParent = tParent;
    CSound.mSamples = new Object();
    CSound.mSamples.Creature_HitFloor_wav = this.RegisterSound('sfx', 'Creature.HitFloor.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Player_Scream_1_wav = this.RegisterSound('sfx', 'Creature.Player.Scream.1.wav', 0.7, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Player_Scream_2_wav = this.RegisterSound('sfx', 'Creature.Player.Scream.2.wav', 0.7, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Hit_1_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.1.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Hit_2_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.2.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Hit_3_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.3.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Hit_4_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.4.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Attack_wav = this.RegisterSound('sfx', 'Creature.Zombie.Attack.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Creature_Zombie_Hit_wav = this.RegisterSound('sfx', 'Creature.Zombie.Hit.wav', 0.3, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Effect_Explosion_wav = this.RegisterSound('sfx', 'Effect.Explosion.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Object_Barrel_Place_wav = this.RegisterSound('sfx', 'Object.Barrel.Place.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Object_Mine_Detonate_wav = this.RegisterSound('sfx', 'Object.Mine.Detonate.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Object_Pickup_wav = this.RegisterSound('sfx', 'Object.Pickup.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Shot_Grenade_Bounce_wav = this.RegisterSound('sfx', 'Shot.Grenade.Bounce.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Shot_HitWall_1_wav = this.RegisterSound('sfx', 'Shot.HitWall.1.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Shot_HitWall_2_wav = this.RegisterSound('sfx', 'Shot.HitWall.2.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Shot_HitWall_3_wav = this.RegisterSound('sfx', 'Shot.HitWall.3.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Shot_Rocket_Fire_wav = this.RegisterSound('sfx', 'Shot.Rocket.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_Mine_Place_wav = this.RegisterSound('sfx', 'Weapon.Mine.Place.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_Pistol_Fire_wav = this.RegisterSound('sfx', 'Weapon.Pistol.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_Railgun_Fire_wav = this.RegisterSound('sfx', 'Weapon.Railgun.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_Rocket_Fire_wav = this.RegisterSound('sfx', 'Weapon.Rocket.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_Shotgun_Fire_wav = this.RegisterSound('sfx', 'Weapon.ShotGun.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.Weapon_UZI_Fire_wav = this.RegisterSound('sfx', 'Weapon.UZI.Fire.wav', 1, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mSamples.World_End_wav = this.RegisterSound('sfx', 'World.End.wav', 1, this.PlaySound_Normal, this.StopSound_Normal);
    CSound.mSamples.Click = this.RegisterSound('sfx', 'World.End.wav', 1, this.PlaySound_Normal, this.StopSound_Normal);
    CSound.mSamples.Click2 = this.RegisterSound('sfx', 'CLICK.wav', 1, this.PlaySound_Normal, this.StopSound_Normal);
    CSound.mAmbience = new Object();
    CSound.mAmbience.Creature_Zombie_Ambience_1_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.1.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mAmbience.Creature_Zombie_Ambience_2_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.2.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mAmbience.Creature_Zombie_Ambience_3_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.3.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
    CSound.mAmbience.Creature_Zombie_Ambience_4_wav = this.RegisterSound('sfx', 'Creature.Zombie.Ambience.4.wav', 0.4, this.PlaySound_Positional, this.StopSound_Normal);
  }

  StopAll(tType?: any): void {
    CSound.mProcessList = new Array();
    for (const _loc3_ of forIn(CSound.mSoundList)) {
      if (CSound.mSoundList[_loc3_].mType == tType || tType == undefined) {
        this.StopSound(CSound.mSoundList[_loc3_]);
      }
    }
  }

  static Pause(): void {
    for (const _loc1_ of forIn(CSound.mSoundList)) {
      CSound.mSoundList[_loc1_].mPaused = CSound.mSoundList[_loc1_].mPlaying;
      if (CSound.mSoundList[_loc1_].mPaused) {
        CSound.mSoundList[_loc1_].mPosition = CSound.mSoundList[_loc1_].oSound.position;
        CSound.mSoundList[_loc1_].oSound.stop();
      }
    }
  }

  static unPause(): void {
    for (const _loc1_ of forIn(CSound.mSoundList)) {
      if (CSound.mSoundList[_loc1_].mPaused) {
        CSound.mSoundList[_loc1_].oSound.start(CSound.mSoundList[_loc1_].mLoops <= 1 ? CSound.mSoundList[_loc1_].mPosition / 1000 : 0, CSound.mSoundList[_loc1_].mLoops);
      }
    }
  }

  static SoundActive(tState: any): void {
    CSound.mSFXActive = tState;
    if (!CSound.mSFXActive) {
      // AS2: CSaveData.LoadData sets this before `new CSound` exists -> calling a method of undefined is a no-op.
      CSound.mSound?.StopAll('sfx');
    }
  }

  static MusicActive(tState: any): void {
    CSound.mMUSICActive = tState;
    if (!CSound.mMUSICActive) {
      CSound.mSound?.StopAll('music');
    }
  }

  RegisterSound(tType: any, tLinkID: any, tVolLevel: any, fPlay: any, fStop: any): any {
    const _loc3_ = this.mcParent.getNextHighestDepth();
    const _loc2_ = this.mcParent.createEmptyMovieClip('Sound' + _loc3_, _loc3_);
    _loc2_._visible = false;
    _loc2_.oSound = new Sound(_loc2_);
    _loc2_.oSound.attachSound(tLinkID);
    _loc2_.oSound.pClass = _loc2_;
    _loc2_.oSound.onSoundComplete = function (this: any): void {
      this.pClass.mPlaying = false;
    };
    _loc2_.mVolumeLevel = tVolLevel;
    _loc2_.mLinkID = tLinkID;
    _loc2_.PlaySound = fPlay;
    _loc2_.StopSound = fStop;
    _loc2_.mPlaying = false;
    _loc2_.pClass = this;
    _loc2_.mType = tType;
    CSound.mSoundList[CSound.mSoundList.length] = _loc2_;
    return _loc2_;
  }

  PlaySound(tItem: any, secOffset?: any, nLoop?: any): void {
    if (tItem.mType == 'sfx' && !CSound.mSFXActive || tItem.mType == 'music' && !CSound.mMUSICActive) {
      return;
    }
    tItem.mPlaying = true;
    tItem.mLoops = nLoop != undefined ? nLoop : 1;
    tItem.oSound.start(secOffset != undefined ? secOffset : 0, tItem.mLoops);
  }

  StopSound(tItem: any): void {
    tItem.mPlaying = false;
    tItem.oSound.stop();
    tItem.mPaused = false;
    this.RemoveFromProcessList(tItem);
  }

  SetVolume(tItem: any, vol: any): void {
    tItem.oSound.setVolume(vol * tItem.mVolumeLevel);
  }

  SetPan(tItem: any, pan: any): void {
    tItem.oSound.setPan(pan);
  }

  static GetPlayhead(tItem: any): number {
    return tItem.oSound.position / tItem.oSound.duration;
  }

  /** Installed as `PlaySound` of a sample clip: `this` is the sample clip. */
  PlaySound_Normal(this: any, tVolume?: any): void {
    tVolume = tVolume != undefined ? int(scidd.Math.CMath.Range(tVolume, 0, 100)) : 100;
    const _loc2_ = this;
    if (_loc2_.mPlaying) {
      _loc2_.pClass.StopSound(_loc2_);
    }
    _loc2_.pClass.SetVolume(_loc2_, tVolume);
    _loc2_.pClass.PlaySound(_loc2_);
  }

  StopSound_Normal(this: any): void {
    const _loc2_ = this;
    _loc2_.pClass.StopSound(_loc2_);
  }

  PlaySound_Positional(this: any, p?: any): void {
    const _loc2_ = this;
    p = p != undefined ? p : new flash.geom.Point(0, 0);
    const _loc5_ = scidd.Math.CMath.Range(p.x * 100, -100, 100);
    let _loc3_ = scidd.Math.CMath.Range((2 - p.length) / 2 * 100, 0, 100);
    _loc3_ = _loc3_ != undefined ? int(scidd.Math.CMath.Range(_loc3_, 0, 100)) : 100;
    if (_loc2_.mPlaying) {
      _loc2_.pClass.StopSound(_loc2_);
    }
    _loc2_.pClass.SetPan(_loc2_, _loc5_);
    _loc2_.pClass.SetVolume(_loc2_, _loc3_);
    _loc2_.pClass.PlaySound(_loc2_);
  }

  PlaySound_Velocity(this: any, tVelocity?: any): void {
    tVelocity = tVelocity != undefined ? scidd.Math.CMath.Range(tVelocity, 0, 1) : 1;
    if (tVelocity <= 0.1) {
      return;
    }
    const _loc2_ = this;
    const _loc4_ = _loc2_.oSound.duration / 1000 * (1 - tVelocity);
    _loc2_.pClass.SetVolume(_loc2_, 100);
    _loc2_.pClass.PlaySound(_loc2_, _loc4_);
  }

  PlaySound_Loop(this: any): void {
    const _loc2_ = this;
    if (!_loc2_.mPlaying) {
      _loc2_.pClass.PlaySound(_loc2_, 0, 100000);
    }
  }

  PlaySound_VolumeAndLoop(this: any, tVolume?: any): void {
    const _loc2_ = this;
    _loc2_.pClass.SetVolume(_loc2_, tVolume != undefined ? tVolume : 100);
    if (!_loc2_.mPlaying) {
      _loc2_.pClass.PlaySound(_loc2_, 0, 100000);
    }
  }

  PlaySound_FadeInAndLoop(this: any): void {
    const _loc2_ = this;
    if (_loc2_.mType == 'sfx' && !CSound.mSFXActive || _loc2_.mType == 'music' && !CSound.mMUSICActive) {
      return;
    }
    if (!_loc2_.mPlaying) {
      _loc2_.pClass.AddToProcessList(_loc2_);
      _loc2_.pClass.SetVolume(_loc2_, 0);
      _loc2_.pClass.PlaySound(_loc2_, 0, 100000);
    }
    _loc2_.mAction = 'fadein';
  }

  StopSound_FadeInAndLoop(this: any): void {
    const _loc2_ = this;
    _loc2_.mAction = 'fadeout';
  }

  static ProcessAll(): void {
    for (const _loc1_ of forIn(CSound.mProcessList)) {
      CSound.Process(CSound.mProcessList[_loc1_]);
    }
  }

  static Process(tItem: any): void {
    const _loc3_ = 5;
    const _loc2_ = 5;
    let _loc4_: number;
    switch (tItem?.mAction) {
      case 'fadeout':
        _loc4_ = tItem.oSound.getVolume() - _loc2_ >= 0 ? tItem.oSound.getVolume() - _loc2_ : 0;
        tItem.pClass.SetVolume(tItem, _loc4_);
        if (_loc4_ == 0) {
          tItem.pClass.StopSound(tItem);
        }
        break;
      case 'fadein':
        _loc4_ = tItem.oSound.getVolume() + _loc3_ <= 100 ? tItem.oSound.getVolume() + _loc3_ : 100;
        tItem.pClass.SetVolume(tItem, _loc4_);
        if (_loc4_ == 100) {
          tItem.mAction = 'none';
        }
    }
  }

  AddToProcessList(tItem: any): void {
    for (const _loc2_ of forIn(CSound.mProcessList)) {
      if (CSound.mProcessList[_loc2_] == tItem) {
        return;
      }
    }
    CSound.mProcessList[CSound.mProcessList.length] = tItem;
  }

  RemoveFromProcessList(tItem: any): void {
    for (const _loc2_ of forIn(CSound.mProcessList)) {
      if (CSound.mProcessList[_loc2_] == tItem) {
        CSound.mProcessList.splice(Number(_loc2_), 1);
        return;
      }
    }
  }

  InitAtmosphere(): void {
  }

  static Atmosphere_Start(tIndex: any): void {
    if (!CSound.mSFXActive) {
      return;
    }
    if (CSound.mCurrentAtmosphere != undefined) {
      return;
    }
    // AS2: CSound.mAtmosphere is never assigned in this game -> everything below operates on undefined (no-ops).
    CSound.mCurrentAtmosphere = CSound.mAtmosphere?.[tIndex];
    CSound.mCurrentAtmosphere?.mLoop?.mSound?.PlaySound?.();
    if (CSound.mCurrentAtmosphere == undefined) {
      return; // every following store/loop targets undefined (silent no-ops in AS2)
    }
    CSound.mCurrentAtmosphere.mTimeStamp = getTimer(); // [BC] generated/disasm/CSound.txt @92789
    CSound.mCurrentAtmosphere.mChannels = new Array(2);
    for (let _loc1_ = 0; _loc1_ < CSound.mCurrentAtmosphere.mChannels.length; _loc1_++) { // [BC] generated/disasm/CSound.txt @92833
      CSound.mCurrentAtmosphere.mChannels[_loc1_] = new Object();
      CSound.mCurrentAtmosphere.mChannels[_loc1_].mCurrentSound = undefined;
      CSound.mCurrentAtmosphere.mChannels[_loc1_].mStartTS = undefined;
      CSound.mCurrentAtmosphere.mChannels[_loc1_].mStopTS = undefined;
      CSound.mCurrentAtmosphere.mChannels[_loc1_].mDelayTS = getTimer() + (random(10) + 10) * 1000; // [BC] generated/disasm/CSound.txt @93058
    }
  }

  static Atmosphere_Stop(): void {
    if (CSound.mCurrentAtmosphere == undefined) {
      return;
    }
    CSound.mCurrentAtmosphere.mPaused = false;
    CSound.mCurrentAtmosphere.mLoop?.mSound?.StopSound?.();
    for (let _loc1_ = 0; _loc1_ < CSound.mCurrentAtmosphere.mChannels?.length; _loc1_++) { // [BC] generated/disasm/CSound.txt @93194
      if (CSound.mCurrentAtmosphere.mChannels[_loc1_].mCurrentSound != undefined) {
        CSound.mCurrentAtmosphere.mChannels[_loc1_].mCurrentSound.mSound?.StopSound?.();
        CSound.mCurrentAtmosphere.mChannels[_loc1_].mCurrentSound = undefined;
      }
    }
    CSound.mCurrentAtmosphere = undefined;
  }

  static Atmosphere_Process(): void {
    if (CSound.mCurrentAtmosphere == undefined || CSound.mCurrentAtmosphere.mPaused == true) {
      return;
    }
    if (CSound.mCurrentAtmosphere.mLoop?.mSound?.mPlaying == false) {
      CSound.mCurrentAtmosphere.mLoop.mSound.PlaySound?.();
    }
    const _loc4_ = CSound.mCurrentAtmosphere.mSFX;
    void _loc4_;
    const _loc3_ = 0;
    void _loc3_;
    for (let _loc2_ = 0; _loc2_ < CSound.mCurrentAtmosphere.mChannels?.length; _loc2_++) { // [BC] generated/disasm/CSound.txt @93598
      const _loc1_ = CSound.mCurrentAtmosphere.mChannels[_loc2_];
      if (_loc1_.mCurrentSound == undefined) {
        if (_loc1_.mDelayTS != undefined) {
          if (getTimer() > _loc1_.mDelayTS) { // [BC] generated/disasm/CSound.txt @93715
            _loc1_.mCurrentSound = CSound.mCurrentAtmosphere.mSFX?.[random(CSound.mCurrentAtmosphere.mSFX?.length)];
            _loc1_.mCurrentSound?.mSound?.PlaySound?.();
            _loc1_.mCurrentSound?.mSound?.oSound?.setPan(random(200) - 100);
            _loc1_.mDelayTS = undefined;
            _loc1_.mStartTS = getTimer(); // [BC] generated/disasm/CSound.txt @93866
            _loc1_.mTimeOut = getTimer() + (5 + random(20)) * 1000; // [BC] generated/disasm/CSound.txt @93900
          }
        }
      } else if (_loc1_.mCurrentSound.mSound?.mPlaying == false) {
        _loc1_.mCurrentSound = undefined;
        _loc1_.mStopTS = getTimer(); // [BC] generated/disasm/CSound.txt @93955
        _loc1_.mDelayTS = getTimer() + random(15000); // [BC] generated/disasm/CSound.txt @93974
      } else if (_loc1_.mTimeOut != undefined && getTimer() > _loc1_.mTimeOut) { // [BC] generated/disasm/CSound.txt @94013
        _loc1_.mTimeOut = undefined;
        _loc1_.mCurrentSound.mSound?.StopSound?.();
      }
    }
  }

  static Atmosphere_Pause(): void {
    if (CSound.mCurrentAtmosphere != undefined) CSound.mCurrentAtmosphere.mPaused = true;
  }

  static Atmosphere_unPause(): void {
    if (CSound.mCurrentAtmosphere != undefined) CSound.mCurrentAtmosphere.mPaused = false;
  }
}
proto(CSound, { _CLASSID_: 'CSound' });


registerGameClass('CSound', CSound);
