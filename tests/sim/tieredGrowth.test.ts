import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {tieredXpRequired,tieredExperienceBeforeLevel,tieredGrowthFromExperience,tieredLevelStats,levelRewardTier} from '../../src/game/local/TieredGrowthRules.ts';
import {newGrowth,awardKill,growthOf,xpRequired} from '../../src/game/local/Net/Growth.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {syncVitals,playerMaximum} from '../../src/game/local/SurvivalRules.ts';
import {Thing} from '../../src/game/packages.ts';

it('front-loads basic/middle rewards and makes later levels progressively slower',()=>{
 expect([1,3,5,10,11,20,30,31,50,70,125].map(tieredXpRequired)).toEqual([2,2,3,5,6,10,15,20,77,137,302]);
 expect(tieredExperienceBeforeLevel(5)).toBe(9n);expect(tieredExperienceBeforeLevel(10)).toBe(27n);
 expect([2,10,11,30,31,125].map(levelRewardTier)).toEqual(['BASIC','BASIC','ADVANCED','ADVANCED','ELITE','ELITE']);
});
it('matches a simple earned-XP oracle and roundtrips boundaries at very high levels in bounded work',()=>{
 let xp=0n;for(let level=1;level<=250;level++){
  expect(tieredExperienceBeforeLevel(level)).toBe(xp);expect(tieredGrowthFromExperience(xp)).toEqual({level,xp:0});
  expect(tieredGrowthFromExperience(xp+BigInt(tieredXpRequired(level))-1n)).toEqual({level,xp:tieredXpRequired(level)-1});xp+=BigInt(tieredXpRequired(level));
 }
 for(const level of [1000000,Number.MAX_SAFE_INTEGER-1]){
  const before=tieredExperienceBeforeLevel(level);expect(tieredGrowthFromExperience(before)).toEqual({level,xp:0});
  expect(tieredExperienceBeforeLevel(level+1)-before).toBe(BigInt(tieredXpRequired(level)));
 }
});
it('pays stronger per-level permanent stats for slower advanced/elite levels',()=>{
 const delta=(a:number,b:number)=>{const x=tieredLevelStats(a),y=tieredLevelStats(b);return {vitality:y.vitality-x.vitality,damage:y.damage-x.damage,capacity:y.capacity-x.capacity};};
 expect(delta(9,10).vitality).toBe(4);expect(delta(10,11).vitality).toBe(6);expect(delta(30,31).vitality).toBe(10);
 expect(delta(10,11).damage).toBeCloseTo(.01);expect(delta(30,31).damage).toBeCloseTo(.02);
 expect(delta(30,31).capacity).toBeCloseTo(.01);
});
it('keeps classic XP APIs intact and awards exact tiered carry with no truncation',()=>{
 const old=newGrowth(1,true,true).players[0];expect(xpRequired(old)).toBe(5);
 const modern=newGrowth(1,true,true,true).players[0];expect(awardKill(modern,100,9)).toBe(100);
 expect([modern.level,modern.xp,modern.score]).toEqual([5,0,100]);expect(xpRequired(modern)).toBe(3);
 modern.level=Number.MAX_SAFE_INTEGER-2;modern.xp=Number.MAX_SAFE_INTEGER-1;awardKill(modern,0,5);
 expect([modern.level,modern.xp]).toEqual([Number.MAX_SAFE_INTEGER-1,4]);
});
it('uses real kill credit to unlock opening weapon rewards sooner without passive XP',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],state=growthOf(w)!.players[0];try{
  expect(state.tiered).toBe('tiered-growth-v1');expect(state.level).toBe(1);
  for(let n=0;n<9;n++){const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.mLife=0;e.lanFatalSlot=0;w.LogKill(e);}
  expect(state.level).toBe(5);expect(p.mWeapons.uzi.mActive).toBe(true);const before={...state};
  g.tick(30);expect(state.level).toBe(before.level);expect(state.xp).toBe(before.xp);
 }finally{g.quit();}
});
it('applies late-level HP/shield maxima, damage and only the new ammo capacity delta',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],state=growthOf(w)!.players[0];try{
  state.level=30;state.xp=tieredXpRequired(30)-1;p.NewWeapon('uzi');syncVitals(p,'restore');
  const gun=p.mWeapons.uzi.mThing;w.mUpgrades.ApplyUpgrade_Weapon(gun);gun.mAmmo=7;p.mLife=85;p.mArmor=19;
  const maximum=playerMaximum(p),capacity=gun.mTotalAmmo;
  const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.mLife=0;e.lanFatalSlot=0;w.LogKill(e);
  expect(state.level).toBe(31);expect(p.mMaxLife-maximum).toBe(10);expect(p.mLife).toBe(95);expect(p.mArmor).toBe(19);
  expect(gun.mDamage).toBeCloseTo(35*1.22);expect(gun.mTotalAmmo).toBeGreaterThan(capacity);expect(gun.mAmmo).toBe(7+gun.mTotalAmmo-capacity);
  w.mHud.Pause(true);expect(w.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text).toContain('HP 366 / SHIELD 366');
 }finally{g.quit();}
});
it('persists new curves and rejects incapable loads before mutation while preserving old run progression',()=>{
 const g=createHeadlessGame(),w=g.world();growthOf(w)!.players[0].xp=1;const modern=capture(w);g.quit();
 const legacy=createHeadlessGame({classicTieredGrowth:true}),old=legacy.world(),before=capture(old);
 expect(applyToWorld(old,modern)).toBe(false);expect(capture(old)).toEqual(before);const saved=capture(old);legacy.quit();
 const next=createHeadlessGame(),world=next.world();try{
  expect(applyToWorld(world,modern)).toBe(true);expect(growthOf(world)!.players[0].tiered).toBe('tiered-growth-v1');expect(xpRequired(growthOf(world)!.players[0])).toBe(2);
  expect(applyToWorld(world,saved)).toBe(true);expect(growthOf(world)!.players[0].tiered).toBeUndefined();expect(xpRequired(growthOf(world)!.players[0])).toBe(5);
 }finally{next.quit();}
});
