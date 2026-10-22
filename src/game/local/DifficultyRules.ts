// Optional difficulty-waves-v1: difficulty changes enemies, never the chosen starting wave.
import {difficultyIndex} from './BalanceRules.ts';
export function difficultyEnemy(wave:number,difficulty:number):{health:number;damage:number;movement:number;attack:number}{
 const d=difficultyIndex(difficulty),n=Math.max(0,Math.floor(wave)-1);
 return {
  health:[1,1.08,1.16,1.25][d]!*(1+[0,.004,.008,.012][d]!*n),
  damage:[1,1.04,1.08,1.12][d]!*(1+[0,.002,.004,.006][d]!*n),
  movement:[1,1.03,1.06,1.09][d]!*(1+Math.min(.06,.0005*d*n)),
  attack:[1,1.04,1.08,1.12][d]!*(1+Math.min(.15,.001*d*n)),
 };
}
