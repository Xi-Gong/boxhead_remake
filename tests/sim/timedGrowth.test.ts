import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {timedPreviousExperience,timedStartLevel,timedWaveExperience,type TimedGrowthConfig} from '../../src/game/local/TimedGrowthRules.ts';
import {timedWorldStartLevel,worldEnemyGrowth} from '../../src/game/local/Endless.ts';
import {ROOM_DIMENSIONS,waveSeconds} from '../../src/game/local/TimedWaveRules.ts';
import {growthOf,xpRequired} from '../../src/game/local/Net/Growth.ts';
import {recordWaveReached} from '../../src/game/local/WaveUnlock.ts';
import {setSelectedStartWave} from '../../src/game/local/StartWave.ts';
import {startingBonuses} from '../../src/game/local/WaveDraftRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';
const config:TimedGrowthConfig={seconds:180,difficulty:0,devils:true,players:1,bosses:true};
it('sums the bounded prefix and repeating tail exactly against a simple per-wave oracle',()=>{
 for(const seconds of [180,240,300])for(const difficulty of [0,1,2,3])for(const devils of [false,true])for(const bosses of [false,true]){
  const c={...config,seconds,difficulty,devils,bosses};let xp=0n;
  for(let wave=1;wave<=220;wave++){
   expect(timedPreviousExperience(wave,c)).toBe(xp);
   expect(timedPreviousExperience(wave,{...c,players:2})).toBe(xp/2n);xp+=BigInt(timedWaveExperience(wave,c));
  }
 }
});
it('reflects map duration, stage cadence, devil settings, equal shares and no assumed Boss kill',()=>{
 expect(timedWaveExperience(5,config)).toBe(120);expect(timedWaveExperience(10,config)).toBe(120);
 expect(timedWaveExperience(5,{...config,seconds:300})).toBe(180);
 expect(timedStartLevel(1,config)).toBe(1);
 expect(timedStartLevel(20,{...config,seconds:300})).toBeGreaterThan(timedStartLevel(20,config));
 expect(timedStartLevel(20,{...config,difficulty:3})).toBeGreaterThan(timedStartLevel(20,config));
 expect(timedStartLevel(20,config)).toBeGreaterThan(timedStartLevel(20,{...config,devils:false}));
 expect(timedStartLevel(20,config)).toBeGreaterThan(timedStartLevel(20,{...config,players:2}));
 for(const wave of [101,105,106,1000000,Number.MAX_SAFE_INTEGER])expect(Number.isSafeInteger(timedStartLevel(wave,config))).toBe(true);
});
it('initializes all 18 selected maps from their timed reference with evenly distributed basic perks',()=>{
 for(let room=1;room<=18;room++){
  const g=createHeadlessGame({menuOnly:'Select',room}),screen=g.main().mcScreen;
  recordWaveReached(20);setSelectedStartWave(20);CMain.mSaveData.mLevelIndex_Single=room-1;
  screen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(room);screen.ChangeLevel(screen.mcSubScreen.mcLevel_Selection,room-1);
  screen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button.onRelease();expect(g.waitRunning()).toBe(true);
  const w=g.world(),state=growthOf(w)!,size=ROOM_DIMENSIONS[room-1]!;
  expect([w.mMap.mSize.x,w.mMap.mSize.y]).toEqual(size);
  expect(state.players[0].level).toBe(timedStartLevel(20,{...config,seconds:waveSeconds(...size)}));
  expect([state.players[0].score,state.players[0].xp]).toEqual([0,0]);
  expect(w.mUpgrades.waveDraft.bonuses[0]).toEqual(startingBonuses(20));expect(g.players()[0].mWeapons.railgun.mActive).toBe(true);g.quit();
 }
});
it('keeps the difficulty floor and current enemy-growth cache deterministic without RNG or saved growth changes',()=>{
 const g=createHeadlessGame({mode:'Coop',difficulty:3}),w=g.world(),p=g.players()[0];
 expect(growthOf(w)!.players[0].level).toBe(timedWorldStartLevel(w,35));
 const rng=getRandomState(),old=worldEnemyGrowth(w);for(let i=0;i<10;i++)expect(worldEnemyGrowth(w)).toBe(old);
 w.mUpgrades.__set__mLevel(1000);const high=worldEnemyGrowth(w);expect(high.health).toBeGreaterThan(old.health);
 w.mUpgrades.__set__mLevel(35);expect(worldEnemyGrowth(w)).toEqual(old);expect(getRandomState()).toBe(rng);
 const state=growthOf(w)!;state.players[0].level=17;state.players[0].xp=3;p.mLife=73;p.mArmor=19;p.mWeapons.uzi.mThing.mAmmo=7;
 const save=capture(w);expect(applyToWorld(w,save)).toBe(true);
 expect(growthOf(w)!.players[0].level).toBe(17);expect(growthOf(w)!.players[0].xp).toBe(3);expect(xpRequired(growthOf(w)!.players[0])).toBe(10);
 expect([p.mLife,p.mArmor,p.mWeapons.uzi.mThing.mAmmo]).toEqual([73,19,7]);g.quit();
});
it('uses timed reference growth for ordinary enemies and matches the currently selected wave',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];w.mUpgrades.__set__mLevel(101);
 const before=getRandomState(),factor=worldEnemyGrowth(w);expect(getRandomState()).toBe(before);
 const expected=timedWorldStartLevel(w,101)-125;expect(factor).toEqual({health:1+.02*expected,damage:1+.008*expected});
 const e:any=new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone());w.mThing_Collection.AddThing(e);e.Process_Init();
 expect(e.mLife).toBe(100*factor.health);expect(e.mDamage).toBe(50*factor.damage);g.quit();
});
