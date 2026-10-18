// Serial: the game RNG is process-global. Bot outcomes are diagnostics, never human win-rate estimates.
// node --experimental-transform-types tools/balance-audit.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {BALANCE_PROFILES,balancedWave,balancedStartLevel} from '../src/game/local/BalanceRules.ts';
import {awardKill,newGrowth,grantGrowthLoadout} from '../src/game/local/Net/Growth.ts';
import {NetSession} from '../src/game/local/Net/NetSession.ts';
import {createHeadlessGame} from '../tests/sim/harness.ts';
import {soak} from '../tests/sim/soak.ts';
const out='generated/reports/v028/balance';mkdirSync(out,{recursive:true});
const report={profiles:BALANCE_PROFILES,waves:[],growth:[],weapons:[],bots:[],notes:[
 'Equal-share start levels model cleared previous waves, not guaranteed player performance.',
 'Enemy HP stays 100/1000 and attack damage stays 50; armor is 100 and never heals.',
 'Devil loot remains one seeded exclusive 20% armor / 20% ammo / 60% original roll.',
 'Bot input is fixed, imperfect and not a human win-rate or subjective-fun measurement.',
]};
for(let difficulty=0;difficulty<4;difficulty++)for(let wave=1;wave<=100;wave++)report.waves.push({difficulty,wave,...balancedWave(wave,difficulty),selectedLevel:balancedStartLevel(wave)});
for(const share of [.3,.5,.7]){
 const old=newGrowth(1).players[0],player=newGrowth(1,true).players[0];let oldCapWave,newCapWave;
 for(let wave=1;wave<=100;wave++){
  report.growth.push({share,wave,legacyLevel:old.level,level:player.level,xp:player.xp});
  const budget=balancedWave(wave,0),z=Math.round(budget.Zombie_TotalCount*share),d=Math.round(budget.Devil_TotalCount*share);
  for(let n=0;n<z;n++){awardKill(old,100,1);awardKill(player,100,1);}
  for(let n=0;n<d;n++){awardKill(old,1000,5);awardKill(player,1000,5);}
  if(old.level===125)oldCapWave??=wave;if(player.level===125)newCapWave??=wave;
 }
 console.log('growth',share,{oldCapWave,newCapWave});
}
{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',balance:'pve-balance-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
 assert(g.waitRunning(3000));const w=g.world(),p=g.players()[0];
 for(const level of [1,3,5,8,10,13,20,40,50,70,90,110,125]){
  w.mUpgrades.lanGrowth.players[0].level=level;grantGrowthLoadout(w);
  for(const entry of p.mWeaponList)if(entry.mActive){
   w.mUpgrades.ApplyUpgrade_Weapon(entry.mThing);const gun=entry.mThing;
   report.weapons.push({level,name:entry.mNameID,damagePerProjectile:gun.mDamage,fireRateTicks:gun.mFireRate,capacity:gun.mTotalAmmo,
    ...(['pistol','uzi','railgun'].includes(entry.mNameID)?{idealBodyHitsZombie:Math.ceil(100/gun.mDamage),idealBodyHitsDevil:Math.ceil(1000/gun.mDamage)}:{})});
  }
 }
 g.quit();
}
for(const mode of ['Single','Coop'])for(const difficulty of [0,1,2,3])for(const seed of [11,31,71]){
 const r=soak({mode,difficulty,room:1,seed,ticks:2500});
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.issues.filter(i=>i.kind!=='spawn_solid'),[]);
 const result={mode,difficulty,seed,ticks:r.ticks,startWave:r.start.level,endWave:r.end.level,score:r.end.score,shots:r.shots,
  peak:r.max,levelUps:r.levelUps,endPlayers:r.end.players};report.bots.push(result);console.log('bot',mode,difficulty,seed,result.endWave,result.score);
 r.game.quit();
}
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log('BALANCE AUDIT PASSED');
