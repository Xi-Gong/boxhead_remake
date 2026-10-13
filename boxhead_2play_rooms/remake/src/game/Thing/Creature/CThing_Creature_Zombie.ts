// Port of projects/boxhead4/Thing/Creature/CThing_Creature_Zombie.as
// Statement order / member layout from generated/disasm/Thing.Creature.CThing_Creature_Zombie.txt (top-level script
// @489884..@492767).
import { proto, random } from '../../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../packages.ts';
import { CThing_Creature } from './CThing_Creature.ts';

export class CThing_Creature_Zombie extends CThing_Creature {
  // ---- AS2 dynamic instance fields ----
  declare mBrain_Count: any;
  declare mTarget_Player: any;
  declare mTarget_Position: any;

  /** Shared XSI collection (created lazily by GetCollection). */
  static mXSI_Collection: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.mColor = 16711680;
    this.mXSI_Animation = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(Thing.Creature.CThing_Creature_Zombie.GetCollection());
    this.Process = this.Process_Init;
  }

  static GetCollection(): any {
    if (Thing.Creature.CThing_Creature_Zombie.mXSI_Collection) {
      return Thing.Creature.CThing_Creature_Zombie.mXSI_Collection;
    }
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection();
    DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.SS_ZOMBIE();
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Zombie_Zombie_Stand', 'stand'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Zombie_Zombie_Walk', 'walk'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Zombie_Zombie_Attack', 'attack'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitRear', 'shothit_1'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_HitFront', 'shothit_2'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dying', 'dying'));
    Thing.Creature.CThing_Creature_Zombie.mXSI_Collection.AddItem(DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.Load('Player_Dead', 'dead'));
    return Thing.Creature.CThing_Creature_Zombie.mXSI_Collection;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    super.Process_Init();
    this.mSpeed = 0.02;
    this.SetState('State_EnterMap');
    this.mBrain_Count = this.mUniqueID % 3;
    this.mScore = 100;
    this.mHeight = 1.5;
    this.mDamage = 50;
    this.mSound = new Object();
    this.mSound.Damage = CSound.mSamples['Creature_Zombie_Hit_' + (random(4) + 1) + '_wav'];
    this.mSound.Death = CSound.mSamples['Creature_Zombie_Hit_' + (random(4) + 1) + '_wav'];
    this.mWorld.mUpgrades.Register_Creature_Zombie(this);
  }

  Process_Normal(): void {
    super.Process_Normal();
  }

  Brain(): void {
    this.mTarget_Player = this.mThing_Collection.GetClosestPlayer(this.mPosition);
    // AS2: no player -> undefined.mPosition is undefined.
    this.mTarget_Position = this.mTarget_Player?.mPosition;
    if (this.mTarget_Player == undefined) {
    }
  }

  State_GotoPlayer_Init(): void {
    this.mBaseStateID = this.mStateID;
    this.mXSI_Animation.SetAnimation('walk');
  }

  State_GotoPlayer(): void {
    this.Brain();
    const _loc2_ = this.mAngle.__get__mDirection();
    this.mCurrentCell = this.mMap.mCells[this.mPosition.mY & 16777215][this.mPosition.mX & 16777215];
    // AS2: mTarget_Position may be undefined (no player) -> undefined & 16777215 == 0.
    this.mTarget_Angle.__set__mAngle(Math.atan2((this.mTarget_Position?.mY & 16777215) + 0.5 - this.mPosition.mY, (this.mTarget_Position?.mX & 16777215) + 0.5 - this.mPosition.mX));
    this.mTarget_Direction = this.mTarget_Angle.mDirection;
    const _loc3_ = this.mCurrentCell['NavReal_' + this.mTarget_Direction]();
    if (_loc3_ & World.Map.CMap_Cell.mCollide_Player) {
      this.SetState_WithDirection('State_Attack', _loc2_, this.mTarget_Direction);
      return;
    }
    if ((this.mTarget_Direction = this.mCurrentCell.Nav_Direction(_loc2_, this.mTarget_Direction, World.Map.CMap_Cell.mCollide_NonMovable, false)) == -1) {
      this.SetState('State_Wait');
      return;
    }
    this.SetState_WithDirection_Wait('State_CellToCell', _loc2_, this.mTarget_Direction);
  }

  State_Attack_Init(): void {
    this.mXSI_Animation.SetAnimation('attack');
  }

  State_Attack(): void {
    if (this.mXSI_Animation.Animate(Math.min(0.3 * (this.mSpeed * 25 * 1.5), 1))) {
      const _loc3_ = this.mMap.mCells[this.mPosition.mY & 16777215][this.mPosition.mX & 16777215];
      // AS2: the adjacent cell can be undefined at the map border -> method call on undefined is a no-op.
      _loc3_.mAdjacentCells[this.mAngle.__get__mDirection()]?.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(this, this.mDamage));
      const _loc2_ = this.mReturnStateID;
      this.SetState('State_Sleep');
      this.mStateCount = 10;
      this.mReturnStateID = _loc2_;
    }
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mWorld.mZombie_DrawCount++;
    this.mWorld.mZombie_AvgPosition.x += Thing.CThing.pDraw.x;
    this.mWorld.mZombie_AvgPosition.y += Thing.CThing.pDraw.y;
    this.mXSI_Animation.Render(Thing.CThing.pDraw, this.mAngle, this.mAlpha);
  }
}
proto(CThing_Creature_Zombie, { _CLASSID_: 'CThing_Creature_Zombie' });

registerGameClass('Thing.Creature.CThing_Creature_Zombie', CThing_Creature_Zombie);
