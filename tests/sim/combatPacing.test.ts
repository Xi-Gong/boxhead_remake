import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {mapPacing,walkDistances} from '../../src/game/local/CombatPacing.ts';
import {timedWave,chooseTimedSpawn,attemptTimedSpawn,clearWaveCombat} from '../../src/game/local/TimedWaves.ts';
import {clearWaveBudget} from '../../src/game/local/ClearWaveRules.ts';
import {waveSeconds,COMBAT_ROOM_SECONDS} from '../../src/game/local/TimedWaveRules.ts';
import {balancedWave} from '../../src/game/local/BalanceRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';

it('sizes all eighteen maps around 90/120 seconds and cuts original objectives and concurrency by at least 60%',()=>{
 const report=[];
 for(let room=1;room<=18;room++){
  const g=createHeadlessGame({room}),w=g.world(),size=w.mMap.mSize,p=mapPacing(w);report.push({room,...p});
  expect(p.area).toBeGreaterThan(40);expect(p.entranceDistance).toBeGreaterThan(0);
  expect(p.seconds).toBeGreaterThanOrEqual(75);expect(p.seconds).toBeLessThanOrEqual(105);
  expect(p.seconds).toBe(COMBAT_ROOM_SECONDS[room-1]);
  for(const wave of [1,18,39]){
   clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);const s=timedWave(w)!,old=clearWaveBudget(wave,waveSeconds(size.x,size.y),0,true,1);
   expect(s.totalTicks).toBe(p.seconds*25);expect(s.clear!.zombies).toBe(Math.floor(old.zombies*.4));
   expect(w.mUpgrades.Level.Zombie_Count).toBe(Math.floor(balancedWave(wave,0).Zombie_Count*.4));
   const choice=chooseTimedSpawn(w,'Zombie');expect(choice?.warning).toBe(false);expect(w.mSpawnPoint_Zombie).toContain(choice?.point);
  }
  w.mUpgrades.__set__mLevel(5);expect(timedWave(w)!.totalTicks).toBe((p.seconds+30)*25);g.quit();
 }
 console.log('map pacing',JSON.stringify(report));
 const g=createHeadlessGame({difficulty:3}),w=g.world();w.mUpgrades.__set__mLevel(39);expect(w.mUpgrades.Level.Zombie_Count).toBe(22);g.quit();
});
it('defers blocked/near entrances with no ground fallback or stored arrival burst',()=>{
 const g=createHeadlessGame({room:18}),w=g.world(),state=timedWave(w)!;
 const reachable=walkDistances(w,g.players().map(p=>p.mPosition));expect(reachable.size).toBeGreaterThan(400);
 w.mSpawnPoint_Zombie=[];expect(chooseTimedSpawn(w,'Zombie')).toBeUndefined();
 for(let i=0;i<200;i++)w.mUpgrades.Process();expect(state.warnings).toEqual([]);expect(state.clear!.emittedZombies).toBe(0);g.quit();
});
it('preserves entrance rotation, deadline and objective across saves/rollback; old combat migrates at next wave',()=>{
 const g=createHeadlessGame(),w=g.world();attemptTimedSpawn(w,'Zombie');g.tick(1);const saved=capture(w),ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const run=()=>{for(let i=0;i<5;i++)attemptTimedSpawn(w,'Zombie');};run();const digest=simulationDigest(captureWorldSnap(w,ctx,false));
 restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);run();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);
 expect(applyToWorld(w,saved)).toBe(true);expect(timedWave(w)!.totalTicks).toBe(saved.timedWave!.totalTicks);expect(timedWave(w)!.entranceCursor).toBe(saved.timedWave!.entranceCursor);g.quit();
 const old=createHeadlessGame({classicCombat:true}),legacy=capture(old.world());old.quit();
 const modern=createHeadlessGame(),mw=modern.world();expect(applyToWorld(mw,legacy)).toBe(true);expect(timedWave(mw)!.totalTicks).toBe(4500);
 mw.mUpgrades.__set__mLevel(2);expect(timedWave(mw)!.totalTicks).toBe(mapPacing(mw).seconds*25);modern.quit();
});
