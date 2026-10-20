import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {Thing,World,DrawPrimitive} from '../../src/game/packages.ts';
import {combatOrdinal} from '../../src/game/local/CombatRosterRules.ts';
import {combatCollection} from '../../src/game/local/CombatRosterArt.ts';
import {beginCombatSmash} from '../../src/game/local/CombatRoster.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';
function boot(){const g=createHeadlessGame();noSpawn(g);placePlayer(g,9.5,8.5,0);return g;}
function enemy(g:any,kind:'runner'|'brute',x=7.5,y=8.5):any{const e:any=new Thing.Creature.CThing_Creature_Zombie(pos(x,y));e.mCombatKind=kind;g.world().mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');return e;}
it('introduces runner at three and brute at six without extra subtype RNG, replacing original quotas',()=>{
 expect(combatOrdinal(2,3,'Zombie')).toBeUndefined();expect(combatOrdinal(3,3,'Zombie')).toBe('runner');
 expect(Array.from({length:100},(_,i)=>combatOrdinal(6,i+1,'Zombie')).filter(k=>k==='runner')).toHaveLength(18);
 expect(Array.from({length:100},(_,i)=>combatOrdinal(6,i+1,'Zombie')).filter(k=>k==='brute')).toHaveLength(14);
 const g=boot(),w=g.world();w.mUpgrades.__set__mLevel(6);w.Spawn_ValidPosition=()=>({mPosition:pos(5.5,8.5)});const before=getRandomState();
 for(let n=0;n<16;n++){w.mUpgrades.Level.mZombieCount=0;expect(World.CWorld.prototype.Spawn_Zombie.call(w)).toBe(true);}
 expect(getRandomState()).toBe(before);expect(g.things().filter(t=>t.mCombatKind==='runner')).toHaveLength(2);expect(g.things().filter(t=>t.mCombatKind==='brute')).toHaveLength(2);g.quit();
});
it('gives runners a faster flanking target and brutes a slower distinct silhouette/health',()=>{
 const g=boot(),r=enemy(g,'runner',5.5),b=enemy(g,'brute');r.Brain();expect(r.mSpeed).toBeGreaterThan(b.mSpeed);expect(r.mMaxLife).toBe(200);expect(b.mMaxLife).toBe(500);
 expect(r.mTarget_Position).not.toBe(g.players()[0].mPosition);expect(r.mTarget_Position.Distance2D(g.players()[0].mPosition)).toBeCloseTo(1.6);g.quit();
});
it('locks the heavy strike for .8s, allows escape, and recovers before another attack',()=>{
 const g=boot(),e=enemy(g,'brute'),p=g.players()[0];p.mArmor=0;p.mInvincible=0;const hp=p.mLife;
 expect(beginCombatSmash(e)).toBe(true);for(let i=0;i<19;i++)e.State_CombatSmash();p.ProcessAffects();expect(p.mLife).toBe(hp);
 placePlayer(g,9.5,11.5,0);e.State_CombatSmash();p.ProcessAffects();expect(p.mLife).toBe(hp);expect(e.mCombatPhase).toBe('recovery');
 for(let i=0;i<30;i++)e.State_CombatSmash();expect(e.mStateID).toBe('State_GotoPlayer');expect(e.mCombatCooldown).toBeGreaterThan(g.world().mTick);g.quit();
});
it('retains a pending strike and new-enemy identity across save and exact rollback replay',()=>{
 const g=boot(),w=g.world(),e=enemy(g,'brute');enemy(g,'runner');expect(beginCombatSmash(e)).toBe(true);e.State_CombatSmash();
 const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);const b=g.things().find(t=>t.Process&&t.mCombatKind==='brute')!;
 expect(b.mStateID).toBe('State_CombatSmash');expect(b.mCombatTicks).toBe(19);
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const run=()=>{for(let i=0;i<8;i++)b.State_CombatSmash();};run();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);run();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);g.quit();
});
it('retains the previous derived-art oracle with authored feet and return frames',()=>{
 const g=boot(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(const kind of ['runner','brute']as const){
  const c=combatCollection(kind,true);expect(c.mItems.walk.mAnimationObject.mFrameCount).toBe(8);
  for(const [key,link]of Object.entries({stand:'Zombie_Zombie_Stand',walk:'Zombie_Zombie_Walk',attack:'Zombie_Zombie_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'})){
   const source=DI.mAnimationSets[link],derived=DI.mAnimationSets['Combat_'+kind+'_'+key];expect(derived.mFrameSequence).toEqual(source.mFrameSequence);
   for(let d=0;d<source.mDirections.length;d++)for(let f=0;f<source.mDirections[d].length;f++){
    const s=source.mDirections[d][f],models=derived.mDirections[d][f].Models;
    for(const name of ['Foot_Left','Foot_Right']){const foot=s.Models[name].Empty?DI.mGroups[s.rPartner]?.[s.mAnimID]?.mDirections[d]?.[f]?.Models[name]:s.Models[name];expect(models[name].Shape_vList).toEqual(foot.Shape_vList);expect(models[name].XSIInfo).toEqual(foot.XSIInfo);}
    for(const m of Object.values(models)as any[])if(m.Shape_vList?.length){expect(m.Shape_vList.length).toBe(m.Shape_Material.length);expect(m.Shape_vList.flat().every(Number.isFinite)).toBe(true);}
   }
  }
 }g.quit();
});
