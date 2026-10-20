import { expect, it } from 'vitest';
import { createHeadlessGame as boot, type HeadlessGameOptions } from './harness.ts';
// Timed-only capability fixture: the next stage has independent draft tests.
const createHeadlessGame=(opts:HeadlessGameOptions={})=>boot({...opts,classicWaveDraft:true});
import { CMain, Thing } from '../../src/game/packages.ts';
import { mapSize, waveSeconds, spawnIntervalSeconds, ROOM_DIMENSIONS } from '../../src/game/local/TimedWaveRules.ts';
import { timedWave, chooseTimedSpawn, clearWaveCombat } from '../../src/game/local/TimedWaves.ts';
import { capture, applyToWorld } from '../../src/game/local/Resume.ts';
import { captureWorldSnap, restoreWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import {beginEmberCast} from '../../src/game/local/EnemyVariants.ts';

it('registers a newly arrived priest before its first stationary cast, while retaining classic entry behavior',()=>{
 for(const classicTimedWaves of [false,true]){
  const game=createHeadlessGame({classicTimedWaves}),w=game.world(),p=game.players()[0];
  p.Move(new Thing.Math.CThing_Position(10.5,8.5,0));
  const e:any=new Thing.Creature.CThing_Creature_Devil(new Thing.Math.CThing_Position(10.5,12.5,0));e.mEnemyVariant='priest';w.mThing_Collection.AddThing(e);e.Process_Init();
  expect(beginEmberCast(e)).toBe(true);
  if(classicTimedWaves)expect(e.mCellID).toBeUndefined();
  else{expect(e.mCellID).toEqual(w.mMap.mCells[12][10].mID);expect(w.mMap.mCells[12][10].mObjects[e.sUniqueID]).toBe(e);}
  game.quit();
 }
});

it('classifies size boundaries and assigns ordinary/Boss limits for all 18 actual maps',()=>{
  expect([mapSize(40,20),mapSize(40,21),mapSize(41,17),mapSize(50,40),mapSize(50,41),mapSize(64,10)])
    .toEqual(['small','medium','medium','medium','large','large']);
  const small=[1,2,4,8],large=[14,15,16,17,18];
  for(let room=1;room<=18;room++){
    const game=createHeadlessGame({room}),world=game.world(),size=world.mMap.mSize;
    expect([size.x,size.y]).toEqual(ROOM_DIMENSIONS[room-1]);
    const seconds=small.includes(room)?180:large.includes(room)?300:240;
    expect(timedWave(world)?.totalTicks).toBe(seconds*CMain.mFPS);
    expect(waveSeconds(size.x,size.y,true)).toBe(seconds+60);game.quit();
  }
});
it('uses the three pacing stages with an absolute 0.2 second floor',()=>{
  expect([0,.2,.7].map(p=>spawnIntervalSeconds(0,1,p))).toEqual([.8*1.15,.8,.8*.85]);
  expect([0,1,2,3].map(d=>spawnIntervalSeconds(d,1,.5))).toEqual([.8,.65,.5,.4]);
  for(const progress of [0,.2,.7,1])expect(spawnIntervalSeconds(3,1000000,progress)).toBeGreaterThanOrEqual(.2);
});
it('spawns promptly, retains concurrent caps after kills and freezes the simulation timer during pause',()=>{
  const game=createHeadlessGame(),world=game.world(),state=timedWave(world)!,level=world.mUpgrades.Level;
  const before=state.remainingTicks;game.tick(1);
  expect([level.Zombie_TotalCount,level.Devil_TotalCount]).toEqual([0,0]);
  expect(state.remainingTicks).toBe(before-1);
  expect(level.mZombieCount+state.warnings.length).toBeGreaterThan(0);
  const cap=level.Zombie_Count;world.mUpgrades.__set__mZombieCount(level.mZombieCount-1);
  expect(level.Zombie_Count).toBe(cap);
  const remaining=state.remainingTicks;world.mPaused=true;game.step(20);expect(state.remainingTicks).toBe(remaining);
  world.mPaused=false;game.quit();
});
it('uses safe reachable warned ground when entries are unavailable',()=>{
  const game=createHeadlessGame({room:18}),world=game.world();world.mSpawnPoint_Zombie=[];
  const choice=chooseTimedSpawn(world,'Zombie');expect(choice?.warning).toBe(true);
  const position=choice!.point.mPosition;
  expect(position.Distance2D(game.players()[0].mPosition)).toBeGreaterThanOrEqual(4);
  expect(position.Distance2D(game.players()[0].mPosition)).toBeLessThanOrEqual(8);game.quit();
});
it('reselects occupied warnings and does not bank spawn attempts while at capacity',()=>{
  const game=createHeadlessGame({room:18}),world=game.world(),u=world.mUpgrades,state=timedWave(world)!;
  world.mSpawnPoint_Zombie=[];u.Level.Zombie_Count=1;u.Process();expect(state.warnings).toHaveLength(1);
  const warning=state.warnings[0]!,cell=world.mMap.mCells[Math.floor(warning.y)][Math.floor(warning.x)];
  cell.mCollide|=128;warning.ticks=1;u.Process();expect(state.warnings).toHaveLength(1);
  expect(state.warnings[0]).not.toEqual(warning);expect(state.warnings[0]!.ticks).toBe(Math.ceil(CMain.mFPS*.8));
  state.warnings=[];u.Level.mZombieCount=1;
  for(let i=0;i<100;i++)u.Process();expect(state.zombieTicks).toBeGreaterThan(0);
  u.Level.mZombieCount=0;u.Process();expect(state.warnings).toHaveLength(1);game.quit();
});
it('clears combat without rewards and records a fresh timed wave only after cleanup',()=>{
  const game=createHeadlessGame(),world=game.world(),player=game.players()[0],u=world.mUpgrades;
  const enemy=world.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(player.mPosition.Clone()));
  enemy.Process_Init();const before=capture(world),objects=Object.values(world.mThing_Collection.mThings).filter((t:any)=>t._CLASSID_.startsWith('CThing_Object_'));
  timedWave(world)!.remainingTicks=1;u.Process();
  expect(u.mLevelIndex).toBe(before.wave+1);expect(timedWave(world)!.remainingTicks).toBe(timedWave(world)!.totalTicks);
  expect(capture(world).growth).toEqual(before.growth);expect(world.mHud.nTotalScore).toBe(before.score);
  expect(world.mThing_Collection.mThings[enemy.sUniqueID]).toBeUndefined();
  for(const object of objects as any[])expect(world.mThing_Collection.mThings[object.sUniqueID]).toBe(object);
  game.quit();
});
it('gives defeat priority on the final tick and preserves remaining time through save and rollback',()=>{
  const game=createHeadlessGame(),world=game.world(),u=world.mUpgrades;
  clearWaveCombat(world);timedWave(world)!.remainingTicks=88;
  const save=capture(world);expect(applyToWorld(world,save)).toBe(true);expect(timedWave(world)!.remainingTicks).toBe(88);
  const ctx=makeSnapCtx(world),data=captureWorldSnap(world,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
  u.Process();const digest=simulationDigest(captureWorldSnap(world,ctx,false));
  restoreWorldSnap(world,{tRel:0,data,instances,sharedObjs},ctx);u.Process();
  expect(simulationDigest(captureWorldSnap(world,ctx,false))).toEqual(digest);
  timedWave(world)!.remainingTicks=1;for(const p of game.players())p.mLife=0;
  u.Process();expect(u.mLevelIndex).toBe(save.wave);game.quit();
});
it('keeps classic rules and DeathMatch and rejects downgrade before mutation',()=>{
  const modern=createHeadlessGame(),save=capture(modern.world());modern.quit();
  const classic=createHeadlessGame({classicTimedWaves:true}),world=classic.world(),before=capture(world);
  expect(timedWave(world)).toBeUndefined();expect(applyToWorld(world,save)).toBe(false);expect(capture(world)).toEqual(before);classic.quit();
  const dm=createHeadlessGame({mode:'DeathMatch'});expect(timedWave(dm.world())).toBeUndefined();dm.quit();
});
it('migrates a finite wave with its score, inventory, vitals and crates intact and starts its clock once',()=>{
  const old=createHeadlessGame({classicTimedWaves:true}),oldWorld=old.world(),p=old.players()[0];
  oldWorld.mUpgrades.__set__mLevel(8);p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=13;p.mLife=79;p.mArmor=21;
  oldWorld.mUpgrades.Level.Zombie_Count=2;oldWorld.mHud.nTotalScore=4321;
  const save=capture(oldWorld);old.quit();
  const next=createHeadlessGame(),world=next.world();expect(applyToWorld(world,save)).toBe(true);
  const after=capture(world);expect(after.score).toBe(4321);expect(after.players).toEqual(save.players);expect(after.objects).toEqual(save.objects);
  expect(world.mUpgrades.Level.Zombie_Count).toBeGreaterThan(2);expect(timedWave(world)!.remainingTicks).toBe(timedWave(world)!.totalTicks);
  timedWave(world)!.remainingTicks-=42;const savedAgain=capture(world);expect(applyToWorld(world,savedAgain)).toBe(true);
  expect(timedWave(world)!.remainingTicks).toBe(timedWave(world)!.totalTicks-42);next.quit();
});
