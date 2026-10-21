import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing,World} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,attemptTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureEnemyArmor} from '../../src/game/local/CombatEnemies.ts';
import {SIMPLE_COMBAT_RULE,simplifiedVitals} from '../../src/game/local/CombatRules.ts';
import {playerMaximum,syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {armorMaximum,refillArmor} from '../../src/game/local/Supplies.ts';
import {enchantHeldWeapon} from '../../src/game/local/EnchantmentRules.ts';
import {rewardOffers,applyWaveReward} from '../../src/game/local/WaveDraft.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {noSpawn,placePlayer,addZombie,pos} from './fxkit.ts';
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
it('separates health and armor at every growth boundary, with exact derived reward previews',()=>{
 expect([1,10,30,50].map(simplifiedVitals)).toEqual([{health:160,armor:60},{health:178,armor:69},{health:238,armor:109},{health:318,armor:169}]);
 const g=createHeadlessGame({classicFeatures:['fragile-armor-v1']}),w=g.world(),p=g.players()[0];try{
  expect([p.mMaxLife,armorMaximum(p)]).toEqual([160,60]);p.mLife=80;p.mArmor=7;
  const stats=capturePlayerStats(w)[0]!;applyWaveReward(w,0,'health',1);applyWaveReward(w,0,'armor',1);
  expect([playerMaximum(p),armorMaximum(p)]).toEqual([173,64]);expect([p.mLife,p.mArmor]).toEqual([93,7]);
  expect([stats.previews!.health![0],stats.previews!.armor![0]]).toEqual([173,64]);
  expect(stats.previews!.penetration).toBeUndefined();
  w.mUpgrades.lanGrowth.players[0].level=31;const before=p.mMaxLife;syncVitals(p,'level');expect(p.mLife).toBe(93+p.mMaxLife-before);expect(p.mArmor).toBe(7);
 }finally{g.quit();}
});
it('breaks the thin shield on the second 50-damage attack with normal overflow',()=>{
 const g=createHeadlessGame({classicFeatures:['fragile-armor-v1']}),p=g.players()[0];try{
  noSpawn(g);placePlayer(g,6.5,8.5);p.mInvincible=0;refillArmor(p);
  const foe={mPosition:p.mPosition.Add(new Thing.Math.CThing_Position(1,0,0)),mAngle:p.mAngle};
  for(let n=0;n<2;n++){p.mAffectors=[new Thing.Affect.CThing_Affect_ZombieAttack(foe,50)];p.ProcessAffects();}
  expect([p.mLife,p.mArmor]).toEqual([120,0]);
 }finally{g.quit();}
});
it('offers no ineffective armor piercing and distributes all selected-wave points over seven stats',()=>{
 const g=createHeadlessGame();try{for(let n=0;n<100;n++)expect(rewardOffers(g.players()[0])).not.toContain('penetration');}finally{g.quit();}
 const b=startingBonuses(15,true,true);expect(b.penetration).toBeUndefined();expect(Object.values(b).reduce((a,n)=>a+n,0)).toBe(14);expect(b.scavenging).toBe(2);
});
it('enchanted bullets receive 15 percent once and hit at most two enemies, still stopping at walls',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  noSpawn(g);const p=placePlayer(g,5.5,8.5);p.NewWeapon('uzi');p.SelectWeapon('uzi');const gun=p.mWeapon_Current;
  const foes=[6.5,7.5,8.5].map(x=>{const e=addZombie(g,x,8.5);e.Process_Init();e.Move(e.mPosition);e.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet);return e;});
  enchantHeldWeapon(p);gun.Fire(p.mPosition.Clone(),p.mAngle.Clone());let shot=g.things().find(e=>e._CLASSID_==='CThing_Shot_Bullet');expect(shot.mDamage).toBeCloseTo(gun.mDamage*1.15);shot.Process_Init();
  expect(foes.map(e=>e.mAffectors.length)).toEqual([1,1,0]);for(const e of foes)e.mAffectors=[];
  w.mMap.GetCell(7,8).mCollide|=World.Map.CMap_Cell.mCollide_Solid;gun.Fire(p.mPosition.Clone(),p.mAngle.Clone());shot=g.things().filter(e=>e._CLASSID_==='CThing_Shot_Bullet').at(-1);shot.Process_Init();expect(foes.map(e=>e.mAffectors.length)).toEqual([1,0,0]);
 }finally{g.quit();}
});
it('enchanted explosions retain the ordinary edge falloff instead of an extra 50 percent',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  noSpawn(g);const e:any=w.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(pos(9.5,8.5),p.mAngle,p,115));e.mEnchanted=true;e.Process_Init();
  const victim=addZombie(g,11.5,8.5);victim.Process_Init();victim.Move(victim.mPosition);victim.mLife=1000;
  expect(new Thing.Affect.CThing_Affect_Explosion(p,e,115,2.5).AffectThing(victim)).toBeCloseTo(115*.5);
 }finally{g.quit();}
});
