// GROWING_SURVIVAL: immutable per-world capability; all mutable vitals live on snapshot-owned players.
import { draftBonuses,type WaveBonuses } from './WaveDraftRules.ts';
import {simplifiedWorld,simplifiedVitals,vitalityStep} from './CombatRules.ts';
import {TIERED_GROWTH_RULE,tieredLevelStats} from './TieredGrowthRules.ts';
import {hasFeature} from './ModernFeatures.ts';
import {percentStats,statPercent} from './PercentStats.ts';
export const SURVIVAL_RULE = 'survival-v1';
const worlds = new WeakSet<object>();
export function setSurvivalEnabled(world: object, enabled: boolean): void {
  if (enabled) worlds.add(world); else worlds.delete(world);
}
export function survivalEnabled(world: any): boolean { return worlds.has(world); }
function playerBaseMaximum(player: any,kind:'health'|'armor'): number {
  const growth=player.mWorld?.mUpgrades?.lanGrowth?.players[player.mPlayerIndex];
  const level=growth?.level??1;
  if(simplifiedWorld(player.mWorld))return simplifiedVitals(level)[kind];
  if(growth?.tiered===TIERED_GROWTH_RULE)return tieredLevelStats(level).vitality;
  return 200 + 4 * (Math.max(1, growth?.endless?level:Math.min(125,level)) - 1);
}
export function playerVitalPercent(player:any,kind:'health'|'armor',bonus:Readonly<WaveBonuses>):number{
 const n=statPercent(kind,bonus,playerBaseMaximum(player,'health')/160-1);
 return kind==='health'?n:Math.min(n,160*(1+statPercent('health',bonus,playerBaseMaximum(player,'health')/160-1))*.4/40-1);
}
export function playerMaximum(player:any,bonus:Readonly<WaveBonuses>=draftBonuses(player.mWorld,player.mPlayerIndex)):number {return percentStats(player.mWorld)?Math.round(160*(1+playerVitalPercent(player,'health',bonus))):Math.round(playerBaseMaximum(player,'health')*(1+vitalityStep(player.mWorld,'health')*bonus.health));}
export function playerArmorMaximum(player:any,bonus:Readonly<WaveBonuses>=draftBonuses(player.mWorld,player.mPlayerIndex)):number {
 if(percentStats(player.mWorld))return Math.min(Math.floor(40*(1+playerVitalPercent(player,'armor',bonus))),Math.floor(playerMaximum(player,bonus)*.4));
 if(hasFeature(player.mWorld,'fragile-armor-v1'))return Math.min(Math.floor(playerBaseMaximum(player,'health')*.25*(1+.06*bonus.armor)),Math.floor(playerMaximum(player,bonus)*.4));
 return Math.round(playerBaseMaximum(player,'armor')*(1+vitalityStep(player.mWorld,'armor')*bonus.armor));
}
export function syncVitals(player: any, mode: 'full' | 'restore' | 'level'): void {
  if (!survivalEnabled(player.mWorld)) return;
  const max = playerMaximum(player), previous = player.mMaxLife ?? 200;
  player.mMaxLife = max;
  if (mode === 'full') player.mLife = max;
  else if (mode === 'level' && player.mLife > 0) player.mLife = Math.min(max, player.mLife + max - previous);
}
export function settleVitals(world: any, restored: boolean): void {
  if (!survivalEnabled(world)) return;
  for (const player of Object.values(world.mThing_Collection.mPlayerThings)) syncVitals(player, restored ? 'restore' : 'full');
}
