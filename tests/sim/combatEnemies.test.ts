import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,attemptTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureEnemyArmor,combatKillXp} from '../../src/game/local/CombatEnemies.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {xpRequired} from '../../src/game/local/Net/Growth.ts';
function enemy(g:any,family:string,kind?:string):any{
 const e=new (Thing.Creature as any)['CThing_Creature_'+family](g.players()[0].mPosition.Clone());if(kind)e.mEnemyVariant=kind;
 g.world().mThing_Collection.AddThing(e);e.Process_Init();return e;
}
it('multiplies each existing family HP, gives devil armor and differentiates combat speeds',()=>{
 const old=createHeadlessGame({classicCombat:true}),base=[enemy(old,'Zombie'),enemy(old,'Zombie','charger'),enemy(old,'Devil'),enemy(old,'Devil','priest')].map(e=>({hp:e.mMaxLife,speed:e.mSpeed}));old.quit();
 const g=createHeadlessGame(),enemies=[enemy(g,'Zombie'),enemy(g,'Zombie','charger'),enemy(g,'Devil'),enemy(g,'Devil','priest')];
 enemies.forEach((e,i)=>{expect(e.mMaxLife).toBeCloseTo(base[i]!.hp*(i<2?2.5:2));expect(e.mSpeed).toBeGreaterThan(base[i]!.speed);if(i>1)expect(e.mEnemyArmor).toBe(Math.ceil(e.mMaxLife*.3));});g.quit();
});
it('consumes armor without regeneration, records lethal ownership after absorption, and grants larger real kill XP',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],e=enemy(g,'Devil');e.mLife=100;e.mEnemyArmor=200;
 const hit=new Thing.Affect.CThing_Affect_Bullet(p,{mCombatPenetration:0},250,p.mAngle.Clone());hit.AffectThing(e);
 expect(e.mLife).toBe(50);expect(e.mEnemyArmor).toBe(0);expect(e.lanFatalSlot).toBeUndefined();
 new Thing.Affect.CThing_Affect_Bullet(p,{},60,p.mAngle.Clone()).AffectThing(e);expect(e.lanFatalSlot).toBe(0);
 w.LogKill(e);const growth=w.mUpgrades.lanGrowth.players[0];expect(growth.level).toBeGreaterThan(1);expect(growth.xp).toBeLessThan(xpRequired(growth));expect(combatKillXp(e)).toBe(10);g.quit();
});
it('saves ordinary devil and priest armor exactly and replays damage deterministically',()=>{
 const g=createHeadlessGame(),w=g.world(),e=enemy(g,'Devil'),priest=enemy(g,'Devil','priest');e.mEnemyArmor=77;priest.mEnemyArmor=123;
 const save=capture(w);expect(applyToWorld(w,save)).toBe(true);
 const restored=g.things().filter(t=>t.Process&&t.mEnemyArmorMaximum&&t.mLife>0);expect(restored.map(t=>t.mEnemyArmor).sort((a,b)=>a-b)).toEqual([77,123]);
 const target=restored[0]!,ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const run=()=>new Thing.Affect.CThing_Affect_Bullet(g.players()[0],{mCombatPenetration:.4},100,g.players()[0].mAngle.Clone()).AffectThing(target);
 run();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);run();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);
 expect(captureEnemyArmor(w).length).toBeGreaterThan(0);g.quit();
});
it('doubles existing Boss HP and adds forty percent consumable armor while preserving ordinary reinforcement limit',()=>{
 const g=createHeadlessGame(),w=g.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(5);expect(attemptTimedSpawn(w,'Zombie','boss')).toBe(true);g.tick(1);
 const boss=g.things().find(e=>e.mBossKind)!;expect(boss.mMaxLife).toBe(12000);expect(boss.mEnemyArmor).toBe(4800);expect(timedWave(w)!.boss!.members![0]!.maximum).toBe(12000);
 expect(combatKillXp(boss)).toBe(50);g.quit();
});
