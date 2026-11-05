import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {beginWaveDraft,processWaveDraft,applyWaveReward,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {queueDraftCommand} from '../../src/game/local/WaveDraftInput.ts';
import {DRAFT_CONTINUE,copyWaveDraft} from '../../src/game/local/WaveDraftRules.ts';
import {toggleStats} from '../../src/game/local/DraftStatsInput.ts';
import {renderDraftWindow} from '../../src/game/local/DraftWindow.ts';
import {rewardPreview} from '../../src/game/local/WaveDraftUi.ts';
import {capturePlayerStats,type PlayerStats} from '../../src/game/local/PlayerStats.ts';
import {PERCENT_STATS,percentText,type PercentStat} from '../../src/game/local/PercentStats.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {copyGrowth} from '../../src/game/local/Net/Growth.ts';
import {captureWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';

const statRows:[string,PercentStat][]=[['HEALTH','health'],['SHIELD','armor'],['DAMAGE','damage'],['FIRE RATE','haste'],['MOVEMENT','mobility'],
 ['AMMO CAPACITY','capacity'],['SUPPLY','scavenging'],['DODGE','dodge'],['ENCHANT DMG','enchantPower'],['ENCHANT SHOTS','endurance']];
function assertSheet(sheet:any,stats:PlayerStats):void{
 expect(sheet._visible).toBe(true);expect(sheet._Name0.text).toBe('LEVEL / XP');expect(sheet._Value0.text).toBe(`${stats.level} / ${stats.xp} / ${stats.required}`);
 for(const [i,[label,key]]of statRows.entries()){
  const value=sheet['_Value'+(i+1)],expected='+'+percentText(stats.percentages![key])+' / '+PERCENT_STATS[key].cap+'%'+(key==='armor'?' (HP 40%)':'');
  expect(sheet['_Name'+(i+1)].text).toBe(label);expect(value.text).toBe(expected);
  expect(value.text).toMatch(/^\+\d+(?:\.\d+)?% \/ \d+%(?: \(HP 40%\))?$/);expect(value.getTextFormat().size).toBeGreaterThanOrEqual(12);
 }
 expect(sheet._Name11.text).toBe('WEAPON');expect(sheet._Value11.text).toBe(stats.weapon+' [A/Y]');
}
function openChoices(world:any):void{
 beginWaveDraft(world);const state=waveDraft(world)!,round=state.round!;
 const ticks=round.intro!.remainingTicks;for(let n=0;n<=ticks;n++)processWaveDraft(world);
 for(let i=0;i<round.offers.length;i++){queueDraftCommand(world,i,DRAFT_CONTINUE,round.wave,'intro');processWaveDraft(world);}
 expect(round.intro).toBeUndefined();
}

it.each(['Single','Coop']as const)('%s renders ten percentage-only stats and a readable percentage pause summary while retaining identity',mode=>{
 const g=createHeadlessGame({mode}),world=g.world();try{
  for(const p of g.players()){
   const i=p.mPlayerIndex;world.mUpgrades.lanGrowth.players[i].level=17;world.mUpgrades.lanGrowth.players[i].xp=3;
   p.NewWeapon('shotgun');p.SelectWeapon('shotgun');world.mUpgrades.weaponBindings[i]={A:'shotgun',Y:'shotgun'};
   for(const key of Object.keys(PERCENT_STATS)as PercentStat[])applyWaveReward(world,i,key,2);
   p.mLife=89;p.mArmor=13;p.mWeapon_Current.mAmmo=6;p.mWeapon_Current.mEnchantDurability=7;
  }
  openChoices(world);toggleStats(world,0);const stats=capturePlayerStats(world),ctx=makeSnapCtx(world),before=simulationDigest(captureWorldSnap(world,ctx,false));
  renderDraftWindow(world,waveDraft(world)!,rewardPreview);const ui=world._WaveDraftHud;
  for(const s of stats){assertSheet(ui['_Player'+s.index]._Stats,s);expect(ui['_Player'+s.index]._Bonuses.text).toContain('LEVEL 17 / 3 XP');}
  expect(simulationDigest(captureWorldSnap(world,ctx,false))).toEqual(before);
  world.mHud.Pause(true);const pause=world.mHud.mcScreenPause._PersonalUpgrades;
  for(const s of stats){
   const summary=pause['_GrowthStats'+s.index],p=s.percentages!;
   expect(summary.text).toBe(`HP +${percentText(p.health)} / SHIELD +${percentText(p.armor)}\rDMG +${percentText(p.damage)} / DODGE ${percentText(p.dodge)}`);
   expect(summary.text).not.toMatch(/HP \d|SHIELD \d|\/s|\bAMMO\b/);expect(summary.multiline).toBe(true);expect(summary.getTextFormat().size).toBeGreaterThanOrEqual(12);
   expect(pause['_Player'+s.index].text).toContain('LV 17');expect(pause['_Player'+s.index].text).toContain('3/');
   const gun=pause['_Weapon'+s.index+'_pistol'];expect(gun._y).toBeGreaterThanOrEqual(160);expect(summary._y+summary._height).toBeLessThan(gun._y);
  }
  world.mHud.Pause(false);expect(g.errors).toEqual([]);
 }finally{g.quit();}
});

it('renders only the local LAN player from confirmed percentage and identity metadata while prediction differs',()=>{
 const g=createHeadlessGame({mode:'Coop'}),world=g.world();let session:NetSession|undefined;try{
  const p=g.players()[1];p.NewWeapon('uzi');p.SelectWeapon('uzi');world.mUpgrades.weaponBindings[1]={A:'uzi',Y:'uzi'};
  openChoices(world);const confirmed=capturePlayerStats(world);Object.assign(confirmed[1]!,{level:17,xp:3,required:20,life:9999,armor:8888,damage:7777,ammo:6666,weapon:'Confirmed UZI'});
  Object.assign(confirmed[1]!.percentages!,{health:.24,armor:.06,damage:.56,haste:.18,mobility:.12,capacity:.64,scavenging:.3,dodge:.21,enchantPower:.27,endurance:.4});
  session=new NetSession(1,{send(){}});session.confirmedPlayerStats=confirmed;session.confirmedWaveDraft=copyWaveDraft(waveDraft(world));session.confirmedGrowth=copyGrowth(world.mUpgrades.lanGrowth);
  Object.assign(session.confirmedGrowth.players[1],{level:17,xp:3});
  world.mUpgrades.lanGrowth.players[1].level=50;world.mUpgrades.waveDraft.bonuses[1].damage=40;p.mLife=12;p.mArmor=0;p.mWeapon_Current.mAmmo=1;
  toggleStats(world,1);renderDraftWindow(world,session.confirmedWaveDraft!,rewardPreview);const ui=world._WaveDraftHud;
  expect(ui._Player0).toBeUndefined();assertSheet(ui._Player1._Stats,confirmed[1]!);expect(ui._Player1._Bonuses.text).toBe('LEVEL 17 / 3 XP');
  world.mHud.Pause(true);const pause=world.mHud.mcScreenPause._PersonalUpgrades;
  expect(pause._GrowthStats1.text).toBe('HP +24% / SHIELD +6%\rDMG +56% / DODGE 21%');expect(pause._Player1.text).toContain('LV 17');
  world.mHud.Pause(false);
 }finally{session?.dispose();g.quit();}
});
