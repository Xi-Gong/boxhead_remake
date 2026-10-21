import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {Thing,DrawPrimitive,World} from '../../src/game/packages.ts';
import {beginGunnerAim,gunnerIdentity} from '../../src/game/local/Gunner.ts';
import {gunnerCollection,ENEMY_GUNS} from '../../src/game/local/GunnerArt.ts';
import {CThing_Shot_EnemyBullet} from '../../src/game/local/EnemyBullet.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';
function boot(){const g=createHeadlessGame({classicSimplifiedCombat:true});noSpawn(g);placePlayer(g,10.5,8.5,0);return g;}
function enemy(g:any,gun='pistol'):any{const e:any=new Thing.Creature.CThing_Creature_Zombie(pos(6.5,8.5));e.mCombatKind='gunner';e.mGunnerSkin=2;e.mGunnerWeapon=gun;g.world().mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');return e;}
const bullets=(g:any)=>g.things().filter((t:any)=>t._CLASSID_==='CThing_Shot_EnemyBullet'&&t.Process);
it('selects all four player identities and three permitted guns without advancing the global random state',()=>{
 const g=boot(),before=getRandomState(),picks=Array.from({length:100},(_,i)=>gunnerIdentity(i+1));
 expect(new Set(picks.map(p=>p.skin)).size).toBe(4);expect(new Set(picks.map(p=>p.gun))).toEqual(new Set(ENEMY_GUNS));expect(getRandomState()).toBe(before);g.quit();
});
it.each(ENEMY_GUNS)('locks %s aim for .6 seconds and emits moving projectiles in a finite burst',gun=>{
 const g=boot(),e=enemy(g,gun);expect(beginGunnerAim(e)).toBe(true);const aim=[e.mCombatAimX,e.mCombatAimY];
 for(let i=0;i<14;i++)e.State_CombatAim();expect(bullets(g)).toHaveLength(0);placePlayer(g,10.5,10.5,0);e.State_CombatAim();
 expect([e.mCombatAimX,e.mCombatAimY]).toEqual(aim);expect(bullets(g)).toHaveLength(gun==='shotgun'?3:1);
 if(gun==='uzi')for(let i=0;i<6;i++)e.State_CombatAim();expect(bullets(g)).toHaveLength(gun==='pistol'?1:3);
 expect(bullets(g).every(t=>t.mCombatBulletLife===75&&t.mDelta.__get__mLength()<.3)).toBe(true);g.quit();
});
it('lets the player sidestep projectiles, blocks at walls and applies one real player hit',()=>{
 const g=boot(),w=g.world(),p=g.players()[0],e=enemy(g);p.mArmor=0;p.mInvincible=0;const hp=p.mLife;
 const shot=new CThing_Shot_EnemyBullet(pos(8.5,8.5),new Thing.Math.CThing_Angle(0),e,12);w.mThing_Collection.AddThing_Shot(shot);shot.Process_Init();
 placePlayer(g,10.5,10.5,0);for(let i=0;i<20&&shot.Process;i++)shot.Process();p.ProcessAffects();expect(p.mLife).toBe(hp);
 const hit=new CThing_Shot_EnemyBullet(pos(9.5,10.5),new Thing.Math.CThing_Angle(0),e,12);w.mThing_Collection.AddThing_Shot(hit);hit.Process_Init();for(let i=0;i<10&&hit.Process;i++)hit.Process();p.ProcessAffects();expect(p.mLife).toBe(hp-12);expect(hit.Process).toBeUndefined();
 const blocked=new CThing_Shot_EnemyBullet(pos(6.5,8.5),new Thing.Math.CThing_Angle(0),e,12);w.mThing_Collection.AddThing_Shot(blocked);w.mMap.mCells[8][7].mCollide|=World.Map.CMap_Cell.mCollide_Solid;blocked.Process_Init();for(let i=0;i<10&&blocked.Process;i++)blocked.Process();expect(blocked.Process).toBeUndefined();g.quit();
});
it('saves skin/weapon and pending aim while rollback preserves an in-flight bullet exactly',()=>{
 const g=boot(),w=g.world(),e=enemy(g,'uzi');expect(beginGunnerAim(e)).toBe(true);e.State_CombatAim();const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);
 const restored=g.things().find(t=>t.Process&&t.mCombatKind==='gunner')!;expect([restored.mGunnerSkin,restored.mGunnerWeapon,restored.mStateID,restored.mCombatTicks]).toEqual([2,'uzi','State_CombatAim',14]);
 for(let i=0;i<14;i++)restored.State_CombatAim();const bullet=bullets(g)[0]!;bullet.Process_Init();
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const run=()=>{for(let i=0;i<4&&bullet.Process;i++)bullet.Process();};run();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);run();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);g.quit();
});
it('prepares distinct gun and skin collections while preserving every authored gun anchor and return frame',()=>{
 const g=boot(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(let skin=0;skin<4;skin++)for(const gun of ENEMY_GUNS){
  const c=gunnerCollection(skin,gun);expect(c.mItems.stand).toBe(c.mItems[gun+'stand']);expect(c.mItems.walk.mAnimationObject.mFrameCount).toBe(8);
  const link={pistol:'Handgun',uzi:'UZI',shotgun:'Shotgun'}[gun];
  for(const action of ['Stand','Walk']){
   const original=DI.mAnimationSets['Player_'+link+'_'+action],derived=DI.mAnimationSets['Gunner_'+skin+'_'+gun+action.toLowerCase()];expect(derived.mFrameSequence).toEqual(original.mFrameSequence);
   for(let d=0;d<original.mDirections.length;d++)for(let f=0;f<original.mDirections[d].length;f++)expect(derived.mDirections[d][f].Models.GunPosition_Right.XSIInfo).toEqual(original.mDirections[d][f].Models.GunPosition_Right.XSIInfo);
  }
 }g.quit();
});
