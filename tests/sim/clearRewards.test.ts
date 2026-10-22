import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {timedWave} from '../../src/game/local/TimedWaves.ts';
import {waveDraft,processWaveDraft} from '../../src/game/local/WaveDraft.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {queueDraftCommand} from '../../src/game/local/WaveDraftInput.ts';
import {DRAFT_CONFIRM} from '../../src/game/local/WaveDraftRules.ts';
function clearOne(g:ReturnType<typeof createHeadlessGame>):void{
 const w=g.world(),c=timedWave(w)!.clear!;c.zombies=1;c.devils=0;
 const e:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.mLife=0;e.lanFatalSlot=0;w.LogKill(e);w.LogKill(e);w.mUpgrades.Process();
}
it('rewards only actual early clears with double percentages, while the deadline grants one survival reward and no passive XP',()=>{
 for(const early of [false,true]){const g=createHeadlessGame(),w=g.world();try{
  const before=capture(w).growth;if(early)clearOne(g);else{timedWave(w)!.remainingTicks=1;w.mUpgrades.Process();}
  const round=waveDraft(w)!.round!;expect(round.multiplier).toBe(early?2:1);expect(round.outcome).toBe(early?'clear':'survived');
  if(!early)expect(capture(w).growth).toEqual(before);else expect(w.mUpgrades.lanGrowth.players[0].level).toBeGreaterThan(before!.players[0].level);
  round.offers=[['dodge','health','damage']];queueDraftCommand(w,0,DRAFT_CONFIRM,round.wave);processWaveDraft(w);expect(waveDraft(w)!.bonuses[0].dodge).toBe(early?2:1);expect(w.mUpgrades.mLevelIndex).toBe(2);
 }finally{g.quit();}}
});
it('persists early-clear provenance, double reward and selected card through save/continue and rewards once across rollback',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  clearOne(g);const round=waveDraft(w)!.round!;round.offers=[['dodge','health','damage']];const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);expect(waveDraft(w)!.round).toEqual(saved.waveDraft!.round);
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const pick=()=>{queueDraftCommand(w,0,DRAFT_CONFIRM,1);processWaveDraft(w);};pick();expect(waveDraft(w)!.bonuses[0].dodge).toBe(2);const digest=simulationDigest(captureWorldSnap(w,ctx,false));
  restoreWorldSnap(w,slot,ctx);pick();expect(waveDraft(w)!.bonuses[0].dodge).toBe(2);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);processWaveDraft(w);expect(waveDraft(w)!.bonuses[0].dodge).toBe(2);
 }finally{g.quit();}
});
it('preserves the one-choice legacy early-clear rule without the new capability',()=>{
 const g=createHeadlessGame({classicFeatures:['clear-rewards-v1']});try{clearOne(g);expect(waveDraft(g.world())!.round!.multiplier).toBe(1);expect(waveDraft(g.world())!.round!.outcome).toBeUndefined();}finally{g.quit();}
});
