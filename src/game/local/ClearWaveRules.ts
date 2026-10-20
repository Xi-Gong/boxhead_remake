// CLEARABLE_WAVES: a finite objective inside the existing survival deadline, with no passive kill rewards.
import {balancedWave} from './BalanceRules.ts';
import {spawnIntervalSeconds} from './TimedWaveRules.ts';
export const CLEAR_WAVES_RULE='clearable-waves-v1';
export interface ClearWaveState {
  rule:typeof CLEAR_WAVES_RULE;
  zombies:number;devils:number;
  emittedZombies:number;emittedDevils:number;
  killedZombies:number;killedDevils:number;
}
/** Budget about 65% of unobstructed full-time arrivals, leaving time for aiming, travel and the final enemies. */
export function clearWaveBudget(wave:number,seconds:number,difficulty:number,devils:boolean,players:number):{zombies:number;devils:number}{
  let arrivals=3;
  for(const [fraction,progress] of [[.2,0],[.5,.2],[.3,.7]])arrivals+=Math.floor(seconds*25*fraction!/Math.ceil(25*spawnIntervalSeconds(difficulty,wave,progress!)));
  const tuning=balancedWave(wave,difficulty),team=players>1?1.35:1;
  return {zombies:Math.ceil(arrivals*.65*team),devils:devils&&tuning.Devil_Count>0?Math.ceil(seconds*25*.65*team/Math.max(50,tuning.Devil_SpawnRate)):0};
}
export function newClearWave(wave:number,seconds:number,difficulty:number,devils:boolean,players:number):ClearWaveState{
  return {rule:CLEAR_WAVES_RULE,...clearWaveBudget(wave,seconds,difficulty,devils,players),emittedZombies:0,emittedDevils:0,killedZombies:0,killedDevils:0};
}
export function clearWaveKeys(family:'Zombie'|'Devil'):{total:'zombies'|'devils';emitted:'emittedZombies'|'emittedDevils';killed:'killedZombies'|'killedDevils'}{
  return family==='Zombie'?{total:'zombies',emitted:'emittedZombies',killed:'killedZombies'}:{total:'devils',emitted:'emittedDevils',killed:'killedDevils'};
}
