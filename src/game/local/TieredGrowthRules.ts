// TIERED_GROWTH: fast opening, increasingly costly later levels, and stronger per-level stat rewards.
export const TIERED_GROWTH_RULE='tiered-growth-v1';
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
export function tieredXpRequired(level:number):number {
  const l=Math.max(1,Math.floor(level));
  return l<=10?2+Math.floor((l-1)/3):l<=30?6+Math.floor((l-11)/2):Number(20n+3n*(BigInt(l)-31n)>MAX?MAX:20n+3n*(BigInt(l)-31n));
}
const prefix=[0n];for(let level=1;level<=30;level++)prefix.push(prefix.at(-1)!+BigInt(tieredXpRequired(level)));
export function tieredExperienceBeforeLevel(level:number):bigint {
  const l=BigInt(Math.max(1,Math.floor(level))),n=l-1n;
  if(n<=30n)return prefix[Number(n)]!;
  const count=n-30n,linear=(MAX-20n)/3n+1n,m=count<linear?count:linear;
  return prefix[30]!+20n*m+3n*m*(m-1n)/2n+(count-m)*MAX;
}
export function tieredGrowthFromExperience(experience:bigint):{level:number;xp:number} {
  const value=experience<0n?0n:experience;let low=1n,high=MAX;
  while(low<high){const mid=(low+high+1n)/2n;if(tieredExperienceBeforeLevel(Number(mid))<=value)low=mid;else high=mid-1n;}
  const level=Number(low),left=value-tieredExperienceBeforeLevel(level);
  return {level,xp:Number(left>MAX?MAX:left)};
}
export function levelRewardTier(level:number):'BASIC'|'ADVANCED'|'ELITE' {return level<=10?'BASIC':level<=30?'ADVANCED':'ELITE';}
export function tieredLevelStats(level:number):{vitality:number;damage:number;capacity:number} {
  const levels=Math.max(0,Math.floor(level)-1),basic=Math.min(9,levels),middle=Math.min(20,Math.max(0,levels-9)),elite=Math.max(0,levels-29);
  return {vitality:200+4*basic+6*middle+10*elite,damage:.01*middle+.02*elite,capacity:.005*middle+.01*elite};
}
