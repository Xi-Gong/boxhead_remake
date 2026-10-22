// Optional percent-stats-v1: additive percentage points, with one table for simulation and UI.
import type {WaveBonuses} from './WaveDraftRules.ts';
export const PERCENT_STATS={
 damage:{step:8,cap:900,label:'DAMAGE'},health:{step:8,cap:500,label:'MAX HP'},
 armor:{step:6,cap:150,label:'SHIELD'},capacity:{step:8,cap:200,label:'CAPACITY'},
 haste:{step:6,cap:75,label:'FIRE RATE'},mobility:{step:4,cap:25,label:'MOVEMENT'},
 scavenging:{step:10,cap:60,label:'SUPPLY'},endurance:{step:10,cap:200,label:'ENCHANT SHOTS'},
 enchantPower:{step:3,cap:45,label:'ENCHANT DAMAGE'},dodge:{step:3,cap:50,label:'DODGE'},
} as const;
export type PercentStat=keyof typeof PERCENT_STATS;
export function percentStats(world:any):boolean{return world?.mUpgrades?.combat?.rule==='combat-pve-v3'&&world.mUpgrades.combat.pendingWave===undefined&&!!world.mUpgrades.features?.includes('percent-stats-v1');}
/** Fractions inside the simulation; display converts once to percentage points. */
export function statPercent(key:PercentStat,bonus:Readonly<WaveBonuses>,automatic=0):number{
 const s=PERCENT_STATS[key];return Math.min(s.cap/100,Math.max(0,automatic+s.step/100*(bonus[key]??0)));
}
export function percentText(value:number):string{return (Math.round(value*1000)/10).toFixed(1).replace(/\.0$/,'')+'%';}
