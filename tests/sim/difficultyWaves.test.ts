import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {recordWaveReached} from '../../src/game/local/WaveUnlock.ts';
import {setSelectedStartWave,getRunStartWave} from '../../src/game/local/StartWave.ts';
import {timedWorldStartLevel} from '../../src/game/local/Endless.ts';
import {difficultyEnemy} from '../../src/game/local/DifficultyRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {MODERN_FEATURES} from '../../src/game/local/ModernFeatures.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import type {GameConfig} from '../../src/game/local/Net/protocol.ts';
const cfg:GameConfig={difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
 progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',balance:'pve-balance-v1',endless:'endless-pve-v1',variants:'enemy-variants-v1',enchantment:'persistent-enchantment-v1',
 timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1',draftReady:'draft-ready-v1',tieredGrowth:'tiered-growth-v1',clearWaves:'clearable-waves-v1',combat:'combat-pve-v3',features:[...MODERN_FEATURES]};
it('replaces only the modern options hint, keeping original legacy copy and nonoverlapping controls',()=>{
 for(const legacy of [false,true]){const g=createHeadlessGame({menuOnly:'Select',classicFeatures:legacy?['difficulty-waves-v1']:undefined});try{
  const s=g.main().mcScreen;s.WindowOptions_Open();const win=s.mcWindow_Options,original=win.$kids().find((c:any)=>c.$def?.id===357);expect(original._visible).toBe(legacy);
  if(legacy)expect(win._DifficultyHelp).toBeUndefined();else{expect(win._DifficultyHelp.text).toContain('Start Wave stays as selected');const text=win._DifficultyHelp.getBounds(win),controls=win._Level_Nightmare.getBounds(win);expect(text.yMin).toBeGreaterThan(controls.yMax);expect(win._DifficultyHelp.textWidth).toBeLessThan(win._DifficultyHelp._width-4);}
 }finally{g.quit();}}
});
it.each(['Single','Coop']as const)('%s honors every selected wave under all four difficulties, including one and beyond 100',mode=>{
 for(const difficulty of [0,1,2,3])for(const wave of [1,2,10,35,126]){
  const g=createHeadlessGame({mode,menuOnly:'Select'});try{
   CMain.mSaveData.mDifficulty=difficulty;recordWaveReached(wave);setSelectedStartWave(wave);
   const icon=g.main().mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button;icon.onRelease.call(icon);expect(g.waitRunning()).toBe(true);
   const w=g.world();expect(w.mUpgrades.mLevelIndex).toBe(wave);expect(getRunStartWave()).toBe(wave);
   expect(w.mUpgrades.lanGrowth.players[0].level).toBe(timedWorldStartLevel(w,wave));
   if(wave===1)for(const p of g.players()){expect(p.mWeaponList.filter((e:any)=>e.mActive).map((e:any)=>e.mNameID)).toEqual(['pistol']);expect(p.mMaxLife).toBe(160);expect(w.mUpgrades.lanGrowth.players[p.mPlayerIndex].level).toBe(1);}
   expect(g.errors).toEqual([]);
  }finally{g.quit();}
 }
});
it('LAN shares exact waves and earned growth only when the independent capability is negotiated',()=>{
 for(const difficulty of [0,1,2,3])for(const wave of [1,7,35]){
  const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});try{
   s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:371,wave,cfg:{...cfg,difficulty}},g.main());expect(g.waitRunning()).toBe(true);
   const w=g.world();expect(w.mUpgrades.mLevelIndex).toBe(wave);expect(s.confirmedWave).toBe(wave);expect(w.mUpgrades.lanGrowth.players.map((p:any)=>p.level)).toEqual([timedWorldStartLevel(w,wave),timedWorldStartLevel(w,wave)]);
   if(wave===1)expect(s.confirmedPlayerStats?.map(p=>[p.level,p.maximum,p.weaponId])).toEqual([[1,160,'pistol'],[1,160,'pistol']]);
  }finally{g.quit();}
 }
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});try{s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:371,wave:1,cfg:{...cfg,difficulty:3,features:MODERN_FEATURES.filter(f=>f!=='difficulty-waves-v1')}},g.main());expect(g.waitRunning()).toBe(true);expect(g.world().mUpgrades.mLevelIndex).toBe(35);}finally{g.quit();}
});
it('keeps the actual saved wave, earned stats and bindings when restoring old and new v2 saves',()=>{
 const g=createHeadlessGame({difficulty:3}),w=g.world(),p=g.players()[0];try{
  w.mUpgrades.__set__mLevel(7);w.mUpgrades.lanGrowth.players[0].xp=1;p.mLife=101;p.mArmor=9;w.mUpgrades.weaponBindings[0].A='pistol';
  const saved=capture(w);for(const old of [true,false]){const snap=structuredClone(saved);if(old)snap.features=snap.features!.filter(f=>f!=='difficulty-waves-v1');w.mUpgrades.__set__mLevel(35);expect(applyToWorld(w,snap)).toBe(true);expect(w.mUpgrades.mLevelIndex).toBe(7);expect([p.mLife,p.mArmor,w.mUpgrades.lanGrowth.players[0].xp]).toEqual([101,9,1]);expect(w.mUpgrades.weaponBindings[0]).toEqual({A:'pistol'});}
 }finally{g.quit();}
});
it('gives higher difficulties stronger initial enemies and faster health/damage growth at the same wave',()=>{
 const samples:any[]=[];for(const difficulty of [0,1,2,3]as const){const g=createHeadlessGame({difficulty}),w=g.world();try{
  const rows=[];for(const wave of [1,36]){w.mUpgrades.__set__mLevel(wave);const e:any=new Thing.Creature.CThing_Creature_Zombie(g.players()[0].mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();rows.push({life:e.mLife,damage:e.mDamage,speed:e.mSpeed,budget:w.mUpgrades.timedWave.clear.zombies});}samples.push(rows);
 }finally{g.quit();}}
 for(let d=1;d<4;d++){for(const wave of [0,1])for(const stat of ['life','damage','speed'])expect(samples[d][wave][stat]).toBeGreaterThan(samples[d-1][wave][stat]);expect(samples[d][0].budget).toBeGreaterThan(samples[d-1][0].budget);for(const stat of ['life','damage'])expect(samples[d][1][stat]/samples[d][0][stat]).toBeGreaterThan(samples[d-1][1][stat]/samples[d-1][0][stat]);}
 for(const d of [0,1,2,3]){const high=difficultyEnemy(Number.MAX_SAFE_INTEGER,d);expect(Object.values(high).every(Number.isFinite)).toBe(true);expect(high.movement).toBeLessThan(1.16);expect(high.attack).toBeLessThan(1.3);}
});
