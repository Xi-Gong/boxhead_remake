// Port of assets/projects/boxhead4/World/CUpgrades.as
// Structure from generated/disasm/World.CUpgrades.txt top-level script @538112..@549738 (initaction of sprite 854).
// Level progression (waves 1..100, then level 100 repeated "FOREVER"), the kill multiplier (x1..x999) with its decay
// timer, and the upgrade table unlocked by multiplier values (58 entries). Upgrades are stored per class id on this
// object (this["CThing_Weapon_UZI"].RapidFire = true ...) with an IDCount version; ApplyUpgrade_* re-derive a thing's
// stats from its ORIGINAL stats whenever the version changed. "Level" is the class id of the wave parameters.
// AS2 "extends MovieClip" but it is created with `new World.CUpgrades(world)` (never placed on the display list), so
// the port keeps a JS constructor.
import { MovieClip, _global, _root, forIn, proto } from '../../engine/runtime.ts';
import { CMain, CSound, Thing, World, registerGameClass } from '../packages.ts';

export class CUpgrades extends MovieClip {
  constructor(tWorld: any) {
    super();
    this.mWorld = tWorld;
    this.mIDCount = 0;
    this.mTick = 0;
    this.__set__mTotalPlayerCount(0);
    this.InitLists();
  }

  override toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  Process(): void {
    if (World.CWorld.mGameMode == 'DeathMatch') {
      return;
    }
    this.mTick = this.mTick + 1;
    let _loc4_: any = this.mWorld.mThing_Collection.mThingCounters;
    _loc4_ = !_loc4_.CThing_Creature_Devil && !_loc4_.CThing_Creature_Zombie;
    const _loc5_ = !this.Level.Devil_Count ? 0 : this.Level.Devil_Count;
    const _loc6_ = this.Level.Zombie_Count;
    if (_loc6_ <= 0 && _loc5_ <= 0 && _loc4_) {
      this.__set__mLevel(this.__get__mLevel() + 1);
      CSound.mSamples.Click.PlaySound();
    } else {
      if (this.Level.mZombieCount < Math.min(this.Level.Zombie_Count, _root._quality != 'LOW' ? 60 : 40)) {
        if (this.Level.mSpawnCount_Zombie-- <= 0) {
          if (this.mWorld.Spawn_Zombie()) {
            this.Level.mSpawnCount_Zombie = this.Level.Zombie_SpawnRate;
          }
        }
      }
      if (this.Level.mDevilCount < this.Level.Devil_Count) {
        if ((this.Level.mSpawnCount_Devil = this.Level.mSpawnCount_Devil - (this.Level.Zombie_Count != 0 ? 1 : 10)) <= 0) {
          if (this.mWorld.Spawn_Devil()) {
            this.Level.mSpawnCount_Devil = this.Level.Devil_SpawnRate;
          }
        }
      }
    }
    if (_global.mCheatsActive || _global.mDebug) {
    }
    if (this.mMultipleKillsTick-- < 0) {
      this.__set__mMultipleKill(0);
    }
    if (this.mMultiplierTick-- < 0) {
      this.__set__mMultiplier(this.__get__mMultiplier() - 1);
    }
  }

  SetDifficulty(tDifficulty: any): void {
    let _loc3_ = 1; // [BC] generated/disasm/World.CUpgrades.txt @539313
    let _loc2_ = 1; // [BC] generated/disasm/World.CUpgrades.txt @539326
    if (World.CWorld.mGameMode == 'DeathMatch') {
      _loc2_ = 200; // [BC] generated/disasm/World.CUpgrades.txt @539369
    } else {
      switch (tDifficulty) {
        case 0:
          _loc3_ = 1; // [BC] generated/disasm/World.CUpgrades.txt @539467
          _loc2_ = 1; // [BC] generated/disasm/World.CUpgrades.txt @539480
          break;
        case 1:
          _loc3_ = 10; // [BC] generated/disasm/World.CUpgrades.txt @539498
          _loc2_ = 10; // [BC] generated/disasm/World.CUpgrades.txt @539511
          break;
        case 2:
          _loc3_ = 20; // [BC] generated/disasm/World.CUpgrades.txt @539529
          _loc2_ = 30; // [BC] generated/disasm/World.CUpgrades.txt @539542
          break;
        case 3:
          _loc3_ = 35; // [BC] generated/disasm/World.CUpgrades.txt @539560
          _loc2_ = 50; // [BC] generated/disasm/World.CUpgrades.txt @539573
      }
    }
    this.mWorld.mHud.mSilentMessages = true;
    for (_loc3_ = _loc3_ - 1; _loc3_; _loc3_--) { // [BC] generated/disasm/World.CUpgrades.txt @539611 (n-1 level-ups)
      this.__set__mLevel(this.__get__mLevel() + 1);
    }
    for (_loc2_ = _loc2_ - 1; _loc2_; _loc2_--) { // [BC] generated/disasm/World.CUpgrades.txt @539681 (n-1 multiplier steps)
      this.__set__mMultiplier(this.__get__mMultiplier() + 1);
    }
    this.mWorld.mHud.mSilentMessages = false;
  }

  AddUpgrade(tName: any, tClassID: any, tProp: any, tValue: any): void {
    const _loc5_ = this[tClassID] = !this[tClassID] ? new Object() : this[tClassID];
    _loc5_[tProp] = tValue;
    _loc5_.IDCount = this.mIDCount++;
    if (tValue != true) {
      // AS2: during InitLists (called from CWorld.Init) neither the thing collection nor the HUD exist yet -> the
      // for..in over undefined does nothing and the HUD call is a no-op.
      // Deviation UPGRADE_NUMERIC_NEWWEAPON (plan appendix C): NewWeapon(1.2) is a complete no-op in AS2 (every store
      // goes to the undefined mWeapons[1.2] and CThing_Weapon.byCLASSID(undefined) returns undefined) but throws in JS,
      // so the call is skipped for values that are not a weapon of the player. Same observable behaviour.
      const _loc2_ = this.mWorld.mThing_Collection?.mPlayerThings;
      for (const _loc4_ of forIn(_loc2_)) {
        if (_loc2_[_loc4_].mWeapons?.[tValue] == undefined) continue;
        _loc2_[_loc4_].NewWeapon(tValue);
      }
    }
    if (tName != undefined) {
      this.mWorld.mHud?.AddMessage_Upgrade(tName);
    }
  }

  ApplyUpgrade_Creature_Player(tThing?: any): void {
    void tThing;
  }

  ApplyUpgrade_Creature_Devil(tThing: any): void {
    const _loc2_ = this[tThing._CLASSID_];
    if (_loc2_?.IDCount == tThing.mUpgradeObject.mIDCount) {
      return;
    }
    tThing.mUpgradeObject.mIDCount = _loc2_?.IDCount;
    const _loc4_ = _loc2_?.mOriginalStats;
    tThing.mSpeed = _loc4_?.mSpeed * ((this.v = _loc2_?.SpeedUp) != undefined ? this.v : 1);
    tThing.mFireRate = _loc4_?.mFireRate * ((this.v = _loc2_?.FireRateUp) != undefined ? this.v : 1);
    tThing.mAttackSpeed = _loc4_?.mAttackSpeed * ((this.v = _loc2_?.AttackSpeedUp) != undefined ? this.v : 1);
  }

  ApplyUpgrade_Creature_Zombie(tThing: any): void {
    const _loc2_ = this[tThing._CLASSID_];
    if (_loc2_?.IDCount == tThing.mUpgradeObject.mIDCount) {
      return;
    }
    tThing.mUpgradeObject.mIDCount = _loc2_?.IDCount;
    const _loc4_ = _loc2_?.mOriginalStats;
    tThing.mSpeed = _loc4_?.mSpeed * ((this.v = _loc2_?.SpeedUp) != undefined ? this.v : 1);
  }

  ApplyUpgrade_Object(tThing: any): void {
    const _loc2_ = this[tThing._CLASSID_];
    if (_loc2_?.IDCount == tThing.mUpgradeObject.mIDCount) {
      return;
    }
    tThing.mUpgradeObject.mIDCount = _loc2_?.IDCount;
    const _loc4_ = _loc2_?.mOriginalStats;
    void _loc4_;
    if (_loc2_?.BiggerBang) {
      tThing.mBiggerBang = 2;
    } else if (_loc2_?.BigBang) {
      tThing.mBiggerBang = 1;
    }
    if (_loc2_?.ClusterExplode) {
      tThing.mClusterExplode = 1;
    }
  }

  ApplyUpgrade_Weapon(tThing: any): void {
    const _loc3_ = this[tThing._CLASSID_];
    if (_loc3_?.IDCount == tThing.mUpgradeObject.mIDCount) {
      return;
    }
    tThing.mUpgradeObject.mIDCount = _loc3_?.IDCount;
    const _loc4_ = _loc3_?.mOriginalStats;
    if (_loc3_?.FatalDamage) {
      tThing.mDamage = _loc4_.mDamage * 10;
    } else if (_loc3_?.QuadDamage) {
      tThing.mDamage = _loc4_.mDamage * 4;
    } else if (_loc3_?.DoubleDamage) {
      tThing.mDamage = _loc4_.mDamage * 2;
    }
    if (_loc3_?.RapidFire) {
      tThing.mFireRate = Math.round(Math.max(_loc4_.mFireRate / 4, 2));
      tThing.mFireRateCount = 0;
      tThing.mAuto = true;
    } else if (_loc3_?.FastFire) {
      tThing.mAuto = true;
    }
    if (_loc3_?.BiggerBang) {
      tThing.mBiggerBang = 2;
    } else if (_loc3_?.BigBang) {
      tThing.mBiggerBang = 1;
    }
    if (_loc3_?.ClusterExplode) {
      tThing.mClusterExplode = 1;
    }
    if (_loc3_?.WiderShot) {
      tThing.mWideShot = 2;
    } else if (_loc3_?.WideShot) {
      tThing.mWideShot = 1;
    }
    if (_loc3_?.InfinateAmmo) {
      tThing.mTotalAmmo = Thing.Weapon.CThing_Weapon.mInfinateAmmo;
      tThing.mAmmo = Thing.Weapon.CThing_Weapon.mInfinateAmmo;
    } else if (_loc3_?.QuadAmmo) {
      tThing.mTotalAmmo = _loc4_.mTotalAmmo * 4;
      tThing.mAmmo = _loc4_.mAmmo * 4;
    } else if (_loc3_?.DoubleAmmo) {
      tThing.mTotalAmmo = _loc4_.mTotalAmmo * 2;
      tThing.mAmmo = _loc4_.mAmmo * 2;
    }
    if (_loc3_?.HomingMissiles) {
      tThing.mHomingMissiles = true;
    }
    if (_loc3_?.InfinateRange) {
      tThing.mRange = 100;
    } else if (_loc3_?.LongShot) {
      tThing.mRange = _loc4_.mRange * 1.5;
    }
  }

  CreateUpgradeClass(tClassID: any): any {
    return this[tClassID] = !this[tClassID] ? new Object() : this[tClassID];
  }

  _RegisterOK(tClassID: any): boolean {
    return !(this[tClassID] == undefined || this[tClassID].mOriginalStats == undefined) ? false : true;
  }

  Register_Creature_Player(tThing: any): void {
    if (this._RegisterOK(tThing._CLASSID_)) {
      const _loc4_ = this.CreateUpgradeClass(tThing._CLASSID_);
      const _loc3_ = _loc4_.mOriginalStats = new Object() as any;
      _loc3_.mSpeed = tThing.mSpeed;
      _loc3_.mMaxLife = tThing.mMaxLife;
      _loc3_.mLife = tThing.mLife;
    }
    tThing.mUpgradeObject = new Object();
    this.ApplyUpgrade_Creature_Player(tThing);
  }

  Register_Creature_Zombie(tThing: any): void {
    if (this._RegisterOK(tThing._CLASSID_)) {
      const _loc4_ = this.CreateUpgradeClass(tThing._CLASSID_);
      const _loc3_ = _loc4_.mOriginalStats = new Object() as any;
      _loc3_.mSpeed = tThing.mSpeed;
      _loc3_.mDamage = tThing.mDamage;
      _loc3_.mMaxLife = tThing.mMaxLife;
      _loc3_.mLife = tThing.mLife;
    }
    tThing.mUpgradeObject = new Object();
    this.ApplyUpgrade_Creature_Zombie(tThing);
  }

  Register_Creature_Devil(tThing: any): void {
    if (this._RegisterOK(tThing._CLASSID_)) {
      const _loc4_ = this.CreateUpgradeClass(tThing._CLASSID_);
      const _loc3_ = _loc4_.mOriginalStats = new Object() as any;
      _loc3_.mSpeed = tThing.mSpeed;
      _loc3_.mFireRate = tThing.mFireRate;
      _loc3_.mAttackSpeed = tThing.mAttackSpeed;
      _loc3_.mDamage = tThing.mDamage;
      _loc3_.mMaxLife = tThing.mMaxLife;
      _loc3_.mLife = tThing.mLife;
    }
    tThing.mUpgradeObject = new Object();
    this.ApplyUpgrade_Creature_Devil(tThing);
  }

  Register_Object(tThing: any): void {
    if (this._RegisterOK(tThing._CLASSID_)) {
      const _loc4_ = this.CreateUpgradeClass(tThing._CLASSID_);
      const _loc3_ = _loc4_.mOriginalStats = new Object() as any;
      _loc3_.mBiggerBang = tThing.mBiggerBang;
      _loc3_.mClusterExplode = tThing.mClusterExplode;
    }
    tThing.mUpgradeObject = new Object();
    this.ApplyUpgrade_Object(tThing);
  }

  Register_Weapon(tThing: any): void {
    if (this._RegisterOK(tThing._CLASSID_)) {
      const _loc4_ = this.CreateUpgradeClass(tThing._CLASSID_);
      const _loc3_ = _loc4_.mOriginalStats = new Object() as any;
      _loc3_.mAuto = tThing.mAuto;
      _loc3_.mFireRate = tThing.mFireRate;
      _loc3_.mAmmo = tThing.mAmmo;
      _loc3_.mTotalAmmo = tThing.mTotalAmmo;
      _loc3_.mDamage = tThing.mDamage;
      _loc3_.mWideShot = tThing.mWideShot;
      _loc3_.mBiggerBang = tThing.mBiggerBang;
      _loc3_.mRange = tThing.mRange;
    }
    tThing.mUpgradeObject = new Object();
    this.ApplyUpgrade_Weapon(tThing);
  }

  InitLists(): void {
    this.mMultipleKills = new Array();
    this.mMultipliers = new Array();
    this.mLevels = new Array();
    let _loc8_ = 1 * CMain.mFPS; // [BC] generated/disasm/World.CUpgrades.txt @542863 (zombie spawn interval)
    let _loc4_ = !_global.mCheat_OneZombie ? 10 : 1; // [BC] generated/disasm/World.CUpgrades.txt @542902 (zombie count)
    let _loc5_ = 10; // [BC] generated/disasm/World.CUpgrades.txt @542915 (zombie total)
    let _loc6_ = 10 * CMain.mFPS; // [BC] generated/disasm/World.CUpgrades.txt @542938 (devil spawn interval)
    let _loc7_ = 0; // [BC] generated/disasm/World.CUpgrades.txt @542955 (devil count)
    let _loc9_ = 0; // [BC] generated/disasm/World.CUpgrades.txt @542972 (devil total)
    const _loc12_ = 0; // [BC] generated/disasm/World.CUpgrades.txt @542989 (unused)
    void _loc12_;
    for (let _loc3_ = 1; _loc3_ <= 100; _loc3_++) { // [BC] generated/disasm/World.CUpgrades.txt @543002 (levels 1..100)
      this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Zombie_SpawnRate', mValue: Math.floor(_loc8_) });
      this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Zombie_Count', mValue: Math.floor(_loc4_) });
      this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Zombie_TotalCount', mValue: Math.floor(_loc5_) });
      this.AddToLevel(_loc3_, { mClassID: 'CThing_Creature_Zombie', mProp: 'SpeedUp', mValue: Math.min(1 + _loc3_ / 100 * 10, 5) });
      _loc8_ = Math.max(_loc8_ - 1, 1); // [BC] generated/disasm/World.CUpgrades.txt @543303
      _loc4_ = Math.min(_loc4_ + 5, 60); // [BC] generated/disasm/World.CUpgrades.txt @543341
      _loc5_ = _loc5_ + 5; // [BC] generated/disasm/World.CUpgrades.txt @543357
      if (CMain.mSaveData.mDevilsActive) {
        this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Devil_SpawnRate', mValue: Math.floor(_loc6_) });
        this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Devil_Count', mValue: Math.floor(_loc7_) });
        this.AddToLevel(_loc3_, { mClassID: 'Level', mProp: 'Devil_TotalCount', mValue: Math.floor(_loc9_) });
        this.AddToLevel(_loc3_, { mClassID: 'CThing_Creature_Devil', mProp: 'SpeedUp', mValue: Math.min(1 + _loc3_ / 100 * 10, 5) });
        _loc7_ = Math.min(_loc3_ != 1 ? _loc7_ + 0.3 : 1, 5); // [BC] generated/disasm/World.CUpgrades.txt @543697
        _loc9_ = _loc3_ != 1 ? _loc9_ + 0.25 : 1; // [BC] generated/disasm/World.CUpgrades.txt @543746
        _loc6_ = Math.max(_loc6_ - 1, CMain.mFPS); // [BC] generated/disasm/World.CUpgrades.txt @543791
      }
    }
    this.CreateUpgradeClass('Level');
    this.__set__mLevel(1);
    this.__set__mMultiplier(0);
    this.__set__mMultipleKill(0);
    this.AddToMultipliers(3, { mClassID: 'CThing_Weapon_Pistol', mProp: 'FastFire', mValue: true, mName: 'Pistol+: Fast Fire' });
    this.AddToMultipliers(5, { mClassID: 'CThing_Creature_Player', mProp: 'NW_uzi', mValue: 'uzi', mName: 'New Weapon: UZI (Key 2)' });
    this.AddToMultipliers(8, { mClassID: 'CThing_Weapon_Pistol', mProp: 'DoubleDamage', mValue: true, mName: 'Pistol+: Double Damage' });
    this.AddToMultipliers(10, { mClassID: 'CThing_Creature_Player', mProp: 'NW_shotgun', mValue: 'shotgun', mName: 'New Weapon: Shotgun (Key 3)' });
    this.AddToMultipliers(13, { mClassID: 'CThing_Weapon_UZI', mProp: 'RapidFire', mValue: true, mName: 'UZI+: Rapid Fire' });
    this.AddToMultipliers(15, { mClassID: 'CThing_Creature_Player', mProp: 'NW_barrel', mValue: 'barrel', mName: 'New Weapon: Barrel (Key 4)' });
    this.AddToMultipliers(17, { mClassID: 'CThing_Weapon_UZI', mProp: 'DoubleAmmo', mValue: true, mName: 'UZI+: Double Ammo' });
    this.AddToMultipliers(18, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'FastFire', mValue: true, mName: 'Shotgun+: Fast Fire' });
    this.AddToMultipliers(20, { mClassID: 'CThing_Creature_Player', mProp: 'NW_grenade', mValue: 'grenade', mName: 'New Weapon: Grenade (Key 5)' });
    this.AddToMultipliers(21, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'DoubleAmmo', mValue: true, mName: 'Shotgun+: Double Ammo' });
    this.AddToMultipliers(23, { mClassID: 'CThing_Weapon_UZI', mProp: 'LongShot', mValue: true, mName: 'UZI+: Long Shot' });
    this.AddToMultipliers(26, { mClassID: 'CThing_Weapon_Barrel', mProp: 'DoubleAmmo', mValue: true, mName: 'Barrel+: Double Ammo' });
    this.AddToMultipliers(30, { mClassID: 'CThing_Creature_Player', mProp: 'NW_fakewall', mValue: 'fakewall', mName: 'New Weapon: Fake walls (Key 6)' });
    this.AddToMultipliers(31, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'WideShot', mValue: true, mName: 'Shotgun+: Wide Shot' });
    this.AddToMultipliers(32, { mClassID: 'CThing_Object_Barrel', mProp: 'BigBang', mValue: true, mName: 'Barrel+: Big Bang' });
    this.AddToMultipliers(33, { mClassID: 'CThing_Weapon_Grenade', mProp: 'ClusterExplode', mValue: true, mName: 'Grenade+: Cluster Explode' });
    this.AddToMultipliers(35, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'LongShot', mValue: true, mName: 'Shotgun+: Long Shot' });
    this.AddToMultipliers(36, { mClassID: 'CThing_Weapon_Barrel', mProp: 'QuadAmmo', mValue: true, mName: 'Barrel+: Quad Ammo' });
    this.AddToMultipliers(37, { mClassID: 'CThing_Weapon_FakeWall', mProp: 'DoubleAmmo', mValue: true, mName: 'Fake Wall+: Double Ammo' });
    this.AddToMultipliers(39, { mClassID: 'CThing_Weapon_UZI', mProp: 'QuadAmmo', mValue: true, mName: 'UZI+: Quad Ammo' });
    this.AddToMultipliers(40, { mClassID: 'CThing_Creature_Player', mProp: 'NW_mine', mValue: 'mine', mName: 'New Weapon: Claymore (Key 7)' });
    this.AddToMultipliers(41, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'QuadAmmo', mValue: true, mName: 'Shotgun+: Quad Ammo' });
    this.AddToMultipliers(42, { mClassID: 'CThing_Weapon_Grenade', mProp: 'DoubleAmmo', mValue: true, mName: 'Grenade+: Double Ammo' });
    this.AddToMultipliers(43, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'RapidFire', mValue: true, mName: 'Shotgun+: Rapid Fire' });
    this.AddToMultipliers(44, { mClassID: 'CThing_Object_Barrel', mProp: 'BiggerBang', mValue: true, mName: 'Barrel+: Bigger Bang' });
    this.AddToMultipliers(45, { mClassID: 'CThing_Weapon_Grenade', mProp: 'BigBang', mValue: true, mName: 'Grenade+: Big Bang' });
    this.AddToMultipliers(47, { mClassID: 'CThing_Object_Mine', mProp: 'ClusterExplode', mValue: true, mName: 'Claymore+: Cluster Explode' });
    this.AddToMultipliers(48, { mClassID: 'CThing_Weapon_UZI', mProp: 'DoubleDamage', mValue: true, mName: 'UZI+: Double Damage' });
    this.AddToMultipliers(50, { mClassID: 'CThing_Creature_Player', mProp: 'NW_rocket', mValue: 'rocket', mName: 'New Weapon: Rocket (Key 8)' });
    this.AddToMultipliers(51, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'WiderShot', mValue: true, mName: 'Shotgun+: Wider Shot' });
    this.AddToMultipliers(52, { mClassID: 'CThing_Weapon_Grenade', mProp: 'QuadAmmo', mValue: true, mName: 'Grenade+: Quad Ammo' });
    this.AddToMultipliers(53, { mClassID: 'CThing_Weapon_FakeWall', mProp: 'QuadAmmo', mValue: true, mName: 'Fake Wall+: Quad Ammo' });
    this.AddToMultipliers(54, { mClassID: 'CThing_Weapon_Mine', mProp: 'DoubleAmmo', mValue: true, mName: 'Claymore+: Double Ammo' });
    this.AddToMultipliers(55, { mClassID: 'CThing_Creature_Player', mProp: 'NW_chargepack', mValue: 'chargepack', mName: 'New Weapon: Chargepack (Key 9)' });
    this.AddToMultipliers(56, { mClassID: 'CThing_Weapon_Shotgun', mProp: 'DoubleDamage', mValue: true, mName: 'Shotgun+: Double Damage' });
    this.AddToMultipliers(57, { mClassID: 'CThing_Weapon_Grenade', mProp: 'BiggerBang', mValue: true, mName: 'Grenade+: Bigger Bang' });
    this.AddToMultipliers(58, { mClassID: 'CThing_Object_Mine', mProp: 'BigBang', mValue: true, mName: 'Claymore+: Big Bang' });
    this.AddToMultipliers(59, { mClassID: 'CThing_Weapon_Rocket', mProp: 'FastFire', mValue: true, mName: 'Rocket+: Fast Fire' });
    this.AddToMultipliers(61, { mClassID: 'CThing_Weapon_UZI', mProp: 'InfinateRange', mValue: true, mName: 'UZI+: Infinate Range' });
    this.AddToMultipliers(62, { mClassID: 'CThing_Object_Mine', mProp: 'BiggerBang', mValue: true, mName: 'Claymore+: Bigger Bang' });
    this.AddToMultipliers(63, { mClassID: 'CThing_Object_ChargePack', mProp: 'ClusterExplode', mValue: true, mName: 'Charge Pack+: Cluster Explode' });
    this.AddToMultipliers(64, { mClassID: 'CThing_Weapon_Mine', mProp: 'QuadAmmo', mValue: true, mName: 'Claymore+: Quad Ammo' });
    this.AddToMultipliers(66, { mClassID: 'CThing_Weapon_Rocket', mProp: 'DoubleAmmo', mValue: true, mName: 'Rocket+: Double Ammo' });
    this.AddToMultipliers(68, { mClassID: 'CThing_Weapon_ChargePack', mProp: 'DoubleAmmo', mValue: true, mName: 'Charge Pack+: Double Ammo' });
    this.AddToMultipliers(70, { mClassID: 'CThing_Creature_Player', mProp: 'NW_railgun', mValue: 'railgun', mName: 'New Weapon: Railgun (Key 0)' });
    this.AddToMultipliers(72, { mClassID: 'CThing_Weapon_Rocket', mProp: 'BigBang', mValue: true, mName: 'Rocket+: Big Bang' });
    this.AddToMultipliers(74, { mClassID: 'CThing_Object_ChargePack', mProp: 'BigBang', mValue: true, mName: 'Charge Pack+: Big Bang' });
    this.AddToMultipliers(76, { mClassID: 'CThing_Weapon_ChargePack', mProp: 'QuadAmmo', mValue: true, mName: 'Charge Pack+: Quad Ammo' });
    this.AddToMultipliers(78, { mClassID: 'CThing_Weapon_Railgun', mProp: 'FastFire', mValue: true, mName: 'Railgun+: Fast Fire' });
    this.AddToMultipliers(80, { mClassID: 'CThing_Weapon_Railgun', mProp: 'DoubleAmmo', mValue: true, mName: 'Railgun+: Double Ammo' });
    this.AddToMultipliers(85, { mClassID: 'CThing_Weapon_Rocket', mProp: 'QuadAmmo', mValue: true, mName: 'Rocket+: Quad Ammo' });
    this.AddToMultipliers(90, { mClassID: 'CThing_Weapon_UZI', mProp: 'QuadDamage', mValue: true, mName: 'UZI+: Quad Damage' });
    this.AddToMultipliers(95, { mClassID: 'CThing_Object_ChargePack', mProp: 'BiggerBang', mValue: true, mName: 'Charge Pack+: Bigger Bang' });
    this.AddToMultipliers(100, { mClassID: 'CThing_Weapon_Railgun', mProp: 'RapidFire', mValue: true, mName: 'Railgun+: Rapid Fire' });
    this.AddToMultipliers(105, { mClassID: 'CThing_Weapon_Rocket', mProp: 'BiggerBang', mValue: true, mName: 'Rocket+: Bigger Bang' });
    this.AddToMultipliers(110, { mClassID: 'CThing_Weapon_Railgun', mProp: 'QuadAmmo', mValue: true, mName: 'Railgun+: Quad Ammo' });
    this.AddToMultipliers(120, { mClassID: 'CThing_Weapon_Rocket', mProp: 'RapidFire', mValue: true, mName: 'Rocket+: Rapid Fire' });
    this.AddToMultipliers(125, { mClassID: 'CThing_Weapon_Railgun', mProp: 'LongShot', mValue: true, mName: 'Railgun+: Long Shot' });
  }

  AddToMultipliers(tIndex: any, tObject: any): void {
    this.mMultipliers[tIndex] = this.mMultipliers[tIndex] != undefined ? this.mMultipliers[tIndex] : new Array();
    tObject.mIndex = tIndex;
    this.mMultipliers[tIndex].push(tObject);
  }

  __get__mMultiplierList(): any[] {
    const _loc4_: any[] = new Array();
    for (let _loc3_ = 0; _loc3_ < this.mMultipliers.length; _loc3_++) { // [BC] generated/disasm/World.CUpgrades.txt @546639
      if (this.mMultipliers[_loc3_]) {
        for (let _loc2_ = 0; _loc2_ < this.mMultipliers[_loc3_].length; _loc2_++) { // [BC] generated/disasm/World.CUpgrades.txt @546699
          _loc4_.push(this.mMultipliers[_loc3_][_loc2_]);
        }
      }
    }
    return _loc4_;
  }

  AddToMultipleKills(tIndex: any, tObject: any): void {
    this.mMultipleKills[tIndex] = this.mMultipleKills[tIndex] != undefined ? this.mMultipleKills[tIndex] : new Array();
    tObject.mIndex = tIndex;
    this.mMultipleKills[tIndex].push(tObject);
  }

  AddToLevel(tIndex: any, tObject: any): void {
    this.mLevels[tIndex] = this.mLevels[tIndex] != undefined ? this.mLevels[tIndex] : new Array();
    tObject.mIndex = tIndex;
    this.mLevels[tIndex].push(tObject);
  }

  LogKills(a: any): void {
    while (a) {
      this.__set__mMultipleKill(this.__get__mMultipleKill() + 1);
      this.__set__mMultiplier(this.__get__mMultiplier() + 1);
      a = a - 1;
    }
  }

  __set__mLevel(a: any): any {
    this.mLevelIndex = a;
    const _loc2_ = this.mLevels[this.mLevelIndex <= 100 ? this.mLevelIndex : 100];
    for (const _loc3_ of forIn(_loc2_)) {
      this.AddUpgrade(_loc2_[_loc3_].mName, _loc2_[_loc3_].mClassID, _loc2_[_loc3_].mProp, _loc2_[_loc3_].mValue);
    }
    this.Level.mZombieCount = 0;
    this.Level.mDevilCount = 0;
    this.Level.mSpawnCount_Zombie = this.Level.Zombie_SpawnRate;
    this.Level.mSpawnCount_Devil = this.Level.Devil_SpawnRate;
    // AS2: during InitLists the HUD does not exist yet -> silent no-op.
    this.mWorld.mHud?.AddMessage_Level('-+-+-+- LEVEL ' + (this.mLevelIndex <= 100 ? this.mLevelIndex : this.mLevelIndex + ' (FOREVER)') + ' -+-+-+-');
    return this.__get__mLevel();
  }

  __get__mLevel(): any {
    return this.mLevelIndex;
  }

  __set__mMultipleKill(a: any): any {
    this.mMultipleKillsIndex = a >= 0 ? a : 0;
    if (this.mMultipleKillsIndex) {
      this.mMultipleKillsTickTotal = this.mMultipleKillsTick = this.GetTicks(this.mMultipleKillsIndex) / 6;
      const _loc2_ = this.mMultipleKills[this.mMultipleKillsIndex];
      delete this.mMultipleKills[this.mMultipleKillsIndex];
      for (const _loc3_ of forIn(_loc2_)) {
        this.AddUpgrade(_loc2_[_loc3_].mName, _loc2_[_loc3_].mClassID, _loc2_[_loc3_].mProp, _loc2_[_loc3_].mValue);
      }
    } else {
      this.mMultipleKillsTickTotal = this.mMultipleKillsTick = 100000;
    }
    return this.__get__mMultipleKill();
  }

  __get__mMultipleKill(): any {
    return this.mMultipleKillsIndex;
  }

  __get__mMultipleKillRatio(): number {
    return this.__get__mMultipleKill() != 0 ? this.mMultipleKillsTick / this.mMultipleKillsTickTotal : 0;
  }

  __set__mMultiplier(a: any): any {
    this.mMultiplierIndex = a >= 1 ? a <= 999 ? a : 999 : 1;
    this.mMultiplierTickTotal = this.mMultiplierTick = this.GetTicks(this.mMultiplierIndex);
    if (a > 1) {
      const _loc3_ = this.mMultipliers[this.mMultiplierIndex];
      for (const _loc4_ of forIn(_loc3_)) {
        const _loc2_ = _loc3_[_loc4_];
        if (_loc2_.mActive != true) {
          this.AddUpgrade(_loc2_.mName, _loc2_.mClassID, _loc2_.mProp, _loc2_.mValue);
          _loc2_.mActive = true;
        }
      }
    }
    return this.__get__mMultiplier();
  }

  __get__mMultiplier(): any {
    return this.mMultiplierIndex;
  }

  __get__mMultiplierTickRatio(): number {
    return this.__get__mMultiplier() != 1 ? this.mMultiplierTick / this.mMultiplierTickTotal : 0;
  }

  GetTicks(index: any): number {
    index = 100 - ((index <= 100 ? index : 100) - 1); // [BC] generated/disasm/World.CUpgrades.txt @548571
    const _loc1_ = Math.pow(index, 2.5) / 100000.00000000003 * (CMain.mFPS * 3 - 3) + 3; // [BC] generated/disasm/World.CUpgrades.txt @548657 (divisor: the double 100000.00000000003)
    return _loc1_;
  }

  __set__mZombieCount(a: any): any {
    const _loc2_ = a - this.Level.mZombieCount;
    if (_loc2_ < 0) {
      this.Level.Zombie_TotalCount = this.Level.Zombie_TotalCount + _loc2_;
      if (this.Level.Zombie_TotalCount < this.Level.Zombie_Count) {
        this.Level.Zombie_Count = this.Level.Zombie_TotalCount;
      }
      this.LogKills(1);
    }
    this.Level.mZombieCount = a;
    return this.__get__mZombieCount();
  }

  __get__mZombieCount(): any {
    return this.Level.mZombieCount;
  }

  __set__mDevilCount(a: any): any {
    const _loc2_ = a - this.Level.mDevilCount;
    if (_loc2_ < 0) {
      this.Level.Devil_TotalCount = this.Level.Devil_TotalCount + _loc2_;
      if (this.Level.Devil_TotalCount < this.Level.Devil_Count) {
        this.Level.Devil_Count = this.Level.Devil_TotalCount;
      }
      this.LogKills(1);
    }
    this.Level.mDevilCount = a;
    return this.__get__mDevilCount();
  }

  __get__mDevilCount(): any {
    return this.Level.mDevilCount;
  }

  __set__mPlayerCount(a: any): any {
    this.Level.mPlayerCount = a;
    return this.__get__mPlayerCount();
  }

  __get__mPlayerCount(): any {
    return this.Level.mPlayerCount != undefined ? this.Level.mPlayerCount : 0;
  }

  __set__mTotalPlayerCount(a: any): any {
    this._TotalPlayerCount = a;
    return this.__get__mTotalPlayerCount();
  }

  __get__mTotalPlayerCount(): any {
    return this._TotalPlayerCount;
  }

  // addProperty(...) accessors; mMultipleKillRatio / mMultiplierList / mMultiplierTickRatio have an EMPTY setter.
  get mDevilCount(): any { return this.__get__mDevilCount(); }
  set mDevilCount(a: any) { this.__set__mDevilCount(a); }
  get mLevel(): any { return this.__get__mLevel(); }
  set mLevel(a: any) { this.__set__mLevel(a); }
  get mMultipleKill(): any { return this.__get__mMultipleKill(); }
  set mMultipleKill(a: any) { this.__set__mMultipleKill(a); }
  get mMultipleKillRatio(): any { return this.__get__mMultipleKillRatio(); }
  set mMultipleKillRatio(_v: any) { /* AS2 empty setter */ }
  get mMultiplier(): any { return this.__get__mMultiplier(); }
  set mMultiplier(a: any) { this.__set__mMultiplier(a); }
  get mMultiplierList(): any { return this.__get__mMultiplierList(); }
  set mMultiplierList(_v: any) { /* AS2 empty setter */ }
  get mMultiplierTickRatio(): any { return this.__get__mMultiplierTickRatio(); }
  set mMultiplierTickRatio(_v: any) { /* AS2 empty setter */ }
  get mPlayerCount(): any { return this.__get__mPlayerCount(); }
  set mPlayerCount(a: any) { this.__set__mPlayerCount(a); }
  get mTotalPlayerCount(): any { return this.__get__mTotalPlayerCount(); }
  set mTotalPlayerCount(a: any) { this.__set__mTotalPlayerCount(a); }
  get mZombieCount(): any { return this.__get__mZombieCount(); }
  set mZombieCount(a: any) { this.__set__mZombieCount(a); }
}
proto(CUpgrades, { _CLASSID_: 'CUpgrades', _BASECLASSID_: 'CUpgrades' });

registerGameClass('World.CUpgrades', CUpgrades);
