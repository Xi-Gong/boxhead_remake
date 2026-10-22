// TIMED_REFERENCE_GROWTH: legacy unobstructed arrivals or the negotiated finite objective; no assumed Boss kill.
import {balancedWave} from './BalanceRules.ts';
import {growthFromExperience} from './EndlessRules.ts';
import {spawnIntervalSeconds} from './TimedWaveRules.ts';
import {tieredGrowthFromExperience} from './TieredGrowthRules.ts';
import {clearWaveBudget,combatWaveBudget} from './ClearWaveRules.ts';
export interface TimedGrowthConfig {seconds:number;difficulty:number;devils:boolean;players:number;bosses:boolean;tiered?:boolean;clearable?:boolean;combat?:boolean;simplified?:boolean;combatSeconds?:number;horde?:boolean}
/** Reference assumes survival through Boss time, without awarding an assumed Boss kill or doubled perk. */
export function timedWaveExperience(wave:number,config:TimedGrowthConfig):number{
  const {seconds,difficulty,devils,bosses}=config;
  if(bosses&&wave%5===0)return Math.floor(config.combat?((config.combatSeconds??90)+30)/3:(seconds+60)/2)*(config.combat?2:1);
  if(config.clearable){const budgetSeconds=config.simplified?config.combatSeconds??seconds:seconds,b=(config.combat?combatWaveBudget:clearWaveBudget)(wave,budgetSeconds,difficulty,devils,config.players,config.horde);return (b.zombies+5*b.devils)*(config.combat?2:1);}
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
