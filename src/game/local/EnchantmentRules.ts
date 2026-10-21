// ENEMY_VARIANTS / PERSISTENT_ENCHANTMENT: old peers retain finite enchanted stock.
import {variantsWorld} from './EnemyVariants.ts';
import {infiniteGrowthWeapon} from './Net/Growth.ts';
import {netSession} from './Net/NetSession.ts';
import {CMain,Thing} from '../packages.ts';
import {simplifiedWorld} from './CombatRules.ts';
export const ENCHANT_COLOR=0xce8fff;
export const ENCHANT_DAMAGE=1.35;
export function enchantmentDamage(world:any):number{return simplifiedWorld(world)?1.15:ENCHANT_DAMAGE;}
export const ENCHANTMENT_RULE='persistent-enchantment-v1';
const classic=new WeakSet<object>();
/** Explicit historical fixture; never changes modern defaults. */
export function setClassicEnchantmentFixture(main:object):void{classic.add(main);}
export function persistentEnchantment(world:any):boolean{
 return variantsWorld(world)&&!classic.has(CMain._this)&&(!netSession()||netSession()?.startOpts?.cfg.enchantment===ENCHANTMENT_RULE);
}
export function persistentWeapon(weapon:any):boolean{return !!weapon?.mPersistentEnchantment&&weapon.mAmmo>0&&persistentEnchantment(weapon.mWorld);}
/** -1 represents an authored infinite-ammo weapon, never the finite 999999 sentinel. */
export function enchantedAmmo(weapon:any):number{
 if(persistentWeapon(weapon))return infiniteGrowthWeapon(weapon)?-1:weapon.mAmmo;
 return weapon?.mEnchantedAmmo===-1?-1:Math.max(0,Math.min(weapon?.mAmmo??0,weapon?.mEnchantedAmmo??0));
}
export function enchantedWeapon(weapon:any):boolean{const n=enchantedAmmo(weapon);return n===-1||n>0;}
export interface EnchantmentState{enchantedAmmo?:number;enchanted?:true}
export function captureEnchantment(weapon:any):EnchantmentState{
 const count=enchantedAmmo(weapon);
 return {...(count!==0?{enchantedAmmo:count}:{}),...(persistentWeapon(weapon)?{enchanted:true as const}:{})};
}
/** Restore old remaining stock as a weapon enchantment only in the newly negotiated rule. No refill. */
export function restoreEnchantment(weapon:any,state:EnchantmentState):void{
 delete weapon.mPersistentEnchantment;
 if(variantsWorld(weapon.mWorld)&&state.enchantedAmmo!==undefined)weapon.mEnchantedAmmo=state.enchantedAmmo;
 else delete weapon.mEnchantedAmmo;
 if(persistentEnchantment(weapon.mWorld)&&weapon.mAmmo>0&&(state.enchanted||enchantedWeapon(weapon)))weapon.mPersistentEnchantment=true;
}
export function canEnchant(player:any):boolean{
 const w=player?.mWeapon_Current;
 return !!w&&w.mNameID!=='fakewall'&&variantsWorld(player.mWorld)&&player.mLife>0&&!(player.mFlags&Thing.CThing.mFlag_DEAD)&&w.mAmmo>0
  &&(persistentEnchantment(player.mWorld)?!persistentWeapon(w):infiniteGrowthWeapon(w)?w.mEnchantedAmmo!==-1:enchantedAmmo(w)<w.mAmmo);
}
export function enchantHeldWeapon(player:any):boolean{
 if(!canEnchant(player))return false;
 const w=player.mWeapon_Current;w.mEnchantedAmmo=infiniteGrowthWeapon(w)?-1:w.mAmmo;
 if(persistentEnchantment(player.mWorld))w.mPersistentEnchantment=true;
 return true;
}
