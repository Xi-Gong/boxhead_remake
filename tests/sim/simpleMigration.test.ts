import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {armorMaximum} from '../../src/game/local/Supplies.ts';
import {timedWave,clearWaveCombat} from '../../src/game/local/TimedWaves.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';
import {pos} from './fxkit.ts';
import {redBoxReward} from '../../src/game/local/SupplyDrops.ts';
import {applySupplyEffect,refillAmmo} from '../../src/game/local/Supplies.ts';
import {applyWaveReward} from '../../src/game/local/WaveDraft.ts';
import {captureCratePayload,applyCratePayload} from '../../src/game/local/WeaponCrate.ts';
import {replenishedAmmo} from '../../src/game/local/CombatRules.ts';
it('immediately migrates vitals, piercing choices and placed enchantment exactly once without mutating the old save',()=>{
 const old=createHeadlessGame({classicSimplifiedCombat:true}),w=old.world(),p=old.players()[0];
 Object.assign(w.mUpgrades.waveDraft.bonuses[0],{damage:2,health:1,armor:1,penetration:3});syncVitals(p,'full');p.mLife=110;p.mArmor=110;
 p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=7;p.SelectWeapon('uzi');p.mWeapon_Current.mPersistentEnchantment=true;p.mWeapon_Current.mEnchantedAmmo=7;
 w.mUpgrades.lanGrowth.players[0].score=321;w.mUpgrades.lanGrowth.players[0].xp=1;
 const mine:any=new Thing.Object.CThing_Object_Mine(pos(7.5,8.5),p.mAngle,p,135);mine.mEnchanted=true;w.mThing_Collection.AddThing(mine);mine.Process_Init();
 w.mUpgrades.FinishTimedWave();w.mUpgrades.waveDraft.round.offers[0]=['penetration','health','armor'];
 const saved=capture(w),original=structuredClone(saved);old.quit();
 const g=createHeadlessGame({classicFeatures:['fragile-armor-v1','enchant-durability-v1']}),world=g.world();try{
  expect(applyToWorld(world,saved)).toBe(true);expect(saved).toEqual(original);const q=g.players()[0],b=world.mUpgrades.waveDraft.bonuses[0];
  expect(world.mUpgrades.combat).toEqual({rule:'combat-pve-v3'});expect([q.mMaxLife,q.mLife,armorMaximum(q),q.mArmor]).toEqual([173,87,64,32]);
  expect([b.damage,b.penetration]).toEqual([5,undefined]);expect(world.mUpgrades.waveDraft.round.offers[0]).toEqual(['damage','health','armor']);
  expect([world.mUpgrades.lanGrowth.players[0].score,world.mUpgrades.lanGrowth.players[0].xp,q.mWeapon_Current.mAmmo]).toEqual([321,1,7]);
  expect(q.mWeapon_Current.mPersistentEnchantment).toBe(true);expect(g.things().find(e=>e.Process&&e._CLASSID_==='CThing_Object_Mine')!.mDamage).toBeCloseTo(115);
  expect(getRandomState()).toBe(saved.rngState);const next=capture(world);expect(applyToWorld(world,next)).toBe(true);
  expect(capture(world).players).toEqual(next.players);expect(world.mUpgrades.waveDraft.bonuses).toEqual(next.waveDraft!.bonuses);
  expect(g.things().find(e=>e.Process&&e._CLASSID_==='CThing_Object_Mine')!.mDamage).toBeCloseTo(115);
 }finally{g.quit();}
});
it('converts retired enemies by family and health fraction, keeping the clock and a reachable finite objective',()=>{
 const old=createHeadlessGame({classicSimplifiedCombat:true}),w=old.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(36);
 for(const [family,kind]of [['Zombie','brute'],['Zombie','gunner'],['Devil','butcher'],['Devil','priest']]){
  const e:any=new (Thing.Creature as any)['CThing_Creature_'+family](pos(8.5,8.5));if(kind==='priest')e.mEnemyVariant=kind;else e.mCombatKind=kind;
  w.mThing_Collection.AddThing(e);e.Process_Init();e.mLife=e.mMaxLife*.4;e.mEnemyArmor=77;
 }
 timedWave(w)!.remainingTicks=1234;timedWave(w)!.clear!.killedZombies=7;timedWave(w)!.clear!.killedDevils=1;
 const saved=capture(w);old.quit();const g=createHeadlessGame(),world=g.world();try{
  expect(applyToWorld(world,saved)).toBe(true);const enemies=g.things().filter(e=>e.Process&&['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(e._CLASSID_));
  expect(enemies).toHaveLength(4);for(const e of enemies){expect(e.mCombatKind).toBeUndefined();expect(e.mEnemyVariant).toBeUndefined();expect(e.mEnemyArmor).toBeUndefined();expect(e.mLife/e.mMaxLife).toBeCloseTo(.4);expect(e.mStateID).toBe('State_GotoPlayer');}
  const t=timedWave(world)!;expect(t.remainingTicks).toBe(1234);expect(t.clear!.emittedZombies).toBe(t.clear!.killedZombies+2);expect(t.clear!.emittedDevils).toBe(t.clear!.killedDevils+2);
  expect(t.clear!.zombies).toBeGreaterThan(t.clear!.killedZombies);expect(t.clear!.devils).toBeGreaterThan(t.clear!.killedDevils);expect(world.mUpgrades.enemyVariantState.zones).toEqual([]);expect(getRandomState()).toBe(saved.rngState);
 }finally{g.quit();}
});
it('reconnects converted Boss members and restores their captured fraction under the new native identity',()=>{
 const old=createHeadlessGame({classicSimplifiedCombat:true}),w=old.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(20);
 for(let i=0;i<2;i++){w.mUpgrades.ProcessTimedSpawns();old.tick(1);}
 for(const e of old.things().filter(e=>e.mBossKind)){e.mLife=e.mMaxLife*.3;e.mEnemyArmor=99;}
 const saved=capture(w);old.quit();const g=createHeadlessGame(),world=g.world();try{
  expect(applyToWorld(world,saved)).toBe(true);const b=timedWave(world)!.boss!;expect(b.members!.map(m=>m.kind)).toEqual(['devil','charger']);
  for(const m of b.members!){const e=world.mThing_Collection.mThings[m.id!];expect(e.mBossKind).toBe(m.kind);expect(e.mLife/e.mMaxLife).toBeCloseTo(.3);expect(e.mEnemyArmor).toBeUndefined();expect(m.maximum).toBe(e.mMaxLife);}
  const next=capture(world);expect(applyToWorld(world,next)).toBe(true);expect(timedWave(world)!.boss!.members!.map(m=>m.kind)).toEqual(['devil','charger']);
 }finally{g.quit();}
});
it('initializes a deadline for an old untimed save and preserves dead players and empty armor',()=>{
 const old=createHeadlessGame({classicTimedWaves:true}),w=old.world();old.players()[0].mLife=0;old.players()[0].mArmor=0;const saved=capture(w);old.quit();
 const g=createHeadlessGame();try{expect(applyToWorld(g.world(),saved)).toBe(true);expect(g.world().mUpgrades.combat.rule).toBe('combat-pve-v3');expect(timedWave(g.world())!.clear).toBeDefined();expect([g.players()[0].mLife,g.players()[0].mArmor]).toEqual([0,0]);}finally{g.quit();}
});
it('rejects a v3 save on v2 before any mutation',()=>{
 const modern=createHeadlessGame(),saved=capture(modern.world());modern.quit();const old=createHeadlessGame({classicSimplifiedCombat:true});try{
  const before=capture(old.world());expect(applyToWorld(old.world(),saved)).toBe(false);expect(capture(old.world())).toEqual(before);
 }finally{old.quit();}
});
it('keeps larger legacy magazines through processing, supplies and death-crate recovery while still consuming shots',()=>{
 const old=createHeadlessGame({classicCombat:true}),w=old.world(),p=old.players()[0];
 w.mUpgrades.lanGrowth.players[0].level=125;p.NewWeapon('uzi');p.SelectWeapon('uzi');w.mUpgrades.ApplyUpgrade_Weapon(p.mWeapon_Current);
 const stock=p.mWeapon_Current.mAmmo=p.mWeapon_Current.mTotalAmmo;
 const saved=capture(w);old.quit();const g=createHeadlessGame();try{
  expect(applyToWorld(g.world(),saved)).toBe(true);const gun=g.players()[0].mWeapons.uzi.mThing;
  expect(gun.mAmmo).toBe(stock);expect(gun.mTotalAmmo).toBeLessThan(stock);
  g.tick(2);expect(gun.mAmmo).toBe(stock);
  const q=g.players()[0],world=g.world();q.NewWeapon('shotgun');
  for(const entry of q.mWeaponList)entry.mActive=['pistol','uzi','shotgun'].includes(entry.mNameID);
  const shotgun=q.mWeapons.shotgun.mThing;
  // With one full/overfull and one empty gun, either insertion order must put the middle roll on the empty gun.
  shotgun.mAmmo=0;expect(redBoxReward(q,.5)).toBe(true);expect(shotgun.mAmmo).toBeGreaterThan(0);expect(gun.mAmmo).toBe(stock);
  for(const roll of [0,.999]){redBoxReward(q,roll);expect(gun.mAmmo).toBe(stock);}
  shotgun.mAmmo=0;expect(applySupplyEffect(q,'ammo')).toBe(true);expect(shotgun.mAmmo).toBeGreaterThan(0);expect(gun.mAmmo).toBe(stock);
  shotgun.mAmmo=0;applyWaveReward(world,0,'ammo',2);expect(shotgun.mAmmo).toBeGreaterThan(0);expect(gun.mAmmo).toBe(stock);
  const payload=captureCratePayload(q)!;gun.mAmmo=1;applyCratePayload(q,payload);expect(gun.mAmmo).toBe(stock);expect(gun.mTotalAmmo).toBeLessThan(stock);
  q.SelectWeapon('uzi');gun.Fire(q.mPosition.Clone(),q.mAngle.Clone());expect(gun.mAmmo).toBe(stock-1);g.tick(2);expect(gun.mAmmo).toBe(stock-1);
  refillAmmo(q);expect(gun.mAmmo).toBe(stock-1);
  const next=capture(world);expect(applyToWorld(world,next)).toBe(true);expect(g.players()[0].mWeapons.uzi.mThing.mAmmo).toBe(stock-1);
  const finite=g.players()[0].mWeapons.uzi.mThing;finite.mAmmo=999999;const before=finite.mAmmo,key={IsDown:()=>true,IsPressed:()=>true};
  for(let tick=0;tick<250;tick++)finite.Update(key);expect(before-finite.mAmmo).toBeGreaterThan(60);expect(before-finite.mAmmo).toBeLessThanOrEqual(84);
  expect(replenishedAmmo({mUpgrades:{combat:{rule:'combat-pve-v2'}}},820,201,50)).toBe(201);
 }finally{g.quit();}
});
