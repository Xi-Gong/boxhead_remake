// Optional difficulty-waves-v1: difficulty changes enemies, never the chosen starting wave.
import {difficultyIndex} from './BalanceRules.ts';
export function difficultyEnemy(wave:number,difficulty:number,horde=false):{health:number;damage:number;movement:number;attack:number}{
 const d=difficultyIndex(difficulty),n=Math.max(0,Math.floor(wave)-1),ramp=Math.min(1,n/29);
 return {
  health:horde?(1+d*.01+d*.03*ramp)*(1+[0,.001,.002,.003][d]!*n):[1,1.08,1.16,1.25][d]!*(1+[0,.004,.008,.012][d]!*n),
  damage:[1,1.04,1.08,1.12][d]!*(1+[0,.002,.004,.006][d]!*n),
  movement:[1,1.03,1.06,1.09][d]!*(1+Math.min(.06,.0005*d*n)),
  attack:[1,1.04,1.08,1.12][d]!*(1+Math.min(.15,.001*d*n)),
 };
}
/** Gentle first waves, then a continuous thirty-wave ramp; no step at an arbitrary wave. */
export function hordeHealth(wave:number,devil:boolean,boss:boolean):number{
 const ramp=Math.min(1,Math.max(0,(wave-(boss?5:1))/30));
 return boss?.45+.35*ramp:devil?.85+.4*ramp:.38+.72*ramp;
}
