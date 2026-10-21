import {flash} from '../../engine/runtime.ts';
import {CMain,Thing,World} from '../packages.ts';
import {combatWorld,simplifiedWorld} from './CombatRules.ts';
import {timedWave,bossMembers} from './TimedWaves.ts';
import {netSession} from './Net/NetSession.ts';
import {capsule} from './UiStyle.ts';
import {hasFeature} from './ModernFeatures.ts';
export interface EnemyArmor {id:string;armor:number;maximum:number;boss:boolean}
export function captureEnemyArmor(world:any):EnemyArmor[]{
 if(!combatWorld(world)||simplifiedWorld(world))return [];
 return (Object.values(world.mThing_Collection?.mThings??{})as any[]).filter(e=>e.Process&&e.mLife>0&&e.mEnemyArmor>0&&!e.lanKillLogged)
  .map(e=>({id:e.sUniqueID,armor:e.mEnemyArmor,maximum:e.mEnemyArmorMaximum,boss:!!e.mBossKind}));
}
export function combatKillXp(enemy:any):number{
 if(enemy.mBossKind)return enemy.mBossKind==='butcher'||enemy.mBossKind==='hunter'?70:50;
 if(enemy.mCombatKind==='butcher')return 14;if(enemy.mCombatKind==='hunter')return 12;
 if(enemy.mCombatKind)return enemy.mCombatKind==='brute'?4:enemy.mCombatKind==='gunner'?3:2;
 return enemy._CLASSID_==='CThing_Creature_Devil'?(enemy.mEnemyVariant==='priest'?12:10):(enemy.mEnemyVariant==='charger'?4:2);
}
const layers=new WeakMap<object,any>();
function drawArmor(world:any):void{
 if(!combatWorld(world)||simplifiedWorld(world)||timedWave(world)?.phase!=='combat')return;
 const session=netSession(),values=session?session.confirmedEnemyArmor:captureEnemyArmor(world);if(!values?.length)return;
 let mc=layers.get(world);if(!mc){mc=world.createEmptyMovieClip('_EnemyArmorArt',world.getNextHighestDepth());mc._visible=false;layers.set(world,mc);}
 for(const v of values){
  const e=world.mThing_Collection.mThings[v.id];if(!e?.Process||e.mLife<=0)continue;
  const anim=e.mXSI_Animation,o=anim?.mAnimationObject,frame=o?.mDirections[o.mLookup256[e.mAngle.__get__mAngle256()&255]]?.mFrames[anim.mCurrentFrameID&16777215];
  if(!frame?.sBMD)continue;
  const p=world.GetScreenPosition(e.mPosition),top=p.y+frame.mDisp.y,width=v.boss?64:30;
  if(p.x<0||p.x>world.mScreenSize.x||top>world.mScreenSize.y||top+frame.sBMD.height<0)continue;
  mc.clear();mc.beginFill(0x17282d,95);capsule(mc,0,0,width,3);mc.endFill();mc.beginFill(0x8bd1de,100);capsule(mc,1,1,Math.max(1,(width-2)*Math.min(1,v.armor/v.maximum)),1);mc.endFill();
  world.bmCurrentDraw.draw(mc,new flash.geom.Matrix(1,0,0,1,Math.round(Math.max(2,Math.min(world.mScreenSize.x-width-2,p.x-width/2))),Math.round(top-4)),undefined,'normal',undefined,true);
 }
}
export function installCombatEnemies():void{
 for(const ctor of [Thing.Creature.CThing_Creature_Zombie,Thing.Creature.CThing_Creature_Devil]){
  const p=ctor.prototype as any,init=p.Process_Init;
  p.Process_Init=function(this:any):any{
   const result=init.call(this);if(!combatWorld(this.mWorld))return result;
   const devil=this._CLASSID_==='CThing_Creature_Devil';
   this.mLife=this.mMaxLife=this.mMaxLife*(this.mBossKind?2:devil?2:2.5);
   this.mSpeed*=this.mEnemyVariant?1.1:devil?1.12:1.2;
   this.mSpeed=Math.max(this.mSpeed,devil ? .08 : this.mEnemyVariant ? .075 : .06);
   if(devil&&this.mBossKind==='devil'&&hasFeature(this.mWorld,'native-bosses-v1')){
    this.mNativeBossAttackStep=Math.min(.2*(this.mSpeed*25*1.5)*1.15,1);
    this.mSpeed*=1.15;this.mAttackDamage*=1.10;this.mNativeBossAttackAt=this.mWorld.mTick+Math.ceil((this.mBossSlot??0)*.25*CMain.mFPS);
   }
   if(!simplifiedWorld(this.mWorld)&&(devil||this.mBossKind))this.mEnemyArmor=this.mEnemyArmorMaximum=Math.ceil(this.mMaxLife*(this.mBossKind?.4:.3));
   const boss=timedWave(this.mWorld)?.boss,member=boss&&bossMembers(boss).find(m=>m.id===this.sUniqueID);
   if(member){member.life=this.mLife;member.maximum=this.mMaxLife;}
   return result;
  };
 }
 const devil=Thing.Creature.CThing_Creature_Devil.prototype as any,attack=devil.State_Attack,decision=devil.State_Attack_Decision;
 devil.State_Attack_Decision=function(this:any):boolean{if(hasFeature(this.mWorld,'native-bosses-v1')&&this.mWorld.mTick<(this.mNativeBossAttackAt??0))return false;return decision.call(this);};
 devil.State_Attack=function(this:any):any{
  if(!hasFeature(this.mWorld,'native-bosses-v1')||this.mBossKind!=='devil')return attack.call(this);
  if(this.mWorld.mTick<this.mNativeBossAttackAt)return;
  const speed=this.mSpeed;this.mSpeed=this.mNativeBossAttackStep/(.2*25*1.5);
  try{return attack.call(this);}finally{this.mSpeed=speed;}
 };
 const map=World.Map.CMap.prototype as any,draw=map.Draw;
 map.Draw=function(this:any,...args:any[]):any{drawArmor(this.mWorld);return draw.apply(this,args);};
}
