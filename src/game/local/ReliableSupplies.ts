// RELIABLE_SUPPLIES: immutable capability; derived-stat queries must never refill a weapon.
import { syncVitals } from './SurvivalRules.ts';
import {combatWorld} from './CombatRules.ts';
export const REFILL_RULE = 'reliable-supplies-v1';
const worlds = new WeakSet<object>();
export function setReliableSupplies(world: object, enabled: boolean): void {
  if (enabled) worlds.add(world); else worlds.delete(world);
}
export function reliableSupplies(world: any): boolean { return worlds.has(world); }
export function syncSupplyWeapon(player: any, weapon: any, inherited = weapon.mTotalAmmo): void {
  const ammo = weapon.mAmmo;
  player.mWorld.mUpgrades.ApplyUpgrade_Weapon(weapon);
  if(!combatWorld(player.mWorld))weapon.mTotalAmmo = Math.max(weapon.mTotalAmmo, inherited ?? 0);
  weapon.mAmmo = combatWorld(player.mWorld)?Math.min(ammo,weapon.mTotalAmmo):ammo;
}
export function syncSupplyVitals(player: any): void { syncVitals(player, 'restore'); }
