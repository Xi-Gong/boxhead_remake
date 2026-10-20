// TIMED_REFERENCE_GROWTH: expected kills with unobstructed, continuously cleared spawns; never a kill quota.
import {balancedWave} from './BalanceRules.ts';
import {growthFromExperience} from './EndlessRules.ts';
import {spawnIntervalSeconds} from './TimedWaveRules.ts';
import {tieredGrowthFromExperience} from './TieredGrowthRules.ts';
export interface TimedGrowthConfig {seconds:number;difficulty:number;devils:boolean;players:number;bosses:boolean;tiered?:boolean}
/** Reference assumes survival through Boss time, without awarding an assumed Boss kill or doubled perk. */
export function timedWaveExperience(wave:number,config:TimedGrowthConfig):number{
  const {seconds,difficulty,devils,bosses}=config;
  if(bosses&&wave%5===0)return Math.floor((seconds+60)/2);
  let zombies=3;
  for(const [fraction,progress] of [[.2,0],[.5,.2],[.3,.7]]){
    const interval=Math.ceil(25*spawnIntervalSeconds(difficulty,wave,progress!));
    zombies+=Math.floor(seconds*25*fraction!/interval);
  }
  const tuning=balancedWave(wave,difficulty);
  const demons=devils&&tuning.Devil_Count>0?Math.floor(seconds*25/Math.max(50,tuning.Devil_SpawnRate)):0;
  return zombies+demons*5;
}
/** Cadences settle by wave 100. Sum that bounded prefix, then a five-wave repeating tail in closed form. */
export function timedPreviousExperience(wave:number,config:TimedGrowthConfig):bigint{
  const count=BigInt(Math.max(1,Math.floor(wave)))-1n,prefix=Number(count<100n?count:100n);
  let xp=0n;
  for(let n=1;n<=prefix;n++)xp+=BigInt(timedWaveExperience(n,config));
  const tail=count-BigInt(prefix);
  if(tail>0n){
    const bossCount=config.bosses?tail/5n:0n;
    xp+=(tail-bossCount)*BigInt(timedWaveExperience(101,config))+bossCount*BigInt(timedWaveExperience(105,config));
  }
  return xp/BigInt(Math.max(1,Math.floor(config.players)));
}
export function timedStartLevel(wave:number,config:TimedGrowthConfig):number{
  return (config.tiered?tieredGrowthFromExperience:growthFromExperience)(timedPreviousExperience(wave,config)).level;
}
