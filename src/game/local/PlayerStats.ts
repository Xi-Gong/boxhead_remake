// Values captured from actual derived stats, never a second implementation of the balance formulas.
import {CMain} from '../packages.ts';
import {armorMaximum} from './Supplies.ts';
import {xpRequired,infiniteGrowthWeapon,modernWeaponProjection} from './Net/Growth.ts';
import {combatWorld,passiveBonuses} from './CombatRules.ts';
import type {WaveBonuses,Reward} from './WaveDraftRules.ts';
import {enchantedWeapon} from './EnchantmentRules.ts';
export interface PlayerStats {
 index:number;level:number;xp:number;required:number;life:number;maximum:number;armor:number;armorMaximum:number;
 speed:number;damage:number;rate:number;ammo:number;capacity:number;capacityBase:number;infinite:boolean;weapon:string;enchanted:boolean;
 penetration:number;supply:number;bonuses:WaveBonuses;
 previews?:Partial<Record<Reward,number[]>>;
}
export function capturePlayerStats(world:any):PlayerStats[]{
 return (Object.values(world.mThing_Collection.mPlayerThings)as any[]).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex).map(p=>{
  const g=world.mUpgrades.lanGrowth?.players[p.mPlayerIndex],w=p.mWeapon_Current;
  const bonus=world.mUpgrades.waveDraft?.bonuses[p.mPlayerIndex]??{damage:0,health:0,armor:0,capacity:0};
  const projected=(kind:'damage'|'capacity'|'haste')=>[1,2].map(n=>{
   const next=modernWeaponProjection(world,p.mPlayerIndex,w._CLASSID_,{...bonus,[kind]:(bonus[kind]??0)+n});
   return next?kind==='haste'?CMain.mFPS/next.fireRate:next[kind]:0;
  });
  const passive=(kind:'mobility'|'penetration'|'scavenging')=>[1,2].map(n=>{
   const next=passiveBonuses({...bonus,[kind]:(bonus[kind]??0)+n});return 100*(kind==='mobility'?1+next.movement:kind==='penetration'?next.penetration:next.supply);
  });
  return {index:p.mPlayerIndex,level:g?.level??1,xp:g?.xp??0,required:g?xpRequired(g):0,
   life:p.mLife,maximum:p.mMaxLife,armor:p.mArmor??0,armorMaximum:armorMaximum(p),speed:p.mSpeed,
   damage:w?.mDamage??0,rate:w?CMain.mFPS/Math.max(1,w.mFireRate):0,ammo:w?.mAmmo??0,capacity:w?.mTotalAmmo??0,
   capacityBase:(w?.mTotalAmmo??0)-(w?.mDraftCapacityBonus??0),infinite:w?infiniteGrowthWeapon(w):false,weapon:w?.mName??'None',enchanted:w?enchantedWeapon(w):false,penetration:p.mArmorPenetration??0,supply:p.mSupplyEfficiency??0,
   bonuses:{...bonus},...(combatWorld(world)&&w?{previews:{damage:projected('damage'),capacity:projected('capacity'),haste:projected('haste'),mobility:passive('mobility'),penetration:passive('penetration'),scavenging:passive('scavenging')}}:{})};
 });
}
