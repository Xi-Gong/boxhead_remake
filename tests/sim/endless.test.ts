import {expect,it} from 'vitest';
import {createHeadlessGame as createPriorGrowthGame} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {ENDLESS_RULE,endlessWave,endlessStartLevel,experienceBeforeLevel,growthFromExperience,previousWaveExperience} from '../../src/game/local/EndlessRules.ts';
import {awardKill,newGrowth,growthOf,xpRequired} from '../../src/game/local/Net/Growth.ts';
import {endlessWorld} from '../../src/game/local/Endless.ts';
import {syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {armorMaximum} from '../../src/game/local/Supplies.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {Thing} from '../../src/game/packages.ts';
import {recordWaveReached,maxUnlockedWave} from '../../src/game/local/WaveUnlock.ts';
import {setSelectedStartWave} from '../../src/game/local/StartWave.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
// Explicit pre-tiered curve fixture: retain the original progression assertions alongside modern tests.
const createHeadlessGame=(options:Parameters<typeof createPriorGrowthGame>[0]={})=>createPriorGrowthGame({...options,classicTieredGrowth:true});

it('crosses 125 repeatedly while legacy growth retains its cap and XP rules',()=>{
 const p=newGrowth(124,true,true).players[0];p.xp=64;
 expect(awardKill(p,100,5)).toBe(12400);expect([p.level,p.xp]).toEqual([125,4]);
 p.xp=64;awardKill(p,100,5);expect([p.level,p.xp]).toEqual([126,4]);
 p.level=1000;p.xp=xpRequired(p)-1;awardKill(p,100,5);expect([p.level,p.xp]).toEqual([1001,4]);
 const old=newGrowth(124,true).players[0];old.xp=64;awardKill(old,100,5);expect([old.level,old.xp]).toEqual([125,0]);
});
it('inverts XP thresholds exactly and derives high waves without per-level or per-wave replay',()=>{
 for(const level of [1,10,11,124,125,126,200,1000,1000000]){
  const xp=experienceBeforeLevel(level);expect(growthFromExperience(xp)).toEqual({level,xp:0});
  if(level>1)expect(growthFromExperience(xp-1n).level).toBe(level-1);
 }
 for(const devils of [false,true])for(const players of [1,2]){
  let experience=0n;
  for(let wave=1;wave<=250;wave++){
   expect(previousWaveExperience(wave,devils,players)).toBe(experience/BigInt(players));
   const e=endlessWave(wave,0);experience+=BigInt(e.Zombie_TotalCount+(devils?e.Devil_TotalCount*5:0));
  }
 }
 expect([1,20,50,100,200].map(w=>endlessStartLevel(w,true,2))).toEqual([1,46,119,196,296]);
 expect(Number.isSafeInteger(endlessStartLevel(Number.MAX_SAFE_INTEGER))).toBe(true);
});
it('grows all live weapon and vital limits once, preserves ammo and keeps infinity authored',()=>{
 const g=createHeadlessGame({mode:'Single'});noSpawn(g);const w=g.world(),p=g.players()[0],s=growthOf(w)!.players[0];
 expect(endlessWorld(w)).toBe(true);expect(s.endless).toBe(true);s.level=125;syncVitals(p,'full');
 p.NewWeapon('uzi');p.SelectWeapon('uzi');const gun=p.mWeapon_Current;
 expect([gun.mDamage,gun.mTotalAmmo]).toEqual([140,400]);gun.mAmmo=7;p.mLife=400;p.mArmor=50;
 s.level=200;syncVitals(p,'level');w.mUpgrades.ApplyUpgrade_Weapon(gun);
 expect([p.mLife,p.mMaxLife,p.mArmor,armorMaximum(p)]).toEqual([700,996,50,996]);
 expect([gun.mDamage,gun.mTotalAmmo,gun.mAmmo]).toEqual([245,550,157]);
 for(let n=0;n<5;n++)w.mUpgrades.ApplyUpgrade_Weapon(gun);
 expect([gun.mDamage,gun.mAmmo]).toEqual([245,157]);
 gun.mTotalAmmo=1200;gun.mAmmo=7;s.level=201;w.mUpgrades.ApplyUpgrade_Weapon(gun);
 expect([gun.mTotalAmmo,gun.mAmmo]).toEqual([1202,9]);
 gun.mTotalAmmo=999999;gun.mAmmo=8;gun.DecrementAmmo();expect(gun.mAmmo).toBe(7);gun.EmptyWeapon();expect(gun.mAmmo).toBe(0);
 const pistol=p.mWeapons.pistol.mThing;pistol.DecrementAmmo();expect(pistol.mAmmo).toBe(999999);
 s.level=1000;syncVitals(p,'restore');expect(armorMaximum(p)).toBe(4196);
 g.quit();
});
it('rejects endless saves before mutating a legacy world',()=>{
 const modern=createHeadlessGame({mode:'Single'}),snap=capture(modern.world());modern.quit();
 const old=createHeadlessGame({mode:'Single',classicEndless:true}),w=old.world(),before=capture(w);
 expect(applyToWorld(w,snap)).toBe(false);expect(capture(w)).toEqual(before);old.quit();
});
it('a real kill upgrades the entire inventory once across rollback and preserves held weapon',()=>{
 const g=createHeadlessGame({mode:'Coop'});noSpawn(g);const w=g.world(),p=g.players()[0],s=growthOf(w)!.players[0];
 s.level=125;s.xp=64;syncVitals(p,'full');p.NewWeapon('uzi');p.NewWeapon('rocket');p.SelectWeapon('uzi');
 for(const name of ['uzi','rocket']){w.mUpgrades.ApplyUpgrade_Weapon(p.mWeapons[name].mThing);p.mWeapons[name].mThing.mAmmo=7;}
 p.mLife=70;p.mArmor=37;const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
 const kill=()=>{const z=w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone(),p.mAngle.Clone()));z.Process_Init();z.lanFatalSlot=0;z.mLife=0;w.LogKill(z);};
 kill();const after=captureWorldSnap(w,ctx,false),digest=simulationDigest(after);
 expect([s.level,s.xp,p.mLife,p.mArmor,p.mWeapon_Current.mNameID]).toEqual([126,0,74,37,'uzi']);
 expect(p.mWeapons.uzi.mThing.mAmmo).toBe(9);expect(p.mWeapons.rocket.mThing.mAmmo).toBe(8);
 restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);kill();
 expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);g.quit();
});
it('shots and placed explosives carry scaled damage once; high damage cannot launch creatures through walls',()=>{
 const g=createHeadlessGame({mode:'Single'});noSpawn(g);const w=g.world(),p=g.players()[0];growthOf(w)!.players[0].level=200;
 for(const name of ['grenade','rocket','barrel','mine','chargepack']){
  p.NewWeapon(name);const gun=p.mWeapons[name].mThing,before=new Set(Object.keys(w.mThing_Collection.mThings));
  gun.Fire(p.mPosition.Clone(),p.mAngle.Clone(),0);
  const created=(Object.values(w.mThing_Collection.mThings) as any[]).filter(t=>!before.has(t.sUniqueID)&&t.mParent===p);
  const carrier=created.find(t=>t._CLASSID_.startsWith('CThing_Shot_')||t._CLASSID_.startsWith('CThing_Object_'));
  expect(carrier,name).toBeDefined();expect(carrier.mEffect?.mDamage??carrier.mDamage).toBe(gun.mDamage);
  if(carrier._CLASSID_.startsWith('CThing_Object_')){carrier.Process_Init();w.mUpgrades.ApplyUpgrade_Object(carrier);expect(carrier.mDamage).toBe(gun.mDamage);}
  carrier.Delete();g.tick(1);
 }
 const z=w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Add(new Thing.Math.CThing_Position(2,0,0)),p.mAngle.Clone()));z.Process_Init();
 z.mDelta=new Thing.Math.CThing_Position(1000,0,0);z.State_BulletHit_Init();expect(z.mDelta.__get__mLength()).toBeCloseTo(.3,10);g.quit();
});
it('bounds enemy budgets while health and normal damage keep rising after wave 100',()=>{
 const g=createHeadlessGame({mode:'Coop',classicTimedWaves:true});noSpawn(g);const w=g.world(),p=g.players()[0],values=[];
 for(const wave of [100,200,1000]){
  w.mUpgrades.__set__mLevel(wave);const l=w.mUpgrades.Level;expect([l.Zombie_TotalCount,l.Devil_TotalCount]).toEqual([200,10]);
  const z=w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone(),p.mAngle.Clone()));z.Process_Init();
  const d=w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Devil(p.mPosition.Clone(),p.mAngle.Clone()));d.Process_Init();
  values.push([z.mLife,z.mDamage,d.mLife,d.mAttackDamage]);z.Delete();d.Delete();
 }
 for(let n=1;n<values.length;n++)for(let k=0;k<4;k++)expect(values[n][k]).toBeGreaterThan(values[n-1][k]);g.quit();
});
it('keeps the Devils-off setting at every endless wave',()=>{
 const g=createHeadlessGame({mode:'Single',options:{devils:0}});noSpawn(g);const w=g.world();
 for(const wave of [20,100,1000]){w.mUpgrades.__set__mLevel(wave);expect([w.mUpgrades.Level.Devil_Count,w.mUpgrades.Level.Devil_TotalCount]).toEqual([0,0]);}
 g.quit();
});
it('selects and restores a high unlocked wave with exact damaged inventory and no refill',()=>{
 const g=createHeadlessGame({mode:'Single',menuOnly:'Select'});recordWaveReached(1000000);expect(maxUnlockedWave()).toBe(1000000);
 setSelectedStartWave(1000000);const screen=g.main().mcScreen;screen.ChangeLevel(screen.mcSubScreen.mcLevel_Selection,0);
 screen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button.onRelease();expect(g.waitRunning()).toBe(true);noSpawn(g);
 const w=g.world(),p=g.players()[0];expect(w.mUpgrades.mLevelIndex).toBe(1000000);expect(growthOf(w)!.players[0].level).toBeGreaterThan(125);
 p.mLife=73;p.mArmor=37;p.mWeapons.uzi.mThing.mAmmo=7;p.SelectWeapon('uzi');
 const snap=capture(w);expect(snap.endless).toBe(ENDLESS_RULE);
 expect(applyToWorld(w,snap)).toBe(true);
 expect([p.mLife,p.mArmor,p.mWeapon_Current.mAmmo]).toEqual([73,37,7]);g.tick(2);
 expect(p.mLife).toBeCloseTo(73+2*p.mMaxLife/750,8); // Original regeneration remains active after restore.
 expect([p.mArmor,p.mWeapon_Current.mAmmo]).toEqual([37,7]);expect(w.mUpgrades.mLevelIndex).toBe(1000000);g.quit();
});
it('keeps v0.2.9 growth and wave fixtures available explicitly',()=>{
 const g=createHeadlessGame({mode:'Single',classicEndless:true});const w=g.world();
 expect(endlessWorld(w)).toBe(false);expect(growthOf(w)!.players[0].endless).toBeUndefined();
 w.mUpgrades.__set__mLevel(100);expect(w.mUpgrades.Level.Zombie_TotalCount).toBe(505);g.quit();
});
