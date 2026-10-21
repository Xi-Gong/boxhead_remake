// ENEMY_VARIANTS: source ports remain unchanged. All authoritative state lives on snapshot-owned things.
import {DrawPrimitive,Thing,World} from '../packages.ts';
import {flash} from '../../engine/runtime.ts';
import {ENCHANT_COLOR,enchantmentDamage,enchantedAmmo,enchantedWeapon,persistentWeapon} from './EnchantmentRules.ts';
import {simplifiedWorld} from './CombatRules.ts';
import {variantsWorld} from './EnemyVariants.ts';
interface Emission {weapon?:any;things:any[]}
const emission=new WeakMap<object,Emission>();
function emitting(collection:any,context:Emission,fn:()=>any):any{
 const old=emission.get(collection);emission.set(collection,context);
 try{return fn();}finally{if(old)emission.set(collection,old);else emission.delete(collection);}
}
function mark(thing:any):void{thing.mEnchanted=true;if(thing.mEffect)thing.mEffect.mEnchanted=true;}
export function enchantSight(world:any,a:any,b:any):boolean{
 const n=Math.max(1,Math.ceil(a.Distance2D(b)/.1)),cells=world.mMap.mCells;
 for(let i=0;i<=n;i++){
  const c=cells[Math.floor(a.mY+(b.mY-a.mY)*i/n)]?.[Math.floor(a.mX+(b.mX-a.mX)*i/n)];
  if(!c||c.mCollide&World.Map.CMap_Cell.mCollide_StaticImpassable)return false;
 }return true;
}
export function installEnchantmentScope():void{
 const collection=Thing.CThing_Collection.prototype as any,add=collection.AddThing;
 collection.AddThing=function(this:any,t:any):any{
  const context=emission.get(this);
  if(context&&/CThing_(Shot_|Effect_Explosion|Object_(Barrel|Mine|ChargePack))/.test(t._CLASSID_)){
   mark(t);context.things.push(t);
  }return add.call(this,t);
 };
 // Wrap only concrete Fire implementations: Shotgun calls super.Fire before emitting its pellets.
 for(const ctor of Object.values(Thing.Weapon)as any[]){
  const p=ctor.prototype;if(!p||!Object.hasOwn(p,'Fire')||ctor===Thing.Weapon.CThing_Weapon)continue;
  const fire=p.Fire;
  p.Fire=function(this:any,...args:any[]):any{
   if(!variantsWorld(this.mWorld)||!enchantedWeapon(this))return fire.apply(this,args);
   const context:Emission={weapon:this,things:[]},damage=this.mDamage;
   if(typeof damage==='number')this.mDamage=damage*enchantmentDamage(this.mWorld);
   try{return emitting(this.mThing_Collection,context,()=>fire.apply(this,args));}
   finally{if(typeof damage==='number')this.mDamage=damage;for(const t of context.things)if(t.mEffect)mark(t.mEffect);}
  };
 }
 const weapon=Thing.Weapon.CThing_Weapon.prototype as any,decrement=weapon.DecrementAmmo,empty=weapon.EmptyWeapon;
 weapon.DecrementAmmo=function(this:any):any{
  const count=enchantedAmmo(this),result=decrement.call(this);
  if(count>0)this.mEnchantedAmmo=count-1;
  if(this.mAmmo<=0)delete this.mPersistentEnchantment;
  return result;
 };
 weapon.EmptyWeapon=function(this:any):any{const result=empty.call(this);if(this.mAmmo<=0){delete this.mEnchantedAmmo;delete this.mPersistentEnchantment;}return result;};
 // A red reward/upgrade replaces the thing, but a nonempty enchanted weapon keeps its identity.
 // Legacy peers still transfer only the recorded stock.
 const player=Thing.Creature.CThing_Creature_Player.prototype as any,addWeapon=player.AddWeapon;
 player.AddWeapon=function(this:any,name:any,...args:any[]):any{
  const old=this.mWeapons?.[name]?.mThing,count=enchantedAmmo(old),persistent=persistentWeapon(old),result=addWeapon.call(this,name,...args),w=this.mWeapons?.[name]?.mThing;
  if(w&&count!==0)w.mEnchantedAmmo=count;
  if(w&&persistent)w.mPersistentEnchantment=true;
  return result;
 };
 // Children already inherit the scaled parent damage. Propagate identity without scaling it again.
 const sources:[any,string[]][]=[
  [Thing.Effect.CThing_Effect_Explosion,['Process_Init']],
  [Thing.Shot.CThing_Shot_Grenade,['Process_Explode']],
  [Thing.Shot.CThing_Shot_Rocket,['Process_Explode']],
  [Thing.Shot.CThing_Shot_ClusterShell,['Process_Normal']],
  [Thing.Object.CThing_Object_Mine,['Process_Detonate']],
  [Thing.Object.CThing_Object_ChargePack,['Process_Detonate']],
  [Thing.Object.CThing_Object_Barrel,['ProcessAffects']],
 ];
 for(const [ctor,methods]of sources)for(const name of methods){
  const p=ctor.prototype,fn=p[name];p[name]=function(this:any,...args:any[]):any{
   return this.mEnchanted?emitting(this.mThing_Collection,{things:[]},()=>fn.apply(this,args)):fn.apply(this,args);
  };
 }
 // Repeat the authored query with earlier targets temporarily excluded. Walls/objects still terminate it.
 // Restore flags before returning; queued affects execute in the usual simulation phase.
 const collide=World.Map.CMap_Collide.prototype as any,line=collide.Collide_Line;
 collide.Collide_Line=function(this:any,shot:any,a:any,b:any,r:any,flags:any,mapOnly?:any):any{
  if(!shot.mEnchanted||mapOnly||shot._CLASSID_!=='CThing_Shot_Bullet')return line.call(this,shot,a,b,r,flags,mapOnly);
  const hidden:[any,number][]=[];
  try{
   const maximum=simplifiedWorld(shot.mWorld)?2:3;
   for(let n=0;n<maximum;n++){
    const hit=line.call(this,shot,a,b,r,flags,mapOnly),t=hit?.mThing;
    if(n===maximum-1||!t||!['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_))return hit;
    t.Affect(new Thing.Affect.CThing_Affect_Bullet(shot.mParent,shot,shot.mDamage,shot.mAngle));
    hidden.push([t,t.mAffectFlags]);t.mAffectFlags=0;
   }
  }finally{for(const [t,f]of hidden)t.mAffectFlags=f;}
 };
 // Explosion cover checks happen before queueing, including barrels which react without AffectThing.
 const thing=Thing.CThing.prototype as any,affect=thing.Affect;
 thing.Affect=function(this:any,a:any):any{
  if(a._CLASSID_==='CThing_Affect_Explosion'&&a.mAffector?.mEnchanted&&!enchantSight(this.mWorld,a.mAffector.mPosition,this.mPosition))return;
  return affect.call(this,a);
 };
 const explosion=Thing.Affect.CThing_Affect_Explosion.prototype as any,damage=explosion.AffectThing;
 explosion.AffectThing=function(this:any,t:any):any{
  if(!this.mAffector?.mEnchanted)return damage.call(this,t);
  if(!enchantSight(t.mWorld,this.mAffector.mPosition,t.mPosition))return 0;
  const d=t.mPosition.Distance2D(this.mAffector.mPosition)/this.mRange,before=this.mDamage;
  // An enchanted blast retains at least 75% of its boosted damage throughout its normal radius.
  if(!simplifiedWorld(t.mWorld)&&d>.75&&d<=1)this.mDamage*=1.5;
  try{return damage.call(this,t);}finally{this.mDamage=before;}
 };
 for(const ctor of [Thing.Shot.CThing_Shot_Bullet,Thing.Shot.CThing_Shot_Railgun]){
  const p=ctor.prototype,draw=p.Draw;p.Draw=function(this:any):any{
   if(!this.mEnchanted)return draw.call(this);
   DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch,this.mWorld.GetScreenPosition(this.mPosition),this.mWorld.GetScreenPosition(this.mDestination),ctor===Thing.Shot.CThing_Shot_Bullet?1:2,ENCHANT_COLOR,this.mAlpha);
  };
 }
 const fx=Thing.Effect.CThing_Effect_Explosion.prototype as any,drawExplosion=fx.Draw,frames=new WeakMap<object,any>();
 fx.Draw=function(this:any):any{
  const clip=this.mcDrawObject,original=clip?.bmObject;if(!this.mEnchanted||!original)return drawExplosion.call(this);
  let frame=frames.get(original);
  if(!frame){const bitmap=original.sBMD.clone();bitmap.applyFilter(bitmap,bitmap.rectangle,new flash.geom.Point(0,0),new flash.filters.ColorMatrixFilter([
   .85,0,.15,0,0, .25,.2,.1,0,0, .8,.1,.15,0,0, 0,0,0,1,0,
  ]));frame={...original,sBMD:bitmap};frames.set(original,frame);}
  clip.bmObject=frame;try{return drawExplosion.call(this);}finally{clip.bmObject=original;}
 };
 const hud=World.CHud.prototype as any,update=hud.UpdatePlayer,colors=new WeakMap<object,number>();
 hud.UpdatePlayer=function(this:any,p:any,...args:any[]):any{
  const result=update.call(this,p,...args),field=this.mcPlayers[p.mPlayerIndex]?.mcAmmo.tfAmount;
  if(field){if(!colors.has(field))colors.set(field,field.textColor);field.textColor=enchantedWeapon(p.mWeapon_Current)?ENCHANT_COLOR:colors.get(field);}
  return result;
 };
}
