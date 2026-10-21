import {flash} from '../../engine/runtime.ts';
import {CMain,Thing,World} from '../packages.ts';
import {combatWorld,simplifiedWorld} from './CombatRules.ts';
import {demonCollection,installDemonArt} from './DemonArt.ts';
import {livingWavePlayers,timedWave,bossMembers} from './TimedWaves.ts';
import {variantSight} from './EnemyVariants.ts';
import {CThing_Shot_EnemyBullet} from './EnemyBullet.ts';
const ticks=(s:number)=>Math.ceil(CMain.mFPS*s),isDemon=(e:any)=>e.mCombatKind==='butcher'||e.mCombatKind==='hunter';
function lock(enemy:any,target:any):void{const a=Math.atan2(target.mPosition.mY-enemy.mPosition.mY,target.mPosition.mX-enemy.mPosition.mX);enemy.mCombatAimX=Math.cos(a);enemy.mCombatAimY=Math.sin(a);enemy.mAngle.__set__mAngle(a);}
export function beginDemonAttack(enemy:any):boolean{
 if(!isDemon(enemy)||enemy.mWorld.mTick<(enemy.mCombatCooldown??0)||enemy.mStateID==='State_CombatCleave'||enemy.mStateID==='State_CombatHunt')return false;
 const hunter=enemy.mCombatKind==='hunter',range=hunter?9:enemy.mBossKind?2.8:2.6;
 const p=livingWavePlayers(enemy.mWorld).filter(p=>{const d=p.mPosition.Distance2D(enemy.mPosition);return d<range&&(!hunter||d>=2.5)&&variantSight(enemy.mWorld,enemy.mPosition,p.mPosition);})
  .sort((a,b)=>a.mPosition.Distance2D(enemy.mPosition)-b.mPosition.Distance2D(enemy.mPosition))[0];if(!p)return false;
 lock(enemy,p);enemy.SetState(hunter?'State_CombatHunt':'State_CombatCleave');return true;
}
function pose(enemy:any):void{const a=enemy.mXSI_Animation;a.mCurrentFrameID=Math.min(a.mFrameCount-1,(1-enemy.mCombatTicks/enemy.mCombatWarnTotal)*a.mFrameCount);}
function warning(enemy:any,seconds:number):void{enemy.mCombatPhase='warning';enemy.mCombatWarnTotal=enemy.mCombatTicks=ticks(seconds);enemy.mXSI_Animation.SetAnimation_FORCED('attack');}
function recover(enemy:any,seconds:number):void{enemy.mCombatPhase='recovery';enemy.mCombatTicks=ticks(seconds);enemy.mXSI_Animation.SetAnimation('stand');}
function finish(enemy:any):void{enemy.mCombatCooldown=enemy.mWorld.mTick+ticks(enemy.mBossKind?2.5:3.5);enemy.SetState('State_GotoPlayer');}
function fan(enemy:any):number[]{return enemy.mBossKind?(enemy.mCombatChain===1?[-.4,-.2,0,.2,.4]:[-.3,-.1,.1,.3]):[-.23,0,.23];}
function shoot(enemy:any):void{
 const a=Math.atan2(enemy.mCombatAimY,enemy.mCombatAimX),at=enemy.mPosition.Clone();at.mX+=enemy.mCombatAimX*.55;at.mY+=enemy.mCombatAimY*.55;at.mZ=.8;
 for(const offset of fan(enemy))enemy.mThing_Collection.AddThing_Shot(new CThing_Shot_EnemyBullet(at.Clone(),new Thing.Math.CThing_Angle(a+offset),enemy,enemy.mAttackDamage*.45,enemy.mBossKind?.2:.18));
}
const views=new WeakMap<object,any>();
function drawWarnings(world:any):void{
 const enemies=(Object.values(world.mThing_Collection.mThings)as any[]).filter(e=>e.Process&&e.mLife>0&&isDemon(e)&&(e.mStateID==='State_CombatCleave'||e.mStateID==='State_CombatHunt')&&e.mCombatPhase==='warning');if(!enemies.length)return;
 let mc=views.get(world);if(!mc){mc=world.createEmptyMovieClip('_DemonWarnings',world.getNextHighestDepth());mc._visible=false;views.set(world,mc);}
 for(const e of enemies){
  mc.clear();const hunter=e.mCombatKind==='hunter',progress=1-e.mCombatTicks/e.mCombatWarnTotal;
  if(hunter){
   mc.lineStyle(1.4,0xa4d5cd,90);for(const a of fan(e))for(let d=22;d<9*32;d+=16){mc.moveTo(Math.cos(a)*d,Math.sin(a)*d);mc.lineTo(Math.cos(a)*(d+9),Math.sin(a)*(d+9));}
   mc.lineStyle(2,0xe4f0c4,100);const r=9+progress*4;mc.moveTo(-r,0);mc.lineTo(0,-r);mc.lineTo(r,0);mc.lineTo(0,r);mc.lineTo(-r,0);
  }else{
   const range=(e.mBossKind?2.8:2.6)*32,spread=Math.acos(e.mBossKind?.15:.3);mc.lineStyle(1.5,0xffc18e,95);mc.beginFill(0xa4513b,17);mc.moveTo(0,0);
   for(let i=0;i<=28;i++){const a=-spread+2*spread*i/28;mc.lineTo(Math.cos(a)*range,Math.sin(a)*range);}mc.lineTo(0,0);mc.endFill();mc.lineStyle(2,0xffbe78,100);
   for(let i=0;i<=28*progress;i++){const a=-spread+2*spread*i/28,x=Math.cos(a)*range,y=Math.sin(a)*range;i?mc.lineTo(x,y):mc.moveTo(x,y);}
  }
  const p=world.GetScreenPosition(e.mPosition);world.bmCurrentDraw.draw(mc,new flash.geom.Matrix(e.mCombatAimX,e.mCombatAimY,-e.mCombatAimY,e.mCombatAimX,p.x,p.y-(hunter?12:0)),undefined,'normal',undefined,true);
 }
}
export function installDemons():void{
 installDemonArt();const devil=Thing.Creature.CThing_Creature_Devil.prototype as any,init=devil.Process_Init,goto=devil.State_GotoPlayer,decision=devil.State_Attack_Decision;
 devil.Process_Init=function(this:any):any{
  const result=init.call(this);if(!combatWorld(this.mWorld)||!isDemon(this))return result;
  const butcher=this.mCombatKind==='butcher';this.mLife=this.mMaxLife=this.mMaxLife*(this.mBossKind?(butcher?1.2:1):butcher?1.3:1.05);
  this.mEnemyArmor=this.mEnemyArmorMaximum=Math.ceil(this.mMaxLife*(this.mBossKind?.4:.3));
  this.mSpeed=butcher?Math.max(.055,Math.min(.12,this.mSpeed*.95)):Math.max(.08,Math.min(.145,this.mSpeed*1.25));
  this.mScore=this.mBossKind?5000:butcher?1800:1600;this.mCombatCooldown=0;this.mXSI_Animation.mCollection=demonCollection(this.mCombatKind,!!this.mBossKind);this.mXSI_Animation.SetAnimation_FORCED('stand');
  const boss=timedWave(this.mWorld)?.boss,member=boss&&bossMembers(boss).find(m=>m.id===this.sUniqueID);if(member){member.life=this.mLife;member.maximum=this.mMaxLife;}return result;
 };
 devil.State_GotoPlayer=function(this:any):any{if(beginDemonAttack(this))return;return goto.call(this);};
 devil.State_Attack_Decision=function(this:any):boolean{return isDemon(this)?false:decision.call(this);};
 const p=Thing.Creature.CThing_Creature.prototype as any,set=p.SetState;
 p.SetState=function(this:any,state:string):any{return set.call(this,isDemon(this)&&state==='State_Attack'?'State_RemoveObject':state);};
 p.State_CombatCleave_Init=function(this:any):void{this.mBaseStateID='State_GotoPlayer';this.mCombatChain=this.mBossKind?1:0;warning(this,1);};
 p.State_CombatCleave=function(this:any):void{
  if(this.mCombatPhase==='warning')pose(this);if(--this.mCombatTicks>0)return;
  if(this.mCombatPhase==='warning'){
   for(const target of livingWavePlayers(this.mWorld)){
    const dx=target.mPosition.mX-this.mPosition.mX,dy=target.mPosition.mY-this.mPosition.mY,d=Math.hypot(dx,dy);
    if(d<=(this.mBossKind?2.8:2.6)&&(dx*this.mCombatAimX+dy*this.mCombatAimY)/Math.max(.001,d)>=(this.mBossKind?.15:.3)&&variantSight(this.mWorld,this.mPosition,target.mPosition))target.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(this,this.mAttackDamage*1.5));
   }
   if(this.mCombatChain>0){this.mCombatChain--;const a=Math.atan2(this.mCombatAimY,this.mCombatAimX)+(this.mUniqueID%2?1:-1)*Math.PI/3;this.mCombatAimX=Math.cos(a);this.mCombatAimY=Math.sin(a);this.mAngle.__set__mAngle(a);warning(this,.7);}
   else recover(this,1.5);return;
  }finish(this);
 };
 p.State_CombatHunt_Init=function(this:any):void{this.mBaseStateID='State_GotoPlayer';this.mCombatChain=this.mBossKind?1:0;warning(this,.9);};
 p.State_CombatHunt=function(this:any):void{
  if(this.mCombatPhase==='warning')pose(this);if(--this.mCombatTicks>0)return;
  if(this.mCombatPhase==='warning'){
   shoot(this);if(this.mCombatChain>0){this.mCombatChain--;warning(this,.7);}else recover(this,this.mBossKind?1.3:.9);return;
  }finish(this);
 };
 const map=World.Map.CMap.prototype as any,draw=map.Draw;map.Draw=function(this:any,...args:any[]):any{if(combatWorld(this.mWorld)&&!simplifiedWorld(this.mWorld))drawWarnings(this.mWorld);return draw.apply(this,args);};
}
