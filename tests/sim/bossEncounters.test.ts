import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {bossCount} from '../../src/game/local/BossWaves.ts';
import {clearWaveCombat,timedWave,copyTimedWave} from '../../src/game/local/TimedWaves.ts';
import {remainingEnemies} from '../../src/game/local/Net/EnemyCounts.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {waveDraft} from '../../src/game/local/WaveDraft.ts';
import {makeSnapCtx,captureWorldSnap,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {DrawPrimitive} from '../../src/game/packages.ts';

function encounter(wave=25,devils:0|1=1){
 const g=createHeadlessGame({room:18,options:{devils}}),w=g.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);
 const initialized=new Set();
 for(let tick=0;tick<250&&initialized.size<bossCount(wave);tick++){
  w.mUpgrades.Process();w.mTick++;
  for(const e of g.things().filter(t=>t.mBossKind&&!initialized.has(t))){e.Process_Init();e.SetState('State_GotoPlayer');initialized.add(e);}
 }
 const enemies=g.things().filter(t=>t.mBossKind).sort((a,b)=>a.mBossSlot-b.mBossSlot);expect(enemies).toHaveLength(bossCount(wave));
 return {g,w,enemies};
}
const kill=(w:any,e:any)=>{e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();w.mUpgrades.Process();};

it('bounds progressive encounters without per-wave loops and retains optional single-Boss semantics',()=>{
 expect([1,5,10,15,20,25,30,1000000].map(bossCount)).toEqual([0,1,1,2,2,3,3,3]);
 const g=createHeadlessGame({classicBossEncounters:true}),w=g.world();w.mUpgrades.__set__mLevel(25);
 expect(timedWave(w)!.boss!.members).toBeUndefined();expect(capture(w).bossEncounters).toBeUndefined();g.quit();
});
it.each([5,15,25])('spawns %s encounter members once, counts every Boss under DEVIL and limits ordinary adds',wave=>{
 const {g,w,enemies}=encounter(wave);try{
  const boss=timedWave(w)!.boss!;expect(boss.members).toHaveLength(bossCount(wave));
  expect(new Set(boss.members!.map(m=>m.id)).size).toBe(bossCount(wave));
  for(let i=0;i<250;i++){w.mUpgrades.Process();w.mTick++;}
  const adds=g.things().filter(e=>e._CLASSID_==='CThing_Creature_Zombie'&&!e.mBossKind);
  expect(adds).toHaveLength(4);expect(remainingEnemies(w)).toEqual({zombies:4,devils:enemies.length});
  if(enemies.length>1){kill(w,enemies[0]);expect(timedWave(w)!.phase).toBe('combat');expect(remainingEnemies(w).devils).toBe(enemies.length-1);
   for(let i=0;i<150;i++){w.mUpgrades.Process();w.mTick++;}
   expect(g.things().filter(e=>e._CLASSID_==='CThing_Creature_Zombie'&&!e.mBossKind)).toHaveLength(4);}
 }finally{g.quit();}
});
it('mixes skills in a multi-Boss encounter and keeps all Tyrants when ordinary devils are disabled',()=>{
 for(const devils of [0,1]as const){const {g,w,enemies}=encounter(25,devils);try{
  expect(enemies.map(e=>e.mBossKind)).toEqual(devils?['charger','priest','charger']:['charger','charger','charger']);
  expect(remainingEnemies(w).devils).toBe(3);
 }finally{g.quit();}}
});
it('only doubles the single draft reward after every Boss dies and rollback cannot award twice',()=>{
 const {g,w,enemies}=encounter();try{
  kill(w,enemies[0]);kill(w,enemies[1]);expect(waveDraft(w)!.round).toBeUndefined();
  const damage=waveDraft(w)!.bonuses[0].damage,ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const finish=()=>{kill(w,enemies[2]);expect(waveDraft(w)!.round!.multiplier).toBe(2);waveDraft(w)!.round!.remainingTicks=1;w.mUpgrades.Process();};
  finish();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,slot,ctx);finish();
  expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);expect(waveDraft(w)!.bonuses[0].damage).toBe(damage+2);
 }finally{g.quit();}
});
it('preserves individual HP, skill slots, dead members and pending spawns across saves without sharing metadata',()=>{
 const {g,w,enemies}=encounter();try{
  kill(w,enemies[0]);enemies[1].mLife=1234;enemies[2].mLife=2345;w.mUpgrades.Process();
  const original=capture(w),copy=copyTimedWave(w)!;copy.boss!.members![1]!.life=1;
  expect(timedWave(w)!.boss!.members![1]!.life).toBe(1234);
  expect(applyToWorld(w,JSON.parse(JSON.stringify(original)))).toBe(true);
  const boss=timedWave(w)!.boss!;expect(boss.members!.map(m=>[m.defeated,m.life])).toEqual([[true,0],[false,1234],[false,2345]]);
  expect(boss.members!.slice(1).every(m=>w.mThing_Collection.mThings[m.id!]?.mLife===m.life)).toBe(true);
  expect(remainingEnemies(w).devils).toBe(2);expect(timedWave(w)!.boss!.members).not.toBe(original.timedWave!.boss!.members);
 }finally{g.quit();}
});
it('rejects modern encounter saves before mutating an incapable world and keeps old single encounters intact on upgrade',()=>{
 const legacy=createHeadlessGame({classicBossEncounters:true}),old=legacy.world();old.mUpgrades.__set__mLevel(25);const oldSave=capture(old);legacy.quit();
 const modern=createHeadlessGame(),world=modern.world();expect(applyToWorld(world,oldSave)).toBe(true);
 expect(timedWave(world)!.boss!.members).toBeUndefined();world.mUpgrades.__set__mLevel(30);expect(timedWave(world)!.boss!.members).toHaveLength(3);modern.quit();
 const source=createHeadlessGame(),w=source.world();w.mUpgrades.__set__mLevel(25);const save=capture(w);source.quit();
 const target=createHeadlessGame({classicBossEncounters:true}),t=target.world(),before=capture(t);
 expect(applyToWorld(t,save)).toBe(false);expect(capture(t)).toEqual(before);target.quit();
});
it('creates one independent numeric-free bar per visible member, then hides only the defeated member',()=>{
 const {g,w,enemies}=encounter();try{
  DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
  for(const [i,e]of enemies.entries()){e.mPosition.mX=10+i*3;e.mPosition.mY=10;}
  w.mDrawPosition.x=0;w.mDrawPosition.y=0;w.mHud.Draw(w.bmDraw);
  for(let i=0;i<3;i++){expect(w._BossHealthHud['_Boss'+i]._visible).toBe(true);expect(w._BossHealthHud['_Boss'+i]._Health).toBeUndefined();}
  kill(w,enemies[1]);w.mHud.Draw(w.bmDraw);expect(w._BossHealthHud._Boss1._visible).toBe(false);
  expect(w._BossHealthHud._Boss0._visible&&w._BossHealthHud._Boss2._visible).toBe(true);
 }finally{g.quit();}
});
it('keeps ordinary timeout rewards after a partial defeat, and gives last-tick party death priority',()=>{
 const first=encounter(15);try{kill(first.w,first.enemies[0]);timedWave(first.w)!.remainingTicks=1;first.w.mUpgrades.Process();
  expect(waveDraft(first.w)!.round!.multiplier).toBe(1);
 }finally{first.g.quit();}
 const last=encounter(15);try{kill(last.w,last.enemies[0]);for(const p of last.g.players())p.mLife=0;
  timedWave(last.w)!.remainingTicks=1;kill(last.w,last.enemies[1]);expect(waveDraft(last.w)!.round).toBeUndefined();expect(last.w.mUpgrades.mLevelIndex).toBe(15);
 }finally{last.g.quit();}
});
it('resumes a warned Boss landing without duplicating or losing encounter slots',()=>{
 const g=createHeadlessGame({room:18}),w=g.world();try{
  clearWaveCombat(w);w.mUpgrades.__set__mLevel(15);w.mSpawnPoint_Devil=[];w.mSpawnPoint_Zombie=[];
  w.mUpgrades.Process();expect(timedWave(w)!.warnings.filter(s=>s.role==='boss')).toHaveLength(1);
  const save=capture(w);expect(applyToWorld(w,JSON.parse(JSON.stringify(save)))).toBe(true);
  for(let i=0;i<100;i++){w.mUpgrades.Process();w.mTick++;}
  const ids=timedWave(w)!.boss!.members!.map(m=>m.id);expect(ids.every(Boolean)).toBe(true);expect(new Set(ids).size).toBe(2);
  expect(g.things().filter(e=>e.mBossKind)).toHaveLength(2);
 }finally{g.quit();}
});
