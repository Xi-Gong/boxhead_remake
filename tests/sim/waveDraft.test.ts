import {expect,it} from 'vitest';
import {createHeadlessGame as boot,KEYS,type HeadlessGameOptions} from './harness.ts';
const createHeadlessGame=(opts:HeadlessGameOptions={})=>boot({...opts,classicDraftReady:true});
import {noSpawn} from './fxkit.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {timedWave} from '../../src/game/local/TimedWaves.ts';
import {beginWaveDraft,processWaveDraft,applyWaveReward,rewardOffers,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {startingBonuses,encodeDraftChoice,decodeDraftChoice} from '../../src/game/local/WaveDraftRules.ts';
import {queueDraftChoice} from '../../src/game/local/WaveDraftInput.ts';
import {armorMaximum} from '../../src/game/local/Supplies.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,restoreWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';

it('keeps drafts within seven input bits and distributes selected-wave builds without replay',()=>{
  for(let i=0;i<3;i++){expect(encodeDraftChoice(i)).toBeLessThan(128);expect(decodeDraftChoice(encodeDraftChoice(i))).toBe(i);}
  for(const wave of [1,2,5,1000000,Number.MAX_SAFE_INTEGER]){
    const values=Object.values(startingBonuses(wave));expect(values.reduce((a,b)=>a+b,0)).toBe(wave-1);
    expect(Math.max(...values)-Math.min(...values)).toBeLessThanOrEqual(1);
  }
});
it('holds combat, regeneration and supply clocks while draft tick/input continues, then defaults at 12 seconds',()=>{
  const g=createHeadlessGame(),w=g.world(),p=g.players()[0];noSpawn(g);p.mLife=70;
  timedWave(w)!.remainingTicks=1;g.tick(1);expect(timedWave(w)!.phase).toBe('draft');
  const timer=w.mUpgrades.supplyState.nextDropTicks,life=p.mLife,position=p.mPosition.Clone(),tick=w.mTick;
  g.keyDown(KEYS.P1.RIGHT);g.tick(20);g.keyUp(KEYS.P1.RIGHT);
  expect(w.mTick).toBe(tick+20);expect(w.mUpgrades.supplyState.nextDropTicks).toBe(timer);
  expect(p.mLife).toBe(life);expect(p.mPosition.Distance2D(position)).toBe(0);
  expect(waveDraft(w)!.round!.remainingTicks).toBe(CMain.mFPS*12-20);
  waveDraft(w)!.round!.selected[0]=2;waveDraft(w)!.round!.remainingTicks=1;g.tick(1);
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.bonuses[0].damage).toBe(1);expect(waveDraft(w)!.round).toBeUndefined();g.quit();
});
it('requires release of held fire on entry and continues as soon as both players confirm',()=>{
  const g=createHeadlessGame({mode:'Coop'}),w=g.world();noSpawn(g);
  g.keyDown(KEYS.P1.FIRE);g.tick(1);beginWaveDraft(w);g.tick(3);
  expect(waveDraft(w)!.round!.confirmed).toEqual([false,false]);
  g.keyUp(KEYS.P1.FIRE);g.tick(1);g.keyDown(KEYS.P1.FIRE);g.tick(1);g.keyUp(KEYS.P1.FIRE);
  expect(waveDraft(w)!.round!.confirmed).toEqual([true,false]);
  g.keyDown(KEYS.P2.FIRE);g.tick(1);g.keyUp(KEYS.P2.FIRE);
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.bonuses.map(b=>b.damage)).toEqual([1,1]);g.quit();
});
it('offers seeded distinct choices, always default firepower and excludes unusable recovery',()=>{
  const g=createHeadlessGame(),w=g.world(),p=g.players()[0];noSpawn(g);
  for(let i=0;i<20;i++){
    const offers=rewardOffers(p);expect(offers[0]).toBe('damage');expect(new Set(offers).size).toBe(3);
    expect(offers).not.toContain('heal');expect(offers).not.toContain('ammo');
  }
  p.mLife=50;p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=1;
  const seen=new Set<string>();for(let i=0;i<50;i++)for(const reward of rewardOffers(p))seen.add(reward);
  expect(seen.has('heal')).toBe(true);expect(seen.has('ammo')).toBe(true);g.quit();
});
it('applies additive bonuses, grants only new health/ammo capacity and never refills shield',()=>{
  const g=createHeadlessGame(),w=g.world(),p=g.players()[0];noSpawn(g);p.NewWeapon('uzi');const gun=p.mWeapons.uzi.mThing;
  p.mLife=50;p.mArmor=12;gun.mAmmo=7;const damage=gun.mDamage,capacity=gun.mTotalAmmo,max=p.mMaxLife;
  applyWaveReward(w,0,'damage',2);expect(gun.mDamage).toBeCloseTo(damage*1.16);
  applyWaveReward(w,0,'health',1);expect(p.mMaxLife).toBe(Math.round(max*1.1));expect(p.mLife).toBe(50+p.mMaxLife-max);
  applyWaveReward(w,0,'armor',1);expect(armorMaximum(p)).toBe(Math.round(max*1.1));expect(p.mArmor).toBe(12);
  applyWaveReward(w,0,'capacity',1);expect(gun.mTotalAmmo).toBe(capacity+Math.floor(capacity*.15));expect(gun.mAmmo).toBe(7+Math.floor(capacity*.15));
  for(let i=0;i<10;i++)w.mUpgrades.ApplyUpgrade_Weapon(gun);
  expect(gun.mTotalAmmo).toBe(capacity+Math.floor(capacity*.15));expect(gun.mAmmo).toBe(7+Math.floor(capacity*.15));
  applyWaveReward(w,0,'capacity',1);expect(gun.mTotalAmmo).toBe(capacity+Math.floor(capacity*.30));
  gun.mAmmo=1;applyWaveReward(w,0,'ammo',2);expect(gun.mAmmo).toBe(1+Math.ceil(gun.mTotalAmmo*.7));
  applyWaveReward(w,0,'heal',2);expect(p.mLife).toBe(p.mMaxLife);g.quit();
});
it('saves exact offers/countdown/bonuses and replays a confirmed reward once across rollback',()=>{
  const g=createHeadlessGame(),w=g.world();noSpawn(g);beginWaveDraft(w,2);waveDraft(w)!.round!.remainingTicks=93;
  const save=capture(w);expect(applyToWorld(w,save)).toBe(true);expect(capture(w).waveDraft).toEqual(save.waveDraft);
  waveDraft(w)!.round!.remainingTicks=1;
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),instances=ctx.instances,sharedObjs=ctx.sharedObjs;
  processWaveDraft(w);expect(waveDraft(w)!.bonuses[0].damage).toBe(2);const digest=simulationDigest(captureWorldSnap(w,ctx,false));
  restoreWorldSnap(w,{tRel:0,data,instances,sharedObjs},ctx);processWaveDraft(w);
  expect(waveDraft(w)!.bonuses[0].damage).toBe(2);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);
  processWaveDraft(w);expect(waveDraft(w)!.bonuses[0].damage).toBe(2);g.quit();
});
it('routes a card click through the tick input and ignores stale clicks after the wave',()=>{
  const g=createHeadlessGame(),w=g.world();noSpawn(g);beginWaveDraft(w);
  const reward=waveDraft(w)!.round!.offers[0]![1]!;queueDraftChoice(w,0,1,1);g.tick(1);
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.bonuses[0][reward as 'health']).toBe(1);
  queueDraftChoice(w,0,0,1);beginWaveDraft(w);g.tick(1);expect(waveDraft(w)!.round!.confirmed[0]).toBe(false);g.quit();
});
it('retains a keyboard tap shorter than a simulation tick',()=>{
  const g=createHeadlessGame(),w=g.world();noSpawn(g);beginWaveDraft(w);
  g.keyDown(KEYS.P1.DOWN);g.keyUp(KEYS.P1.DOWN);g.tick(1);expect(waveDraft(w)!.round!.selected[0]).toBe(1);
  g.keyDown(KEYS.P1.FIRE);g.keyUp(KEYS.P1.FIRE);g.tick(1);expect(w.mUpgrades.mLevelIndex).toBe(2);g.quit();
});
it('restores boosted finite weapons without repeated capacity or free ammo on continue',()=>{
  const g=createHeadlessGame(),w=g.world(),p=g.players()[0];noSpawn(g);p.NewWeapon('uzi');
  applyWaveReward(w,0,'capacity',2);applyWaveReward(w,0,'damage',3);p.mWeapons.uzi.mThing.mAmmo=3;
  const save=capture(w),capacity=p.mWeapons.uzi.mThing.mTotalAmmo,damage=p.mWeapons.uzi.mThing.mDamage;
  for(let i=0;i<3;i++){
    expect(applyToWorld(w,save)).toBe(true);w.mUpgrades.ApplyUpgrade_Weapon(p.mWeapons.uzi.mThing);
    expect([p.mWeapons.uzi.mThing.mAmmo,p.mWeapons.uzi.mThing.mTotalAmmo,p.mWeapons.uzi.mThing.mDamage]).toEqual([3,capacity,damage]);
  }g.quit();
});
it('keeps the construct through cooperative respawn and resets it in a new run',()=>{
  const g=createHeadlessGame({mode:'Coop'}),w=g.world(),p=g.players()[0];noSpawn(g);applyWaveReward(w,0,'health',2);
  p.mLife=0;p.SetState('State_Respawn');expect(p.mMaxLife).toBe(240);expect(waveDraft(w)!.bonuses[0].health).toBe(2);g.quit();
  const fresh=createHeadlessGame();expect(waveDraft(fresh.world())!.bonuses[0]).toEqual({damage:0,health:0,armor:0,capacity:0});fresh.quit();
});
it('migrates high-wave saves without healing or ammunition and rejects missing draft capability',()=>{
  const old=createHeadlessGame({classicWaveDraft:true}),w0=old.world(),p0=old.players()[0];noSpawn(old);
  w0.mUpgrades.__set__mLevel(25);p0.NewWeapon('uzi');p0.mWeapons.uzi.mThing.mAmmo=7;p0.mLife=67;p0.mArmor=19;
  const save=capture(w0);old.quit();
  const modern=createHeadlessGame(),w=modern.world(),p=modern.players()[0];noSpawn(modern);
  expect(applyToWorld(w,save)).toBe(true);expect(waveDraft(w)!.bonuses[0]).toEqual(startingBonuses(25));
  for(let i=0;i<3;i++)w.mUpgrades.ApplyUpgrade_Weapon(p.mWeapons.uzi.mThing);
  expect([p.mLife,p.mArmor,p.mWeapons.uzi.mThing.mAmmo]).toEqual([67,19,7]);
  const newSave=capture(w);modern.quit();
  const classic=createHeadlessGame({classicWaveDraft:true}),before=capture(classic.world());
  expect(applyToWorld(classic.world(),newSave)).toBe(false);expect(capture(classic.world())).toEqual(before);classic.quit();
});
it('uses confirmed draft HUD state and consumes only the negotiated seven-bit per-player input',()=>{
  const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:17,netcode:'rollback-v2',cfg:{
    difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
    progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',
    balance:'pve-balance-v1',endless:'endless-pve-v1',timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1'}},g.main());
  expect(g.waitRunning(3000)).toBe(true);const w=g.world();beginWaveDraft(w);
  expect(s.confirmedWaveDraft?.round).toBeUndefined();
  const tick=s.tickIndex(w);s.tickMeta.set(tick,{});
  for(const i of [0,1]){s.slot(i,'NEXT_WEAPON').setHeld(true,tick,0);s.slot(i,'PREV_WEAPON').setHeld(true,tick,0);s.slot(i,'UP').setHeld(true,tick,0);}
  s.executeWorldStep(w,tick);
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.bonuses.map(b=>b.damage)).toEqual([1,1]);
  expect(s.tickMeta.get(tick).waveDraft.bonuses.map((b:any)=>b.damage)).toEqual([1,1]);
  expect(s.confirmedWaveDraft!.bonuses.map(b=>b.damage)).toEqual([0,0]);g.quit();
});
