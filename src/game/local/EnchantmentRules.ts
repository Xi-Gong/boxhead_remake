// ENEMY_VARIANTS: the unpublished enemy-variants-v1 rules include the priest's purple loot.
import {variantsWorld} from './EnemyVariants.ts';
import {infiniteGrowthWeapon} from './Net/Growth.ts';
import {Thing} from '../packages.ts';
export const ENCHANT_COLOR=0xce8fff;
export const ENCHANT_DAMAGE=1.35;
/** -1 represents an authored infinite-ammo weapon, never the finite 999999 sentinel. */
export function enchantedAmmo(weapon:any):number{return weapon?.mEnchantedAmmo===-1?-1:Math.max(0,Math.min(weapon?.mAmmo??0,weapon?.mEnchantedAmmo??0));}
export function enchantedWeapon(weapon:any):boolean{const n=enchantedAmmo(weapon);return n===-1||n>0;}
export function canEnchant(player:any):boolean{
 const w=player?.mWeapon_Current;
 return !!w&&w.mNameID!=='fakewall'&&variantsWorld(player.mWorld)&&player.mLife>0&&!(player.mFlags&Thing.CThing.mFlag_DEAD)&&w.mAmmo>0
  &&(infiniteGrowthWeapon(w)?w.mEnchantedAmmo!==-1:enchantedAmmo(w)<w.mAmmo);
}
export function enchantHeldWeapon(player:any):boolean{
 if(!canEnchant(player))return false;
 const w=player.mWeapon_Current;w.mEnchantedAmmo=infiniteGrowthWeapon(w)?-1:w.mAmmo;return true;
}
