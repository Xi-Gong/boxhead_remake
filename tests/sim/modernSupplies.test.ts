import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { noSpawn, placePlayer, pos } from './fxkit.ts';
import { CMain, Thing, World } from '../../src/game/packages.ts';
import { CThing_Object_SupplyCrate, armorMaximum, refillArmor, refillAmmo, type SupplyKind } from '../../src/game/local/Supplies.ts';
import { modernLoot, supplyIdentity } from '../../src/game/local/LootRules.ts';
import { deliverRedBoxes, redBoxReward, supplyGround } from '../../src/game/local/SupplyDrops.ts';
import { capture, applyToWorld, armSnapshot } from '../../src/game/local/Resume.ts';
import { getRandomState, setRandomState, setMathRandomSource, mathRandom, random } from '../../src/engine/flash/rng.ts';
import { captureWorldSnap, makeSnapCtx, restoreWorldSnap } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';

function boot(mode:'Single'|'Coop'='Single',room=1){const g=createHeadlessGame({mode,room});noSpawn(g);return g;}
function special(g:any,kind:SupplyKind,where:any=pos(12.5,8.5)){
  const w=g.world(),box=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(where,kind,supplyIdentity(w,'s')));
  box.Process_Init();return box;
}
function randomBoxes(g:any):any[]{return g.things().filter((t:any)=>t.mRandomRedId&&t.Process);}
function liveSupplies(g:any):any[]{return g.things().filter((t:any)=>t.mSupplyId&&t.Process&&!t.mSupplyConsumed);}

it('devils choose exactly one of three permanent supplies with exactly one seeded roll, once per victim',()=>{
  const g=boot(),w=g.world(),seen=new Set<string>();
  for(let seed=1;seed<=300;seed++){
    setRandomState(seed);const kind=['armor','ammo','medical'][random(3)],end=getRandomState();setRandomState(seed);
    const before=liveSupplies(g).length,victim={_CLASSID_:'CThing_Creature_Devil',mPosition:pos(12.5,8.5),mScore:1000};
    w.LogKill(victim);const created=liveSupplies(g).at(-1);expect(liveSupplies(g)).toHaveLength(before+1);
    // Object.values uses insertion order; the ordinary headless thingList uses reverse Flash enumeration.
    const last=(Object.values(w.mThing_Collection.mThings) as any[]).filter(t=>t.mSupplyId).at(-1);
    expect(last.mSupplyKind).toBe(kind);expect(last.mDeleteCounter).toBeUndefined();expect(last.Process).toBe(last.Process_Init);
    expect(getRandomState()).toBe(end);w.LogKill(victim);expect(getRandomState()).toBe(end);expect(liveSupplies(g)).toHaveLength(before+1);
    seen.add(last.mSupplyKind);expect(created).toBeDefined();
  }
  expect([...seen].sort()).toEqual(['ammo','armor','medical']);expect(g.errors).toEqual([]);g.quit();
});
it('permanent boxes survive elapsed time, wave advance and accumulation with no count-based cleanup',()=>{
  const g=boot(),w=g.world();for(let n=0;n<200;n++)special(g,['armor','ammo','medical'][n%3] as SupplyKind);
  const ids=liveSupplies(g).map(t=>t.mSupplyId).sort();g.tick(2000);w.mUpgrades.__set__mLevel(2);g.tick(2);
  expect(liveSupplies(g).map(t=>t.mSupplyId).sort()).toEqual(ids);expect(capture(w).objects.filter(o=>o.supply)).toHaveLength(200);
  expect(g.errors).toEqual([]);g.quit();
});
it.each(['armor','ammo','medical'] as const)('%s remains while full, applies only its effect, and cannot be claimed twice',kind=>{
  const g=boot(),p=g.players()[0];refillArmor(p);p.NewWeapon('uzi');refillAmmo(p);p.mLife=p.mMaxLife;
  const box=special(g,kind,p.mPosition.Clone());expect(box.mSupplyConsumed).toBe(false);expect(box.Process).toBe(box.Process_Normal);
  p.mLife=73;p.mArmor=37;p.mWeapons.uzi.mThing.mAmmo=7;const active=p.mWeaponList.map((e:any)=>e.mActive);
  box.PickedUp();expect(box.mSupplyConsumed).toBe(true);expect(box.Process).toBeUndefined();
  expect(p.mLife).toBe(kind==='medical'?p.mMaxLife:73);expect(p.mArmor).toBe(kind==='armor'?armorMaximum(p):37);
  expect(p.mWeapons.uzi.mThing.mAmmo).toBe(kind==='ammo'?p.mWeapons.uzi.mThing.mTotalAmmo:7);expect(p.mWeaponList.map((e:any)=>e.mActive)).toEqual(active);
  p.mLife=31;p.mArmor=11;p.mWeapons.uzi.mThing.mAmmo=3;box.PickedUp();expect([p.mLife,p.mArmor,p.mWeapons.uzi.mThing.mAmmo]).toEqual([31,11,3]);g.quit();
});
it('ammo boxes remain when there is no owned weapon missing ammo; locked weapons are not granted',()=>{
  const g=boot(),p=g.players()[0],box=special(g,'ammo',p.mPosition.Clone());
  expect(box.mSupplyConsumed).toBe(false);expect(p.mWeapons.uzi.mActive).toBe(false);
  p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;box.PickedUp();expect(box.mSupplyConsumed).toBe(true);
  expect(p.mWeapons.uzi.mThing.mAmmo).toBe(p.mWeapons.uzi.mThing.mTotalAmmo);expect(p.mWeapons.rocket.mActive).toBe(false);g.quit();
});
it('two players share a cell: full/dead players cannot block a valid picker, and one box has one winner',()=>{
  const g=boot('Coop'),a=placePlayer(g,6.5,8.5,0,0),b=placePlayer(g,6.5,8.5,0,1);
  a.mArmor=0;refillArmor(b);const first=special(g,'armor',a.mPosition.Clone());
  expect(first.mSupplyConsumed).toBe(true);expect([a.mArmor,b.mArmor]).toEqual([200,200]);
  a.mArmor=0;b.mArmor=0;special(g,'armor',a.mPosition.Clone());expect([a.mArmor,b.mArmor]).toEqual([0,200]);
  a.mArmor=0;b.mArmor=0;b.mLife=0;special(g,'armor',a.mPosition.Clone());expect([a.mArmor,b.mArmor]).toEqual([200,0]);
  a.mLife=0;const remain=special(g,'medical',a.mPosition.Clone());expect(remain.mSupplyConsumed).toBe(false);g.quit();
});
it('red rewards split 10/10/10/70, retain the original weapon order/weights, and never heal in the weapon branch',()=>{
  const g=boot(),p=g.players()[0];p.NewWeapon('uzi');p.NewWeapon('shotgun');const counts={armor:0,ammo:0,medical:0,weapon:0};
  for(let i=0;i<100;i++){
    p.mArmor=0;p.mLife=73;p.mWeapons.uzi.mThing.mAmmo=0;p.mWeapons.shotgun.mThing.mAmmo=0;
    redBoxReward(p,(i+.5)/100);
    if(p.mArmor>0)counts.armor++;else if(p.mLife===p.mMaxLife)counts.medical++;
    else if(p.mWeapons.uzi.mThing.mAmmo>0&&p.mWeapons.shotgun.mThing.mAmmo>0)counts.ammo++;else counts.weapon++;
  }
  expect(counts).toEqual({armor:10,ammo:10,medical:10,weapon:70});
  for(const [fraction,name]of [[.1,'shotgun'],[.9,'uzi']] as const){
    p.mLife=73;p.mWeapons.uzi.mThing.mAmmo=0;p.mWeapons.shotgun.mThing.mAmmo=p.mWeapons.shotgun.mThing.mTotalAmmo;
    const previous=p.mWeapons[name].mThing;redBoxReward(p,.3+.7*fraction);expect(p.mWeapons[name].mThing).not.toBe(previous);expect(p.mLife).toBe(73);
  }
  g.quit();
});
it('every red pickup uses one seeded roll, including full effects and the empty weapon pool; no reroll',()=>{
  const g=boot(),p=g.players()[0];
  for(let seed=1;seed<=100;seed++){
    setRandomState(seed);mathRandom();const end=getRandomState();setRandomState(seed);p.RandomPickup();expect(getRandomState()).toBe(end);
  }
  p.mLife=73;expect(redBoxReward(p,.99)).toBe(false);expect(p.mLife).toBe(73);expect(p.mWeapons.uzi.mActive).toBe(false);g.quit();
});
it('ordinary boxes are consumed without benefit and fixed boxes reappear on the 24-second timer',()=>{
  const g=boot(),w=g.world(),p=placePlayer(g,6.5,8.5,0);p.mLife=73;
  setMathRandomSource(()=>.99);
  try{
    const fixed=w.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Pickup(p.mPosition.Clone()));fixed.Process_Init();
    expect(fixed.Process).toBe(fixed.Process_Count);expect(fixed.mReappearCount).toBe(CMain.mFPS*24);expect(p.mLife).toBe(73);
    const dropped=w.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Pickup(p.mPosition.Clone()));dropped.mDeleteOnPickup=true;dropped.SetDeleteCounter(CMain.mFPS*10);
    dropped.Process_DeleteCounter_Init();dropped.PickedUp();expect(dropped.Process).toBeUndefined();expect(p.mLife).toBe(73);
    placePlayer(g,8.5,8.5,0);g.tick(CMain.mFPS*24+2);expect(fixed.Process).toBe(fixed.Process_Normal);
  }finally{setMathRandomSource(undefined);g.quit();}
});
it.each(['Single','Coop'] as const)('%s delivers after 20 simulated seconds, pauses its timer, respects cap and expires random red boxes',mode=>{
  const g=boot(mode),w=g.world(),count=mode==='Single'?1:2;
  g.tick(CMain.mFPS*20-1);expect(randomBoxes(g)).toHaveLength(0);g.tick(1);expect(randomBoxes(g)).toHaveLength(count);
  const first=randomBoxes(g)[0];expect(first.mDeleteCounter).toBe(CMain.mFPS*45);
  const remaining=w.mUpgrades.supplyState.nextDropTicks;w.mPaused=true;g.step(500);expect(w.mUpgrades.supplyState.nextDropTicks).toBe(remaining);w.mPaused=false;
  for(let i=0;i<8;i++)deliverRedBoxes(w);expect(randomBoxes(g)).toHaveLength(count*3);
  const seed=getRandomState();deliverRedBoxes(w);expect(getRandomState()).toBe(seed);
  g.tick(CMain.mFPS*45+3);expect(first.Process).toBeUndefined();expect(randomBoxes(g).length).toBeLessThanOrEqual(count*3);g.quit();
});
it('all 18 rooms place deliveries on reachable empty floor, away from geometry, boxes and player feet',()=>{
  for(const mode of ['Single','Coop'] as const)for(let room=1;room<=18;room++){
    const g=boot(mode,room),w=g.world(),valid=supplyGround(w);expect(valid.length,`${mode} ${room}`).toBeGreaterThan(0);
    deliverRedBoxes(w);const boxes=randomBoxes(g);expect(boxes).toHaveLength(mode==='Single'?1:2);
    for(const box of boxes){
      const cell=w.mMap.GetCell(box.mPosition.mX,box.mPosition.mY);expect(valid).toContain(cell);
      expect(cell.mCollide&(World.Map.CMap_Cell.mCollide_StaticImpassable|World.Map.CMap_Cell.mCollide_Object|World.Map.CMap_Cell.mCollide_EdgeOfMap)).toBe(0);
      expect(g.players().some(p=>Math.floor(p.mPosition.mX)===Math.floor(box.mPosition.mX)&&Math.floor(p.mPosition.mY)===Math.floor(box.mPosition.mY))).toBe(false);
    }
    expect(g.errors).toEqual([]);g.quit();
  }
});
it('skips a delivery without a random call when no reachable location exists',()=>{
  const g=boot(),w=g.world();for(const row of w.mMap.mCells)for(const cell of row)cell.mCollide|=World.Map.CMap_Cell.mCollide_Solid;
  const seed=getRandomState();deliverRedBoxes(w);expect(randomBoxes(g)).toHaveLength(0);expect(getRandomState()).toBe(seed);g.quit();
});
it('saves exact permanent identities, random lifetimes and timer; consumed boxes never reappear or reroll',()=>{
  const g=boot(),w=g.world(),p=g.players()[0];const remain=special(g,'medical'),taken=special(g,'armor',p.mPosition.Clone());
  expect(taken.mSupplyConsumed).toBe(true);deliverRedBoxes(w);g.tick(40);
  const snap=capture(w);expect(snap.loot?.rule).toBe('supply-crates-v2');expect(snap.objects.filter(o=>o.supply).map(o=>o.supply!.id)).toEqual([remain.mSupplyId]);
  const wanted=snap.objects.filter(o=>o.supply||o.randomRed);const rng=snap.rngState;
  remain.Delete();g.tick(1);expect(applyToWorld(w,snap)).toBe(true);
  expect(capture(w).objects.filter(o=>o.supply||o.randomRed)).toEqual(wanted);expect(w.mUpgrades.supplyState).toEqual(snap.loot!.state);
  expect(getRandomState()).toBe(rng);expect(liveSupplies(g)).toHaveLength(1);expect(liveSupplies(g)[0].mSupplyId).toBe(remain.mSupplyId);
  expect(applyToWorld(w,snap)).toBe(true);expect(liveSupplies(g)).toHaveLength(1);expect(randomBoxes(g)).toHaveLength(1);g.quit();
});
it('retry restores the checkpoint box collection and timer, and rollback reproduces pickups and deliveries',()=>{
  const g=boot('Coop'),w=g.world();special(g,'medical');deliverRedBoxes(w);g.tick(3);const saved=capture(w);
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const before=simulationDigest(data);deliverRedBoxes(w);w.mUpgrades.supplyState.nextDropTicks=1;g.tick(2);restoreWorldSnap(w,slot,ctx);
  expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);
  g.quit();expect(g.waitScreen('State_Debrief','Screen_Debrief')).toBe(true);armSnapshot(saved);g.main().mcScreen.nState='State_LoadWorld';expect(g.waitRunning()).toBe(true);
  expect(capture(g.world()).objects.filter(o=>o.supply||o.randomRed)).toEqual(saved.objects.filter(o=>o.supply||o.randomRed));
  liveSupplies(g)[0].Delete();g.quit();expect(g.waitScreen('State_Debrief','Screen_Debrief')).toBe(true);g.retry();expect(g.waitRunning()).toBe(true);
  expect(liveSupplies(g).map(t=>t.mSupplyId)).toEqual(saved.objects.filter(o=>o.supply).map(o=>o.supply!.id));g.quit();
});
it('legacy fixtures and deathmatch retain original supply/timer rules and gain no supply state',()=>{
  for(const opts of [{classicGrowth:true,mode:'Single' as const},{mode:'DeathMatch' as const}]){
    const g=createHeadlessGame(opts);expect(modernLoot(g.world())).toBe(false);expect(g.world().mUpgrades.supplyState).toBeUndefined();expect(capture(g.world()).loot).toBeUndefined();g.quit();
  }
});
