import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {clearWaveBudget} from '../../src/game/local/ClearWaveRules.ts';
import {timedWave,attemptTimedSpawn,roomForTimedSpawn,copyTimedWave,clearWaveCombat} from '../../src/game/local/TimedWaves.ts';
import {remainingEnemies} from '../../src/game/local/Net/EnemyCounts.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {timedWaveExperience,timedPreviousExperience} from '../../src/game/local/TimedGrowthRules.ts';
import {Thing} from '../../src/game/packages.ts';

it('sets finite map-sized objectives on every ordinary map, scaling cooperation without changing deadlines',()=>{
 for(let room=1;room<=18;room++){
  const g=createHeadlessGame({room,classicCombat:true}),w=g.world(),s=timedWave(w)!,c=s.clear!;
  expect(c).toMatchObject({...clearWaveBudget(1,s.totalTicks/25,0,true,1),emittedZombies:0,killedZombies:0});
  expect(remainingEnemies(w)).toEqual({zombies:c.zombies,devils:0});expect(c.zombies).toBeGreaterThan(100);
  w.mUpgrades.__set__mLevel(5);expect(timedWave(w)!.clear).toBeUndefined();expect(timedWave(w)!.boss).toBeDefined();g.quit();
 }
 const solo=clearWaveBudget(2,180,0,true,1),coop=clearWaveBudget(2,180,0,true,2);
 expect(coop.zombies).toBeGreaterThan(solo.zombies);expect(coop.zombies).toBeLessThan(2*solo.zombies);
});
it('reserves pending arrivals and stops at the exact family budget without banking excess spawns',()=>{
 const g=createHeadlessGame({room:18,classicCombat:true}),w=g.world(),s=timedWave(w)!,c=s.clear!;w.mSpawnPoint_Zombie=[];c.zombies=1;
 expect(attemptTimedSpawn(w,'Zombie')).toBe(true);expect(s.warnings).toHaveLength(1);expect(roomForTimedSpawn(w,'Zombie')).toBe(false);
 expect(attemptTimedSpawn(w,'Zombie')).toBe(false);s.warnings[0]!.ticks=1;w.mUpgrades.Process();
 expect(c.emittedZombies).toBe(1);expect(s.warnings).toHaveLength(0);
 for(let i=0;i<100;i++)w.mUpgrades.Process();expect(c.emittedZombies).toBe(1);expect(s.warnings).toHaveLength(0);g.quit();
});
it('finishes early only after all real kills, deduplicates credit and gives one ordinary draft',()=>{
 const g=createHeadlessGame(),w=g.world(),s=timedWave(w)!,c=s.clear!;c.zombies=1;c.devils=0;
 const e:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();
 e.mLife=0;e.lanFatalSlot=0;w.LogKill(e);w.LogKill(e);expect(c.killedZombies).toBe(1);expect(remainingEnemies(w).zombies).toBe(0);
 const xp=w.mUpgrades.lanGrowth.players[0].xp;w.mUpgrades.Process();expect(s.phase).toBe('draft');
 expect(w.mUpgrades.waveDraft.round.multiplier).toBe(1);expect(s.remainingTicks).toBe(s.totalTicks);
 w.mUpgrades.Process();expect(w.mUpgrades.lanGrowth.players[0].xp).toBe(xp);g.quit();
});
it('lets a non-killing survivor time out without XP and gives party death priority at either finish condition',()=>{
 for(const cleared of [false,true]){
  const g=createHeadlessGame(),w=g.world(),s=timedWave(w)!,c=s.clear!;s.remainingTicks=1;
  if(cleared){c.killedZombies=c.zombies;c.killedDevils=c.devils;}
  const before=capture(w).growth;for(const p of g.players())p.mLife=0;w.mUpgrades.Process();expect(s.phase).toBe('combat');
  g.players()[0].mLife=1;w.mUpgrades.Process();expect(s.phase).toBe('draft');expect(remainingEnemies(w)).toEqual({zombies:0,devils:0});expect(capture(w).growth).toEqual(before);g.quit();
 }
});
it('copies objectives independently and restores rollback counters and confirmed kill identities',()=>{
 const g=createHeadlessGame(),w=g.world(),s=timedWave(w)!;
 const copy=copyTimedWave(w)!;copy.clear!.killedZombies++;expect(s.clear!.killedZombies).toBe(0);
 const enemy:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(enemy);enemy.Process_Init();
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const kill=()=>{enemy.mLife=0;enemy.lanFatalSlot=0;w.LogKill(enemy);w.LogKill(enemy);w.mUpgrades.Process();};
 kill();expect(s.clear!.killedZombies).toBe(1);const digest=simulationDigest(captureWorldSnap(w,ctx,false));
 restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);kill();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);expect(timedWave(w)!.clear!.killedZombies).toBe(1);g.quit();
});
it('keeps restored live variants inside their original budget and makes old high-wave rules explicit',()=>{
 const g=createHeadlessGame(),w=g.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(1001);
 const enemy:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());enemy.mEnemyVariant='charger';w.mThing_Collection.AddThing(enemy);enemy.Process_Init();
 timedWave(w)!.clear!.emittedZombies=3;timedWave(w)!.clear!.killedZombies=2;
 const saved=capture(w);g.quit();const next=createHeadlessGame(),world=next.world();
 expect(applyToWorld(world,saved)).toBe(true);expect(timedWave(world)!.clear!.emittedZombies).toBe(3);expect(timedWave(world)!.clear!.killedZombies).toBe(2);next.quit();
});
it('returns omitted ordinary saved enemies to the arrival budget, retaining kills, warnings and clock',()=>{
 const g=createHeadlessGame(),w=g.world(),s=timedWave(w)!;clearWaveCombat(w);
 s.clear!.emittedZombies=12;s.clear!.killedZombies=7;s.remainingTicks=1234;s.warnings=[{family:'Zombie',x:10.5,y:12.5,ticks:12}];
 const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);const restored=timedWave(w)!;
 expect(restored.clear!.killedZombies).toBe(7);expect(restored.clear!.emittedZombies).toBe(7);expect(restored.remainingTicks).toBe(1234);expect(restored.warnings).toEqual(saved.timedWave!.warnings);g.quit();
});
it('rejects incapable saves before mutation, while legacy current waves keep their original continuous rule',()=>{
 const g=createHeadlessGame(),saved=capture(g.world());g.quit();
 const old=createHeadlessGame({classicClearWaves:true}),w=old.world(),before=capture(w);
 expect(applyToWorld(w,saved)).toBe(false);expect(capture(w)).toEqual(before);expect(timedWave(w)!.clear).toBeUndefined();old.quit();
 const modern=createHeadlessGame();expect(applyToWorld(modern.world(),before)).toBe(true);expect(timedWave(modern.world())!.clear).toBeUndefined();
 modern.world().mUpgrades.__set__mLevel(2);expect(timedWave(modern.world())!.clear).toBeDefined();modern.quit();
});
it('uses the clear objective for reference growth, with bounded high-wave sums and no assumed Boss credit',()=>{
 for(const seconds of [180,240,300])for(const players of [1,2]){
  const config={seconds,players,difficulty:0,devils:true,bosses:true,tiered:true,clearable:true};let xp=0n;
  for(let wave=1;wave<=160;wave++){
   expect(timedPreviousExperience(wave,config)).toBe(xp/BigInt(players));
   const amount=timedWaveExperience(wave,config),b=clearWaveBudget(wave,seconds,0,true,players);
   expect(amount).toBe(wave%5?b.zombies+5*b.devils:Math.floor((seconds+60)/2));xp+=BigInt(amount);
  }
  expect(timedPreviousExperience(Number.MAX_SAFE_INTEGER,config)).toBeGreaterThan(xp);
 }
});
