import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {Thing} from '../../src/game/packages.ts';
import {canEnchant,enchantHeldWeapon,enchantedAmmo,durabilityMaximum,syncDurability} from '../../src/game/local/EnchantmentRules.ts';
import {refillAmmo} from '../../src/game/local/Supplies.ts';
import {applyWaveReward,rewardOffers} from '../../src/game/local/WaveDraft.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureCratePayload,applyCratePayload} from '../../src/game/local/WeaponCrate.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';

it('uses exact per-weapon budgets and consumes one unit per successful emission or placement',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);placePlayer(g,5.5,8.5);
  const budgets={pistol:60,uzi:120,shotgun:30,railgun:30,rocket:24,grenade:24,barrel:12,mine:12,chargepack:12};let x=7.5;
  for(const [name,budget]of Object.entries(budgets)){
   if(name!=='pistol')p.NewWeapon(name);p.SelectWeapon(name);const gun=p.mWeapon_Current;
   expect(durabilityMaximum(gun)).toBe(budget);expect(enchantHeldWeapon(p)).toBe(true);
   gun.Fire(pos(x++,8.5),p.mAngle.Clone(),0);expect(enchantedAmmo(gun)).toBe(budget-1);
  }
  p.NewWeapon('fakewall');p.SelectWeapon('fakewall');expect(canEnchant(p)).toBe(false);
  p.SelectWeapon('barrel');const gun=p.mWeapon_Current,cell=w.mMap.GetCell(8.5,8.5),before=enchantedAmmo(gun);cell.mChildCount=2;
  gun.Fire(pos(8.5,8.5),p.mAngle.Clone());expect(enchantedAmmo(gun)).toBe(before);
 }finally{g.quit();}
});
it('keeps the last shotgun volley enchanted and retains durability through empty ammo, refills and reconstruction',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);p.NewWeapon('shotgun');p.SelectWeapon('shotgun');let gun=p.mWeapon_Current;
  gun.mAmmo=1;enchantHeldWeapon(p);gun.mEnchantDurability=1;gun.Fire(p.mPosition.Clone(),p.mAngle.Clone());
  const shots=g.things().filter(t=>t._CLASSID_==='CThing_Shot_Bullet');expect(shots.length).toBeGreaterThanOrEqual(3);expect(shots.every(s=>s.mEnchanted&&Math.abs(s.mDamage-gun.mDamage*1.15)<1e-6)).toBe(true);
  expect(enchantedAmmo(gun)).toBe(0);refillAmmo(p);expect(enchantedAmmo(gun)).toBe(0);
  enchantHeldWeapon(p);gun.mAmmo=0;const before=enchantedAmmo(gun);gun.Update({IsPressed:()=>true,IsReleased:()=>false,IsDown:()=>true});expect(enchantedAmmo(gun)).toBe(before);
  expect(canEnchant(p)).toBe(false);gun.mEnchantDurability-=2;expect(enchantHeldWeapon(p)).toBe(true);
  gun.mEnchantDurability=7;refillAmmo(p);expect(enchantedAmmo(gun)).toBe(7);p.AddWeapon('shotgun');gun=p.mWeapon_Current;expect(enchantedAmmo(gun)).toBe(7);
  gun.mAmmo=0;const snap=capture(w);expect(applyToWorld(w,snap)).toBe(true);expect([p.mWeapon_Current.mAmmo,enchantedAmmo(p.mWeapon_Current)]).toEqual([0,7]);
  expect(applyToWorld(w,capture(w))).toBe(true);expect(enchantedAmmo(p.mWeapon_Current)).toBe(7);
 }finally{g.quit();}
});
it('adds only growth capacity deltas and exposes exact endurance reward previews without reviving exhaustion',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  p.NewWeapon('uzi');p.SelectWeapon('uzi');const gun=p.mWeapon_Current;enchantHeldWeapon(p);gun.mEnchantDurability=3;
  w.mUpgrades.lanGrowth.players[0].level=11;w.mUpgrades.ApplyUpgrade_Weapon(gun);const first=durabilityMaximum(gun);expect(enchantedAmmo(gun)).toBe(3+first-120);
  const preview=capturePlayerStats(w)[0]!.previews!.endurance![1];applyWaveReward(w,0,'endurance',2);expect(durabilityMaximum(gun)).toBe(preview);expect(enchantedAmmo(gun)).toBe(3+preview-120);
  gun.mEnchantDurability=0;applyWaveReward(w,0,'endurance',1);syncDurability(gun);expect(enchantedAmmo(gun)).toBe(0);
  let seen=false;for(let n=0;n<100;n++)seen||=rewardOffers(p).includes('endurance');expect(seen).toBe(true);
  const b=startingBonuses(17,true,true,true);expect(Object.values(b).reduce((a,n)=>a+n,0)).toBe(16);expect(b.endurance).toBe(2);
  expect(durabilityMaximum({...gun,mWorld:{mUpgrades:{lanGrowth:{players:[{level:1e12}]}}}})).toBeLessThanOrEqual(360);
 }finally{g.quit();}
});
it('moves empty enchanted stock through death crates and merges by maximum without creating ammunition',()=>{
 const g=createHeadlessGame({mode:'Coop'}),[p,q]=g.players();try{
  p.NewWeapon('uzi');p.SelectWeapon('uzi');enchantHeldWeapon(p);p.mWeapon_Current.mAmmo=0;p.mWeapon_Current.mEnchantDurability=17;
  const payload=captureCratePayload(p)!;expect(payload.weapons[0]!.enchantDurability).toBe(17);
  p.ResetWeapons();expect(enchantedAmmo(p.mWeapons.uzi.mThing)).toBe(0);
  applyCratePayload(q,payload);q.SelectWeapon('uzi');expect([q.mWeapon_Current.mAmmo,enchantedAmmo(q.mWeapon_Current)]).toEqual([0,17]);
  applyCratePayload(q,payload);expect(enchantedAmmo(q.mWeapon_Current)).toBe(17);
 }finally{g.quit();}
});
it.each([true,false])('migrates surviving old enchantment once (persistent=%s)',persistent=>{
 const old=createHeadlessGame({classicFeatures:['enchant-durability-v1'],classicEnchantment:!persistent}),p=old.players()[0];let saved:any;
 try{p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=7;enchantHeldWeapon(p);saved=capture(old.world());}finally{old.quit();}
 const g=createHeadlessGame();try{
  expect(applyToWorld(g.world(),saved)).toBe(true);const gun=g.players()[0].mWeapon_Current;expect(enchantedAmmo(gun)).toBe(persistent?120:7);
  gun.mEnchantDurability=2;expect(applyToWorld(g.world(),capture(g.world()))).toBe(true);expect(enchantedAmmo(g.players()[0].mWeapon_Current)).toBe(2);
 }finally{g.quit();}
});
