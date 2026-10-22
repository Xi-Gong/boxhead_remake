import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {applyWaveReward,rewardOffers,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {PERCENT_STATS,statPercent} from '../../src/game/local/PercentStats.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {rewardPreview} from '../../src/game/local/WaveDraftUi.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {enchantHeldWeapon} from '../../src/game/local/EnchantmentRules.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {getRandomState,setRandomState} from '../../src/engine/flash/rng.ts';
import {mathRandom} from '../../src/engine/runtime.ts';
import {dodgeChance} from '../../src/game/local/Dodge.ts';

it('adds exact percentage points, displays matching single/double previews and caps every stat',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  p.NewWeapon('uzi');p.SelectWeapon('uzi');const gun=p.mWeapon_Current;
  const stats=capturePlayerStats(w)[0]!;expect(stats.percentages!.damage).toBe(0);
  expect(rewardPreview(stats,'mobility',2)).toContain('+0% > +8%');expect(rewardPreview(stats,'dodge',2)).toContain('+0% > +6%');
  for(const reward of ['damage','health','armor','capacity','haste','mobility','scavenging','endurance','enchantPower','dodge']as const)applyWaveReward(w,0,reward,2);
  const next=capturePlayerStats(w)[0]!;
  for(const [key,spec]of Object.entries(PERCENT_STATS))expect(next.percentages![key]).toBeCloseTo(stats.percentagePreviews![key]![1]);
  expect(gun.mDamage).toBeCloseTo(stats.damage*1.16);expect(gun.mTotalAmmo).toBe(145);expect(p.mSpeed).toBeCloseTo(.16*1.08);expect(p.mSupplyEfficiency).toBeCloseTo(.2);
  for(const [key,spec]of Object.entries(PERCENT_STATS)){expect(statPercent(key as any,{damage:1e12,health:1e12,armor:1e12,capacity:1e12,[key]:1e12})).toBeCloseTo(spec.cap/100);}
  Object.assign(waveDraft(w)!.bonuses[0],Object.fromEntries(Object.keys(PERCENT_STATS).map(key=>[key,10000])));
  syncVitals(p,'restore');const high=capturePlayerStats(w)[0]!;for(const [key,spec]of Object.entries(PERCENT_STATS))expect(high.percentages![key]).toBeLessThanOrEqual(spec.cap/100+1e-8);
  for(let n=0;n<20;n++)expect(rewardOffers(p).every(r=>r==='heal'||r==='ammo')).toBe(true);
 }finally{g.quit();}
});
it('distributes fresh selected-wave builds over ten stats, leaving saved allocations untouched',()=>{
 const b=startingBonuses(21,true,true,true,true,true);expect(Object.values(b).reduce((n,v)=>n+v,0)).toBe(20);expect(b.dodge).toBe(2);
 const g=createHeadlessGame(),w=g.world();try{applyWaveReward(w,0,'dodge',3);const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);expect(waveDraft(w)!.bonuses).toEqual(saved.waveDraft!.bonuses);expect(dodgeChance(g.players()[0])).toBeCloseTo(.09);}finally{g.quit();}
});
it('converts old v2 builds once without healing, replenishing ammunition or reactivating exhausted enchantment',()=>{
 const old=createHeadlessGame({classicFeatures:['percent-stats-v1']});let saved:any;try{
  const w=old.world(),p=old.players()[0];w.mUpgrades.lanGrowth.players[0].level=50;applyWaveReward(w,0,'health',5);p.mLife=p.mMaxLife/2;p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=7;enchantHeldWeapon(p);p.mWeapon_Current.mEnchantDurability=0;saved=capture(w);
 }finally{old.quit();}
 const g=createHeadlessGame(),w=g.world();try{
  expect(applyToWorld(w,saved)).toBe(true);const p=g.players()[0];expect(p.mLife).toBeLessThanOrEqual(saved.players[0].life);expect(p.mLife/p.mMaxLife).toBeCloseTo(.5,2);expect(p.mWeapon_Current.mAmmo).toBe(7);expect(p.mWeapon_Current.mEnchantDurability).toBe(0);expect(waveDraft(w)!.bonuses).toEqual(saved.waveDraft.bonuses);
  const now=capture(w);for(let n=0;n<3;n++){expect(applyToWorld(w,now)).toBe(true);expect(capture(w).players).toEqual(now.players);}
 }finally{g.quit();}
});
it('resolves seeded dodge before armor and hit reactions, with exactly one draw per eligible incoming hit',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  applyWaveReward(w,0,'dodge',100);expect(dodgeChance(p)).toBe(.5);
  const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.Move(p.mPosition.Add(new Thing.Math.CThing_Position(1,0,0)));
  setRandomState(11235);const expected=Array.from({length:100},()=>mathRandom()<.5),end=getRandomState();setRandomState(11235);
  let evaded=0;for(const dodge of expected){p.mLife=160;p.mArmor=40;p.mInvincible=0;p.SetState('State_PlayerControl');const state=p.mStateID;
   p.mAffectors=[new Thing.Affect.CThing_Affect_ZombieAttack(e,50)];p.ProcessAffects();
   expect(p.mLife).toBe(dodge?160:150);expect(p.mArmor).toBe(dodge?40:0);if(dodge){expect(p.mStateID).toBe(state);evaded++;}
  }expect(getRandomState()).toBe(end);expect(evaded).toBe(expected.filter(Boolean).length);expect(evaded).toBeGreaterThan(25);expect(evaded).toBeLessThan(75);
 }finally{g.quit();}
});
it('replays dodge and the following RNG exactly from a pre-input rollback snapshot',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  applyWaveReward(w,0,'dodge',10);p.mInvincible=0;
  const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.Move(p.mPosition.Add(new Thing.Math.CThing_Position(1,0,0)));p.mAffectors=[new Thing.Affect.CThing_Affect_ZombieAttack(e,50)];
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};p.ProcessAffects();const result=simulationDigest(captureWorldSnap(w,ctx,false)),rng=getRandomState();
  restoreWorldSnap(w,slot,ctx);p.ProcessAffects();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(result);expect(getRandomState()).toBe(rng);
 }finally{g.quit();}
});
it.each([false,true])('makes no dodge draw for zero chance, spawn protection, dead players or legacy peers (legacy=%s)',legacy=>{
 const g=createHeadlessGame({classicFeatures:legacy?['percent-stats-v1']:[]}),p=g.players()[0],w=g.world();try{
  const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();
  for(const mode of ['zero','protected','dead']){waveDraft(w)!.bonuses[0].dodge=mode==='zero'?0:100;p.mInvincible=mode==='protected'?10:0;p.mLife=mode==='dead'?0:160;p.mAffectors=[new Thing.Affect.CThing_Affect_ZombieAttack(e,10)];const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};p.ProcessAffects();const after=getRandomState();restoreWorldSnap(w,slot,ctx);Thing.Creature.CThing_Creature.prototype.ProcessAffects.call(p);expect(after).toBe(getRandomState());}
 }finally{g.quit();}
});
