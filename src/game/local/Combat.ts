// Modern combat is installed before armor and lethal-hit ownership observers.
import {CMain,Thing,World} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {endlessConfigured} from './Endless.ts';
import {timedWavesConfigured} from './TimedWaves.ts';
import {draftReadyConfigured} from './WaveDraft.ts';
import {tieredGrowthConfigured} from './TieredGrowth.ts';
import {clearWavesConfigured} from './ClearWaves.ts';
import {COMBAT_RULE,combatWorld,shotgunFalloff} from './CombatRules.ts';
const classic=new WeakSet<object>();
export function setClassicCombatFixture(main:object):void{classic.add(main);}
export function combatConfigured():boolean{
 const s=netSession();return !classic.has(CMain._this)&&endlessConfigured()&&timedWavesConfigured()&&draftReadyConfigured()&&tieredGrowthConfigured()&&clearWavesConfigured()
  &&(!s||s.startOpts?.cfg.combat===COMBAT_RULE&&s.startOpts.cfg.variants==='enemy-variants-v1');
}
type Emission={kind:'shotgun'|'rocket';x?:number;y?:number;range?:number;things:any[]};
const emissions=new WeakMap<object,Emission>();
function emit(collection:any,context:Emission,fn:()=>any):any{
 const old=emissions.get(collection);emissions.set(collection,context);try{return fn();}finally{if(old)emissions.set(collection,old);else emissions.delete(collection);}
}
function mark(t:any,c:Emission):void{
 if(c.kind==='rocket'&&/^CThing_(Shot_|Effect_Explosion)/.test(t._CLASSID_)){t.mCombatRocket=true;if(t.mEffect)t.mEffect.mCombatRocket=true;}
 else if(t._CLASSID_==='CThing_Shot_Bullet'){t.mCombatShotgun=true;t.mCombatOriginX=c.x;t.mCombatOriginY=c.y;t.mCombatRange=c.range;}
}
export function installCombatScope():void{
 const hud=World.CHud.prototype as any,message=hud.AddMessage_Info;
 hud.AddMessage_Info=function(this:any,value:any,...args:any[]):any{
  if(combatWorld(this.mWorld)&&typeof value==='string')value=value.replace(/Double Ammo/g,'Capacity +50%').replace(/Quad Ammo/g,'Capacity +100%').replace(/Infinite Ammo/g,'Capacity +125%').replace(/Rapid Fire/g,'Controlled Fire +30%');
  return message.call(this,value,...args);
 };
 const u=World.CUpgrades.prototype as any,init=u.InitLists,level=u.__set__mLevel;
 u.InitLists=function(this:any):any{const result=init.call(this);if(combatConfigured())this.combat={rule:COMBAT_RULE};return result;};
 u.__set__mLevel=function(this:any,wave:number):any{
  const activate=this.combat?.pendingWave!==undefined&&wave>=this.combat.pendingWave;
  if(activate)delete this.combat.pendingWave;
  const result=level.call(this,wave);
  if(activate)for(const p of Object.values(this.mWorld.mThing_Collection?.mPlayerThings??{})as any[]){
   p.mLife=Math.min(p.mLife,p.mMaxLife);
   for(const e of p.mWeaponList??[])if(e.mActive&&e.mThing){const ammo=e.mThing.mAmmo;this.ApplyUpgrade_Weapon(e.mThing);e.mThing.mAmmo=Math.min(ammo,e.mThing.mTotalAmmo);}
  }return result;
 };
 const collection=Thing.CThing_Collection.prototype as any,add=collection.AddThing;
 collection.AddThing=function(this:any,t:any):any{const context=emissions.get(this);if(context){mark(t,context);context.things.push(t);}return add.call(this,t);};
 for(const [ctor,kind]of [[Thing.Weapon.CThing_Weapon_Shotgun,'shotgun'],[Thing.Weapon.CThing_Weapon_Rocket,'rocket']]as const){
  const p=ctor.prototype as any,fire=p.Fire;p.Fire=function(this:any,...args:any[]):any{
   if(!combatWorld(this.mWorld))return fire.apply(this,args);
   const c:Emission={kind,x:args[0]?.mX,y:args[0]?.mY,range:this.mRange,things:[]};
   try{return emit(this.mThing_Collection,c,()=>fire.apply(this,args));}finally{for(const t of c.things)mark(t,c);}
  };
 }
 for(const [ctor,name]of [[Thing.Effect.CThing_Effect_Explosion,'Process_Init'],[Thing.Shot.CThing_Shot_ClusterShell,'Process_Normal']]as const){
  const p=ctor.prototype,fn=p[name];p[name]=function(this:any,...args:any[]):any{
   return this.mCombatRocket&&combatWorld(this.mWorld)?emit(this.mThing_Collection,{kind:'rocket',things:[]},()=>fn.apply(this,args)):fn.apply(this,args);
  };
 }
 const blast=Thing.Affect.CThing_Affect_Explosion.prototype as any,affect=blast.AffectThing;
 blast.AffectThing=function(this:any,victim:any):any{
  if(!combatWorld(victim.mWorld)||!this.mAffector?.mCombatRocket||victim!==this.mOwner)return affect.call(this,victim);
  const damage=this.mDamage;this.mDamage*=.15;try{return affect.call(this,victim);}finally{this.mDamage=damage;}
 };
 const bullet=Thing.Affect.CThing_Affect_Bullet.prototype as any,hit=bullet.AffectThing;
 bullet.AffectThing=function(this:any,victim:any):any{
  const shot=this.mAffector;if(!combatWorld(victim.mWorld)||!shot?.mCombatShotgun)return hit.call(this,victim);
  const damage=this.mDamage;this.mDamage*=shotgunFalloff(Math.hypot(victim.mPosition.mX-shot.mCombatOriginX,victim.mPosition.mY-shot.mCombatOriginY),shot.mCombatRange);
  try{return hit.call(this,victim);}finally{this.mDamage=damage;}
 };
}
