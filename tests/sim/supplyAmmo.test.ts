import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {CThing_Object_SupplyCrate,devilSupply,refillAmmo} from '../../src/game/local/Supplies.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';

it('uses a single exclusive 20% armor / 20% ammo / 60% original loot roll',()=>{
  const counts={armor:0,ammo:0,original:0};for(let n=0;n<100;n++)counts[devilSupply(n)??'original']++;
  expect(counts).toEqual({armor:20,ammo:20,original:60});
});
it('refills all owned weapons, including empty slots, without granting locked weapons or changing health/armor',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),p=g.players()[0],w=g.world();
  for(const name of ['uzi','shotgun','grenade','mine','rocket'])p.NewWeapon(name);
  p.mWeapons.uzi.mThing.mAmmo=1;p.mWeapons.shotgun.mThing.mAmmo=0;p.mWeapons.grenade.mThing.mAmmo=2;
  p.mWeapons.mine.mThing.mAmmo=0;p.mWeapons.rocket.mThing.mAmmo=1;p.mLife=83;p.mArmor=27;p.SelectWeapon('uzi');
  const held=p.mWeapon_Current,active=p.mWeaponList.map((e:any)=>e.mActive);
  const crate=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone(),'ammo'));
  crate.Process_DeleteCounter_Init();crate.PickedUp();
  for(const entry of p.mWeaponList)if(entry.mActive)expect(entry.mThing.mAmmo).toBe(entry.mThing.mTotalAmmo);
  expect(p.mWeaponList.map((e:any)=>e.mActive)).toEqual(active);expect(p.mWeapon_Current).toBe(held);
  expect(p.mLife).toBe(83);expect(p.mArmor).toBe(27);
  p.mWeapons.uzi.mThing.mAmmo=3;crate.PickedUp();expect(p.mWeapons.uzi.mThing.mAmmo).toBe(3);g.quit();
});
it('uses each LAN player own upgraded capacities without switching weapon or firing',()=>{
  const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',
    difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
  expect(g.waitRunning(3000)).toBe(true);const [a,b]=g.players(),w=g.world();
  w.mUpgrades.lanGrowth.players[0].level=125;w.mUpgrades.lanGrowth.players[1].level=1;
  for(const p of [a,b]){p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;refillAmmo(p);}
  expect(a.mWeapons.uzi.mThing.mAmmo).toBe(a.mWeapons.uzi.mThing.mTotalAmmo);
  expect(b.mWeapons.uzi.mThing.mAmmo).toBe(b.mWeapons.uzi.mThing.mTotalAmmo);
  expect(a.mWeapons.uzi.mThing.mTotalAmmo).toBeGreaterThan(b.mWeapons.uzi.mThing.mTotalAmmo);
  expect(a.mWeapon_Current.mNameID).toBe('pistol');expect(b.mWeapon_Current.mNameID).toBe('pistol');g.quit();
});
