import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,bossMembers} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';

it.each([0,1,2,3]as const)('difficulty %s reduces each family and Boss independently of count, growth and RNG',difficulty=>{
 for(const mode of ['Single','Coop']as const){
  const samples:any[][]=[];
  for(const modern of [false,true]){
   const g=createHeadlessGame({difficulty,mode,classicFeatures:modern?[]:['enemy-relief-v1']}),w=g.world();try{
    const rows=[];
    for(const wave of [1,11,36,1001,5,25,1000]){
     clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);
     for(const family of ['Zombie','Devil']as const){
      const e:any=new Thing.Creature['CThing_Creature_'+family](g.players()[0].mPosition.Clone());
      if(wave%5===0){e.mBossKind=family==='Zombie'?'zombie':'devil';e.mBossSlot=0;}
      w.mThing_Collection.AddThing(e);e.Process_Init();
      let step=0;
      if(family==='Zombie'){e.mXSI_Animation.Animate=(n:number)=>(step=n,false);e.State_Attack();}
      rows.push({family,boss:!!e.mBossKind,life:e.mMaxLife,damage:family==='Zombie'?e.mDamage:e.mAttackDamage,speed:e.mSpeed,step,
       objective:timedWave(w)?.clear,bosses:timedWave(w)?.boss?bossMembers(timedWave(w)!.boss!).length:0,rng:getRandomState()});
     }
    }samples.push(rows);
   }finally{g.quit();}
  }
  for(let i=0;i<samples[0]!.length;i++){
   const old=samples[0]![i],current=samples[1]![i],zombie=old.family==='Zombie';
   expect(current.life).toBeCloseTo(old.life*(old.boss?.6:zombie?.8:.7));
   expect(current.damage).toBeCloseTo(old.damage*(zombie?.85:1));expect(current.speed).toBeCloseTo(old.speed*(zombie?.88:1));
   if(zombie){expect(current.step).toBeCloseTo(old.step*.85);expect(current.step).toBeLessThanOrEqual(.85);}
   expect(current.objective).toEqual(old.objective);expect(current.bosses).toBe(old.bosses);expect(current.rng).toBe(old.rng);
  }
 }
});

it.each([0,1]as const)('migrates living native Boss HP once while retaining members, clocks and stock (devils=%s)',devils=>{
 const old=createHeadlessGame({mode:'Coop',classicFeatures:['enemy-relief-v1'],options:{devils}});let saved:any,oldMaximum=0;
 try{
  const w=old.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(25);
  for(let n=0;n<4;n++){w.mUpgrades.ProcessTimedSpawns();old.tick(1);}
  const living=old.things().filter(e=>e.Process&&e.mBossKind);expect(living).toHaveLength(4);
  oldMaximum=living[0].mMaxLife;for(const e of living)e.mLife=e.mMaxLife*.3;
  const state=timedWave(w)!;state.remainingTicks=1234;state.boss!.reinforcementTicks=21;
  const p=old.players()[0];p.mLife=101;p.mArmor=7;p.NewWeapon('shotgun');p.mWeapons.shotgun.mThing.mAmmo=6;
  saved=capture(w);
 }finally{old.quit();}
 const g=createHeadlessGame({mode:'Coop',options:{devils}});try{
  const w=g.world();expect(applyToWorld(w,saved)).toBe(true);expect(getRandomState()).toBe(saved.rngState);
  const state=timedWave(w)!;expect(state.remainingTicks).toBe(1234);expect(state.boss!.reinforcementTicks).toBe(21);expect(bossMembers(state.boss!)).toHaveLength(4);
  for(const [slot,m]of bossMembers(state.boss!).entries()){
   const e=w.mThing_Collection.mThings[m.id!];expect(e.mBossSlot).toBe(slot);expect(e.mMaxLife).toBeCloseTo(oldMaximum*.6);expect(e.mLife/e.mMaxLife).toBeCloseTo(.3);
   expect(e.mBossKind).toBe(devils?'devil':'zombie');expect(m.life).toBe(e.mLife);expect(m.maximum).toBe(e.mMaxLife);
  }
  const p=g.players()[0];expect([p.mLife,p.mArmor,p.mWeapons.shotgun.mThing.mAmmo]).toEqual([101,7,6]);
  const next=capture(w),hp=next.variants!.enemies.map(e=>[e.fields.mLife,e.fields.mMaxLife]);
  expect(applyToWorld(w,next)).toBe(true);expect(capture(w).variants!.enemies.map(e=>[e.fields.mLife,e.fields.mMaxLife])).toEqual(hp);
  expect(getRandomState()).toBe(next.rngState);
 }finally{g.quit();}
});
