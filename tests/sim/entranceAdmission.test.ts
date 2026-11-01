import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Bot,runBots} from './bots.ts';
import {Thing} from '../../src/game/packages.ts';
import {attemptTimedSpawn,chooseTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';

it.each(['Single','Coop']as const)('lets room 16 opening enemies enter and be killed with unchanged %s bot inputs',mode=>{
 const g=createHeadlessGame({mode,room:16,seed:7000+48+mode.length,difficulty:0,options:{infiniteLife:true,gameAmount:3}});
 try{const bots=mode==='Single'?[new Bot(0,{cycleEvery:90,digits:true})]:[new Bot(0,{cycleEvery:90}),new Bot(1,{cycleEvery:110})];
  runBots(g,bots,1200);expect(g.snapshot().score).toBeGreaterThan(0);expect(g.errors).toEqual([]);
 }finally{g.quit();}
});
it('does not queue a second authored entrance against the pending first entry corridor',()=>{
 const g=createHeadlessGame({room:16,seed:7054});try{
  expect(attemptTimedSpawn(g.world(),'Zombie')).toBe(true);
  const pending=g.things().find(t=>t.Process===t.Process_Init&&t._CLASSID_==='CThing_Creature_Zombie')!;
  const first=g.world().mSpawnPoint_Zombie.find(s=>s.mPosition.mX===pending.mPosition.mX&&s.mPosition.mY===pending.mPosition.mY)!;
  const next=chooseTimedSpawn(g.world(),'Zombie')?.point;
  if(next){expect([first.mCell,first.mNextCell].includes(next.mCell)).toBe(false);expect([first.mCell,first.mNextCell].includes(next.mNextCell)).toBe(false);}
  expect(g.things().some(t=>t.Process===t.Process_Init&&t._CLASSID_==='CThing_Creature_Zombie')).toBe(true);
 }finally{g.quit();}
});
it('preserves the old entry wait and original RNG path when the peer lacks the capability',()=>{
 const g=createHeadlessGame({room:16,seed:7054,classicFeatures:['safe-entrances-v1'],options:{infiniteLife:true,gameAmount:3}});try{
  g.tick(100);const enemies=g.things().filter(t=>t.Process&&t._CLASSID_==='CThing_Creature_Zombie');
  expect(enemies.map(e=>[e.mPosition.mX,e.mPosition.mY])).toEqual([[39.5,48.5],[38.5,48.5]]);
  expect(enemies.every(e=>e.mStateID==='State_Wait'&&e.mBaseStateID==='State_EnterMap'&&!(e.mFlags&Thing.CThing.mFlag_Collidable))).toBe(true);
 }finally{g.quit();}
});
it('derives identical reservations after rollback without drawing RNG',()=>{
 const g=createHeadlessGame({room:16,seed:7054}),w=g.world();try{
  attemptTimedSpawn(w,'Zombie');const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs,rng=getRandomState();
  const pick=()=>{const q=chooseTimedSpawn(w,'Zombie')?.point;return q&&[q.mPosition.mX,q.mPosition.mY,w.mUpgrades.timedWave.entranceCursor];};
  const first=pick();expect(getRandomState()).toBe(rng);restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);
  expect(pick()).toEqual(first);expect(getRandomState()).toBe(rng);
 }finally{g.quit();}
});
