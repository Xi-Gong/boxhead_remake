import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { Thing } from '../../src/game/packages.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';

it.each([
  {net:false,pass:false,damage:false,mode:'Coop',through:true},
  {net:false,pass:false,damage:true,mode:'Coop',through:false},
  {net:false,pass:false,damage:false,mode:'DeathMatch',through:false},
  {net:true,pass:true,damage:false,mode:'Coop',through:true},
  {net:true,pass:false,damage:false,mode:'Coop',through:false},
  {net:true,pass:true,damage:true,mode:'Coop',through:false},
] as const)('line selection preserves walls and enemy damage: $net / $pass / $damage / $mode', config => {
  const g=createHeadlessGame(config.net?{menuOnly:'Main'}:{mode:config.mode,room:1,options:{damage:config.damage?1:0}});
  if(config.net){
    const s=new NetSession(0,{send(){}});
    s.startLocalGame({mode:config.mode,roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',
      cfg:{...(config.pass?{teamPass:'team-pass-v1' as const}:{}),difficulty:0,gameSpeed:1,devils:true,collisions:true,
        damage:config.damage,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
    expect(g.waitRunning(3000)).toBe(true);
  }
  const w=g.world(),[p1,p2]=g.players(),Pos=Thing.Math.CThing_Position;
  p1.Move(new Pos(5.5,9.5,0));p2.Move(new Pos(7.5,9.5,0));p1.mInvincible=p2.mInvincible=0;
  const zombie=w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(new Pos(9.5,9.5,0),p1.mAngle.Clone()));
  zombie.Process_Init();zombie.Move(new Pos(9.5,9.5,0));zombie.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet);
  const mask=Object.getOwnPropertyDescriptor(p2,'mAffectFlags');
  const start=new Pos(6.2,9.5,0),end=new Pos(11.5,9.5,0),source={mID:p1.mID,mParent:p1,mPosition:start,mAngle:p1.mAngle};
  const hit=w.mMap.mCollide.Collide_Line(source,start,end,.04,Thing.Affect.CThing_Affect.mAffect_Bullet);
  expect({kind:hit?.mCollideType,id:hit?.mThing?.sUniqueID}).toEqual({kind:'thing',id:(config.through?zombie:p2).sUniqueID});
  expect(Object.getOwnPropertyDescriptor(p2,'mAffectFlags')).toEqual(mask);
  const zombieLife=zombie.mLife;
  w.mMap.mAffect.Affect_Line(source,start,end,.04,new Thing.Affect.CThing_Affect_Bullet(p1,source,10,p1.mAngle));
  expect(p2.mAffectors.length>0).toBe(!config.through);
  zombie.ProcessAffects();expect(zombie.mLife).toBe(zombieLife-10);p2.ProcessAffects();
  expect(Object.getOwnPropertyDescriptor(p2,'mAffectFlags')).toEqual(mask);
  const life=p2.mLife;
  p2.Affect(new Thing.Affect.CThing_Affect_FireBall(zombie,zombie,10,zombie.mAngle));p2.ProcessAffects();
  expect(p2.mLife).toBe(life-10);
  expect(g.errors).toEqual([]);g.quit();
});
