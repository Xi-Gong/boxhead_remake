// ENDLESS_PVE: bounded-cost deterministic arithmetic, including waves beyond Number's exact XP sum range.
import { balancedWave } from './BalanceRules.ts';
export const ENDLESS_RULE='endless-pve-v1';
export const WEAPON_TIER_LIMIT=125;
export function endlessXpRequired(level:number):number {return 5*(1+Math.floor((Math.max(1,level)-1)/10));}
export function experienceBeforeLevel(level:number):bigint {
  const n=BigInt(Math.max(1,Math.floor(level)))-1n,q=n/10n,r=n%10n;
  return 25n*q*(q+1n)+5n*(q+1n)*r;
}
function integerSqrt(n:bigint):bigint {
  if(n<2n)return n;
  let x=1n<<BigInt(Math.ceil(n.toString(2).length/2)),next=(x+n/x)/2n;
  while(next<x){x=next;next=(x+n/x)/2n;}return x;
}
export function growthFromExperience(experience:bigint):{level:number;xp:number} {
  const value=experience<0n?0n:experience,q=(integerSqrt(1n+4n*value/25n)-1n)/2n;
  const left=value-25n*q*(q+1n),cost=5n*(q+1n),r=left/cost;
  return {level:Number(10n*q+r+1n),xp:Number(left%cost)};
}
export function endlessWave(wave:number,difficulty:number,fps=25){
  const w=Math.max(1,Math.floor(wave)),base=balancedWave(w,difficulty,fps);
  return {...base,Zombie_TotalCount:Math.min(10+5*(w-1),200),Devil_TotalCount:w===1?0:Math.min(1+Math.floor((w-2)/4),10)};
}
export function previousWaveExperience(wave:number,devils=true,players=2):bigint {
  const n=BigInt(Math.max(1,Math.floor(wave)))-1n,k=n<39n?n:39n;
  let xp=10n*k+5n*k*(k-1n)/2n+(n-k)*200n;
  if(devils){
    const m=n>0n?n-1n:0n,limited=m<40n?m:40n,q=limited/4n,r=limited%4n;
    xp+=5n*(2n*q*(q+1n)+r*(q+1n)+(m-limited)*10n);
  }
  return xp/BigInt(Math.max(1,Math.floor(players)));
}
export function endlessStartLevel(wave:number,devils=true,players=2):number {
  return growthFromExperience(previousWaveExperience(wave,devils,players)).level;
}
export function enemyGrowth(wave:number,devils:boolean,players:number):{health:number;damage:number} {
  const excess=Math.max(0,endlessStartLevel(wave,devils,players)-WEAPON_TIER_LIMIT);
  return {health:1+.02*excess,damage:1+.008*excess};
}
