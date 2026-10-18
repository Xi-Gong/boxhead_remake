import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {remainingEnemies} from '../../src/game/local/Net/EnemyCounts.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {Thing} from '../../src/game/packages.ts';

it('uses remaining wave totals, decreases only the killed type once, and restores counts on rollback/retry',()=>{
  const game=createHeadlessGame({menuOnly:'Main'}),session=new NetSession(0,{send(){}});
  session.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,wave:20,netcode:'rollback-v2',
    cfg:{progression:'personal-growth-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},game.main());
  expect(game.waitRunning(3000)).toBe(true);
  const w=game.world(),initial=remainingEnemies(w),ctx=makeSnapCtx(w);
  expect(initial).toEqual({zombies:105,devils:5});expect(session.confirmedEnemies).toEqual(initial);
  const data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const owner=game.players()[0];
  for(const [spawn,cls] of [['Spawn_Zombie','CThing_Creature_Zombie'],['Spawn_Devil','CThing_Creature_Devil']]){
    const ids=new Set(game.things().map(t=>t.sUniqueID));expect(w[spawn]()).toBe(true);
    const victim=game.things().find(t=>!ids.has(t.sUniqueID)&&t._CLASSID_===cls)!;victim.Process_Init();victim.mLife=1;
    expect(remainingEnemies(w)).toEqual(cls==='CThing_Creature_Zombie'?initial:{zombies:104,devils:5});
    new Thing.Affect.CThing_Affect_Bullet(owner,owner,1,owner.mAngle).AffectThing(victim);victim.SetState('State_Dying');
    const killed=remainingEnemies(w);w.LogKill(victim);expect(remainingEnemies(w)).toEqual(killed);
    expect(killed).toEqual({zombies:104,devils:cls==='CThing_Creature_Devil'?4:5});
  }
  // Predicted world changes cannot leak to the confirmed HUD state.
  expect(session.confirmedEnemies).toEqual(initial);
  restoreWorldSnap(w,slot,ctx);expect(remainingEnemies(w)).toEqual(initial);
  session.markEnded();session.startLocalGame(session.retryStart(),game.main());expect(game.waitRunning(3000)).toBe(true);
  expect(session.confirmedEnemies).toEqual(initial);expect(remainingEnemies(game.world())).toEqual(initial);game.quit();
});

it('displays zero for disabled devils, empty waves and invalid negative totals',()=>{
  expect(remainingEnemies({mUpgrades:{Level:{Zombie_TotalCount:10}}})).toEqual({zombies:10,devils:0});
  expect(remainingEnemies({mUpgrades:{Level:{Zombie_TotalCount:-1,Devil_TotalCount:NaN}}})).toEqual({zombies:0,devils:0});
});
