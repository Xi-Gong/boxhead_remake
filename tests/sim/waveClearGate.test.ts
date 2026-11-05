import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS,type HeadlessGame} from './harness.ts';
import {CMain} from '../../src/game/packages.ts';
import {beginWaveDraft,processWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {DRAFT_CONTINUE,DRAFT_CONFIRM,encodeDraftChoice,encodeDraftSelection,copyWaveDraft} from '../../src/game/local/WaveDraftRules.ts';
import {queueDraftCommand,draftSampleBits} from '../../src/game/local/WaveDraftInput.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {validRunSnapshot} from '../../src/game/local/ResumeValidation.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {predictedRemoteBits} from '../../src/game/local/Net/Rollback.ts';

function step(g:HeadlessGame,n=1):void{for(let i=0;i<n;i++){CMain.mInput.ProcessAllKeys();processWaveDraft(g.world());}}
function tap(g:HeadlessGame,key:number):void{g.keyDown(key);CMain.mInput.ProcessAllKeys();g.keyUp(key);CMain.mInput.ProcessAllKeys();step(g);}
function enter(g:HeadlessGame):void{
 const w=g.world(),r=waveDraft(w)!.round!;step(g,r.intro!.remainingTicks);step(g);
 for(let i=0;i<r.offers.length;i++){queueDraftCommand(w,i,DRAFT_CONTINUE,r.wave,'intro');step(g);}
 expect(waveDraft(w)!.round!.intro).toBeUndefined();step(g);
}

it.each([0,1,2]as const)('cannot skip any of the three seconds or carry countdown input into the next stage (speed=%s)',gameSpeed=>{
 const g=createHeadlessGame({options:{gameSpeed}}),w=g.world();try{
  g.keyDown(KEYS.P1.FIRE);beginWaveDraft(w);const r=waveDraft(w)!.round!,ticks=Math.ceil(CMain.mFPS*3);expect(r.intro!.remainingTicks).toBe(ticks);
  for(let i=0;i<ticks;i++){
   queueDraftCommand(w,0,DRAFT_CONTINUE,r.wave,'intro');queueDraftCommand(w,0,DRAFT_CONFIRM,r.wave,'choices');step(g);
   expect(r.intro!.remainingTicks).toBe(ticks-i-1);expect(r.intro!.entered).toEqual([false]);expect(r.confirmed).toEqual([false]);
  }
  step(g,3);expect(r.intro!.entered).toEqual([false]);expect(r.armed).toEqual([false]);
  g.keyUp(KEYS.P1.FIRE);step(g);expect(r.armed).toEqual([true]);
  tap(g,KEYS.P1.FIRE);expect(r.intro).toBeUndefined();expect(r.chosen).toEqual([false]);expect(r.confirmed).toEqual([false]);expect(r.armed).toEqual([false]);
  // A command cannot masquerade as a neutral release and arm itself.
  queueDraftCommand(w,0,DRAFT_CONFIRM,r.wave,'choices');step(g);expect(r.armed).toEqual([false]);expect(r.confirmed).toEqual([false]);
  step(g);queueDraftCommand(w,0,DRAFT_CONFIRM,r.wave,'choices');step(g);expect(r.confirmed).toEqual([false]);
  queueDraftCommand(w,0,encodeDraftSelection(1),r.wave,'choices');step(g);expect(r.chosen).toEqual([true]);
  const reward=r.offers[0]![1]!;queueDraftCommand(w,0,DRAFT_CONFIRM,r.wave,'choices');step(g);
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.round).toBeUndefined();expect(waveDraft(w)!.lastRewardWave).toBe(1);
  if(reward!=='heal'&&reward!=='ammo')expect(waveDraft(w)!.bonuses[0][reward]).toBe(1);
 }finally{g.quit();}
});

it('waits independently for both players and preserves adjacent short taps with an explicit first selection',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();try{
  beginWaveDraft(w,2,'clear');const r=waveDraft(w)!.round!;step(g,r.intro!.remainingTicks);step(g);
  tap(g,KEYS.P1.FIRE);expect(r.intro!.entered).toEqual([true,false]);step(g,300);expect(r.intro!.entered).toEqual([true,false]);
  tap(g,KEYS.P2.FIRE);expect(r.intro).toBeUndefined();expect(r.chosen).toEqual([false,false]);step(g);
  tap(g,KEYS.P1.DOWN);expect(r.selected).toEqual([0,0]);expect(r.chosen).toEqual([true,false]);
  tap(g,KEYS.P1.DOWN);expect(r.selected).toEqual([1,0]);tap(g,KEYS.P2.UP);expect(r.selected).toEqual([1,2]);
  tap(g,KEYS.P1.FIRE);expect(r.confirmed).toEqual([true,false]);step(g,350);expect(r.confirmed).toEqual([true,false]);
  tap(g,KEYS.P2.FIRE);expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.lastRewardWave).toBe(1);
 }finally{g.quit();}
});

it('rejects stale confirmed-UI commands from the other stage and never accepts legacy click-to-confirm in the new gate',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  beginWaveDraft(w);const r=waveDraft(w)!.round!;step(g,r.intro!.remainingTicks);step(g);
  queueDraftCommand(w,0,encodeDraftSelection(2),r.wave,'choices');step(g);expect(r.intro).toBeDefined();
  queueDraftCommand(w,0,DRAFT_CONTINUE,r.wave,'intro');queueDraftCommand(w,0,DRAFT_CONFIRM,r.wave,'intro');step(g);
  expect(r.intro).toBeUndefined();step(g);expect(r.confirmed).toEqual([false]);expect(r.chosen).toEqual([false]);
  queueDraftCommand(w,0,encodeDraftChoice(2),r.wave,'choices');step(g);expect(r.confirmed).toEqual([false]);expect(r.chosen).toEqual([false]);
  queueDraftCommand(w,0,encodeDraftSelection(2),r.wave,'intro');step(g);expect(r.chosen).toEqual([false]);
  queueDraftCommand(w,0,encodeDraftSelection(2),r.wave,'choices');step(g);expect(r.chosen).toEqual([true]);expect(r.confirmed).toEqual([false]);
  expect(draftSampleBits(w,16,0)).toBe(16);expect(draftSampleBits(w,0,16)).toBe(DRAFT_CONFIRM);
 }finally{g.quit();}
});

it('deep-copies and restores countdown/entry state and replays countdown ticks exactly across rollback',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();try{
  beginWaveDraft(w,2,'boss');const r=waveDraft(w)!.round!;step(g,7);const saved=capture(w),copied=copyWaveDraft(waveDraft(w))!;
  copied.round!.intro!.remainingTicks=0;copied.round!.intro!.entered[0]=true;copied.round!.chosen![0]=true;
  expect(r.intro!.remainingTicks).toBe(Math.ceil(CMain.mFPS*3)-7);expect(r.intro!.entered).toEqual([false,false]);expect(r.chosen).toEqual([false,false]);
  expect(validRunSnapshot(saved)).toBe(true);expect(applyToWorld(w,saved)).toBe(true);expect(capture(w).waveDraft).toEqual(saved.waveDraft);
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};step(g,3);
  const after=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,slot,ctx);step(g,3);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(after);
  step(g,waveDraft(w)!.round!.intro!.remainingTicks);step(g);queueDraftCommand(w,0,DRAFT_CONTINUE,r.wave,'intro');step(g);
  const partial=capture(w);expect(partial.waveDraft!.round!.intro!.entered).toEqual([true,false]);expect(applyToWorld(w,partial)).toBe(true);expect(capture(w).waveDraft).toEqual(partial.waveDraft);
 }finally{g.quit();}
});

it('rejects malformed gated state and unsupported gated saves before mutating any world',()=>{
 const g=createHeadlessGame(),w=g.world();let saved:any;try{
  beginWaveDraft(w);saved=capture(w);const before=capture(w);
  const variants=[(s:any)=>s.waveDraft.round.intro.remainingTicks=-1,(s:any)=>s.waveDraft.round.intro.remainingTicks=151,
   (s:any)=>s.waveDraft.round.intro.entered.push(false),(s:any)=>s.waveDraft.round.chosen=[],(s:any)=>s.waveDraft.round.confirmed[0]=true,
   (s:any)=>delete s.waveDraft.round.readyRule,(s:any)=>s.waveDraft.round.intro.entered[0]=true];
  for(const mutate of variants){const s=structuredClone(saved);mutate(s);expect(validRunSnapshot(s)).toBe(false);expect(applyToWorld(w,s)).toBe(false);expect(capture(w)).toEqual(before);}
 }finally{g.quit();}
 const legacy=createHeadlessGame({classicFeatures:['wave-clear-gate-v1']});try{
  const before=capture(legacy.world());saved.features=saved.features.filter((f:string)=>f!=='wave-clear-gate-v1');
  expect(applyToWorld(legacy.world(),saved)).toBe(false);expect(capture(legacy.world())).toEqual(before);
 }finally{legacy.quit();}
});

it('upgrades an already open legacy draft without rerolling or discarding its confirmed partner',()=>{
 const old=createHeadlessGame({mode:'Coop',classicFeatures:['wave-clear-gate-v1']});let saved:any;
 try{beginWaveDraft(old.world(),2,'clear');const r=waveDraft(old.world())!.round!;r.selected=[1,2];r.confirmed=[true,false];saved=capture(old.world());}finally{old.quit();}
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();try{
  expect(applyToWorld(w,saved)).toBe(true);const r=waveDraft(w)!.round!;expect(r.intro).toBeUndefined();expect(r.chosen).toEqual([true,false]);expect(r.selected).toEqual([1,2]);expect(r.offers).toEqual(saved.waveDraft.round.offers);
  step(g);tap(g,KEYS.P2.FIRE);expect(r.confirmed).toEqual([true,false]);tap(g,KEYS.P2.DOWN);expect(r.selected).toEqual([1,0]);expect(r.chosen).toEqual([true,true]);
  tap(g,KEYS.P2.FIRE);expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.lastRewardWave).toBe(1);
 }finally{g.quit();}
});

it('suppresses only actual draft action source frames during prediction, including a final READY into combat',()=>{
 const s=new NetSession(0,{send(){}});try{
  const wire=s as any;wire.remoteFrames.set(3,DRAFT_CONFIRM);s.tickMeta.set(3,{remoteBits:DRAFT_CONFIRM,predicted:false});
  const world:any={mUpgrades:{},Process(){}};
  s.executeWorldStep(world,3);expect(s.tickMeta.get(3).remoteDraftCommand).toBe(false);expect(predictedRemoteBits(wire,4)).toBe(DRAFT_CONFIRM);
  world.mUpgrades.waveDraft={round:{chosen:[true]}};world.Process=()=>{delete world.mUpgrades.waveDraft.round;};
  s.executeWorldStep(world,3);expect(s.tickMeta.get(3).remoteDraftCommand).toBe(true);expect(world.mUpgrades.waveDraft.round).toBeUndefined();expect(predictedRemoteBits(wire,4)).toBe(0);
  wire.remoteFrames.set(4,105);expect(predictedRemoteBits(wire,4)).toBe(105);
 }finally{s.dispose();}
});
