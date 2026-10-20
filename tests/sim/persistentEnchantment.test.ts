import {expect,it} from 'vitest';
import {createHeadlessGame as createPriorGrowthGame} from './harness.ts';
import {noSpawn,placePlayer} from './fxkit.ts';
import {enchantHeldWeapon,enchantedWeapon,canEnchant,persistentWeapon,ENCHANTMENT_RULE} from '../../src/game/local/EnchantmentRules.ts';
import {CThing_Object_SupplyCrate,refillAmmo} from '../../src/game/local/Supplies.ts';
import {redBoxReward} from '../../src/game/local/SupplyDrops.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureCratePayload,applyCratePayload} from '../../src/game/local/WeaponCrate.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {withTimerValue} from '../../src/engine/flash/clock.ts';
// Explicit pre-tiered curve fixture: retain the original progression assertions alongside modern tests.
const createHeadlessGame=(options:Parameters<typeof createPriorGrowthGame>[0]={})=>createPriorGrowthGame({...options,classicTieredGrowth:true,classicClearWaves:true});

function boot(){
 const g=createHeadlessGame({mode:'Single'});noSpawn(g);const p=placePlayer(g,5.5,8.5);
 p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=3;
 return {g,p,w:g.world()};
}
function fire(p:any){p.mWeapon_Current.Fire(p.mPosition.Clone(),p.mAngle.Clone(),0);}

it.each(['red-all','red-weapon','devil-ammo'])('%s refills the enchanted weapon beyond its original enchanted stock',kind=>{
 const {g,p,w}=boot();
 try{
  expect(enchantHeldWeapon(p)).toBe(true);expect(p.mWeapon_Current.mAmmo).toBe(3);fire(p);
  if(kind==='red-all')expect(redBoxReward(p,.15)).toBe(true);
  else if(kind==='red-weapon')expect(redBoxReward(p,.5)).toBe(true);
  else {const crate=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone(),'ammo','s901'));crate.Process_Init();expect(crate.mSupplyConsumed).toBe(true);}
  const gun=p.mWeapon_Current;expect(gun.mAmmo).toBe(gun.mTotalAmmo);
  for(let i=0;i<3;i++)fire(p);
  const before=new Set(g.things());fire(p);
  const shot=g.things().find(t=>!before.has(t)&&t._CLASSID_==='CThing_Shot_Bullet');
  expect(shot.mEnchanted).toBe(true);expect(shot.mDamage).toBeCloseTo(gun.mDamage*1.35);expect(enchantedWeapon(gun)).toBe(true);expect(canEnchant(p)).toBe(false);
 }finally{g.quit();}
});

it('clears enchantment on the last round before a same-tick refill or replacement',()=>{
 const {g,p}=boot();
 try{
  p.mWeapon_Current.mAmmo=1;enchantHeldWeapon(p);fire(p);
  expect(g.things().find(t=>t._CLASSID_==='CThing_Shot_Bullet').mEnchanted).toBe(true);
  expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);refillAmmo(p);
  expect(p.mWeapon_Current.mPersistentEnchantment).toBeUndefined();
  expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);p.AddWeapon('uzi');
  expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);
 }finally{g.quit();}
});

it('switching, upgrades and weapon reconstruction retain only the nonempty enchanted weapon',()=>{
 const {g,p,w}=boot();
 try{
  enchantHeldWeapon(p);p.NewWeapon('shotgun');p.SelectWeapon('shotgun');expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);
  refillAmmo(p);p.SelectWeapon('uzi');expect(persistentWeapon(p.mWeapon_Current)).toBe(true);
  p.mWeapon_Current.mAmmo=5;w.mUpgrades.lanGrowth.players[0].level=39;w.mUpgrades.ApplyUpgrade_Weapon(p.mWeapon_Current);
  expect(persistentWeapon(p.mWeapon_Current)).toBe(true);expect(p.mWeapon_Current.mTotalAmmo).toBe(400);
  const old=p.mWeapon_Current;p.AddWeapon('uzi');expect(p.mWeapon_Current).not.toBe(old);expect(persistentWeapon(p.mWeapon_Current)).toBe(true);
  p.mWeapon_Current.EmptyWeapon();refillAmmo(p);expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);
 }finally{g.quit();}
});

it.each([undefined,0,2,-1])('old save stock %s migrates only a surviving enchantment without a refill',stock=>{
 const {g,p,w}=boot();
 try{
  if(stock===-1)p.SelectWeapon('pistol');
  const id=p.mWeapon_Current.mNameID,snap=capture(w);delete snap.enchantment;
  snap.players[0]!.weapons[id]!.enchantedAmmo=stock;delete snap.players[0]!.weapons[id]!.enchanted;
  const ammo=p.mWeapon_Current.mAmmo;expect(applyToWorld(w,JSON.parse(JSON.stringify(snap)))).toBe(true);
  expect(p.mWeapon_Current.mAmmo).toBe(ammo);expect(persistentWeapon(p.mWeapon_Current)).toBe(stock===2||stock===-1);
  refillAmmo(p);expect(persistentWeapon(p.mWeapon_Current)).toBe(stock===2||stock===-1);
 }finally{g.quit();}
});

it('save/continue and rollback replay retain the marker, clear it at depletion, and preserve exact simulation state',()=>{
 const {g,p,w}=boot();
 try{
  enchantHeldWeapon(p);const saved=capture(w);expect(saved.enchantment).toBe(ENCHANTMENT_RULE);expect(saved.players[0]!.weapons.uzi!.enchanted).toBe(true);
  expect(applyToWorld(w,JSON.parse(JSON.stringify(saved)))).toBe(true);expect(p.mWeapon_Current.mAmmo).toBe(3);expect(persistentWeapon(p.mWeapon_Current)).toBe(true);
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const replay=()=>{
   withTimerValue(w.mTick*40,()=>{fire(p);redBoxReward(p,.5);fire(p);p.mWeapon_Current.mAmmo=1;fire(p);refillAmmo(p);});
   for(let n=0;n<2;n++)withTimerValue((w.mTick+1)*40,()=>g.tick(1));
   return captureWorldSnap(w,ctx,false);
  };
  const first=replay();expect(persistentWeapon(p.mWeapon_Current)).toBe(false);
  restoreWorldSnap(w,slot,ctx);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(simulationDigest(data));
  expect(persistentWeapon(p.mWeapon_Current)).toBe(true);const second=replay();expect(simulationDigest(second)).toEqual(simulationDigest(first));
  const emptySave=capture(w);expect(emptySave.players[0]!.weapons.uzi!.enchanted).toBeUndefined();
  expect(applyToWorld(w,emptySave)).toBe(true);expect(enchantedWeapon(p.mWeapon_Current)).toBe(false);
 }finally{g.quit();}
});

it.each(['crate','picker','old-crate'] as const)('death weapon merge retains enchantment from %s',source=>{
 const g=createHeadlessGame({mode:'Coop'});noSpawn(g);
 try{
  const [p,other]=g.players();p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=7;
  if(source!=='picker')enchantHeldWeapon(p);const payload=captureCratePayload(p)!;
  if(source==='old-crate')delete payload.weapons.find(w=>w.nameID==='uzi')!.enchanted;
  other.NewWeapon('uzi');other.SelectWeapon('uzi');other.mWeapon_Current.mAmmo=11;if(source==='picker')enchantHeldWeapon(other);
  applyCratePayload(other,payload);expect(other.mWeapon_Current.mAmmo).toBe(11);expect(persistentWeapon(other.mWeapon_Current)).toBe(true);
  refillAmmo(other);for(let n=0;n<12;n++)fire(other);expect(persistentWeapon(other.mWeapon_Current)).toBe(true);
  const snap=capture(g.world());expect(applyToWorld(g.world(),snap)).toBe(true);expect(persistentWeapon(other.mWeapon_Current)).toBe(true);
 }finally{g.quit();}
});

it.each([false,true])('single-instance LAN negotiation uses persistent enchantment only when enabled=%s',enabled=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 try{
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:3000,netcode:'rollback-v2',cfg:{
   progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',refill:'reliable-supplies-v1',
   balance:'pve-balance-v1',endless:'endless-pve-v1',variants:'enemy-variants-v1',...(enabled?{enchantment:ENCHANTMENT_RULE}:{}),
   difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
  expect(g.waitRunning()).toBe(true);const p=g.players()[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=2;enchantHeldWeapon(p);
  refillAmmo(p);fire(p);fire(p);expect(enchantedWeapon(p.mWeapon_Current)).toBe(enabled);
  expect(Object.hasOwn(p.mWeapon_Current,'mPersistentEnchantment')).toBe(enabled);
  const snap=capture(g.world());snap.enchantment=ENCHANTMENT_RULE;
  expect(applyToWorld(g.world(),snap)).toBe(enabled);
 }finally{g.quit();}
});
