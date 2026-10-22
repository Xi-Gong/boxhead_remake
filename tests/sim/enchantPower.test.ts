import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {enchantmentDamage,enchantHeldWeapon,enchantPowerEnabled} from '../../src/game/local/EnchantmentRules.ts';
import {applyWaveReward,rewardOffers} from '../../src/game/local/WaveDraft.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {rewardPreview} from '../../src/game/local/WaveDraftUi.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';

it('grows per owner with bounded diminishing returns, exact single/double previews and no ordinary damage mutation',()=>{
 const g=createHeadlessGame({mode:'Coop',classicFeatures:['percent-stats-v1']}),w=g.world(),[p,q]=g.players();try{
  expect(enchantmentDamage(w)).toBeCloseTo(1.15);w.mUpgrades.lanGrowth.players[1].level=30;
  expect(enchantmentDamage(w,1)).toBeCloseTo(1+.15*(1+2*.29/2.29));expect(enchantmentDamage(w,0)).toBeCloseTo(1.15);
  const stats=capturePlayerStats(w)[1]!,damage=q.mWeapon_Current.mDamage,preview=stats.previews!.enchantPower![1]!;
  expect(rewardPreview(stats,'enchantPower',2)).toMatch(/18.8%.*20.9%/);
  applyWaveReward(w,1,'enchantPower',2);expect(w.mUpgrades.waveDraft.bonuses[1].enchantPower).toBe(2);expect(enchantmentDamage(w,1)).toBe(preview);
  expect(q.mWeapon_Current.mDamage).toBe(damage);expect(p.mWeapon_Current.mDamage).toBe(damage);
  const rng=getRandomState();capturePlayerStats(w);expect(getRandomState()).toBe(rng);
  w.mUpgrades.lanGrowth.players[1].level=1e12;expect(enchantmentDamage(w,1)).toBeLessThanOrEqual(1.45);
  expect(enchantmentDamage(w,1)).toBeGreaterThan(1.4499);
 }finally{g.quit();}
});
it('emits with the correct owner bonus and keeps the last shot and delayed explosion at emission damage',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world(),[p,q]=g.players();try{
  noSpawn(g);placePlayer(g,5.5,8.5);placePlayer(g,8.5,8.5,0,1);applyWaveReward(w,1,'enchantPower',2);
  for(const player of [p,q]){
   const gun=player.mWeapon_Current,damage=gun.mDamage,mult=enchantmentDamage(w,player.mPlayerIndex);enchantHeldWeapon(player);gun.mEnchantDurability=1;
   const old=new Set(g.things());gun.Fire(player.mPosition.Clone(),player.mAngle.Clone());const shot=g.things().find(s=>!old.has(s)&&s._CLASSID_==='CThing_Shot_Bullet')!;
   expect(shot.mEnchanted).toBe(true);expect(shot.mDamage).toBeCloseTo(damage*mult);expect(gun.mEnchantDurability).toBe(0);expect(gun.mDamage).toBe(damage);
  }
  q.NewWeapon('grenade');q.SelectWeapon('grenade');const gun=q.mWeapon_Current;enchantHeldWeapon(q);gun.mEnchantDurability=1;
  const emitted=gun.mDamage*enchantmentDamage(w,1);gun.Fire(pos(9.5,8.5),q.mAngle.Clone(),0);
  const grenade=g.things().find(s=>s._CLASSID_==='CThing_Shot_Grenade')!;expect(grenade.mEffect.mDamage).toBeCloseTo(emitted);expect(grenade.mEffect.mEnchanted).toBe(true);
  applyWaveReward(w,1,'enchantPower',2);w.mUpgrades.lanGrowth.players[1].level=50;expect(grenade.mEffect.mDamage).toBeCloseTo(emitted);
 }finally{g.quit();}
});
it('offers power without requiring active enchantment and includes it only in new selected-wave distributions',()=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  let seen=false;for(let n=0;n<150;n++)seen=rewardOffers(p).includes('enchantPower')||seen;expect(seen).toBe(true);
  const old=startingBonuses(19,true,true,true),next=startingBonuses(19,true,true,true,true);
  expect(old.enchantPower).toBeUndefined();expect(next.enchantPower).toBe(2);expect(Object.values(next).reduce((a,n)=>a+n,0)).toBe(18);
 }finally{g.quit();}
});
it('preserves power in v2 saves and rollback snapshots, accepts old bonus objects without redistribution',()=>{
 const g=createHeadlessGame(),w=g.world();let saved:any;try{
  applyWaveReward(w,0,'enchantPower',2);const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs},before=enchantmentDamage(w);
  applyWaveReward(w,0,'enchantPower',2);restoreWorldSnap(w,slot,ctx);expect(enchantmentDamage(w)).toBe(before);
  saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);expect(enchantmentDamage(w)).toBe(before);expect(applyToWorld(w,capture(w))).toBe(true);expect(enchantmentDamage(w)).toBe(before);
  const legacy=structuredClone(saved);legacy.features=legacy.features.filter((f:string)=>f!=='enchant-power-v1');delete legacy.waveDraft.bonuses[0].enchantPower;
  expect(applyToWorld(w,legacy)).toBe(true);expect(w.mUpgrades.waveDraft.bonuses).toEqual(legacy.waveDraft.bonuses);expect(enchantmentDamage(w)).toBeCloseTo(1.15);
 }finally{g.quit();}
 const old=createHeadlessGame({classicFeatures:['enchant-power-v1']});try{
  const world=old.world();world.mUpgrades.lanGrowth.players[0].level=100;expect(enchantPowerEnabled(world)).toBe(false);expect(enchantmentDamage(world)).toBe(1.15);
  for(let n=0;n<30;n++)expect(rewardOffers(old.players()[0])).not.toContain('enchantPower');expect(capturePlayerStats(world)[0]!.enchantDamage).toBeUndefined();
  expect(applyToWorld(world,saved)).toBe(false);
 }finally{old.quit();}
});
