import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {clearWaveCombat,timedWave,chooseTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {mapPacing,modernBudget} from '../../src/game/local/CombatPacing.ts';
import {combatWaveBudget} from '../../src/game/local/ClearWaveRules.ts';
import {timedWaveExperience,timedPreviousExperience,type TimedGrowthConfig} from '../../src/game/local/TimedGrowthRules.ts';
function verifyPacing(horde=false){
 for(let room=1;room<=18;room++)for(const difficulty of [0,1,2,3]as const){
  const g=createHeadlessGame({room,difficulty,classicFeatures:horde?[]:['horde-balance-v1']});try{
   const w=g.world(),profile=mapPacing(w),wave=[1,11,21,36][difficulty];clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);
   const s=timedWave(w)!;expect(s.totalTicks).toBe(profile.seconds*25);
   expect(s.clear).toMatchObject(combatWaveBudget(wave,profile.seconds,difficulty,true,1,horde));
   expect(modernBudget(w,wave,difficulty,true,1)).toEqual(combatWaveBudget(wave,profile.seconds,difficulty,true,1,horde));
   expect(chooseTimedSpawn(w,'Zombie')?.warning).toBe(false);
   w.mUpgrades.__set__mLevel(10);g.tick(12);expect(timedWave(w)!.boss!.members!.every(m=>m.id)).toBe(true);
  }finally{g.quit();}
 }
}
it('uses actual deadlines and reachable original entrances for every map and difficulty',()=>verifyPacing());
it('uses the revised sparse-to-horde objectives and reachable entrances on every map and difficulty',()=>verifyPacing(true));
it('allows two ordinary Boss reinforcements independently of the charger Boss slot',()=>{
 const g=createHeadlessGame({classicFeatures:['native-bosses-v1']}),w=g.world();try{
  clearWaveCombat(w);w.mUpgrades.__set__mLevel(5);const boss=timedWave(w)!.boss!;
  w.mUpgrades.ProcessTimedSpawns();g.tick(1);expect(boss.members![0].id).toBeTruthy();
  for(let n=0;n<5;n++){boss.reinforcementTicks=1;w.mUpgrades.ProcessTimedSpawns();g.tick(1);}
  const adds=g.things().filter(e=>e._CLASSID_==='CThing_Creature_Zombie'&&e.Process&&!e.mBossKind);
  expect(adds).toHaveLength(2);expect(adds.every(e=>!e.mEnemyVariant&&!e.mCombatKind)).toBe(true);expect(w.mUpgrades.Level.Zombie_Count).toBe(3);
 }finally{g.quit();}
});
it('uses the same objective for bounded selected-wave XP without assumed Boss kills',()=>{
 const c:TimedGrowthConfig={seconds:300,combatSeconds:85,difficulty:3,devils:true,players:1,bosses:true,tiered:true,clearable:true,combat:true,simplified:true};
 let total=0n;for(let wave=1;wave<=130;wave++){
  expect(timedPreviousExperience(wave,c)).toBe(total);
  const b=combatWaveBudget(wave,85,3,true,1),xp=timedWaveExperience(wave,c);
  expect(xp).toBe(wave%5?(b.zombies+5*b.devils)*2:Math.floor(115/3)*2);total+=BigInt(xp);
 }
 expect(timedPreviousExperience(Number.MAX_SAFE_INTEGER,c)).toBeGreaterThan(total);
});
