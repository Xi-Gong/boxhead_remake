import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing,World} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,attemptTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureEnemyArmor} from '../../src/game/local/CombatEnemies.ts';
import {SIMPLE_COMBAT_RULE} from '../../src/game/local/CombatRules.ts';
import {simpleDevilSupply} from '../../src/game/local/LootRules.ts';
import {redBoxReward} from '../../src/game/local/SupplyDrops.ts';
import {getRandomState,setRandomState} from '../../src/engine/flash/rng.ts';
import {random} from '../../src/engine/runtime.ts';

it('retains only native zombies, chargers and devils across successful high-wave ordinal slots',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  w.mUpgrades.__set__mLevel(36);w.Spawn_ValidPosition=()=>({mPosition:g.players()[0].mPosition.Clone()});
  Object.assign(timedWave(w)!.clear!,{zombies:1000,devils:1000});
  for(const family of ['Zombie','Devil'])for(let n=0;n<100;n++){
   w.mUpgrades.Level['m'+family+'Count']=0;
   expect(World.CWorld.prototype['Spawn_'+family].call(w)).toBe(true);
  }
  const enemies=g.things().filter(e=>e._CLASSID_==='CThing_Creature_Zombie'||e._CLASSID_==='CThing_Creature_Devil');
  expect(enemies.some(e=>e.mEnemyVariant==='charger')).toBe(true);
  expect(enemies.every(e=>!e.mCombatKind&&(!e.mEnemyVariant||e.mEnemyVariant==='charger'))).toBe(true);
  expect(w.mUpgrades.combat.rule).toBe(SIMPLE_COMBAT_RULE);
 }finally{g.quit();}
});
it('uses native devil Bosses without armor and saves them without a variant marker',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  clearWaveCombat(w);w.mUpgrades.__set__mLevel(10);
  expect(timedWave(w)!.boss!.members!.map(m=>m.kind)).toEqual(['devil']);
  expect(attemptTimedSpawn(w,'Devil','boss')).toBe(true);g.tick(1);
  const boss=g.things().find(e=>e.mBossKind)!;
  expect(boss.mEnemyVariant).toBeUndefined();expect(boss.mEnemyArmor).toBeUndefined();
  boss.mLife=boss.mMaxLife*.4;const saved=capture(w);
  expect(saved.variants!.enemies.some(e=>e.fields.mBossKind==='devil')).toBe(true);
  expect(applyToWorld(w,saved)).toBe(true);
  const restored=g.things().find(e=>e.Process&&e.mBossKind==='devil')!;
  expect(restored.mLife/restored.mMaxLife).toBeCloseTo(.4);expect(captureEnemyArmor(w)).toEqual([]);
 }finally{g.quit();}
});
it('splits every devil death into four exact seeded quarters with one RNG call',()=>{
 expect(Array.from({length:100},(_,n)=>simpleDevilSupply(n)).reduce((a,k)=>(a[k]=(a[k]??0)+1,a),{})).toEqual({medical:25,armor:25,enchant:25,ammo:25});
 const g=createHeadlessGame(),w=g.world();try{
  const e:any=new Thing.Creature.CThing_Creature_Devil(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();
  const before=getRandomState(),kind=simpleDevilSupply(random(100)),after=getRandomState();setRandomState(before);
  e.mLife=0;w.LogKill(e);expect(getRandomState()).toBe(after);
  const boxes=g.things().filter(e=>e.mSupplyId);expect(boxes).toHaveLength(1);expect(boxes[0].mSupplyKind).toBe(kind);
  w.LogKill(e);expect(g.things().filter(e=>e.mSupplyId)).toHaveLength(1);expect(getRandomState()).toBe(after);
 }finally{g.quit();}
});
it('uses the whole red-box roll for existing weapons without changing health, armor or unlocks',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  p.NewWeapon('uzi');p.mLife=80;p.mArmor=7;
  const active=Object.values(p.mWeapons).filter((e:any)=>e.mActive).length;
  for(const roll of [0,.099,.1,.249,.25,.5,.75,.999]){
   p.mWeapons.uzi.mThing.mAmmo=0;expect(redBoxReward(p,roll)).toBe(true);expect(p.mWeapons.uzi.mThing.mAmmo).toBeGreaterThan(0);
   expect([p.mLife,p.mArmor]).toEqual([80,7]);expect(Object.values(p.mWeapons).filter((e:any)=>e.mActive)).toHaveLength(active);
  }
 }finally{g.quit();}
});
it('keeps the negotiated v2 roster and enemy armor in the explicit previous-rule fixture',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true});try{
  const e:any=new Thing.Creature.CThing_Creature_Devil(g.players()[0].mPosition.Clone());g.world().mThing_Collection.AddThing(e);e.Process_Init();
  expect(g.world().mUpgrades.combat.rule).toBe('combat-pve-v2');expect(e.mEnemyArmor).toBe(600);
 }finally{g.quit();}
});
