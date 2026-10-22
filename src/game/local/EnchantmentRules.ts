// ENEMY_VARIANTS / PERSISTENT_ENCHANTMENT: old peers retain finite enchanted stock.
import {variantsWorld} from './EnemyVariants.ts';
import {infiniteGrowthWeapon} from './Net/Growth.ts';
import {netSession} from './Net/NetSession.ts';
import {CMain,Thing} from '../packages.ts';
import {simplifiedWorld} from './CombatRules.ts';
import {hasFeature} from './ModernFeatures.ts';
import {draftBonuses,type WaveBonuses} from './WaveDraftRules.ts';
export const ENCHANT_COLOR=0xce8fff;
export const ENCHANT_DAMAGE=1.35;
export const SIMPLE_ENCHANT_DAMAGE=1.15;
export function enchantPowerEnabled(world:any):boolean{return hasFeature(world,'enchant-power-v1')&&durabilityEnabled(world);}
/** Growth affects the enchantment's extra damage, never the ordinary weapon or already emitted attacks. */
export function enchantmentDamage(world:any,index=0,bonus:Readonly<WaveBonuses>=draftBonuses(world,index)):number{
 if(!enchantPowerEnabled(world))return simplifiedWorld(world)?SIMPLE_ENCHANT_DAMAGE:ENCHANT_DAMAGE;
 const level=world?.mUpgrades?.lanGrowth?.players[index]?.level??1,x=.01*Math.max(0,level-1)+.10*(bonus.enchantPower??0);
 return 1+.15*(1+2*x/(2+x));
}
export const ENCHANTMENT_RULE='persistent-enchantment-v1';
const classic=new WeakSet<object>();
/** Explicit historical fixture; never changes modern defaults. */
export function setClassicEnchantmentFixture(main:object):void{classic.add(main);}
export function persistentEnchantment(world:any):boolean{
 return variantsWorld(world)&&!classic.has(CMain._this)&&(!netSession()||netSession()?.startOpts?.cfg.enchantment===ENCHANTMENT_RULE);
}
export function durabilityEnabled(world:any):boolean{return hasFeature(world,'enchant-durability-v1')&&persistentEnchantment(world);}
const budgets:Record<string,number>={pistol:60,uzi:120,shotgun:30,railgun:30,rocket:24,grenade:24,barrel:12,mine:12,chargepack:12};
export function durabilityMaximum(weapon:any,bonus:Readonly<WaveBonuses>=draftBonuses(weapon?.mWorld,weapon?.mParent?.mPlayerIndex??0)):number{
 const base=budgets[weapon?.mNameID]??0,level=weapon?.mWorld?.mUpgrades?.lanGrowth?.players[weapon?.mParent?.mPlayerIndex??0]?.level??1;
 const x=.01*Math.max(0,level-1)+.10*(bonus.endurance??0);return Math.floor(base*(1+2*x/(2+x)));
}
export function syncDurability(weapon:any):void{
 if(!durabilityEnabled(weapon?.mWorld)||weapon.mEnchantDurability===undefined)return;
 const maximum=durabilityMaximum(weapon),previous=weapon.mEnchantMaximum??maximum;
 if(weapon.mEnchantDurability>0)weapon.mEnchantDurability=Math.min(maximum,weapon.mEnchantDurability+Math.max(0,maximum-previous));
 weapon.mEnchantMaximum=maximum;
}
export function persistentWeapon(weapon:any):boolean{return !!weapon&&!durabilityEnabled(weapon.mWorld)&&!!weapon.mPersistentEnchantment&&weapon.mAmmo>0&&persistentEnchantment(weapon.mWorld);}
/** -1 represents an authored infinite-ammo weapon, never the finite 999999 sentinel. */
export function enchantedAmmo(weapon:any):number{
 if(durabilityEnabled(weapon?.mWorld))return Math.max(0,weapon.mEnchantDurability??0);
 if(persistentWeapon(weapon))return infiniteGrowthWeapon(weapon)?-1:weapon.mAmmo;
 return weapon?.mEnchantedAmmo===-1?-1:Math.max(0,Math.min(weapon?.mAmmo??0,weapon?.mEnchantedAmmo??0));
}
export function enchantedWeapon(weapon:any):boolean{const n=enchantedAmmo(weapon);return n===-1||n>0;}
export interface EnchantmentState{enchantedAmmo?:number;enchanted?:true;enchantDurability?:number;enchantMaximum?:number}
export function captureEnchantment(weapon:any):EnchantmentState{
 if(durabilityEnabled(weapon?.mWorld))return weapon?.mEnchantDurability!==undefined?{enchantDurability:weapon.mEnchantDurability,enchantMaximum:weapon.mEnchantMaximum??durabilityMaximum(weapon)}:{};
 const count=enchantedAmmo(weapon);
 return {...(count!==0?{enchantedAmmo:count}:{}),...(persistentWeapon(weapon)?{enchanted:true as const}:{})};
}
/** Restore old remaining stock as a weapon enchantment only in the newly negotiated rule. No refill. */
export function restoreEnchantment(weapon:any,state:EnchantmentState):void{
 delete weapon.mPersistentEnchantment;
 if(durabilityEnabled(weapon.mWorld)){
  const maximum=durabilityMaximum(weapon);
  weapon.mEnchantDurability=state.enchantDurability!==undefined?Math.max(0,Math.min(maximum,state.enchantDurability))
   :state.enchanted&&weapon.mAmmo>0?maximum:Math.max(0,Math.min(maximum,state.enchantedAmmo===-1?maximum:state.enchantedAmmo??0));
  weapon.mEnchantMaximum=state.enchantMaximum??maximum;delete weapon.mEnchantedAmmo;syncDurability(weapon);return;
 }
 if(variantsWorld(weapon.mWorld)&&state.enchantedAmmo!==undefined)weapon.mEnchantedAmmo=state.enchantedAmmo;
 else delete weapon.mEnchantedAmmo;
 if(persistentEnchantment(weapon.mWorld)&&weapon.mAmmo>0&&(state.enchanted||enchantedWeapon(weapon)))weapon.mPersistentEnchantment=true;
}
export function canEnchant(player:any):boolean{
 const w=player?.mWeapon_Current;
 return !!w&&w.mNameID!=='fakewall'&&variantsWorld(player.mWorld)&&player.mLife>0&&!(player.mFlags&Thing.CThing.mFlag_DEAD)&&(durabilityEnabled(player.mWorld)||w.mAmmo>0)
  &&(durabilityEnabled(player.mWorld)?enchantedAmmo(w)<durabilityMaximum(w):true)
  &&(persistentEnchantment(player.mWorld)?!persistentWeapon(w):infiniteGrowthWeapon(w)?w.mEnchantedAmmo!==-1:enchantedAmmo(w)<w.mAmmo);
}
export function enchantHeldWeapon(player:any):boolean{
 if(!canEnchant(player))return false;
 if(durabilityEnabled(player.mWorld)){const w=player.mWeapon_Current;w.mEnchantDurability=w.mEnchantMaximum=durabilityMaximum(w);delete w.mPersistentEnchantment;delete w.mEnchantedAmmo;return true;}
 const w=player.mWeapon_Current;w.mEnchantedAmmo=infiniteGrowthWeapon(w)?-1:w.mAmmo;
 if(persistentEnchantment(player.mWorld))w.mPersistentEnchantment=true;
 return true;
}
