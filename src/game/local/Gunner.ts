import {flash} from '../../engine/runtime.ts';
import {getRandomState} from '../../engine/flash/rng.ts';
import {CMain,CSound,Thing,World} from '../packages.ts';
import {combatWorld,simplifiedWorld} from './CombatRules.ts';
import {gunnerCollection,installGunnerArt,ENEMY_GUNS} from './GunnerArt.ts';
import {livingWavePlayers} from './TimedWaves.ts';
import {variantSight} from './EnemyVariants.ts';
import {CThing_Shot_EnemyBullet} from './EnemyBullet.ts';
const ticks=(s:number)=>Math.ceil(CMain.mFPS*s);
export function gunnerIdentity(ordinal:number,seed=getRandomState()):{skin:number;gun:'pistol'|'uzi'|'shotgun'}{
 const value=(seed^Math.imul(ordinal,0x9e3779b1))>>>0;return {skin:value%4,gun:ENEMY_GUNS[Math.floor(value/4)%3]!};
}
export function beginGunnerAim(enemy:any):boolean{
 if(enemy.mCombatKind!=='gunner'||enemy.mWorld.mTick<(enemy.mCombatCooldown??0))return false;
 const p=livingWavePlayers(enemy.mWorld).filter(p=>{const d=p.mPosition.Distance2D(enemy.mPosition);return d>=2.7&&d<=8.5&&variantSight(enemy.mWorld,enemy.mPosition,p.mPosition);})
  .sort((a,b)=>a.mPosition.Distance2D(enemy.mPosition)-b.mPosition.Distance2D(enemy.mPosition))[0];if(!p)return false;
 const a=Math.atan2(p.mPosition.mY-enemy.mPosition.mY,p.mPosition.mX-enemy.mPosition.mX);enemy.mCombatAimX=Math.cos(a);enemy.mCombatAimY=Math.sin(a);enemy.mCombatAimRange=p.mPosition.Distance2D(enemy.mPosition);
 enemy.mAngle.__set__mAngle(a);enemy.SetState('State_CombatAim');return true;
}
function fire(enemy:any):void{
 const at=Thing.Creature.CThing_Creature_Player.prototype.GetWeaponPosition.call(enemy),a=enemy.mAngle.__get__mAngle(),gun=enemy.mGunnerWeapon;
 for(const offset of gun==='shotgun'?[-.16,0,.16]:[0])enemy.mThing_Collection.AddThing_Shot(new CThing_Shot_EnemyBullet(at.Clone(),new Thing.Math.CThing_Angle(a+offset),enemy,enemy.mDamage*(gun==='uzi'?.16:gun==='shotgun'?.2:.25)));
 const sound=CSound.mSamples['Weapon_'+(gun==='pistol'?'Pistol':gun==='uzi'?'UZI':'Shotgun')+'_Fire_wav'];if(sound)enemy.PlaySound(sound);
}
const views=new WeakMap<object,any>();
function drawAim(world:any):void{
 const enemies=(Object.values(world.mThing_Collection.mThings)as any[]).filter(e=>e.Process&&e.mLife>0&&e.mStateID==='State_CombatAim'&&e.mCombatPhase==='warning');if(!enemies.length)return;
 let mc=views.get(world);if(!mc){mc=world.createEmptyMovieClip('_EnemyAimArt',world.getNextHighestDepth());mc._visible=false;views.set(world,mc);}
 for(const e of enemies){
  mc.clear();const range=Math.min(9,e.mCombatAimRange+.8)*32,spread=e.mGunnerWeapon==='shotgun'?.16:0;mc.lineStyle(1.3,0xe47d57,90);
  for(const angle of spread?[-spread,0,spread]:[0])for(let d=20;d<range;d+=13){mc.moveTo(Math.cos(angle)*d,Math.sin(angle)*d);mc.lineTo(Math.cos(angle)*Math.min(range,d+7),Math.sin(angle)*Math.min(range,d+7));}
  mc.lineStyle(2,0xffb571,100);const r=6+3*(1-e.mCombatTicks/ticks(.6));mc.moveTo(-r,0);mc.lineTo(0,-r);mc.lineTo(r,0);mc.lineTo(0,r);mc.lineTo(-r,0);
  const p=world.GetScreenPosition(e.mPosition);world.bmCurrentDraw.draw(mc,new flash.geom.Matrix(e.mCombatAimX,e.mCombatAimY,-e.mCombatAimY,e.mCombatAimX,p.x,p.y-12),undefined,'normal',undefined,true);
 }
}
export function installGunner():void{
 installGunnerArt();const zombie=Thing.Creature.CThing_Creature_Zombie.prototype as any,init=zombie.Process_Init,goto=zombie.State_GotoPlayer;
 zombie.Process_Init=function(this:any):any{
  const result=init.call(this);if(this.mCombatKind!=='gunner'||!combatWorld(this.mWorld))return result;
  if(this.mGunnerSkin===undefined){const pick=gunnerIdentity(this.mWorld.mUpgrades.enemyVariantState.zombie);this.mGunnerSkin=pick.skin;this.mGunnerWeapon=pick.gun;}
  this.mLife=this.mMaxLife=this.mMaxLife*.9;this.mSpeed=Math.max(.055,Math.min(.11,this.mSpeed*1.1));this.mScore=250;this.mCombatCooldown=0;
  this.mXSI_Animation.mCollection=gunnerCollection(this.mGunnerSkin,this.mGunnerWeapon);this.mXSI_Animation.SetAnimation_FORCED('stand');return result;
 };
 zombie.State_GotoPlayer=function(this:any):any{if(beginGunnerAim(this))return;return goto.call(this);};
 const p=Thing.Creature.CThing_Creature.prototype as any;
 p.State_CombatAim_Init=function(this:any):void{this.mBaseStateID='State_GotoPlayer';this.mCombatPhase='warning';this.mCombatTicks=ticks(.6);this.mCombatShots=0;this.mXSI_Animation.SetAnimation('stand');};
 p.State_CombatAim=function(this:any):void{
  if(--this.mCombatTicks>0)return;
  if(this.mCombatPhase==='warning'){
   fire(this);this.mCombatShots=this.mGunnerWeapon==='uzi'?2:0;
   this.mCombatPhase=this.mCombatShots?'burst':'recovery';this.mCombatTicks=ticks(this.mCombatShots?.12:1.2);return;
  }
  if(this.mCombatPhase==='burst'){fire(this);if(--this.mCombatShots<=0)this.mCombatPhase='recovery';this.mCombatTicks=ticks(this.mCombatShots?.12:1.2);return;}
  this.mCombatCooldown=this.mWorld.mTick+ticks(1.8);this.SetState('State_GotoPlayer');
 };
 const map=World.Map.CMap.prototype as any,draw=map.Draw;map.Draw=function(this:any,...args:any[]):any{if(combatWorld(this.mWorld)&&!simplifiedWorld(this.mWorld))drawAim(this.mWorld);return draw.apply(this,args);};
}
