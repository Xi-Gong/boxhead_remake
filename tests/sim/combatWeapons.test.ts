import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {combatWorld,modernWeapon,shotgunFalloff} from '../../src/game/local/CombatRules.ts';
import {infiniteGrowthWeapon} from '../../src/game/local/Net/Growth.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {applyCratePayload} from '../../src/game/local/WeaponCrate.ts';
import {syncSupplyWeapon} from '../../src/game/local/ReliableSupplies.ts';
const bonus={damage:0,health:0,armor:0,capacity:0};
it('bounds all finite capacities and rate ceilings at arbitrarily high growth while preserving game-speed tick periods',()=>{
 for(const [id,ammo,delay]of [['Pistol',999999,8],['UZI',100,4],['Shotgun',20,12],['Rocket',20,12],['Railgun',15,5]]as const){
  const raw={mDamage:51,mTotalAmmo:ammo,mFireRate:delay};
  const high=modernWeapon(raw,{InfinateAmmo:true,RapidFire:true},{damage:1e9,capacity:1e9},{...bonus,capacity:1e9},'CThing_Weapon_'+id,25);
  expect(high.capacity).toBeLessThanOrEqual(ammo===999999?ammo:ammo*3);expect(high.capacity).toBeGreaterThan(0);
  const ceilings={Pistol:5,UZI:3,Shotgun:10,Rocket:13,Railgun:10};expect(high.fireRate).toBeGreaterThanOrEqual(ceilings[id]);
  expect(modernWeapon(raw,{RapidFire:true},{damage:0,capacity:0},bonus,'CThing_Weapon_'+id,50).fireRate)
   .toBe(modernWeapon(raw,{RapidFire:true},{damage:0,capacity:0},bonus,'CThing_Weapon_'+id,12.5).fireRate);
 }
 expect(shotgunFalloff(0,7)).toBe(1);expect(shotgunFalloff(7,7)).toBeCloseTo(.45);
});
it('keeps special weapons finite, consumes stock, and does not refill on repeated upgrades or restore',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];expect(combatWorld(w)).toBe(true);
 w.mUpgrades.lanGrowth.players[0].level=500;
 for(const name of ['uzi','shotgun','rocket','railgun'])p.NewWeapon(name);
 for(const name of ['uzi','shotgun','rocket','railgun']){
  const gun=p.mWeapons[name].mThing;w.mUpgrades.ApplyUpgrade_Weapon(gun);gun.mAmmo=7;
  const max=gun.mTotalAmmo;expect(infiniteGrowthWeapon(gun)).toBe(false);gun.DecrementAmmo();expect(gun.mAmmo).toBe(6);
  for(let i=0;i<4;i++)w.mUpgrades.ApplyUpgrade_Weapon(gun);
  expect(gun.mAmmo).toBe(6);expect(gun.mTotalAmmo).toBe(max);
 }
 const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);
 for(const name of ['uzi','shotgun','rocket','railgun'])expect(p.mWeapons[name].mThing.mAmmo).toBe(6);
 expect(infiniteGrowthWeapon(p.mWeapons.pistol.mThing)).toBe(true);g.quit();
});
it('marks rocket descendants and applies direct self damage before armor, leaving other blasts full strength',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];p.NewWeapon('rocket');const gun=p.mWeapons.rocket.mThing;
 gun.Fire(p.mPosition.Clone(),p.mAngle.Clone());const rocket=g.things().find(t=>t._CLASSID_==='CThing_Shot_Rocket')!;
 expect(rocket.mCombatRocket).toBe(true);expect(rocket.mEffect.mCombatRocket).toBe(true);
 const effect=rocket.mEffect;effect.mPosition=p.mPosition.Clone();
 const hit=new Thing.Affect.CThing_Affect_Explosion(p,effect,100,2);
 p.mArmor=20;p.mLife=100;expect(hit.AffectThing(p)).toBe(15);expect(p.mArmor).toBe(5);expect(p.mLife).toBe(100);expect(hit.mDamage).toBe(100);
 const other=new Thing.Affect.CThing_Affect_Explosion(p,{mPosition:p.mPosition.Clone()},100,2);p.mArmor=0;other.AffectThing(p);expect(p.mLife).toBe(0);g.quit();
});
it('retains emitted shotgun origin and applies falloff once per victim across rollback',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];p.NewWeapon('shotgun');const gun=p.mWeapons.shotgun.mThing;
 expect(gun.mDamage).toBeCloseTo(51*.65);gun.Fire(p.mPosition.Clone(),p.mAngle.Clone());
 const shot=g.things().find(t=>t.mCombatShotgun)!;expect(shot).toBeTruthy();
 const at=p.mPosition.Clone();at.mX+=gun.mRange;const victim=new Thing.Creature.CThing_Creature_Zombie(at);w.mThing_Collection.AddThing(victim);victim.Process_Init();victim.mLife=1000;
 const affect=new Thing.Affect.CThing_Affect_Bullet(p,shot,100,p.mAngle.Clone());
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 affect.AffectThing(victim);expect(victim.mLife).toBeCloseTo(955);expect(affect.mDamage).toBe(100);
 const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);affect.AffectThing(victim);
 expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);g.quit();
});
it('migrates old combat at the next wave without progress loss or free ammunition and rejects downgrade',()=>{
 const old=createHeadlessGame({classicCombat:true}),w0=old.world(),p0=old.players()[0];w0.mUpgrades.lanGrowth.players[0].level=500;p0.NewWeapon('uzi');
 w0.mUpgrades.ApplyUpgrade_Weapon(p0.mWeapons.uzi.mThing);p0.mWeapons.uzi.mThing.mAmmo=777;p0.mLife=67;p0.mArmor=19;
 const save=capture(w0);old.quit();const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];expect(applyToWorld(w,save)).toBe(true);
 expect(combatWorld(w)).toBe(false);expect(p.mWeapons.uzi.mThing.mAmmo).toBe(777);
 w.mUpgrades.__set__mLevel(save.wave+1);expect(combatWorld(w)).toBe(true);expect(w.mUpgrades.lanGrowth.players[0].level).toBe(500);
 expect(p.mWeapons.uzi.mThing.mAmmo).toBe(p.mWeapons.uzi.mThing.mTotalAmmo);expect(p.mWeapons.uzi.mThing.mTotalAmmo).toBeLessThanOrEqual(300);
 expect([p.mLife,p.mArmor]).toEqual([67,19]);const modern=capture(w);g.quit();
 const classic=createHeadlessGame({classicCombat:true}),before=capture(classic.world());expect(applyToWorld(classic.world(),modern)).toBe(false);expect(capture(classic.world())).toEqual(before);classic.quit();
});
it('cannot inherit obsolete capacity through supplies or death crates and observes the UZI ceiling in actual weapon updates',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true}),w=g.world(),p=g.players()[0];w.mUpgrades.lanGrowth.players[0].level=500;p.NewWeapon('uzi');
 const gun=p.mWeapons.uzi.mThing;w.mUpgrades.ApplyUpgrade_Weapon(gun);gun.mAmmo=7;
 syncSupplyWeapon(p,gun,999999);expect(gun.mTotalAmmo).toBeLessThanOrEqual(300);expect(gun.mAmmo).toBe(7);
 applyCratePayload(p,{weapons:[{nameID:'uzi',ammo:999999,totalAmmo:999999}]});
 expect(gun.mTotalAmmo).toBeLessThanOrEqual(300);expect(gun.mAmmo).toBe(gun.mTotalAmmo);
 p.mWeapon_Current=gun;const before=gun.mAmmo,key={IsDown:()=>true,IsPressed:()=>true,IsReleased:()=>false};
 for(let t=0;t<250;t++)gun.Update(key);expect(before-gun.mAmmo).toBeLessThanOrEqual(84);expect(before-gun.mAmmo).toBeGreaterThan(60);g.quit();
});
