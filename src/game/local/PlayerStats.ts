// Values captured from actual derived stats, never a second implementation of the balance formulas.
import {CMain} from '../packages.ts';
import {armorMaximum} from './Supplies.ts';
import {xpRequired,infiniteGrowthWeapon,modernWeaponProjection} from './Net/Growth.ts';
import {combatWorld,simplifiedWorld,passiveBonuses} from './CombatRules.ts';
import {playerMaximum,playerArmorMaximum,playerVitalPercent} from './SurvivalRules.ts';
import type {WaveBonuses,Reward} from './WaveDraftRules.ts';
import {enchantedWeapon,enchantedAmmo,durabilityEnabled,durabilityMaximum,enchantPowerEnabled,enchantmentDamage} from './EnchantmentRules.ts';
import {bindingsFor,type WeaponBindings} from './WeaponBindings.ts';
import {percentStats,statPercent,type PercentStat} from './PercentStats.ts';
export interface PlayerStats {
 index:number;level:number;xp:number;required:number;life:number;maximum:number;armor:number;armorMaximum:number;
 speed:number;damage:number;rate:number;ammo:number;capacity:number;capacityBase:number;infinite:boolean;weapon:string;enchanted:boolean;
 penetration:number;supply:number;bonuses:WaveBonuses;
 simplified?:true;
 weaponId?:string;bindings?:WeaponBindings;
 enchantDurability?:number;enchantMaximum?:number;enchantDamage?:number;
 previews?:Partial<Record<Reward,number[]>>;
 percentages?:Record<PercentStat,number>;
 percentagePreviews?:Partial<Record<PercentStat,number[]>>;
}
export function capturePlayerStats(world:any):PlayerStats[]{
 return (Object.values(world.mThing_Collection.mPlayerThings)as any[]).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex).map(p=>{
  const g=world.mUpgrades.lanGrowth?.players[p.mPlayerIndex],w=p.mWeapon_Current;
  const bonus=world.mUpgrades.waveDraft?.bonuses[p.mPlayerIndex]??{damage:0,health:0,armor:0,capacity:0};
  const simple=simplifiedWorld(world);
  const projected=(kind:'damage'|'capacity'|'haste')=>[1,2].map(n=>{
   const next=modernWeaponProjection(world,p.mPlayerIndex,w._CLASSID_,{...bonus,[kind]:(bonus[kind]??0)+n});
   return next?kind==='haste'?CMain.mFPS/next.fireRate:next[kind]:0;
  });
  const passive=(kind:'mobility'|'penetration'|'scavenging')=>[1,2].map(n=>{
   const next=passiveBonuses({...bonus,[kind]:(bonus[kind]??0)+n},percentStats(world));return 100*(kind==='mobility'?1+next.movement:kind==='penetration'?next.penetration:next.supply);
  });
  const percentages=(b:WaveBonuses):Record<PercentStat,number>=>{
   const weapon=w&&modernWeaponProjection(world,p.mPlayerIndex,w._CLASSID_,b);
   return {damage:weapon?.damageBonus??0,capacity:weapon?.capacityBonus??0,haste:weapon?.hasteBonus??0,
    health:playerVitalPercent(p,'health',b),armor:playerVitalPercent(p,'armor',b),
    mobility:statPercent('mobility',b),scavenging:statPercent('scavenging',b),dodge:statPercent('dodge',b),
    enchantPower:enchantmentDamage(world,p.mPlayerIndex,b)-1,endurance:statPercent('endurance',b,.01*Math.max(0,(g?.level??1)-1))};
  };
  const totals=percentStats(world)?percentages(bonus):undefined;
  return {index:p.mPlayerIndex,level:g?.level??1,xp:g?.xp??0,required:g?xpRequired(g):0,
   life:p.mLife,maximum:p.mMaxLife,armor:p.mArmor??0,armorMaximum:armorMaximum(p),speed:p.mSpeed,
   damage:w?.mDamage??0,rate:w?CMain.mFPS/Math.max(1,w.mFireRate):0,ammo:w?.mAmmo??0,capacity:w?.mTotalAmmo??0,
   capacityBase:(w?.mTotalAmmo??0)-(w?.mDraftCapacityBonus??0),infinite:w?infiniteGrowthWeapon(w):false,weapon:w?.mName??'None',enchanted:w?enchantedWeapon(w):false,penetration:p.mArmorPenetration??0,supply:p.mSupplyEfficiency??0,
   ...(totals?{percentages:totals,percentagePreviews:Object.fromEntries(Object.keys(totals).map(key=>[key,[1,2].map(n=>percentages({...bonus,[key]:(bonus[key]??0)+n})[key])]))}:{}),
   bonuses:{...bonus},...(durabilityEnabled(world)?{enchantDurability:enchantedAmmo(w),enchantMaximum:durabilityMaximum(w)}:{}),...(enchantPowerEnabled(world)?{enchantDamage:enchantmentDamage(world,p.mPlayerIndex)}:{}),...(world.mUpgrades.weaponBindings?{weaponId:w?.mNameID,bindings:{...bindingsFor(world,p.mPlayerIndex)}}:{}),...(simple?{simplified:true as const}:{}),...(combatWorld(world)&&w?{previews:{damage:projected('damage'),capacity:projected('capacity'),haste:projected('haste'),health:[1,2].map(n=>playerMaximum(p,{...bonus,health:bonus.health+n})),armor:[1,2].map(n=>playerArmorMaximum(p,{...bonus,armor:bonus.armor+n})),mobility:passive('mobility'),...(!simple?{penetration:passive('penetration')}:{}),...(durabilityEnabled(world)?{endurance:[1,2].map(n=>durabilityMaximum(w,{...bonus,endurance:(bonus.endurance??0)+n}))}:{}),...(enchantPowerEnabled(world)?{enchantPower:[1,2].map(n=>enchantmentDamage(world,p.mPlayerIndex,{...bonus,enchantPower:(bonus.enchantPower??0)+n}))}:{}),scavenging:passive('scavenging')}}:{})};
 });
}
