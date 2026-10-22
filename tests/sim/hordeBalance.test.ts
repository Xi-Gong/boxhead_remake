import {expect,it,vi} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,bossMembers} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {refillAmmo} from '../../src/game/local/Supplies.ts';
import {noSpawn} from './fxkit.ts';

it.each([0,1,2,3]as const)('difficulty %s trades individual health for modestly larger groups without changing damage or movement',difficulty=>{
 const samples:any[][]=[];
 for(const modern of [false,true]){
  const g=createHeadlessGame({difficulty,classicFeatures:modern?[]:['horde-balance-v1']});try{
   const w=g.world(),rows=[];
   for(const wave of [1,11,36,101]){
    clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);
    const e:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();
    rows.push({health:e.mMaxLife,damage:e.mDamage,speed:e.mSpeed,count:timedWave(w)!.clear!.zombies});
   }samples.push(rows);
  }finally{g.quit();}
 }
 for(let n=0;n<4;n++){const [old,current]=[samples[0]![n],samples[1]![n]];
  expect(current.health).toBeLessThanOrEqual(old.health*.45);expect(current.health).toBeGreaterThan(0);
  expect(current.damage).toBe(old.damage);expect(current.speed).toBe(old.speed);expect(current.count).toBeGreaterThan(old.count);expect(current.count).toBeLessThanOrEqual(Math.ceil(old.count*1.25));
 }
});
it('gives every finite weapon more base stock than its original authored capacity and preserves surplus on upgrade, refill and restore',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  const capacities={uzi:125,shotgun:25,rocket:25,railgun:19,grenade:25,barrel:13,mine:13,chargepack:13,fakewall:7};
  for(const [name,capacity]of Object.entries(capacities)){
   p.NewWeapon(name);const gun=p.mWeapons[name].mThing;gun.Update({IsDown:()=>false,IsPressed:()=>false,IsReleased:()=>false});
   expect(gun.mTotalAmmo,name).toBe(capacity);expect(gun.mAmmo).toBe(capacity);
   gun.mAmmo=capacity+40;w.mUpgrades.ApplyUpgrade_Weapon(gun);expect(gun.mAmmo).toBe(capacity+40);
   refillAmmo(p);expect(gun.mAmmo).toBe(capacity+40);
  }
  const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);
  for(const [name,capacity]of Object.entries(capacities))expect(p.mWeapons[name].mThing.mAmmo).toBe(capacity+40);
 }finally{g.quit();}
});
it('shortens the base shotgun period from 18 to 14 ticks and proves sustained real input and release',()=>{
 for(const modern of [false,true]){const g=createHeadlessGame({classicFeatures:modern?[]:['horde-balance-v1']}),p=g.players()[0];try{
  noSpawn(g);p.NewWeapon('shotgun');p.SelectWeapon('shotgun');const gun=p.mWeapon_Current,fire=vi.spyOn(gun,'Fire');
  g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(gun.mFireRate).toBe(modern?14:18);g.tick(gun.mFireRate*3);expect(fire).toHaveBeenCalledTimes(4);
  g.keyUp(KEYS.P1.FIRE);g.tick(gun.mFireRate*2);expect(fire).toHaveBeenCalledTimes(4);
 }finally{g.quit();}}
});
it('adds one Boss per encounter, keeps the four-member cap and lowers combined health',()=>{
 const totals:number[][]=[];
 for(const modern of [false,true]){const g=createHeadlessGame({classicFeatures:modern?[]:['horde-balance-v1']}),w=g.world();try{
  const rows=[];for(const [wave,oldCount]of [[5,1],[15,2],[25,3],[100,3]]){
   clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave!);const boss=timedWave(w)!.boss!;
   expect(bossMembers(boss)).toHaveLength(oldCount!+(modern?1:0));
   for(let i=0;i<bossMembers(boss).length;i++){w.mUpgrades.ProcessTimedSpawns();g.tick(1);}
   expect(bossMembers(boss).every(m=>m.id&&m.maximum>0)).toBe(true);rows.push(bossMembers(boss).reduce((n,m)=>n+m.maximum,0));
  }totals.push(rows);
 }finally{g.quit();}}
 totals[1]!.forEach((n,i)=>expect(n).toBeLessThan(totals[0]![i]!));
});
