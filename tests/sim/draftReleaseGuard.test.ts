import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {beginWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {toggleStats,statsOpen} from '../../src/game/local/DraftStatsInput.ts';
for(const mode of ['Single','Coop']as const)for(const heldAtClose of [false,true])it(`${mode}: discards inspect-time confirmation edges (held at close: ${heldAtClose})`,()=>{
 const g=createHeadlessGame({mode}),w=g.world();try{
  noSpawn(g);beginWaveDraft(w);toggleStats(w,0);g.keyDown(KEYS.P1.FIRE);g.tick(2);expect(statsOpen(w,0)).toBe(true);expect(waveDraft(w)!.round!.confirmed.every(x=>!x)).toBe(true);
  if(!heldAtClose){g.keyUp(KEYS.P1.FIRE);g.tick(2);}toggleStats(w,0);g.tick(2);
  if(heldAtClose){g.keyUp(KEYS.P1.FIRE);g.tick(2);}expect(waveDraft(w)!.round?.confirmed).toEqual(mode==='Single'?[false]:[false,false]);
  g.keyDown(KEYS.P1.FIRE);g.tick(1);if(mode==='Single')expect(w.mUpgrades.mLevelIndex).toBe(2);else expect(waveDraft(w)!.round!.confirmed).toEqual([true,false]);
 }finally{g.quit();}
});
