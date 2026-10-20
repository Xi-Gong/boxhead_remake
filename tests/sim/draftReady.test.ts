import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {beginWaveDraft,waveDraft,processWaveDraft} from '../../src/game/local/WaveDraft.ts';
import {queueDraftChoice} from '../../src/game/local/WaveDraftInput.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';

it('waits beyond the old deadline without a default or combat-side progress',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();noSpawn(g);beginWaveDraft(w);
 const before=capture(w),supply=w.mUpgrades.supplyState.nextDropTicks;
 g.tick(400);expect(w.mUpgrades.mLevelIndex).toBe(1);
 expect(waveDraft(w)!.round!.readyRule).toBe('draft-ready-v1');
 expect(waveDraft(w)!.round!.remainingTicks).toBe(0);
 expect(waveDraft(w)!.round!.confirmed).toEqual([false,false]);
 expect(capture(w).growth).toEqual(before.growth);expect(w.mUpgrades.supplyState.nextDropTicks).toBe(supply);g.quit();
});
it('retains one ready player through save/restore and awards both once across rollback',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();noSpawn(g);beginWaveDraft(w,2);
 waveDraft(w)!.round!.offers=[['damage','health','armor'],['damage','health','armor']];
 queueDraftChoice(w,0,0,1);g.tick(1);expect(waveDraft(w)!.round!.confirmed).toEqual([true,false]);
 const save=capture(w);expect(applyToWorld(w,save)).toBe(true);expect(waveDraft(w)!.round!.confirmed).toEqual([true,false]);
 g.tick(330);expect(w.mUpgrades.mLevelIndex).toBe(1);
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const finish=()=>{waveDraft(w)!.round!.confirmed[1]=true;processWaveDraft(w);};
 finish();const digest=simulationDigest(captureWorldSnap(w,ctx,false));
 expect(waveDraft(w)!.bonuses.map(b=>b.damage)).toEqual([2,2]);
 restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);finish();
 expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);
 expect(waveDraft(w)!.bonuses.map(b=>b.damage)).toEqual([2,2]);g.quit();
});
it('keeps the fire release guard, single-player confirmation, and rejects unsupported saves before mutation',()=>{
 const g=createHeadlessGame(),w=g.world();noSpawn(g);g.keyDown(KEYS.P1.FIRE);beginWaveDraft(w);g.tick(5);
 expect(waveDraft(w)!.round!.confirmed).toEqual([false]);const save=capture(w);
 g.keyUp(KEYS.P1.FIRE);g.tick(1);g.keyDown(KEYS.P1.FIRE);g.tick(1);
 expect(w.mUpgrades.mLevelIndex).toBe(2);g.quit();
 const legacy=createHeadlessGame({classicDraftReady:true}),before=capture(legacy.world());
 expect(applyToWorld(legacy.world(),save)).toBe(false);expect(capture(legacy.world())).toEqual(before);legacy.quit();
});
it('upgrades an old pending draft to explicit readiness without changing its offers or chosen players',()=>{
 const old=createHeadlessGame({mode:'Coop',classicDraftReady:true}),w0=old.world();beginWaveDraft(w0);
 waveDraft(w0)!.round!.confirmed[0]=true;waveDraft(w0)!.round!.remainingTicks=1;const save=capture(w0);old.quit();
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();expect(applyToWorld(w,save)).toBe(true);
 expect(waveDraft(w)!.round!.offers).toEqual(save.waveDraft!.round!.offers);
 expect(waveDraft(w)!.round!.confirmed).toEqual([true,false]);g.tick(10);
 expect(w.mUpgrades.mLevelIndex).toBe(1);expect(waveDraft(w)!.round!.remainingTicks).toBe(0);g.quit();
});
