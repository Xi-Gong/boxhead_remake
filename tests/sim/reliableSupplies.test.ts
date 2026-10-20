import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { noSpawn } from './fxkit.ts';
import { redBoxReward } from '../../src/game/local/SupplyDrops.ts';
import { refillAmmo, supplyCanBenefit, armorMaximum } from '../../src/game/local/Supplies.ts';
import { capture, applyToWorld } from '../../src/game/local/Resume.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';

it('a single-weapon red reward fills inherited capacity without changing the selected weapon', () => {
  const g = createHeadlessGame({ mode: 'Single',classicCombat:true }); noSpawn(g);
  const p = g.players()[0]; p.NewWeapon('uzi'); p.SelectWeapon('uzi');
  p.mWeapon_Current.mTotalAmmo = 1200; p.mWeapon_Current.mAmmo = 17;
  expect(redBoxReward(p, .99)).toBe(true);
  expect(p.mWeapon_Current.mNameID).toBe('uzi');
  expect(p.mWeapon_Current.mTotalAmmo).toBe(1200);
  expect(p.mWeapon_Current.mAmmo).toBe(1200);
  g.tick(2); expect(p.mWeapon_Current.mAmmo).toBe(1200); g.quit();
});

it('synchronizes supply limits without granting ammo during an eligibility query', () => {
  const g=createHeadlessGame({classicTieredGrowth:true,mode:'Single'}); noSpawn(g);
  const p=g.players()[0],w=g.world(); p.NewWeapon('uzi'); p.mWeapons.uzi.mThing.mAmmo=7;
  w.mUpgrades.lanGrowth.players[0].level=39;
  expect(supplyCanBenefit(p,'ammo')).toBe(true);
  expect(p.mWeapons.uzi.mThing.mAmmo).toBe(7);
  expect(p.mWeapons.uzi.mThing.mTotalAmmo).toBe(400);
  expect(redBoxReward(p,.25)).toBe(true); expect(p.mLife).toBe(352);
  p.mArmor=0; expect(redBoxReward(p,.05)).toBe(true); expect(p.mArmor).toBe(armorMaximum(p));
  p.mLife=73;expect(redBoxReward(p,.15)).toBe(true);
  expect(p.mWeapons.uzi.mThing.mAmmo).toBe(400);expect(p.mLife).toBe(73);g.quit();
});

it.each([false,true])('negotiated refill rule=%s preserves the exact legacy path when absent',enabled=>{
  const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:3000,netcode:'rollback-v2',cfg:{
    progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',
    ...(enabled?{refill:'reliable-supplies-v1' as const}:{}),
    difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
  expect(g.waitRunning()).toBe(true);const p=g.players()[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');
  p.mWeapon_Current.mTotalAmmo=1200;p.mWeapon_Current.mAmmo=7;
  redBoxReward(p,.99);expect(p.mWeapon_Current.mAmmo).toBe(enabled?1200:100);g.quit();
});

it('whole-backpack supply preserves larger inherited capacities through an upgrade and resume', () => {
  const g = createHeadlessGame({ mode: 'Coop',classicCombat:true }); noSpawn(g);
  const p = g.players()[0], w = g.world(); p.NewWeapon('uzi'); p.NewWeapon('shotgun'); p.SelectWeapon('uzi');
  p.mWeapon_Current.mTotalAmmo = 1200; p.mWeapon_Current.mAmmo = 0;
  w.mUpgrades.lanGrowth.players[p.mPlayerIndex].level = 39;
  refillAmmo(p);
  expect(p.mWeapon_Current.mAmmo).toBe(1200);
  expect(p.mWeapons.shotgun.mThing.mAmmo).toBe(p.mWeapons.shotgun.mThing.mTotalAmmo);
  p.mLife = 73; p.mArmor = 37;
  const snap = capture(w); expect(applyToWorld(w, snap)).toBe(true);
  expect(p.mWeapon_Current.mAmmo).toBe(1200);
  expect(p.mWeapon_Current.mTotalAmmo).toBe(1200);
  expect([p.mLife, p.mArmor]).toEqual([73, 37]); g.quit();
});
