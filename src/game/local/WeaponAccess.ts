// Selection may inspect an unlocked empty gun; emission still uses its actual ammunition.
import {Thing} from '../packages.ts';
import {hasFeature} from './ModernFeatures.ts';
function selectable(player:any,fn:()=>any):any{
 const saved:Array<{gun:any;own:PropertyDescriptor|undefined}>=[];
 for(const entry of player.mWeaponList??[])if(entry.mActive&&entry.mThing){
  const gun=entry.mThing;saved.push({gun,own:Object.getOwnPropertyDescriptor(gun,'WeaponEmpty')});gun.WeaponEmpty=()=>false;
 }
 try{return fn();}finally{for(const {gun,own}of saved)if(own)Object.defineProperty(gun,'WeaponEmpty',own);else delete gun.WeaponEmpty;}
}
export function installWeaponAccess():void{
 const player=Thing.Creature.CThing_Creature_Player.prototype as any;
 for(const name of ['SelectWeapon','NextWeapon','PrevWeapon']){
  const original=player[name];player[name]=function(this:any,...args:any[]):any{
   return hasFeature(this.mWorld,'empty-weapons-v1')?selectable(this,()=>original.apply(this,args)):original.apply(this,args);
  };
 }
 const weapon=Thing.Weapon.CThing_Weapon.prototype as any,update=weapon.Update;
 weapon.Update=function(this:any,key:any):any{
  if(hasFeature(this.mWorld,'empty-weapons-v1')&&this.WeaponEmpty()){
   this.mWorld.mUpgrades.ApplyUpgrade_Weapon(this);
   if(this.WeaponEmpty()){
    this.mFire=false;this.mFireRateCount=Math.max(0,this.mFireRateCount-1);
    key?.IsPressed?.();key?.IsReleased?.();return;
   }
  }
  return update.call(this,key);
 };
}
