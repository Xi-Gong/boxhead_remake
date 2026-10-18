import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {BALANCE_RULE,balancedWave,balancedStartLevel,balancedXpRequired} from '../../src/game/local/BalanceRules.ts';
import {balancedWorld} from '../../src/game/local/Balance.ts';
import {awardKill,newGrowth,copyGrowth,xpRequired} from '../../src/game/local/Net/Growth.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {Thing} from '../../src/game/packages.ts';
import {Bot,runBots} from './bots.ts';

it('keeps every wave budget, bounds concurrency, and preserves ordered pressure across all four difficulties',()=>{
 for(let wave=1;wave<=100;wave++)for(let difficulty=0;difficulty<4;difficulty++){
  const p=balancedWave(wave,difficulty),next=balancedWave(wave,difficulty+1);
  expect(p.Zombie_TotalCount).toBe(10+5*(wave-1));expect(p.Devil_TotalCount).toBe(wave===1?0:Math.floor(1+(wave-2)/4));
  expect(p.Zombie_Count).toBeLessThanOrEqual(56);expect(p.Devil_Count).toBeLessThanOrEqual(5);
  expect(p.Zombie_Count).toBeLessThanOrEqual(p.Zombie_TotalCount);expect(p.Devil_Count).toBeLessThanOrEqual(p.Devil_TotalCount);
  expect(p.Zombie_SpawnRate).toBeGreaterThanOrEqual(1);expect(p.Devil_SpawnRate).toBeGreaterThanOrEqual(50);
  expect(p.Zombie_Count).toBeLessThanOrEqual(next.Zombie_Count);expect(p.Devil_Count).toBeLessThanOrEqual(next.Devil_Count);
  expect(p.Zombie_SpawnRate).toBeGreaterThanOrEqual(next.Zombie_SpawnRate);expect(p.Devil_SpawnRate).toBeGreaterThanOrEqual(next.Devil_SpawnRate);
  expect(p.zombieSpeed).toBeLessThanOrEqual(next.zombieSpeed);expect(p.devilSpeed).toBeLessThanOrEqual(next.devilSpeed);
 }
});
it('keeps early unlocks quick and spreads later weapon improvements across many more waves',()=>{
 const player=newGrowth(1,true).players[0];
 awardKill(player,100,5);expect(player.level).toBe(2);expect(player.score).toBe(100);
 player.level=10;player.xp=4;awardKill(player,1000,5);expect(player.level).toBe(11);expect(player.xp).toBe(4);expect(xpRequired(player)).toBe(10);
 player.level=124;player.xp=64;awardKill(player,1000,5);expect(player.level).toBe(125);expect(player.xp).toBe(0);
 expect([1,10,20,35,50,100].map(w=>balancedStartLevel(w))).toEqual([1,22,46,84,122,125]);
 expect(balancedStartLevel(35,false)).toBeLessThan(balancedStartLevel(35,true));
 expect(balancedStartLevel(20,true,1)).toBeGreaterThan(balancedStartLevel(20,true,2));
 expect(balancedXpRequired(1)).toBe(5);expect(balancedXpRequired(125)).toBe(65);
});
it.each([0,1,2,3] as const)('applies difficulty %i to actual local worlds without inflating enemy health or damage',(difficulty)=>{
 const g=createHeadlessGame({mode:'Single',difficulty,room:1}),w=g.world(),u=w.mUpgrades,t=balancedWave(u.mLevelIndex,difficulty);
 expect(balancedWorld(w)).toBe(true);expect(u.Level.Zombie_SpawnRate).toBe(t.Zombie_SpawnRate);expect(u.Level.Zombie_TotalCount).toBe(t.Zombie_TotalCount);
 const p=g.players()[0],z=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone(),p.mAngle.Clone()),d=new Thing.Creature.CThing_Creature_Devil(p.mPosition.Clone(),p.mAngle.Clone());
 for(const enemy of [z,d]){w.mThing_Collection.AddThing(enemy);enemy.Process_Init();}
 expect(z.mLife).toBe(100);expect(z.mDamage).toBe(50);expect(z.mSpeed).toBeCloseTo(.02*t.zombieSpeed,10);
 expect(d.mLife).toBe(1000);expect(d.mAttackDamage).toBe(50);expect(d.mSpeed).toBeCloseTo(.04*t.devilSpeed,10);
 expect(p.mLife).toBe(200);g.quit();
});
it.each([0,1,2,3] as const)('bounds actual spawn pressure at difficulty %i on the high and low quality paths',(difficulty)=>{
 for(const detail of [true,false]){
  const g=createHeadlessGame({mode:'Single',room:18,difficulty,options:{detail,infiniteLife:true}}),w=g.world();
  w.mUpgrades.__set__mLevel(100);const tuning=balancedWave(100,difficulty),cap=Math.min(tuning.Zombie_Count,detail?60:40);
  let peak=0;runBots(g,[new Bot(0,{passive:true})],600,()=>{
   const count=w.mUpgrades.Level.mZombieCount;peak=Math.max(peak,count);expect(count).toBeLessThanOrEqual(cap);
   expect(w.mUpgrades.Level.mDevilCount).toBeLessThanOrEqual(tuning.Devil_Count);
  });
  expect(peak).toBe(cap);expect(g.errors).toEqual([]);g.quit();
 }
});
it('grants a selected-wave loadout from the same earned-growth curve and restores its partial XP and armor',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,wave:20,netcode:'rollback-v2',cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',balance:BALANCE_RULE,
  difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
 expect(g.waitRunning(3000)).toBe(true);const w=g.world(),p=g.players()[0],growth=w.mUpgrades.lanGrowth;
 expect(growth.players.map((p:any)=>p.level)).toEqual([46,46]);expect(p.mWeapons.mine.mActive).toBeTruthy();expect(p.mWeapons.rocket.mActive).toBeFalsy();
 expect(p.mArmor).toBeUndefined();expect(growth.players[0].score).toBe(0);expect(growth.players[0].xp).toBe(0);
 growth.players[0].xp=19;p.mArmor=47;p.mLife=87;const snap=capture(w);
 growth.players[0].xp=0;p.mArmor=0;p.mLife=200;expect(applyToWorld(w,snap)).toBe(true);
 expect(w.mUpgrades.lanGrowth.players[0].xp).toBe(19);expect(xpRequired(w.mUpgrades.lanGrowth.players[0])).toBe(25);
 expect(p.mArmor).toBe(47);expect(p.mLife).toBe(87);expect(copyGrowth(w.mUpgrades.lanGrowth).players[0].curve).toBe(BALANCE_RULE);g.quit();
});
it('retains the original wave and five-XP rules when a LAN peer lacks balance capability',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,wave:20,netcode:'rollback-v2',cfg:{progression:'personal-growth-v1',
  difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
 expect(g.waitRunning(3000)).toBe(true);const w=g.world(),p=w.mUpgrades.lanGrowth.players[0];expect(balancedWorld(w)).toBe(false);
 expect(w.mUpgrades.CThing_Creature_Zombie.SpeedUp).toBe(3);expect(p.level).toBe(30);expect(p.curve).toBeUndefined();expect(xpRequired(p)).toBe(5);g.quit();
});
it('keeps the difficulty head-start floor when selecting an earlier wave',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,wave:5,netcode:'rollback-v2',cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',balance:BALANCE_RULE,
  difficulty:3,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
 expect(g.waitRunning(3000)).toBe(true);expect(g.world().mUpgrades.mLevelIndex).toBe(5);
 expect(g.world().mUpgrades.lanGrowth.players.map((p:any)=>p.level)).toEqual([84,84]);g.quit();
});
