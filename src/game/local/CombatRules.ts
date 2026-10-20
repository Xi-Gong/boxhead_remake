// Versioned modern PvE tuning. Pure arithmetic; no mutable caches or random draws.
import type {WaveBonuses} from './WaveDraftRules.ts';
export const COMBAT_RULE='combat-pve-v2';
export interface CombatState {rule:typeof COMBAT_RULE;pendingWave?:number}
export function combatWorld(world:any):boolean{return world?.mUpgrades?.combat?.rule===COMBAT_RULE&&world.mUpgrades.combat.pendingWave===undefined;}
export function diminishing(value:number,maximum=2):number{const n=Math.max(0,value);return maximum*n/(maximum+n);}
export function passiveBonuses(b:WaveBonuses):{movement:number;penetration:number;supply:number}{return {
 movement:diminishing(.04*(b.mobility??0),.25),penetration:diminishing(.12*(b.penetration??0),.6),supply:diminishing(.1*(b.scavenging??0),.6)};}
export function restoredSupply(maximum:number,efficiency:number,fraction=.4):number{return Math.ceil(maximum*fraction*(1+efficiency));}
export function shotgunFalloff(distance:number,range:number):number{return 1-.55*Math.max(0,Math.min(1,(distance/Math.max(.1,range)-.3)/.7));}
export function modernWeapon(raw:any,flags:any,stats:{damage:number;capacity:number},bonus:WaveBonuses,classID:string,_fps:number){
 const factor=flags?.FatalDamage?10:flags?.QuadDamage?4:flags?.DoubleDamage?2:1;
 const damage=(raw.mDamage??0)*factor*(1+stats.damage)*(1+.08*bonus.damage)*(classID==='CThing_Weapon_Shotgun'? .65:1);
 const ammunition=flags?.InfinateAmmo?1.25:flags?.QuadAmmo?1:flags?.DoubleAmmo? .5:0;
 const capacity=raw.mTotalAmmo===999999?999999:Math.floor(raw.mTotalAmmo*(1+diminishing(ammunition+stats.capacity+.08*bonus.capacity)));
 const limits:Record<string,number>={CThing_Weapon_Pistol:5,CThing_Weapon_UZI:8,CThing_Weapon_Shotgun:2.5,CThing_Weapon_Rocket:2,CThing_Weapon_Railgun:2.5};
 const base=raw.mFireRate*(classID==='CThing_Weapon_Railgun'?3:classID==='CThing_Weapon_Shotgun'||classID==='CThing_Weapon_Rocket'?1.5:1);
 // Keep authored tick periods independent of game-speed, like the original weapons.
 const fireRate=Math.max(limits[classID]?Math.round(25/limits[classID]!):2,Math.round(base/(1+(flags?.RapidFire? .3:0)+diminishing(.06*(bonus.haste??0),.75))));
 return {damage,capacity,fireRate};
}
