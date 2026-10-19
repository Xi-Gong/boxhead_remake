import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { CMain, Thing } from '../../src/game/packages.ts';
import { growthOf, copyGrowth, xpRequired } from '../../src/game/local/Net/Growth.ts';
import { balancedStartLevel } from '../../src/game/local/BalanceRules.ts';
import { initializeLocalGrowth } from '../../src/game/local/LocalGrowth.ts';
import { capture, applyToWorld, armSnapshot, hasCheckpoint } from '../../src/game/local/Resume.ts';
import { recordWaveReached } from '../../src/game/local/WaveUnlock.ts';
import { setSelectedStartWave } from '../../src/game/local/StartWave.ts';
import { getRandomState } from '../../src/engine/flash/rng.ts';
import { SharedObject } from '../../src/engine/flash/SharedObject.ts';

function kill(world:any, player:any, devil=false) {
  const ctor=devil?Thing.Creature.CThing_Creature_Devil:Thing.Creature.CThing_Creature_Zombie;
  const victim=new ctor(player.mPosition.Clone(),player.mAngle.Clone());
  world.mThing_Collection.AddThing(victim); victim.Process_Init(); victim.mLife=10;
  new Thing.Affect.CThing_Affect_Bullet(player,player,10,player.mAngle).AffectThing(victim);
  world.LogKill(victim); world.LogKill(victim); victim.Delete();
}
function start(game:any,wave=1) {
  recordWaveReached(wave); setSelectedStartWave(wave);
  const s=game.main().mcScreen,icons=s.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  s.ChangeLevel(s.mcSubScreen.mcLevel_Selection,0); icons._Button.onRelease.call(icons._Button);
  expect(game.waitRunning()).toBe(true);
}

describe('local permanent personal growth',()=>{
  it.each(['Single','Coop'] as const)('%s uses owned kills, the balanced curve, score-before-level, and no decay',mode=>{
    const game=createHeadlessGame({mode}),world=game.world(),players=game.players(),state=growthOf(world)!;
    expect(state.players[0]).toEqual({score:0,level:1,xp:0,curve:'pve-balance-v1',endless:true});
    for(let i=0;i<5;i++)kill(world,players[0]);
    expect(state.players[0]).toEqual({score:500,level:2,xp:0,curve:'pve-balance-v1',endless:true});
    expect(state.players[1].score).toBe(0);
    if(mode==='Coop'){kill(world,players[1],true);expect(state.players[1].level).toBe(2);expect(state.players[1].score).toBe(1000);}
    state.players[0].level=10;state.players[0].xp=4;kill(world,players[0],true);
    expect(state.players[0].level).toBe(11);expect(state.players[0].xp).toBe(4);expect(xpRequired(state.players[0])).toBe(10);
    world.mUpgrades.__set__mMultiplier(0);expect(state.players[0].level).toBe(11);
    expect(world.mHud.nTotalScore).toBe(state.players[0].score+state.players[1].score);
    expect(hasCheckpoint()).toBe(true);expect(game.errors).toEqual([]);
  });
  it.each(['Single','Coop'] as const)('%s selected-wave and difficulty floors share the earned-wave model',mode=>{
    const game=createHeadlessGame({mode,menuOnly:'Select'}); CMain.mSaveData.mDifficulty=3;
    start(game,20); const world=game.world(),level=balancedStartLevel(35,true,mode==='Single'?1:2);
    expect(world.mUpgrades.mLevelIndex).toBe(20);
    expect(growthOf(world)!.players[0]).toEqual({score:0,level,xp:0,curve:'pve-balance-v1',endless:true});
    for(const p of game.players())expect(p.mWeapons.railgun.mActive).toBe(true);
  });
  it('single progression uses all previous kills, cooperation an equal share; disabling devils excludes their XP',()=>{
    const levels=[];
    for(const mode of ['Single','Coop'] as const){
      const game=createHeadlessGame({mode,menuOnly:'Select'}); CMain.mSaveData.mDevilsActive=0;start(game,20);
      levels.push(growthOf(game.world())!.players[0].level);
      expect(levels.at(-1)).toBe(balancedStartLevel(20,false,mode==='Single'?1:2));
    }
    expect(levels[0]).toBeGreaterThan(levels[1]!);
  });
  it.each(['Single','Coop'] as const)('%s migrates old v2 only once, retaining score, damaged health, armor, inventory and ammo',mode=>{
    const old=createHeadlessGame({classicGrowth:true,mode,room:1}),w=old.world();
    w.mHud.nTotalScore=12345;
    for(const p of old.players()) {p.NewWeapon('railgun');p.mWeapons.railgun.mThing.mAmmo=7;p.mLife=73;p.mArmor=37;}
    const snap=capture(w);expect(snap.growth).toBeUndefined();
    const modern=createHeadlessGame({mode}),world=modern.world();
    expect(applyToWorld(world,snap)).toBe(true);
    const state=copyGrowth(growthOf(world)!);expect(state.players[0].level).toBe(70);expect(state.players[0].xp).toBe(0);
    expect(state.players.map(p=>p.score)).toEqual(mode==='Single'?[12345,0]:[6173,6172]);
    for(const p of modern.players()){
      expect(p.mLife).toBe(73);expect(p.mArmor).toBe(37);
      expect(Object.values(p.mWeapons).filter((e:any)=>e.mActive).map((e:any)=>e.mNameID)).toEqual(['pistol','railgun']);
      expect(p.mWeapons.railgun.mThing.mAmmo).toBe(7);
      world.mUpgrades.ApplyUpgrade_Weapon(p.mWeapons.railgun.mThing);expect(p.mWeapons.railgun.mThing.mAmmo).toBe(7);
    }
    expect(getRandomState()).toBe(snap.rngState);
    const roundtrip=capture(world); state.players[0].xp=8;roundtrip.growth=state;
    expect(applyToWorld(world,roundtrip)).toBe(true);initializeLocalGrowth(world,true);
    expect(growthOf(world)).toEqual(state);expect(world.mHud.nTotalScore).toBe(12345);
  });
  it('old multiplier and wave baselines remain lower bounds, and saved growth restores directly',()=>{
    const old=createHeadlessGame({classicGrowth:true}),w=old.world();
    w.mUpgrades.mMultiplierIndex=125;const snap=capture(w);
    const modern=createHeadlessGame();expect(applyToWorld(modern.world(),snap)).toBe(true);
    expect(growthOf(modern.world())!.players[0].level).toBe(125);
    const saved=capture(modern.world());saved.growth!.players[0].level=11;saved.growth!.players[0].xp=9;
    saved.multiplierIndex=125;expect(applyToWorld(modern.world(),saved)).toBe(true);
    expect(growthOf(modern.world())!.players[0].level).toBe(11);expect(growthOf(modern.world())!.players[0].xp).toBe(9);
  });
  it('armed continuation and actual retry preserve the checkpoint personal state',()=>{
    const game=createHeadlessGame({mode:'Coop',menuOnly:'Select'});start(game,20);
    const saved=capture(game.world());saved.growth!.players[0].score=3123;saved.growth!.players[0].xp=3;
    saved.score=3123;saved.players[0]!.life=73;
    game.quit();expect(game.waitScreen('State_Debrief','Screen_Debrief')).toBe(true);
    armSnapshot(saved);game.main().mcScreen.nState='State_LoadWorld';expect(game.waitRunning()).toBe(true);
    expect(growthOf(game.world())).toEqual(saved.growth);expect(game.players()[0].mLife).toBe(73);
    kill(game.world(),game.players()[0]);game.quit();expect(game.waitScreen('State_Debrief','Screen_Debrief')).toBe(true);
    game.retry();expect(game.waitRunning()).toBe(true);expect(growthOf(game.world())).toEqual(saved.growth);
  });
  it.each(['Single','Coop'] as const)('%s continues an old serialized save, then saves and restarts with permanent growth',mode=>{
    const map=new Map<string,string>();
    SharedObject._setStorage({getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);}});
    try {
      const old=createHeadlessGame({classicGrowth:true,mode});
      old.world().mHud.nTotalScore=101;old.players()[0].mLife=73;old.players()[0].mArmor=31;
      old.players()[0].NewWeapon('uzi');old.players()[0].mWeapons.uzi.mThing.mAmmo=7;old.saveQuit();
      expect(old.waitScreen('State_Main','Screen_Main')).toBe(true);
      const modern=createHeadlessGame({menuOnly:'Main'}),button=modern.main().mcScreen.mcContinue;
      button.onRelease.call(button);expect(modern.waitRunning()).toBe(true);
      const state=copyGrowth(growthOf(modern.world())!);
      expect(state.players[0].score).toBe(mode==='Single'?101:51);
      expect(modern.players()[0].mLife).toBe(73);expect(modern.players()[0].mArmor).toBe(31);
      expect(modern.players()[0].mWeapons.uzi.mThing.mAmmo).toBe(7);
      modern.saveQuit();expect(modern.waitScreen('State_Main','Screen_Main')).toBe(true);
      const restarted=createHeadlessGame({menuOnly:'Main'}),continueButton=restarted.main().mcScreen.mcContinue;
      continueButton.onRelease.call(continueButton);expect(restarted.waitRunning()).toBe(true);
      expect(growthOf(restarted.world())).toEqual(state);expect(restarted.players()[0].mWeapons.uzi.mThing.mAmmo).toBe(7);
      expect(restarted.players()[0].mLife).toBe(73);expect(restarted.players()[0].mArmor).toBe(31);
    } finally {SharedObject._setStorage(undefined);}
  });
  it.each(['Single','Coop'] as const)('%s draws its own panels and pause upgrades without a LAN session',mode=>{
    const game=createHeadlessGame({mode}),w=game.world();kill(w,game.players()[0],true);w.Draw();
    const ui=w._LanGrowthHud;expect(ui._Player0._Score.text).toBe('000000001000');expect(ui._Player0._Level.text).toBe('LV 2');
    expect(!!ui._Player1).toBe(mode==='Coop');w.mHud.Pause(true);
    expect(w.mHud.mcScreenPause._PersonalUpgrades._Player0.text).toContain('LV 2');
    expect(!!w.mHud.mcScreenPause._PersonalUpgrades._Player1).toBe(mode==='Coop');
  });
  it('leaves deathmatch on original growth and inventory',()=>{
    const game=createHeadlessGame({mode:'DeathMatch'});expect(growthOf(game.world())).toBeUndefined();
    expect(game.world().mUpgrades.mMultiplierIndex).toBe(200);
  });
});
