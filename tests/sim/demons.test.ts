import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {Thing,World,DrawPrimitive} from '../../src/game/packages.ts';
import {beginDemonAttack} from '../../src/game/local/Demons.ts';
import {demonCollection} from '../../src/game/local/DemonArt.ts';
import {combatOrdinal} from '../../src/game/local/CombatRosterRules.ts';
import {bossKind,bossCount} from '../../src/game/local/BossWaves.ts';
import {timedWave,clearWaveCombat} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
function boot(){const g=createHeadlessGame({classicSimplifiedCombat:true});noSpawn(g);placePlayer(g,10.5,8.5,0);return g;}
function enemy(g:any,kind:'butcher'|'hunter',boss=false):any{const e:any=new Thing.Creature.CThing_Creature_Devil(pos(kind==='butcher'?8.5:6.5,8.5));e.mCombatKind=kind;if(boss)e.mBossKind=kind;g.world().mThing_Collection.AddThing(e);e.Process_Init();e.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet|Thing.Affect.CThing_Affect.mAffect_Explosion|Thing.Affect.CThing_Affect.mAffect_FireBall);e.SetState('State_GotoPlayer');return e;}
it('introduces both ordinary devils at twelve/eighteen and four Boss families at their intended waves',()=>{
 expect(combatOrdinal(11,3,'Devil')).toBeUndefined();expect(combatOrdinal(12,3,'Devil')).toBe('butcher');expect(combatOrdinal(17,1,'Devil')).toBeUndefined();expect(combatOrdinal(18,1,'Devil')).toBe('hunter');
 expect([5,10,15,20,25].map(w=>bossKind(w,true,true))).toEqual(['charger','priest','butcher','hunter','charger']);expect(bossKind(20,false,true)).toBe('charger');
 const g=boot(),b=enemy(g,'butcher'),h=enemy(g,'hunter');expect([b.mMaxLife,b.mEnemyArmorMaximum,h.mMaxLife,h.mEnemyArmorMaximum]).toEqual([2600,780,2100,630]);expect(h.mSpeed).toBeGreaterThan(b.mSpeed);g.quit();
});
it('telegraphs a locked heavy cleave, allows escape, then exposes a full recovery window',()=>{
 const g=boot(),e=enemy(g,'butcher'),p=g.players()[0];p.mInvincible=0;p.mArmor=0;const hp=p.mLife;expect(beginDemonAttack(e)).toBe(true);
 for(let i=0;i<24;i++)e.State_CombatCleave();p.ProcessAffects();expect(p.mLife).toBe(hp);placePlayer(g,10.5,11.5,0);e.State_CombatCleave();p.ProcessAffects();expect(p.mLife).toBe(hp);expect(e.mCombatTicks).toBe(38);
 for(let i=0;i<38;i++)e.State_CombatCleave();expect(e.mStateID).toBe('State_GotoPlayer');expect(e.mCombatCooldown).toBeGreaterThan(g.world().mTick);g.quit();
});
it.each([false,true])('hunter Boss=%s locks its fan, leaves gaps, and warns again before the second volley',boss=>{
 const g=boot(),e=enemy(g,'hunter',boss);expect(beginDemonAttack(e)).toBe(true);const dir=[e.mCombatAimX,e.mCombatAimY];placePlayer(g,10.5,10.5,0);
 for(let i=0;i<22;i++)e.State_CombatHunt();expect(g.things().filter(t=>t._CLASSID_==='CThing_Shot_EnemyBullet')).toHaveLength(0);e.State_CombatHunt();
 expect(g.things().filter(t=>t._CLASSID_==='CThing_Shot_EnemyBullet')).toHaveLength(boss?5:3);expect([e.mCombatAimX,e.mCombatAimY]).toEqual(dir);
 if(boss){expect(e.mCombatPhase).toBe('warning');for(let i=0;i<18;i++)e.State_CombatHunt();expect(g.things().filter(t=>t._CLASSID_==='CThing_Shot_EnemyBullet')).toHaveLength(9);}expect(e.mCombatPhase).toBe('recovery');g.quit();
});
it('preserves new Boss members and depleted armor/skill chains across saves and exact rollback',()=>{
 for(const wave of [15,20,35]){
  const g=createHeadlessGame({classicSimplifiedCombat:true,room:18}),w=g.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);
  for(let i=0;i<bossCount(wave);i++){w.mUpgrades.ProcessTimedSpawns();for(const e of g.things().filter(t=>t.mBossKind&&t.Process===t.Process_Init))e.Process_Init();}
  const bosses=g.things().filter(t=>t.mBossKind).sort((a,b)=>a.mBossSlot-b.mBossSlot);expect(bosses).toHaveLength(bossCount(wave));expect(bosses[0]!.mCombatKind).toBe(wave===20?'hunter':'butcher');
  const e=bosses[0]!;e.mEnemyArmor=99;e.mCombatAimX=1;e.mCombatAimY=0;e.SetState(e.mCombatKind==='hunter'?'State_CombatHunt':'State_CombatCleave');e.mCombatTicks=7;
  const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);const restored=g.things().find(t=>t.Process&&t.mBossSlot===0&&t.mBossKind)!;expect(restored.mEnemyArmor).toBe(99);expect(restored.mCombatTicks).toBe(7);expect(timedWave(w)!.boss!.members).toHaveLength(bossCount(wave));
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs,run=()=>{for(let n=0;n<8;n++)restored[restored.mStateID]();};run();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);run();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);g.quit();
 }
});
it('keeps a protected casting Boss alive through absorbed hits while lethal hits still enter ordinary death',()=>{
 const g=boot(),w=g.world(),e=enemy(g,'hunter',true),p=g.players()[0];expect(beginDemonAttack(e)).toBe(true);e.mLife=50;e.mEnemyArmor=100;p.mInvincible=0;
 e.Affect(new Thing.Affect.CThing_Affect_Bullet(p,{mPosition:p.mPosition.Clone()},80,p.mAngle.Clone()));e.ProcessAffects();expect(e.mLife).toBe(50);expect(e.mStateID).toBe('State_CombatHunt');
 e.Affect(new Thing.Affect.CThing_Affect_Bullet(p,{mPosition:p.mPosition.Clone()},200,p.mAngle.Clone()));e.ProcessAffects();expect(e.mLife).toBeLessThanOrEqual(0);expect(['State_Dying','State_Dead']).toContain(e.mStateID);g.quit();
});
it('retains the previous ordinary/Boss art oracle with original feet and timing',()=>{
 const g=boot(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(const kind of ['butcher','hunter']as const)for(const boss of [false,true]){
  const c=demonCollection(kind,boss,true);expect(c.mItems.walk.mAnimationObject.mFrameCount).toBe(8);
  for(const [key,link]of Object.entries({stand:'Player_Stand',walk:'Player_Walk',attack:'Devil_Devil_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'})){
   const src=DI.mAnimationSets[link],derived=DI.mAnimationSets['Demon_'+kind+(boss?'Boss':'')+'_'+key];expect(derived.mFrameSequence).toEqual(src.mFrameSequence);
   for(let d=0;d<src.mDirections.length;d++)for(let f=0;f<src.mDirections[d].length;f++){
    const s=src.mDirections[d][f],models=derived.mDirections[d][f].Models;
    for(const name of ['Foot_Left','Foot_Right']){const foot=s.Models[name].Empty?DI.mGroups[s.rPartner]?.[s.mAnimID]?.mDirections[d]?.[f]?.Models[name]:s.Models[name];expect(models[name].Shape_vList).toEqual(foot.Shape_vList);expect(models[name].XSIInfo).toEqual(foot.XSIInfo);}
    for(const m of Object.values(models)as any[])if(m.Shape_vList?.length){expect(m.Shape_vList.length).toBe(m.Shape_Material.length);expect(m.Shape_vList.flat().every(Number.isFinite)).toBe(true);}
   }
  }
 }g.quit();
});
it('does not add new combat fields when restoring an old-capability variant',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true,classicCombat:true}),w=g.world(),e:any=new Thing.Creature.CThing_Creature_Devil(g.players()[0].mPosition.Clone());e.mEnemyVariant='priest';w.mThing_Collection.AddThing(e);e.Process_Init();
 const saved=capture(w);expect(Object.hasOwn(saved.variants!.enemies[0]!.fields,'mCombatKind')).toBe(false);expect(applyToWorld(w,saved)).toBe(true);
 const restored=g.things().find(t=>t.Process&&t.mEnemyVariant==='priest')!;expect(Object.hasOwn(restored,'mEnemyArmor')).toBe(false);expect(Object.hasOwn(restored,'mCombatKind')).toBe(false);g.quit();
});
