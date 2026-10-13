// Port of projects/boxhead4/Thing/Creature/CThing_Creature_Player.as
// Statement order / member layout from generated/disasm/Thing.Creature.CThing_Creature_Player.txt (top-level script
// @469443..@478073). ffdec loop artifacts fixed from bytecode: Process_Init (SELECT0..9 keys), InitWeapons
// (mKeyID = (i+1) % 10), RandomPickup (cumulative chances), NextWeapon / PrevWeapon (k = 1..len-1).
import { _global, forIn, mathRandom, proto } from '../../../engine/runtime.ts';
import { CInput, CMain, CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Creature } from './CThing_Creature.ts';

export class CThing_Creature_Player extends CThing_Creature {
  declare mVisible: any;
  // ---- AS2 dynamic instance fields ----
  declare mPlayerIndex: any;
  declare mXSI_Collection: any;
  declare mControls: any;
  declare mControl_PostFix: any;
  declare mWeapons: any;
  declare mWeaponList: any;
  declare mWeapon_Current: any;
  declare mCurrentAnim: any;

  /** Cache of XSI collections per character index (created lazily by GetCollection). */
  static mXSI_Collections: any;

  constructor(tPosition?: any, tPlayerIndex?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mPlayerIndex = tPlayerIndex != undefined ? tPlayerIndex : 0;
    const _loc3_ = CMain.mSaveData['mPlayer' + (this.mPlayerIndex + 1) + '_CharacterIndex'];
    this.mXSI_Animation = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(this.mXSI_Collection = Thing.Creature.CThing_Creature_Player.GetCollection(_loc3_));
    this.Process = this.Process_Init;
  }

  static GetCollection(saveCharacter?: any): any {
    // AS2: mXSI_Collections is undefined until the first collection is built -> reading a member of it gives undefined.
    if (Thing.Creature.CThing_Creature_Player.mXSI_Collections?.[saveCharacter]) {
      return Thing.Creature.CThing_Creature_Player.mXSI_Collections[saveCharacter];
    }
    const _loc1_ = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection();
    switch (saveCharacter) {
      case 0:
        DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_SWAT();
        break;
      case 1:
        DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_BOND();
        break;
      case 2:
        DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_GIJOE();
        break;
      case 3:
        DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_BAMBO();
    }
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Stand', 'stand'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Walk', 'walk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitRear', 'shothit_1'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitFront', 'shothit_2'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dying', 'dying'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dead', 'dead'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Handgun_Walk', 'pistolwalk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Handgun_Stand', 'pistolstand'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Shotgun_Walk', 'shotgunwalk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Shotgun_Stand', 'shotgunstand'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_UZI_Walk', 'uziwalk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_UZI_Stand', 'uzistand'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Rocket_Walk', 'rocketwalk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Rocket_Stand', 'rocketstand'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Railgun_Walk', 'railgunwalk'));
    _loc1_.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Railgun_Stand', 'railgunstand'));
    _loc1_.MimicItem('grenadewalk', 'walk');
    _loc1_.MimicItem('grenadestand', 'stand');
    _loc1_.MimicItem('barrelwalk', 'walk');
    _loc1_.MimicItem('barrelstand', 'stand');
    _loc1_.MimicItem('minewalk', 'walk');
    _loc1_.MimicItem('minestand', 'stand');
    _loc1_.MimicItem('claymorewalk', 'walk');
    _loc1_.MimicItem('claymorestand', 'stand');
    _loc1_.MimicItem('chargepackwalk', 'walk');
    _loc1_.MimicItem('chargepackstand', 'stand');
    _loc1_.MimicItem('fakewallwalk', 'walk');
    _loc1_.MimicItem('fakewallstand', 'stand');
    Thing.Creature.CThing_Creature_Player.mXSI_Collections = !Thing.Creature.CThing_Creature_Player.mXSI_Collections ? new Array() : Thing.Creature.CThing_Creature_Player.mXSI_Collections;
    Thing.Creature.CThing_Creature_Player.mXSI_Collections[saveCharacter] = _loc1_;
    return _loc1_;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
    this.mWorld.mHud.DeletePlayer(this);
  }

  Delete(): void {
    delete this.Process;
    this.mThing_Collection.DeleteThing_Player(this);
  }

  Process_Init(): void {
    super.Process_Init();
    if (_global.mInfinateLife) {
      this.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight);
    } else {
      this.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet | Thing.Affect.CThing_Affect.mAffect_Explosion | Thing.Affect.CThing_Affect.mAffect_ZombieAttack | Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight | Thing.Affect.CThing_Affect.mAffect_FireBall);
    }
    this.mControls = new Object();
    this.mControl_PostFix = this.mPlayerIndex != 0 ? '2' : '';
    this.mControls.LEFT = CMain.mInput['KEY_LEFT' + this.mControl_PostFix];
    this.mControls.RIGHT = CMain.mInput['KEY_RIGHT' + this.mControl_PostFix];
    this.mControls.UP = CMain.mInput['KEY_UP' + this.mControl_PostFix];
    this.mControls.DOWN = CMain.mInput['KEY_DOWN' + this.mControl_PostFix];
    this.mControls.FIRE = CMain.mInput['KEY_FIRE' + this.mControl_PostFix];
    this.mControls.NEXT_WEAPON = CMain.mInput['KEY_NEXT_WEAPON' + this.mControl_PostFix];
    this.mControls.PREV_WEAPON = CMain.mInput['KEY_PREV_WEAPON' + this.mControl_PostFix];
    if (this.mWorld.mUpgrades.__get__mTotalPlayerCount() == 1) {
      CMain.mInput.AddAdditionKeyCode(this.mControls.FIRE, CInput.ToAscii(' '));
      // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @472143 — ffdec lost the counter (SELECT0..SELECT9).
      for (let _loc4_ = 0; _loc4_ < 10; _loc4_++) {
        this.mControls['SELECT' + _loc4_] = CMain.mInput['KEY_SELECT' + _loc4_ + this.mControl_PostFix]; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @472211
      }
    }
    this.mControls.FIRE.Renew();
    this.mColor = 1044480;
    this.mSpeed = 0.16;
    this.mMass = 2;
    this.mHeight = 1.5;
    this.mMaxLife = this.mLife = 200; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @472344
    this.InitWeapons();
    this.SelectWeapon('pistol');
    this.mSound = new Object();
    this.mSound.Death = CSound.mSamples.Creature_Player_Scream_1_wav;
    this.mWorld.mUpgrades.Register_Creature_Player(this);
    this.SetState('State_PlayerControl');
    this.mWorld.mHud.AddPlayer(this);
    this.mInvincible = 200;
  }

  Process_Normal(): void {
    super.Process_Normal();
    this.SetCollideDirection(this.mPosition, World.Map.CMap_Cell.mCollide_Player);
    if (!(this.mFlags & Thing.CThing.mFlag_DEAD)) {
      this.mWorld.TrackThing(this);
    }
    if (this.mInvincible) {
      this.mInvincible--;
    }
  }

  State_PlayerControl_Init(): void {
    this.mBaseStateID = this.mStateID;
    delete this.mCurrentAnim;
    this.State_PlayerControl();
  }

  State_PlayerControl(): void {
    if (this.mLife > 0 && this.mLife < this.mMaxLife) {
      this.mLife = Math.min(this.mLife + this.mMaxLife / (CMain.mFPS * 30), this.mMaxLife);
    }
    this.mDelta = new Thing.Math.CThing_Position(!this.mControls.LEFT.IsDown() ? (!this.mControls.RIGHT.IsDown() ? 0 : 1) : -1, !this.mControls.UP.IsDown() ? (!this.mControls.DOWN.IsDown() ? 0 : 1) : -1, 0).ScaleN(this.mSpeed);
    if (!this.mDelta.Equals0()) {
      this.mAngle.__set__mDelta(this.mDelta);
    }
    let _loc4_: any = undefined;
    switch (this.MoveAndReturn(this.mWorld.mMap.mCollide.PlayerCollide(this.KeepDistance()))) {
      case 'cellmoved':
        Thing.CThing.mFlag_CellMoved |= Thing.CThing.mFlag_CellMoved;
      // falls through
      case 'moved':
        _loc4_ = this.mWeapon_Current.mNameID + 'walk';
        break;
      case '':
        _loc4_ = this.mWeapon_Current.mNameID + 'stand';
    }
    let _loc2_: any = undefined;
    if (this.mWorld.mUpgrades.__get__mTotalPlayerCount() == 1) {
      for (const _loc3_ of forIn(this.mWeapons)) {
        if (this.mControls['SELECT' + this.mWeapons[_loc3_].mKeyID].IsReleased()) {
          _loc2_ = this.mWeapons[_loc3_];
        }
      }
    }
    if (this.mControls.NEXT_WEAPON.IsReleased()) {
      _loc2_ = this.NextWeapon();
    }
    if (this.mControls.PREV_WEAPON.IsReleased()) {
      _loc2_ = this.PrevWeapon();
    }
    if (_loc2_) {
      this.mControls.FIRE.Renew();
      this.SelectWeapon(_loc2_.mNameID);
    }
    this.mWeapon_Current.Update(this.mControls.FIRE);
    if (_loc4_ != this.mCurrentAnim) {
      this.mXSI_Animation.SetAnimation(this.mCurrentAnim = _loc4_, 0);
    } else {
      this.mXSI_Animation.Animate(this.mSpeed * 2);
    }
  }

  KeepDistance(): any {
    if (World.CWorld.mGameMode == 'Coop') {
      const _loc2_ = this.mThing_Collection.GetOtherPlayer(this);
      if (!_loc2_ || _loc2_.mFlags & Thing.CThing.mFlag_DEAD) {
        return this;
      }
      const _loc6_ = Math.abs(_loc2_.mPosition.mX - this.mPosition.mX);
      const _loc4_ = Math.abs(_loc2_.mPosition.mX - (this.mPosition.mX + this.mDelta.mX));
      const _loc5_ = Math.abs(_loc2_.mPosition.mY - this.mPosition.mY);
      const _loc3_ = Math.abs(_loc2_.mPosition.mY - (this.mPosition.mY + this.mDelta.mY));
      if (_loc4_ > _loc6_) {
        if (_loc4_ > 19) {
          this.mDelta.mX = 0;
        }
      }
      if (_loc3_ > _loc5_) {
        if (_loc3_ > 13) {
          this.mDelta.mY = 0;
        }
      }
    }
    return this;
  }

  State_Dead(): void {
    if (this.mStateCount < CMain.mFPS) {
      this.mAlpha = (this.mStateCount / CMain.mFPS) * 100;
      this.mWorld.PlayerDead(this);
    }
    if (--this.mStateCount < 0) {
      this.SetState('State_Respawn');
      this.mStateCount = 25;
    }
  }

  State_Respawn(): void {
    if (--this.mStateCount < 0) {
      const _loc2_ = this.mWorld.Spawn_Player_PositionObject(this.mThing_Collection.GetOtherPlayer(this));
      if (_loc2_) {
        this.mAlpha = 100;
        this.mXSI_Animation = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(this.mXSI_Collection);
        this.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet | Thing.Affect.CThing_Affect.mAffect_Explosion | Thing.Affect.CThing_Affect.mAffect_ZombieAttack | Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight | Thing.Affect.CThing_Affect.mAffect_FireBall);
        this.mFlags = Thing.CThing.mFlag_Collidable;
        this.Move(_loc2_.mPosition.Clone());
        this.mAngle.__set__mAngle(_loc2_.mAngle.mAngle);
        this.mInvincible = 25 * (World.CWorld.mGameMode != 'DeathMatch' ? 5 : 1);
        this.SetState('State_PlayerControl');
        this.mControls.FIRE.Renew();
        this.mMaxLife = this.mLife = 200; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @475092
        this.ResetWeapons();
        this.SelectWeapon('pistol');
        this.Process = this.Process_Normal;
        this.mWorld.mUpgrades.__set__mPlayerCount(this.mWorld.mUpgrades.__get__mPlayerCount() + 1);
      }
    }
  }

  InitWeapons(): void {
    const _loc3_ = ['pistol', 'uzi', 'shotgun', 'barrel', 'grenade', 'fakewall', 'mine', 'rocket', 'chargepack', 'railgun'];
    const _loc4_ = ['CThing_Weapon_Pistol', 'CThing_Weapon_UZI', 'CThing_Weapon_Shotgun', 'CThing_Weapon_Barrel', 'CThing_Weapon_Grenade', 'CThing_Weapon_FakeWall', 'CThing_Weapon_Mine', 'CThing_Weapon_Rocket', 'CThing_Weapon_ChargePack', 'CThing_Weapon_Railgun'];
    this.mWeapons = new Object();
    this.mWeaponList = new Array();
    // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @475335 — i = 0..9, mKeyID = (i + 1) % 10.
    for (let _loc2_ = 0; _loc2_ < _loc4_.length; _loc2_++) {
      this.mWeapons[_loc3_[_loc2_]] = { mIndex: _loc2_, mNameID: _loc3_[_loc2_], mClassID: _loc4_[_loc2_], mThing: undefined, mActive: false, mKeyID: (_loc2_ + 1) % 10 }; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @475435
      this.mWeaponList[_loc2_] = this.mWeapons[_loc3_[_loc2_]]; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @475463
    }
    this.NewWeapon(_loc3_[0]);
  }

  ResetWeapons(): void {
    for (const _loc2_ of forIn(this.mWeapons)) {
      if (_loc2_ != 'pistol') {
        // AS2: weapons never picked up have no mThing -> method call on undefined is a no-op.
        this.mWeapons[_loc2_].mThing?.EmptyWeapon();
      }
    }
    this.SelectWeapon('pistol');
  }

  NewWeapon(tWeaponName?: any): void {
    this.mWeapons[tWeaponName].mActive = true;
    this.AddWeapon(tWeaponName);
  }

  SelectWeapon(tWeaponName?: any): void {
    const _loc2_ = this.mWeapons[tWeaponName].mThing;
    // AS2: undefined.WeaponEmpty() is undefined -> !undefined is true (the mActive test then decides).
    if (!_loc2_?.WeaponEmpty() && this.mWeapons[tWeaponName].mActive) {
      // AS2: mWeapon_Current is undefined on the very first selection.
      const _loc3_ = this.mWeapon_Current?.mNameID;
      this.mWeapon_Current = _loc2_;
      if (_loc3_ != this.mWeapon_Current.mNameID) {
        if (World.CWorld.mGameMode == 'Single') {
          this.mWorld.mHud.AddMessage_Info(this.mWeapon_Current.mName + ' selected!', this.mPlayerIndex);
        }
      }
      this.mWeapon_Current.Reset();
    }
  }

  RandomPickup(): boolean {
    const _loc3_: any[] = new Array();
    let _loc5_ = 0; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476024
    let _loc8_: any;
    for (const _loc7_ of forIn(this.mWeapons)) {
      if (this.mWeapons[_loc7_].mActive && this.mWeapons[_loc7_].mNameID != 'pistol') {
        const _loc4_ = this.mWeapons[_loc7_];
        _loc8_ = (1 - _loc4_.mThing.mAmmo / _loc4_.mThing.mTotalAmmo) * 0.75 + 0.25;
        _loc5_ = _loc5_ + _loc8_; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476216 — cumulative (ffdec: `0 + x`)
        _loc3_.push({ mNameID: _loc4_.mNameID, mChance: _loc8_, mChanceIndex: _loc5_ });
      }
    }
    if (this.mLife < this.mMaxLife) {
      _loc8_ = (1 - this.mLife / this.mMaxLife) * _loc5_;
      _loc5_ += _loc8_;
      _loc3_.push({ mNameID: 'life', mChance: _loc8_, mChanceIndex: _loc5_ });
    }
    const _loc6_ = mathRandom() * _loc5_;
    // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476416 — first i with rnd < mChanceIndex.
    for (let _loc2_ = 0; _loc2_ < _loc3_.length; _loc2_++) {
      if (_loc6_ < _loc3_[_loc2_].mChanceIndex) { // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476456
        if (_loc3_[_loc2_].mNameID == 'life') {
          this.mWorld.mHud.AddMessage_Info('Life up!', this.mPlayerIndex);
          this.mLife = this.mMaxLife;
          return true;
        }
        this.mWorld.mHud.AddMessage_Info('Picked up ' + this.AddWeapon(_loc3_[_loc2_].mNameID).mThing.mName, this.mPlayerIndex); // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476616
        return true;
      }
    }
    return false;
  }

  AddWeapon(tWeaponName?: any): any {
    // AS2: the first AddWeapon of a weapon has no mThing yet -> Dispose() on undefined is a no-op.
    this.mWeapons[tWeaponName].mThing?.Dispose();
    this.mWeapons[tWeaponName].mThing = this.mThing_Collection.Register_Thing(Thing.Weapon.CThing_Weapon.byCLASSID(this.mWeapons[tWeaponName].mClassID, this.mPosition, new Thing.Math.CThing_Angle(0), this));
    // AS2: mWeapon_Current is undefined while InitWeapons() runs.
    if (this.mWeapons[tWeaponName].mThing.mNameID == this.mWeapon_Current?.mNameID) {
      this.mWeapon_Current = this.mWeapons[tWeaponName].mThing;
    }
    return this.mWeapons[tWeaponName];
  }

  NextWeapon(): any {
    const _loc5_ = this.mWeapons[this.mWeapon_Current.mNameID];
    const _loc6_ = _loc5_;
    let _loc3_ = 1; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @476992
    const _loc4_ = this.mWeaponList.length;
    while (_loc3_ < _loc4_) { // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477016
      const _loc2_ = (_loc5_.mIndex + _loc3_) % _loc4_; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477050
      if (this.mWeaponList[_loc2_].mActive && !this.mWeaponList[_loc2_].mThing.WeaponEmpty()) {
        return this.mWeaponList[_loc2_];
      }
      _loc3_ = _loc3_ + 1; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477146
    }
    return undefined;
  }

  PrevWeapon(): any {
    const _loc5_ = this.mWeapons[this.mWeapon_Current.mNameID];
    const _loc6_ = _loc5_;
    let _loc4_ = 1; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477226
    const _loc3_ = this.mWeaponList.length;
    while (_loc4_ < _loc3_) { // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477250
      const _loc2_ = (_loc5_.mIndex + _loc3_ - _loc4_) % _loc3_; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477290
      if (this.mWeaponList[_loc2_].mActive && !this.mWeaponList[_loc2_].mThing.WeaponEmpty()) {
        return this.mWeaponList[_loc2_];
      }
      _loc4_ = _loc4_ + 1; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Player.txt @477386
    }
    return undefined;
  }

  GetWeaponPosition(): any {
    this.mXSI_Animation.Update_CurrentFrame(this.mAngle);
    // AS2: only the gun animations carry an XSI_Model_GunPosition_Right node (the original tests for undefined).
    const _loc2_ = this.mXSI_Animation.__get__XSI_Info()?.XSI_Model_GunPosition_Right?.nPosition;
    return !(_loc2_ == undefined || isNaN(_loc2_.mX)) ? this.mPosition.Add(new Thing.Math.CThing_Position(_loc2_.mX, _loc2_.mY, _loc2_.mZ)) : this.mPosition.Clone();
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mVisible = !(this.mInvincible && this.mInvincible % 2) && this.mStateID != 'State_Respawn';
    if (this.mVisible) {
      this.mXSI_Animation.Render(Thing.CThing.pDraw, this.mAngle, this.mAlpha);
    }
  }
}
proto(CThing_Creature_Player, { _CLASSID_: 'CThing_Creature_Player', mVisible: true });

registerGameClass('Thing.Creature.CThing_Creature_Player', CThing_Creature_Player);
