import {flash} from '../../engine/runtime.ts';
import {CMain,Thing,World} from '../packages.ts';
import {combatWorld} from './CombatRules.ts';
import {combatOrdinal,type CombatKind} from './CombatRosterRules.ts';
import {combatCollection,installCombatRosterArt} from './CombatRosterArt.ts';
import {livingWavePlayers} from './TimedWaves.ts';
import {variantSight} from './EnemyVariants.ts';
const ticks=(seconds:number)=>Math.ceil(CMain.mFPS*seconds);
export function beginCombatSmash(enemy:any):boolean{
 if(enemy.mCombatKind!=='brute'||enemy.mWorld.mTick<(enemy.mCombatCooldown??0))return false;
 const target=livingWavePlayers(enemy.mWorld).filter(p=>p.mPosition.Distance2D(enemy.mPosition)<=2.2&&variantSight(enemy.mWorld,enemy.mPosition,p.mPosition))[0];
 if(!target)return false;
 const a=Math.atan2(target.mPosition.mY-enemy.mPosition.mY,target.mPosition.mX-enemy.mPosition.mX);enemy.mCombatAimX=Math.cos(a);enemy.mCombatAimY=Math.sin(a);enemy.mAngle.__set__mAngle(a);
 enemy.SetState('State_CombatSmash');return true;
}
const views=new WeakMap<object,any>();
function drawCombatWarnings(world:any):void{
 const enemies=(Object.values(world.mThing_Collection.mThings)as any[]).filter(e=>e.Process&&e.mLife>0&&e.mStateID==='State_CombatSmash'&&e.mCombatPhase==='warning');if(!enemies.length)return;
 let mc=views.get(world);if(!mc){mc=world.createEmptyMovieClip('_CombatWarnings',world.getNextHighestDepth());mc._visible=false;views.set(world,mc);}
 for(const e of enemies){
  const range=2.2*32,spread=Math.acos(.3);mc.clear();mc.lineStyle(1.5,0xffd38b,95);mc.beginFill(0xaa5b38,16);mc.moveTo(0,0);
  for(let i=0;i<=24;i++){const a=-spread+2*spread*i/24;mc.lineTo(Math.cos(a)*range,Math.sin(a)*range);}mc.lineTo(0,0);mc.endFill();
  const progress=1-e.mCombatTicks/ticks(.8);mc.lineStyle(2,0xffbc68,90);for(let i=0;i<=24*progress;i++){const a=-spread+2*spread*i/24;const x=Math.cos(a)*range,y=Math.sin(a)*range;i?mc.lineTo(x,y):mc.moveTo(x,y);}
  const p=world.GetScreenPosition(e.mPosition);world.bmCurrentDraw.draw(mc,new flash.geom.Matrix(e.mCombatAimX,e.mCombatAimY,-e.mCombatAimY,e.mCombatAimX,p.x,p.y),undefined,'normal',undefined,true);
 }
}
export function installCombatRoster():void{
 installCombatRosterArt();
 const collection=Thing.CThing_Collection.prototype as any,add=collection.AddThing;
 collection.AddThing=function(this:any,e:any):any{
  const result=add.call(this,e),w=this.mWorld,s=w.mUpgrades.enemyVariantState;
  if(combatWorld(w)&&!e.mBossKind&&!e.mEnemyVariant&&!e.mCombatKind&&['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(e._CLASSID_)&&s){
   const family=e._CLASSID_==='CThing_Creature_Zombie'?'Zombie':'Devil',ordinal=family==='Zombie'?s.zombie:s.devil;
   const kind=ordinal>0?combatOrdinal(w.mUpgrades.mLevelIndex,ordinal,family):undefined;
   if(kind&&(Object.values(this.mThings)as any[]).filter(t=>t.mCombatKind===kind&&t.Process&&t.mLife>0&&!t.lanKillLogged).length<2)e.mCombatKind=kind;
  }return result;
 };
 for(const ctor of [Thing.Creature.CThing_Creature_Zombie,Thing.Creature.CThing_Creature_Devil]){
  const p=ctor.prototype as any,init=p.Process_Init,goto=p.State_GotoPlayer;
  p.Process_Init=function(this:any):any{
   const result=init.call(this);if(!combatWorld(this.mWorld)||!['runner','brute'].includes(this.mCombatKind))return result;
   const kind=this.mCombatKind as CombatKind;
   this.mLife=this.mMaxLife=this.mMaxLife*(kind==='runner'?.8:2);
   this.mSpeed=kind==='runner'?Math.max(.105,Math.min(.175,this.mSpeed*2.2)):Math.max(.045,Math.min(.095,this.mSpeed*.8));
   this.mDamage*=kind==='runner'?.75:1.4;this.mScore=kind==='runner'?150:300;this.mCombatCooldown=0;
   this.mXSI_Animation.mCollection=combatCollection(kind);this.mXSI_Animation.SetAnimation_FORCED('stand');return result;
  };
  p.State_GotoPlayer=function(this:any):any{if(this.mCombatKind&&beginCombatSmash(this))return;return goto.call(this);};
 }
 const zombie=Thing.Creature.CThing_Creature_Zombie.prototype as any,brain=zombie.Brain;
 zombie.Brain=function(this:any):any{
  const result=brain.call(this),target=this.mTarget_Position;if(this.mCombatKind!=='runner'||!target)return result;
  const dx=target.mX-this.mPosition.mX,dy=target.mY-this.mPosition.mY,d=Math.hypot(dx,dy);if(d<2.5||d>8)return result;
  const side=this.mUniqueID%2?1:-1,q=target.Clone();q.mX+=-dy/d*1.6*side;q.mY+=dx/d*1.6*side;
  if(variantSight(this.mWorld,this.mPosition,q))this.mTarget_Position=q;return result;
 };
 const p=Thing.Creature.CThing_Creature.prototype as any;
 p.State_CombatSmash_Init=function(this:any):void{this.mBaseStateID='State_GotoPlayer';this.mCombatPhase='warning';this.mCombatTicks=ticks(.8);this.mXSI_Animation.SetAnimation('attack');};
 p.State_CombatSmash=function(this:any):void{
  this.mXSI_Animation.QAnimate(this.mCombatPhase==='warning'?.12:.3);if(--this.mCombatTicks>0)return;
  if(this.mCombatPhase==='warning'){
   for(const target of livingWavePlayers(this.mWorld)){
    const dx=target.mPosition.mX-this.mPosition.mX,dy=target.mPosition.mY-this.mPosition.mY,d=Math.hypot(dx,dy);
    if(d<=2.2&&(dx*this.mCombatAimX+dy*this.mCombatAimY)/Math.max(.001,d)>=.3&&variantSight(this.mWorld,this.mPosition,target.mPosition))target.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(this,this.mDamage));
   }this.mCombatPhase='recovery';this.mCombatTicks=ticks(1.2);return;
  }this.mCombatCooldown=this.mWorld.mTick+ticks(3);this.SetState('State_GotoPlayer');
 };
 const map=World.Map.CMap.prototype as any,draw=map.Draw;map.Draw=function(this:any,...args:any[]):any{if(combatWorld(this.mWorld))drawCombatWarnings(this.mWorld);return draw.apply(this,args);};
}
