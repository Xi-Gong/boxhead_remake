import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {placePlayer} from './fxkit.ts';
import {Thing} from '../../src/game/packages.ts';
import {rewardOffers,applyWaveReward,beginWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {passiveBonuses} from '../../src/game/local/CombatRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {applySupplyEffect,armorMaximum} from '../../src/game/local/Supplies.ts';
import {redBoxReward} from '../../src/game/local/SupplyDrops.ts';
import {recordWaveReached} from '../../src/game/local/WaveUnlock.ts';
import {setSelectedStartWave} from '../../src/game/local/StartWave.ts';

it('offers distinct offense/defense/utility choices with actual benefits and seeded variety',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];p.NewWeapon('uzi');p.NewWeapon('shotgun');p.mWeapons.uzi.mThing.mAmmo=0;p.mLife=50;
 const seen=new Set<string>();
 for(let n=0;n<150;n++){
  const o=rewardOffers(p);expect(new Set(o).size).toBe(3);expect(['damage','haste','penetration']).toContain(o[0]);
  expect(['health','armor','heal']).toContain(o[1]);expect(['capacity','mobility','scavenging','ammo']).toContain(o[2]);o.forEach(x=>seen.add(x));
 }
 expect(seen.size).toBe(10);g.quit();
 const samples=()=>{const g=createHeadlessGame({classicSimplifiedCombat:true,seed:999}),p=g.players()[0];const o=Array.from({length:12},()=>rewardOffers(p));g.quit();return o;};
 expect(samples()).toEqual(samples());
});
it('applies actual speed/rate/piercing/supply bonuses and restores their derived values without free refill',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];p.NewWeapon('shotgun');const delay=p.mWeapons.shotgun.mThing.mFireRate;
 for(const reward of ['mobility','haste','penetration','scavenging']as const)applyWaveReward(w,0,reward,3);
 expect(p.mSpeed).toBeGreaterThan(.16);expect(p.mSpeed).toBeLessThan(.2);expect(p.mArmorPenetration).toBeGreaterThan(0);expect(p.mSupplyEfficiency).toBeGreaterThan(0);
 expect(p.mWeapons.shotgun.mThing.mFireRate).toBeLessThan(delay);p.mWeapons.shotgun.mThing.mAmmo=2;
 const values=[p.mSpeed,p.mArmorPenetration,p.mSupplyEfficiency],save=capture(w);expect(applyToWorld(w,save)).toBe(true);
 expect([p.mSpeed,p.mArmorPenetration,p.mSupplyEfficiency]).toEqual(values);expect(p.mWeapons.shotgun.mThing.mAmmo).toBe(2);g.quit();
});
it('captures piercing at emission, absorbs the remaining damage, and observes real lethal ownership',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];applyWaveReward(w,0,'penetration',3);p.NewWeapon('uzi');
 p.mWeapons.uzi.mThing.Fire(p.mPosition.Clone(),p.mAngle.Clone());const shot=g.things().find(t=>t._CLASSID_==='CThing_Shot_Bullet')!;
 const pen=shot.mCombatPenetration;applyWaveReward(w,0,'penetration',8);expect(shot.mCombatPenetration).toBe(pen);expect(p.mArmorPenetration).toBeGreaterThan(pen);
 const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();e.mLife=1000;e.mEnemyArmor=200;
 const hit=new Thing.Affect.CThing_Affect_Bullet(p,shot,100,p.mAngle.Clone());hit.AffectThing(e);
 expect(e.mLife).toBeCloseTo(1000-100*pen);expect(e.mEnemyArmor).toBeCloseTo(200-100*(1-pen));expect(hit.mDamage).toBe(100);
 e.mLife=50;e.mEnemyArmor=100;const plain=new Thing.Affect.CThing_Affect_Bullet(p,{mCombatPenetration:0},100,p.mAngle.Clone());
 plain.AffectThing(e);expect(e.mLife).toBe(50);expect(e.lanFatalSlot).toBeUndefined();plain.AffectThing(e);expect(e.mLife).toBe(-50);expect(e.lanFatalSlot).toBe(0);g.quit();
});
it('makes scavenging improve partial health/shield/ammo supplies without replacing enchanted weapons',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');const gun=p.mWeapon_Current;
 p.mLife=10;expect(applySupplyEffect(p,'medical')).toBe(true);const ordinary=p.mLife;p.mLife=10;applyWaveReward(w,0,'scavenging',5);
 expect(applySupplyEffect(p,'medical')).toBe(true);expect(p.mLife).toBeGreaterThan(ordinary);expect(p.mLife).toBeLessThan(p.mMaxLife);
 p.mArmor=0;expect(applySupplyEffect(p,'armor')).toBe(true);expect(p.mArmor).toBeGreaterThan(armorMaximum(p)*.4);expect(p.mArmor).toBeLessThan(armorMaximum(p));
 gun.mAmmo=1;gun.mPersistentEnchantment=true;expect(redBoxReward(p,.99)).toBe(true);
 expect(p.mWeapon_Current).toBe(gun);expect(gun.mAmmo).toBeGreaterThan(gun.mTotalAmmo*.4);expect(gun.mAmmo).toBeLessThan(gun.mTotalAmmo);expect(gun.mPersistentEnchantment).toBe(true);g.quit();
});
it('keeps saved mines at their emitted piercing value while later build choices persist',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=placePlayer(g,5.5,8.5,0);applyWaveReward(w,0,'penetration',2);p.NewWeapon('mine');p.SelectWeapon('mine');
 p.mWeapon_Current.Fire(p.GetWeaponPosition(),p.mAngle.Clone());const mine=g.things().find(t=>t._CLASSID_==='CThing_Object_Mine')!;expect(mine).toBeTruthy();
 const pen=mine.mCombatPenetration;applyWaveReward(w,0,'penetration',5);const save=capture(w);
 expect(save.objects.find(o=>o.classID==='CThing_Object_Mine')!.penetration).toBe(pen);expect(applyToWorld(w,save)).toBe(true);
 const restored=g.things().find(t=>t._CLASSID_==='CThing_Object_Mine')!;expect(restored.mCombatPenetration).toBe(pen);expect(p.mArmorPenetration).toBeGreaterThan(pen);g.quit();
});
it('distributes selected-wave permanent builds across eight attributes in constant work',()=>{
 for(const wave of [1,2,9,1000000,Number.MAX_SAFE_INTEGER]){
  const b=startingBonuses(wave,true);expect(Object.values(b).reduce((a,v)=>a+v,0)).toBe(wave-1);
  const stats=passiveBonuses(b);expect(stats.movement).toBeLessThanOrEqual(.25);expect(stats.penetration).toBeLessThanOrEqual(.6);expect(stats.supply).toBeLessThanOrEqual(.6);
 }
 const g=createHeadlessGame({classicSimplifiedCombat:true,menuOnly:'Select'});recordWaveReached(17);setSelectedStartWave(17);
 g.main().mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button.onRelease();expect(g.waitRunning()).toBe(true);
 const w=g.world();expect(w.mUpgrades.mLevelIndex).toBe(17);beginWaveDraft(w);expect(waveDraft(w)!.bonuses[0].mobility).toBe(2);g.quit();
});
