import {World} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {waveDraft} from './WaveDraft.ts';
import {installDraftStatsInput} from './DraftStatsInput.ts';
import {renderDraftWindow,hideDraftWindow} from './DraftWindow.ts';
import type {PlayerStats} from './PlayerStats.ts';
import {compactStat,type Reward} from './WaveDraftRules.ts';
const number=(n:number)=>compactStat(n);
const ammo=(n:number,infinite=false)=>infinite?'INF':number(n);
export function rewardPreview(stats:PlayerStats|undefined,reward:Reward,m:number):string{
 if(!stats)return 'Current stats will appear when confirmed';
 const b=stats.bonuses;
 if(reward==='damage')return `DAMAGE  ${number(stats.damage)}  >  ${number(stats.previews?.damage[m-1]??stats.damage/(1+.08*b.damage)*(1+.08*(b.damage+m)))}`;
 if(reward==='health')return `MAX HP  ${number(stats.maximum)}  >  ${number(stats.previews?.health?.[m-1]??stats.maximum/(1+.1*b.health)*(1+.1*(b.health+m)))}`;
 if(reward==='armor')return `MAX SHIELD  ${number(stats.armorMaximum)}  >  ${number(stats.previews?.armor?.[m-1]??stats.armorMaximum/(1+.1*b.armor)*(1+.1*(b.armor+m)))}`;
 if(reward==='haste')return `RATE  ${stats.rate.toFixed(1)}  >  ${(stats.previews?.haste?.[m-1]??stats.rate).toFixed(1)} per sec`;
 if(reward==='mobility')return `MOVEMENT  ${number(stats.speed/.16*100)}%  >  ${number(stats.previews?.mobility?.[m-1]??100)}%`;
 if(reward==='penetration')return `PIERCING  ${number(stats.penetration*100)}%  >  ${number(stats.previews?.penetration?.[m-1]??0)}%`;
 if(reward==='scavenging')return `SUPPLY EFFECT  +${number(stats.supply*100)}%  >  +${number(stats.previews?.scavenging?.[m-1]??0)}%`;
 if(reward==='endurance')return `ENCHANT SHOTS  ${number(stats.enchantMaximum??0)}  >  ${number(stats.previews?.endurance?.[m-1]??0)}`;
 if(reward==='enchantPower')return `BONUS  +${((stats.enchantDamage!-1)*100).toFixed(1)}%  >  +${(((stats.previews?.enchantPower?.[m-1]??stats.enchantDamage!)-1)*100).toFixed(1)}%`;
 if(reward==='capacity')return stats.infinite?'CAPACITY  /  FINITE WEAPONS':`CAPACITY  ${ammo(stats.capacity)}  >  ${ammo(stats.previews?.capacity[m-1]??stats.capacity+Math.floor(stats.capacityBase*.15*(b.capacity+m))-Math.floor(stats.capacityBase*.15*b.capacity))}`;
 if(reward==='heal')return `HP  ${number(stats.life)}  >  ${number(Math.min(stats.maximum,stats.life+stats.maximum*.35*m*(1+stats.supply)))}`;
 return stats.infinite?'RESTORE AMMO TO FINITE WEAPONS':`AMMO  ${ammo(stats.ammo)}  >  ${ammo(Math.min(stats.capacity,stats.ammo+Math.ceil(stats.capacity*.35*m*(1+stats.supply))))}`;
}
export function installWaveDraftUi():void{
 installDraftStatsInput();
 const hud=World.CHud.prototype as any,draw=hud.Draw;
 hud.Draw=function(this:any,...args:any[]):any{
  const result=draw.apply(this,args),session=netSession(),world=this.mWorld,state=session?session.confirmedWaveDraft:waveDraft(world);
  if(state?.round)renderDraftWindow(world,state,rewardPreview);else hideDraftWindow(world);return result;
 };
}
