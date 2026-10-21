// PERSISTENT_SUPPLIES: immutable capability + mutable, snapshot-owned simulation counters.
import { CMain } from '../packages.ts';
export const LOOT_RULE = 'supply-crates-v2';
export const SUPPLY_KINDS = ['armor', 'ammo', 'medical'] as const;
export const SIMPLE_SUPPLY_KINDS=['medical','armor','enchant','ammo'] as const;
export function simpleDevilSupply(roll:number){return SIMPLE_SUPPLY_KINDS[Math.min(3,Math.max(0,Math.floor(roll/25)))]!;}
export interface SupplyState { nextDropTicks: number; nextId: number }
const worlds = new WeakSet<object>();
export function modernLoot(world: any): boolean { return worlds.has(world); }
export function setModernLoot(world: any, enabled: boolean): void {
  if (enabled) {
    worlds.add(world);
    world.mUpgrades.supplyState ??= { nextDropTicks: CMain.mFPS * 20, nextId: 1 } satisfies SupplyState;
  } else worlds.delete(world);
}
export function supplyIdentity(world: any, prefix: 's' | 'r'): string {
  return prefix + (world.mUpgrades.supplyState as SupplyState).nextId++;
}
