// ENEMY_VARIANTS: optional PvE subclasses retain their original family/class identity and counters.
import {flash,random} from '../../engine/runtime.ts';
import {CMain,CSound,Thing,World} from '../packages.ts';
import {endlessWorld} from './Endless.ts';
import {netSession} from './Net/NetSession.ts';
import {installVariantArt,variantCollection} from './VariantArt.ts';
import {combatFamily,type CombatKind} from './CombatRosterRules.ts';
import {simplifiedWorld} from './CombatRules.ts';
import {hasFeature} from './ModernFeatures.ts';
export const VARIANTS_RULE='enemy-variants-v1';
export type EnemyVariant='charger'|'priest';
export function variantsWorld(world:any):boolean{return endlessWorld(world)&&(!netSession()||netSession()?.startOpts?.cfg.variants===VARIANTS_RULE);}
export function variantPercent(kind:EnemyVariant,wave:number):number{return kind==='charger'?(wave<8?0:Math.min(25,10+Math.floor((wave-8)/4))):(wave<20?0:Math.min(40,20+5*Math.floor((wave-20)/5)));}
export function variantOrdinal(kind:EnemyVariant,wave:number,ordinal:number):boolean{const p=variantPercent(kind,wave);return Math.floor(ordinal*p/100)>Math.floor((ordinal-1)*p/100);}
const things=(w:any):any[]=>Object.values(w.mThing_Collection?.mThings??{});
const players=(w:any):any[]=>Object.values(w.mThing_Collection.mPlayerThings).filter((p:any)=>p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD)).sort((a:any,b:any)=>a.mPlayerIndex-b.mPlayerIndex);
const ticks=(seconds:number):number=>Math.ceil(CMain.mFPS*seconds);
function skillPose(enemy:any,total:number):void{
 const a=enemy.mXSI_Animation;
 // Allocate all pose frames across the phase ticks, leaving time to display the final pose before transition.
 a.mCurrentFrameID=Math.min(a.mFrameCount-1,(1-enemy.mVariantTicks/total)*a.mFrameCount);
}
const position=(x:number,y:number):any=>new Thing.Math.CThing_Position(x,y,0);
function blocked(w:any,x:number,y:number,r=0,objects=true):boolean{
 const mask=World.Map.CMap_Cell.mCollide_StaticImpassable|(objects?World.Map.CMap_Cell.mCollide_Object:0);
 for(const [dx,dy]of [[-r,-r],[r,-r],[-r,r],[r,r]]){const c=w.mMap.mCells[Math.floor(y+dy!)]?.[Math.floor(x+dx!)];if(!c||c.mCollide&mask)return true;}return false;
}
export function variantSight(w:any,a:any,b:any):boolean{
 const n=Math.max(1,Math.ceil(a.Distance2D(b)/.15));
 for(let i=0;i<=n;i++)if(blocked(w,a.mX+(b.mX-a.mX)*i/n,a.mY+(b.mY-a.mY)*i/n,0,true))return false;return true;
}
export interface EmberZone {id:number;caster:string;target:number;mPosition:any;mAngle:any;damage:number;born:number;warning:number;duration:number;interval:number;lastPulse:number}
export function emberZones(w:any):EmberZone[]{return w.mUpgrades.enemyVariantState?.zones??[];}
const skillFields=['mLife','mMaxLife','mVariantCooldown','mVariantPhase','mVariantTicks','mChargeX','mChargeY','mChargeDistance','mBossKind','mBossChargesRemaining','mEnemyArmor','mEnemyArmorMaximum','mCombatKind','mCombatCooldown','mCombatPhase','mCombatTicks','mCombatAimX','mCombatAimY','mCombatAimRange','mCombatShots','mGunnerSkin','mGunnerWeapon','mCombatChain','mCombatWarnTotal','mNativeBossAttackAt'] as const;
export interface VariantSave {
 rule:typeof VARIANTS_RULE;wave:number;zombie:number;devil:number;nextZone:number;
 zones:(Omit<EmberZone,'mPosition'|'mAngle'>&{x:number;y:number;angle:number})[];
 enemies:{id:string;kind:EnemyVariant|CombatKind|'devil'|'zombie';x:number;y:number;angle:number;state:string;frame:number;damageSound?:string;deathSound?:string;fields:Record<string,number|string|undefined>}[];
}
export function captureVariants(w:any):VariantSave|undefined{
 if(!variantsWorld(w))return;
 const s=w.mUpgrades.enemyVariantState;
 return {rule:VARIANTS_RULE,wave:s.wave,zombie:s.zombie,devil:s.devil,nextZone:s.nextZone,
  zones:s.zones.map(({mPosition:p,mAngle:a,...rest}:EmberZone)=>({...rest,x:p.mX,y:p.mY,angle:a.__get__mAngle()})),
  enemies:things(w).filter(e=>(e.mBossKind||e.mCombatKind||e.mEnemyVariant||e.mEnemyArmorMaximum)&&e.Process&&e.mLife>0&&!e.lanKillLogged).map(e=>({id:e.sUniqueID,kind:e.mCombatKind??e.mEnemyVariant??(e._CLASSID_==='CThing_Creature_Zombie'?'zombie':'devil'),x:e.mPosition.mX,y:e.mPosition.mY,angle:e.mAngle.__get__mAngle(),state:e.mStateID,frame:e.mXSI_Animation.mCurrentFrameID,damageSound:Object.keys(CSound.mSamples).find(k=>CSound.mSamples[k]===e.mSound.Damage),deathSound:Object.keys(CSound.mSamples).find(k=>CSound.mSamples[k]===e.mSound.Death),fields:Object.fromEntries([...skillFields.filter(k=>Object.hasOwn(e,k)).map(k=>[k,e[k]]),...(typeof e.mBossSlot==='number'?[['mBossSlot',e.mBossSlot]]:[])])}))};
}
export function restoreVariants(w:any,s:VariantSave|undefined,migrate=false):void{
 if(!variantsWorld(w)||s?.rule!==VARIANTS_RULE)return;
 for(const e of things(w))if((e.mBossKind||e.mCombatKind||e.mEnemyVariant||e.mEnemyArmorMaximum)&&e.Process){e.ClearCollideCell();e.Delete();}
 const identities=new Map<string,string>();
 for(const saved of s.enemies){
  const native=hasFeature(w,'native-bosses-v1'),fields={...saved.fields},retired=migrate&&saved.kind!=='charger'||native&&saved.kind!=='devil'&&saved.kind!=='zombie';
  if(migrate||retired){
   for(const key of Object.keys(fields))if(key==='mLife'||key==='mMaxLife'||key.startsWith('mEnemyArmor')||retired&&(key.startsWith('mCombat')||key.startsWith('mGunner')||key.startsWith('mVariant')||key.startsWith('mCharge')||key==='mBossChargesRemaining'))delete fields[key];
   if(fields.mBossKind)fields.mBossKind=native?(netSession()?.startOpts?.cfg.devils??!!CMain.mSaveData.__get__mDevilsActive())?'devil':'zombie':fields.mBossKind==='charger'?'charger':'devil';
  }
  const family=native&&fields.mBossKind?combatFamily(String(fields.mBossKind)):combatFamily(saved.kind),ctor=family==='Zombie'?Thing.Creature.CThing_Creature_Zombie:Thing.Creature.CThing_Creature_Devil;
  const e:any=new ctor(position(saved.x,saved.y),new Thing.Math.CThing_Angle(saved.angle));
  if(fields.mCombatKind)e.mCombatKind=fields.mCombatKind;else if(!retired&&saved.kind!=='devil'&&saved.kind!=='zombie')e.mEnemyVariant=saved.kind;
  if(fields.mGunnerSkin!==undefined){e.mGunnerSkin=fields.mGunnerSkin;e.mGunnerWeapon=fields.mGunnerWeapon;}
  if(fields.mBossKind)e.mBossKind=fields.mBossKind;
  if(typeof fields.mBossSlot==='number')e.mBossSlot=fields.mBossSlot;
  w.mThing_Collection.AddThing(e);e.Process_Init();
  e.ClearCollideCell();e.Move(position(saved.x,saved.y));e.SetCollideDirection(e.mPosition,World.Map.CMap_Cell.mCollide_Creature);e.mFlags|=Thing.CThing.mFlag_Collidable;
  e.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet|Thing.Affect.CThing_Affect.mAffect_Explosion|Thing.Affect.CThing_Affect.mAffect_FireBall);
  e.mBaseStateID='State_GotoPlayer';e.SetState(!retired&&['State_VariantCharge','State_VariantCast','State_CombatSmash','State_CombatAim','State_CombatCleave','State_CombatHunt'].includes(saved.state)?saved.state:'State_GotoPlayer');Object.assign(e,fields);
  if(migrate||retired)e.mLife=Math.max(1,Math.min(e.mMaxLife,e.mMaxLife*Number(saved.fields.mLife)/Math.max(1,Number(saved.fields.mMaxLife))));
  e.mXSI_Animation.SetAnimation_FORCED(e.mStateID==='State_CombatAim'?'stand':['State_CombatCleave','State_CombatHunt'].includes(e.mStateID)?e.mCombatPhase==='warning'?'attack':'stand':e.mStateID==='State_CombatSmash'?'attack':e.mStateID==='State_VariantCast'?'cast':e.mStateID==='State_VariantCharge'?(e.mVariantPhase==='warning'?'warning':e.mVariantPhase==='charge'?'charge':'recovery'):'walk',retired?0:saved.frame??0);
  if(!retired&&saved.damageSound)e.mSound.Damage=CSound.mSamples[saved.damageSound];if(!retired&&saved.deathSound)e.mSound.Death=CSound.mSamples[saved.deathSound];
  if(family==='Zombie')w.mUpgrades.Level.mZombieCount++;else w.mUpgrades.Level.mDevilCount++;
  identities.set(saved.id,e.sUniqueID);
 }
 w.mUpgrades.enemyVariantState={wave:s.wave,zombie:s.zombie,devil:s.devil,nextZone:s.nextZone,zones:migrate?[]:s.zones.map(({x,y,angle,...z})=>({...z,caster:identities.get(z.caster)??z.caster,mPosition:position(x,y),mAngle:new Thing.Math.CThing_Angle(angle)}))};
}
export function processEmberZones(w:any):void{
 const state=w.mUpgrades.enemyVariantState;if(!state)return;
 state.zones=state.zones.filter((z:EmberZone)=>{
  const age=w.mTick-z.born;if(age>=z.warning+z.duration)return false;
  if(age<z.warning){const owner=w.mThing_Collection.mThings[z.caster];return !!owner?.Process&&owner.mLife>0&&!owner.lanKillLogged;}
  const pulse=Math.floor((age-z.warning)/z.interval);if(pulse<=z.lastPulse)return true;z.lastPulse=pulse;
  if(pulse>3)return true;
  for(const p of players(w)){
   const cycle=Math.floor(w.mTick/z.interval);
   if(p.mEmberDamageCycle===cycle||p.mPosition.Distance2D(z.mPosition)>1||!variantSight(w,z.mPosition,p.mPosition))continue;
   p.mEmberDamageCycle=cycle;p.Affect(new Thing.Affect.CThing_Affect_FireBall(z,z,z.damage,z.mAngle));
  }return true;
 });
}
function nearbyTarget(enemy:any,min:number,max:number):any{return players(enemy.mWorld).filter(p=>{const d=p.mPosition.Distance2D(enemy.mPosition);return d>=min&&d<=max&&variantSight(enemy.mWorld,enemy.mPosition,p.mPosition);}).sort((a,b)=>a.mPosition.Distance2D(enemy.mPosition)-b.mPosition.Distance2D(enemy.mPosition))[0];}
export function beginCharge(enemy:any):boolean{
 if(enemy.mEnemyVariant!=='charger'||enemy.mWorld.mTick<(enemy.mVariantCooldown??0))return false;
 const target=nearbyTarget(enemy,2.5,6);if(!target)return false;
 const direction=target.mPosition.Subtract(enemy.mPosition).Normalize2D(1);enemy.mChargeX=direction.mX;enemy.mChargeY=direction.mY;
 enemy.mAngle.__set__mAngle(Math.atan2(direction.mY,direction.mX));enemy.SetState('State_VariantCharge');return true;
}
export function beginEmberCast(enemy:any):boolean{
 if(enemy.mEnemyVariant!=='priest'||enemy.mBossKind||enemy.mWorld.mTick<(enemy.mVariantCooldown??0))return false;
 const w=enemy.mWorld,state=w.mUpgrades.enemyVariantState,zones=emberZones(w),targets=players(w).filter(p=>p.mPosition.Distance2D(enemy.mPosition)<=7&&variantSight(w,enemy.mPosition,p.mPosition)&&!zones.some(z=>z.target===p.mPlayerIndex));
 if(!targets.length||zones.length>=(World.CWorld.mGameMode==='Single'?2:4))return false;
 for(const p of targets){
  if(zones.length>=(World.CWorld.mGameMode==='Single'?2:4))break;
  zones.push({id:state.nextZone++,caster:enemy.sUniqueID,target:p.mPlayerIndex,mPosition:p.mPosition.Clone(),mAngle:enemy.mAngle.Clone(),damage:enemy.mAttackDamage*.3,born:w.mTick,warning:ticks(.9),duration:ticks(1.6),interval:ticks(.4),lastPulse:-1});
 }
 enemy.mVariantCooldown=w.mTick+ticks(5);enemy.SetState('State_VariantCast');enemy.PlaySound(CSound.mSamples.Creature_Zombie_Hit_1_wav);return true;
}
const drawViews=new WeakMap<object,any>();
/** Render-only sweep of the same step length/radii and static obstruction query as the charge. */
export function chargeWarningGeometry(enemy:any):{length:number;radius:number}{
 const w=enemy.mWorld,radius=enemy.mRadius+Math.max(0,...players(w).map(p=>p.mRadius));let distance=0;
 for(let i=1;i<=50;i++){
  const next=i*.08;
  if(blocked(w,enemy.mPosition.mX+enemy.mChargeX*next,enemy.mPosition.mY+enemy.mChargeY*next,enemy.mRadius,true))break;
  distance=next;
 }
 return {length:distance*32,radius:radius*32};
}
function drawZones(w:any):void{
 const zones=emberZones(w),chargers=things(w).filter(e=>e.Process&&e.mStateID==='State_VariantCharge'&&e.mVariantPhase==='warning');if(!zones.length&&!chargers.length)return;
 let mc=drawViews.get(w);if(!mc){mc=w.createEmptyMovieClip('_EmberArt',w.getNextHighestDepth());mc._visible=false;drawViews.set(w,mc);}
 for(const z of zones){
  const age=w.mTick-z.born,warning=age<z.warning,pulse=warning?0:Math.sin((age-z.warning)*Math.PI/z.interval)**2;
  mc.clear();mc.lineStyle(warning?2:1.5,warning?0xffcf70:0x7e1d12,100);
  mc.beginFill(warning?0x6e3428:0x8a311c,warning?15:24);
  for(let i=0;i<=32;i++){const a=i*Math.PI/16,x=Math.cos(a)*32,y=Math.sin(a)*32;i?mc.lineTo(x,y):mc.moveTo(x,y);}mc.endFill();
  const progress=warning?Math.max(0,Math.min(1,(w.mTick-z.born)/z.warning)):1;
  mc.lineStyle(2,warning?0xffe3a1:0xf7b751,95);
  for(let i=0;i<=24*progress;i++){const a=i*Math.PI/12-Math.PI/2,x=Math.cos(a)*25,y=Math.sin(a)*25;i?mc.lineTo(x,y):mc.moveTo(x,y);}
  // Four broken seal marks share the priest's angular molten inlays; never flash the screen.
  mc.lineStyle(1.5,warning?0xd89a52:0xf5b85d,warning?75:65+pulse*15);
  for(let i=0;i<4;i++){
   const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a),at=(x:number,y:number):number[]=>[c*x-s*y,s*x+c*y];
   mc.moveTo(...at(17,-4));mc.lineTo(...at(21,0));mc.lineTo(...at(17,4));mc.moveTo(...at(25,0));mc.lineTo(...at(29,0));
  }
  if(warning){
   mc.lineStyle(1,0xffd18b,65);const r=3+4*progress;
   mc.moveTo(0,-r);mc.lineTo(r,0);mc.lineTo(0,r);mc.lineTo(-r,0);mc.lineTo(0,-r);
  }else for(let i=0;i<5;i++){
   const x=(i-2)*8,y=7+Math.abs(i-2)*2,h=11+5*Math.sin(age*.42+i*1.4),bend=2*Math.sin(age*.28+i);
   mc.lineStyle(1,0x733020,60);mc.beginFill(0xe57628,70);
   mc.moveTo(x-4,y);mc.curveTo(x-6,y-h*.45,x+bend,y-h);mc.curveTo(x+1,y-h*.35,x+4,y);mc.lineTo(x-4,y);mc.endFill();
   mc.lineStyle();mc.beginFill(0xffd581,75);mc.moveTo(x-2,y-1);mc.lineTo(x+bend*.4,y-h*.55);mc.lineTo(x+2,y-1);mc.endFill();
  }
  const p=w.GetScreenPosition(z.mPosition),m=new flash.geom.Matrix(1,0,0,1,p.x,p.y);w.bmCurrentDraw.draw(mc,m,undefined,'normal',undefined,true);
 }
 for(const e of chargers){
  const progress=1-e.mVariantTicks/ticks(.6);
  const geometry=chargeWarningGeometry(e),length=geometry.length,radius=geometry.radius;
  mc.clear();mc.lineStyle(1.5,0xf1ce82,95);mc.beginFill(0x9e7444,10);
  for(let i=0;i<=16;i++){const a=-Math.PI/2+i*Math.PI/16,x=length+Math.cos(a)*radius,y=Math.sin(a)*radius;i?mc.lineTo(x,y):mc.moveTo(x,y);}
  for(let i=0;i<=16;i++){const a=Math.PI/2+i*Math.PI/16;mc.lineTo(Math.cos(a)*radius,Math.sin(a)*radius);}mc.lineTo(length,-radius);mc.endFill();
  mc.lineStyle(2,0xe5bd76,65+progress*25);
  for(let i=0;i<3;i++){const x=(i+1)*length/4;if(x<8)continue;mc.moveTo(x-5,-6);mc.lineTo(x+2,0);mc.lineTo(x-5,6);}
  const p=w.GetScreenPosition(e.mPosition);w.bmCurrentDraw.draw(mc,new flash.geom.Matrix(e.mChargeX,e.mChargeY,-e.mChargeY,e.mChargeX,p.x,p.y),undefined,'normal',undefined,true);
 }
}
export function installEnemyVariantsScope():void{
 installVariantArt();
 const world=World.CWorld.prototype as any,upgrades=World.CUpgrades.prototype as any,collection=Thing.CThing_Collection.prototype as any;
 const level=upgrades.__set__mLevel;upgrades.__set__mLevel=function(this:any,n:any):any{const result=level.call(this,n);if(variantsWorld(this.mWorld))this.enemyVariantState={wave:n,zombie:0,devil:0,nextZone:1,zones:[]};return result;};
 const spawnScopes=new WeakMap<object,EnemyVariant>();
 for(const [name,kind]of [['Spawn_Zombie','charger'],['Spawn_Devil','priest']]as const){const spawn=world[name];world[name]=function(this:any):any{if(!variantsWorld(this)||hasFeature(this,'native-bosses-v1'))return spawn.call(this);spawnScopes.set(this.mThing_Collection,kind);try{return spawn.call(this);}finally{spawnScopes.delete(this.mThing_Collection);}};}
 const add=collection.AddThing;collection.AddThing=function(this:any,t:any):any{
  const kind=spawnScopes.get(this),state=this.mWorld.mUpgrades.enemyVariantState;
  if(kind&&t._CLASSID_===(kind==='charger'?'CThing_Creature_Zombie':'CThing_Creature_Devil')){
   const ordinal=kind==='charger'?++state.zombie:++state.devil;
   if(!(kind==='priest'&&simplifiedWorld(this.mWorld))&&variantOrdinal(kind,state.wave,ordinal)&&things(this.mWorld).filter(e=>e.mEnemyVariant===kind&&e.Process&&!e.lanKillLogged&&!(e.mFlags&Thing.CThing.mFlag_DEAD)).length<(kind==='charger'?4:1))t.mEnemyVariant=kind;
  }return add.call(this,t);
 };
 const process=collection.Process;collection.Process=function(this:any):any{if(variantsWorld(this.mWorld)&&!hasFeature(this.mWorld,'native-bosses-v1'))processEmberZones(this.mWorld);return process.call(this);};
 const map=World.Map.CMap.prototype as any,draw=map.Draw;map.Draw=function(this:any,...args:any[]):any{if(variantsWorld(this.mWorld)&&!hasFeature(this.mWorld,'native-bosses-v1'))drawZones(this.mWorld);return draw.apply(this,args);};
 const creature=Thing.Creature.CThing_Creature.prototype as any,setState=creature.SetState;
 creature.SetState=function(this:any,state:any):any{
  if(this.mEnemyVariant&&this.mStateID==='State_VariantCharge'&&state!=='State_VariantCharge'){this.mVariantCooldown=this.mWorld.mTick+ticks(6);this.mVariantPhase='';}
  return setState.call(this,state);
 };
 for(const ctor of [Thing.Creature.CThing_Creature_Zombie,Thing.Creature.CThing_Creature_Devil]){
  const p=ctor.prototype as any,init=p.Process_Init,goto=p.State_GotoPlayer;
  p.Process_Init=function(this:any):any{const result=init.call(this);if(this.mEnemyVariant&&variantsWorld(this.mWorld)){this.mLife=this.mMaxLife=this.mMaxLife*(this.mEnemyVariant==='charger'?1.6:1.2);this.mScore=this.mEnemyVariant==='charger'?200:1500;this.mVariantCooldown=0;this.mXSI_Animation.mCollection=variantCollection(this.mEnemyVariant,!!this.mBossKind);this.mXSI_Animation.SetAnimation_FORCED('stand');}return result;};
  p.State_GotoPlayer=function(this:any):any{if(this.mEnemyVariant==='charger'&&beginCharge(this))return;if(this.mEnemyVariant==='priest'&&beginEmberCast(this))return;return goto.call(this);};
 }
 const devil=Thing.Creature.CThing_Creature_Devil.prototype as any,decision=devil.State_Attack_Decision;
 devil.State_Attack_Decision=function(this:any):boolean{return this.mEnemyVariant==='priest'?false:decision.call(this);};
 creature.State_VariantCharge_Init=function(this:any):void{this.ClearCollideCell();this.SetCollideDirection(this.mPosition,World.Map.CMap_Cell.mCollide_Creature);this.mBaseStateID='State_GotoPlayer';this.mVariantPhase='warning';this.mVariantTicks=ticks(.6);this.mChargeDistance=0;this.mXSI_Animation.SetAnimation('warning');};
 creature.State_VariantCharge=function(this:any):void{
  if(this.mVariantPhase==='warning'){skillPose(this,ticks(.6));if(--this.mVariantTicks<=0){this.mVariantPhase='charge';this.mXSI_Animation.SetAnimation('charge');}return;}
  if(this.mVariantPhase==='recovery'){skillPose(this,ticks(.8));if(--this.mVariantTicks<=0)this.SetState('State_GotoPlayer');return;}
  let stop=false;const w=this.mWorld;
  for(let i=0;i<3;i++){
   const step=Math.min(.08,4-this.mChargeDistance),x=this.mPosition.mX+this.mChargeX*step,y=this.mPosition.mY+this.mChargeY*step;
   if(blocked(w,x,y,this.mRadius,true)){stop=true;break;}
   const player=players(w).find(p=>Math.hypot(p.mPosition.mX-x,p.mPosition.mY-y)<=this.mRadius+p.mRadius);
   if(player){player.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(this,this.mDamage*1.5));stop=true;break;}
   this.ClearCollideCell();this.Move(position(x,y));this.SetCollideDirection(this.mPosition,World.Map.CMap_Cell.mCollide_Creature);this.mChargeDistance+=step;
   if(this.mChargeDistance>=4-1e-8){stop=true;break;}
  }
  this.mXSI_Animation.QAnimate(.85);
  if(stop){this.mVariantPhase='recovery';this.mVariantTicks=ticks(.8);this.mXSI_Animation.SetAnimation('recovery');}
 };
 creature.State_VariantCast_Init=function(this:any):void{this.mBaseStateID='State_GotoPlayer';this.mVariantTicks=ticks(.9);this.mXSI_Animation.SetAnimation('cast');};
 creature.State_VariantCast=function(this:any):void{skillPose(this,ticks(.9));if(--this.mVariantTicks<=0)this.SetState('State_GotoPlayer');};
 const kill=world.LogKill;world.LogKill=function(this:any,victim:any):any{
  if(!variantsWorld(this)||hasFeature(this,'native-bosses-v1')||!victim?.mEnemyVariant)return kill.call(this,victim);
  if(victim.mVariantDropLogged)return;victim.mVariantDropLogged=true;
  this.mUpgrades.enemyVariantState.zones=emberZones(this).filter(z=>z.caster!==victim.sUniqueID||this.mTick-z.born>=z.warning);
  if(victim.mEnemyVariant!=='charger')return kill.call(this,victim);
  const extra=random(100)<50,create=this._CreatePickup,own=Object.getOwnPropertyDescriptor(this,'_CreatePickup');let dropped=false;
  this._CreatePickup=function(this:any,p:any):void{if(!dropped){dropped=true;create.call(this,p);}};
  try{const result=kill.call(this,victim);if(extra&&!dropped)this._CreatePickup(victim.mPosition);return result;}
  finally{if(own)Object.defineProperty(this,'_CreatePickup',own);else delete this._CreatePickup;}
 };
}
