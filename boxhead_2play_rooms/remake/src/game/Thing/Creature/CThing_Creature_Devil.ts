// Port of projects/boxhead4/Thing/Creature/CThing_Creature_Devil.as
// Statement order / member layout from generated/disasm/Thing.Creature.CThing_Creature_Devil.txt (top-level script
// @482833..@486864).
import { proto, random } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Creature } from './CThing_Creature.ts';

export class CThing_Creature_Devil extends CThing_Creature {
  // ---- AS2 dynamic instance fields ----
  declare mAttackRange: any;
  declare mAttackDamage: any;
  declare mAttackSpeed: any;
  declare mAttackAngle: any;
  declare mFireRate: any;
  declare mFireRateCount: any;
  declare mTarget_Player: any;
  declare mTarget_Position: any;
  declare mDamageMulitply: any;
  declare mCanAttack: any;

  /** Shared XSI collection (created lazily by GetCollection). */
  static mXSI_Collection: any;
  static mDefault_Scale = 0.42;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mColor = 16711680;
    this.mXSI_Animation = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(Thing.Creature.CThing_Creature_Devil.GetCollection());
    this.Process = this.Process_Init;
  }

  static GetCollection(): any {
    if (Thing.Creature.CThing_Creature_Devil.mXSI_Collection) {
      return Thing.Creature.CThing_Creature_Devil.mXSI_Collection;
    }
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection();
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_DEVIL(Thing.Creature.CThing_Creature_Devil.mDefault_Scale);
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Stand', 'stand'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Walk', 'walk'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitRear', 'shothit_1'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitFront', 'shothit_2'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dying', 'dying'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dead', 'dead'));
    Thing.Creature.CThing_Creature_Devil.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Devil_Devil_Attack', 'attack'));
    return Thing.Creature.CThing_Creature_Devil.mXSI_Collection;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  State_Dead_Init(): void {
    super.State_Dead_Init();
  }

  Affect_Setup(tFlags?: any): void {
    super.Affect_Setup(tFlags | Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight);
  }

  Process_Init(): void {
    super.Process_Init();
    this.mSpeed = 0.04;
    this.SetRadius(Thing.Creature.CThing_Creature_Devil.mDefault_Scale);
    this.mMaxLife = this.mLife = 1000; // [BC] generated/disasm/Thing.Creature.CThing_Creature_Devil.txt @484141
    this.mAttackRange = 5;
    this.mAttackDamage = 50;
    this.mMass = 5;
    this.mFireRate = 0;
    this.mScore = 1000;
    this.mHeight = 1.8;
    this.mFireRateCount = 5;
    this.mWorld.mUpgrades.Register_Creature_Zombie(this);
    this.SetState('State_EnterMap');
    this.mSound = new Object();
    this.mSound.Damage = CSound.mSamples['Creature_Zombie_Hit_' + (random(4) + 1) + '_wav'];
    this.mSound.Death = CSound.mSamples['Creature_Zombie_Hit_' + (random(4) + 1) + '_wav'];
  }

  Process_Normal(): void {
    super.Process_Normal();
    this.mFireRateCount--;
  }

  Brain(): boolean {
    this.mTarget_Player = this.mThing_Collection.GetClosestPlayer(this.mPosition);
    // AS2: no player -> undefined.mPosition is undefined.
    this.mTarget_Position = this.mTarget_Player?.mPosition;
    if (this.mTarget_Player == undefined) {
    }
    if (this.State_Attack_Decision()) {
      this.mDamageMulitply = false;
      this.mAttackAngle = this.mPosition.CAngleToPosition(this.mTarget_Player.mPosition);
      this.SetState('State_Attack');
      return true;
    }
    this.mCanAttack = true;
    return false;
  }

  State_GotoPlayer_Init(): void {
    this.mBaseStateID = this.mStateID;
    this.mXSI_Animation.SetAnimation('walk');
  }

  State_GotoPlayer(): void {
    if (this.Brain()) {
      return;
    }
    const _loc2_ = this.mAngle.__get__mDirection();
    this.mCurrentCell = this.mMap.mCells[this.mPosition.mY & 16777215][this.mPosition.mX & 16777215];
    // AS2: mTarget_Position may be undefined (no player) -> undefined & 16777215 == 0.
    this.mTarget_Angle.__set__mAngle(Math.atan2((this.mTarget_Position?.mY & 16777215) + 0.5 - this.mPosition.mY, (this.mTarget_Position?.mX & 16777215) + 0.5 - this.mPosition.mX));
    this.mTarget_Direction = this.mTarget_Angle.mDirection;
    const _loc3_ = this.mCurrentCell['NavReal_' + this.mTarget_Direction]();
    if (!(_loc3_ & World.Map.CMap_Cell.mCollide_Player)) {
    }
    if (_loc3_ & World.Map.CMap_Cell.mCollide_Object) {
      this.mAttackAngle = this.mAngle.Clone();
      this.mAttackAngle.__set__mDirection(this.mAngle.mDirection);
      this.mDamageMulitply = true;
      this.SetState_WithDirection('State_Attack', _loc2_, this.mTarget_Direction);
      return;
    }
    if ((this.mTarget_Direction = this.mCurrentCell.Nav_Direction(_loc2_, this.mTarget_Direction, World.Map.CMap_Cell.mCollide_NonMovable, true)) == -1) {
      this.SetState('State_Wait');
      return;
    }
    this.SetState_WithDirection_Wait('State_CellToCell', _loc2_, this.mTarget_Direction);
  }

  State_Attack_Decision(): boolean {
    if (!this.mCanAttack || this.mFireRateCount > 0) {
      return false;
    }
    if (this.mTarget_Player.mLife <= 0) {
      return false;
    }
    const _loc2_ = this.mTarget_Player.mPosition;
    if (this.mPosition.CAngleToPosition(_loc2_).__get__mDirection() != this.mAngle.__get__mDirection()) {
      return false;
    }
    if (this.mPosition.Distance_SQR(_loc2_) > this.mAttackRange * this.mAttackRange) {
      return false;
    }
    const _loc3_ = this.mWorld.mMap.mCollide.Collide_Line(this, this.mPosition, _loc2_, Thing.Shot.CThing_Shot_FireBall.mCollideRadius, Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight);
    // AS2: Collide_Line returns undefined when nothing is hit (and wall hits carry no mThing) -> reads give undefined.
    if (_loc3_?.mThing?._CLASSID_ != this.mTarget_Player._CLASSID_) {
      return false;
    }
    return true;
  }

  State_Attack_Init(): void {
    this.mXSI_Animation.SetAnimation('attack');
  }

  State_Attack(): void {
    const _loc3_ = this.mXSI_Animation.Animate_RetObj(Math.min(0.2 * (this.mSpeed * 25 * 1.5), 1));
    if (_loc3_.mNewFrame && _loc3_.mFrameIndex == 3) {
      const _loc5_ = this.mAttackDamage;
      const _loc6_ = this.mAttackSpeed;
      const _loc4_ = this.mAttackAngle;
      this.mXSI_Animation.Update_CurrentFrame(this.mAngle);
      let _loc2_ = this.mXSI_Animation.__get__XSI_Info().XSI_Model_Hand_Right.nPosition;
      _loc2_ = _loc2_.Add(this.mXSI_Animation.__get__XSI_Info().XSI_Model_Hand_Left.nPosition);
      _loc2_ = this.mPosition.Add(_loc2_.ScaleN(0.5));
      if (isNaN(_loc2_.mX) || isNaN(_loc2_.mY)) {
        _loc2_ = this.mPosition.Clone();
        _loc2_ = _loc2_.Add(_loc4_.__get__mDelta().Normalize(this.mRadius + this.mRadius / 2));
        _loc2_.mZ = 0.84;
      }
      this.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_FireBall(_loc2_, _loc4_.Clone(), this, _loc5_, this.mDamageMulitply, _loc6_));
      this.mFireRateCount = this.mFireRate;
    }
    if (_loc3_.mAnimEnd) {
      this.SetState(this.mReturnStateID);
    }
  }

  State_TrackTarget_Init(): void {
    this.mXSI_Animation.SetAnimation('stand');
  }

  // ffdec showed `var State_TrackTarget = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Creature.CThing_Creature_Devil.txt @486474
  State_TrackTarget(): void {
  }

  State_RemoveObject_Init(): void {
    this.mXSI_Animation.SetAnimation('stand');
    this.mCurrentCell = this.mMap.mCells[this.mPosition.mY & 16777215][this.mPosition.mX & 16777215];
  }

  State_RemoveObject(): void {
    // AS2: the adjacent cell can be undefined at the map border -> undefined.mCollide & x == 0.
    if (this.mCurrentCell.mAdjacentCells[this.mAngle.__get__mDirection()]?.mCollide & World.Map.CMap_Cell.mCollide_Object) {
      this.mCurrentCell.mAdjacentCells[this.mAngle.__get__mDirection()].Affect(new Thing.Affect.CThing_Affect_DevilAttack(this, this, 100000, this.mAngle));
    } else {
      this.SetState('State_GotoPlayer');
    }
  }
}
proto(CThing_Creature_Devil, { _CLASSID_: 'CThing_Creature_Devil' });

registerGameClass('Thing.Creature.CThing_Creature_Devil', CThing_Creature_Devil);
