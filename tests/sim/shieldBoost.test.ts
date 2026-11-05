import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {armorMaximum,CThing_Object_SupplyCrate} from '../../src/game/local/Supplies.ts';
import {syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {applyWaveReward} from '../../src/game/local/WaveDraft.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {enchantHeldWeapon,enchantedAmmo} from '../../src/game/local/EnchantmentRules.ts';

it('starts empty with a sixty-point maximum, fills from a real useful crate and spills only excess damage',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  expect(armorMaximum(p)).toBe(60);expect(p.mArmor??0).toBe(0);p.mLife=91;
  const crate=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone(),'armor','shield-test'));
  crate.Process_DeleteCounter_Init();crate.PickedUp();expect(p.mArmor).toBe(60);expect(p.mLife).toBe(91);
  const hit=new Thing.Affect.CThing_Affect_Bullet(p,p,70,p.mAngle.Clone());expect(hit.AffectThing(p)).toBe(70);
  expect([p.mArmor,p.mLife]).toEqual([0,81]);crate.PickedUp();expect([p.mArmor,p.mLife]).toEqual([0,81]);
 }finally{g.quit();}
});

it('uses exact single/double shield previews and keeps the HP constraint effective after health and armor picks',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  const before=capturePlayerStats(w)[0]!;expect(before.percentages!.armor).toBe(0);expect(before.previews!.armor).toEqual([63,64]);
  expect(before.percentagePreviews!.armor![0]).toBeCloseTo(.06);expect(before.percentagePreviews!.armor![1]).toBeCloseTo(1/15);
  applyWaveReward(w,0,'armor',2);expect(armorMaximum(p)).toBe(64);expect(p.mArmor??0).toBe(0);
  expect(capturePlayerStats(w)[0]!.percentages!.armor).toBeCloseTo(before.percentagePreviews!.armor![1]);
  applyWaveReward(w,0,'health',1);expect(p.mMaxLife).toBe(173);expect(armorMaximum(p)).toBe(67);
  applyWaveReward(w,0,'armor',1);expect(armorMaximum(p)).toBe(69);expect(armorMaximum(p)).toBeLessThanOrEqual(p.mMaxLife*.4);
  for(const level of [1,10,30,125,100000])for(const health of [0,1,5,1000])for(const armor of [0,1,2,25,1000]){
   w.mUpgrades.lanGrowth.players[0].level=level;Object.assign(w.mUpgrades.waveDraft.bonuses[0],{health,armor});syncVitals(p,'restore');
   const stats=capturePlayerStats(w)[0]!;expect(armorMaximum(p)).toBeLessThanOrEqual(Math.floor(p.mMaxLife*.4));
   expect(armorMaximum(p)).toBeLessThanOrEqual(150);expect(stats.percentages!.armor).toBeLessThanOrEqual(1.5);
   expect(stats.previews!.armor!.every(n=>n<=Math.floor(p.mMaxLife*.4))).toBe(true);
  }
 }finally{g.quit();}
});

it('keeps saved old shield stock, health, ammo and exhausted enchantment across the new base and repeated restores',()=>{
 const old=createHeadlessGame({classicFeatures:['shield-boost-v1']});let saved:any;
 try{
  const p=old.players()[0];expect(armorMaximum(p)).toBe(40);p.mArmor=29;p.mLife=89;p.NewWeapon('shotgun');p.SelectWeapon('shotgun');p.mWeapon_Current.mAmmo=6;
  enchantHeldWeapon(p);p.mWeapon_Current.mEnchantDurability=0;saved=capture(old.world());
 }finally{old.quit();}
 const g=createHeadlessGame();try{
  const w=g.world(),p=g.players()[0];expect(applyToWorld(w,saved)).toBe(true);expect(armorMaximum(p)).toBe(60);
  for(let n=0;n<3;n++){
   expect([p.mArmor,p.mLife,p.mWeapon_Current.mAmmo,enchantedAmmo(p.mWeapon_Current)]).toEqual([29,89,6,0]);
   expect(applyToWorld(w,capture(w))).toBe(true);
  }
  saved=capture(w);
 }finally{g.quit();}
 const legacy=createHeadlessGame({classicFeatures:['shield-boost-v1']});try{
  const before=capture(legacy.world());expect(applyToWorld(legacy.world(),saved)).toBe(false);expect(capture(legacy.world())).toEqual(before);
 }finally{legacy.quit();}
});
