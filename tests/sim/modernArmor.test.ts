import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {armorMaximum,applySupplyEffect,supplyCanBenefit,livingPicker,refillArmor} from '../../src/game/local/Supplies.ts';
import {applyWaveReward,rewardOffers} from '../../src/game/local/WaveDraft.ts';
import {syncVitals} from '../../src/game/local/SurvivalRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';

it('fills fragile armor completely from zero or residual stock regardless of supply efficiency',()=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  expect(armorMaximum(p)).toBe(40);p.mLife=91;
  for(const efficiency of [0,.6])for(const stock of [0,7,39]){
   p.mArmor=stock;p.mSupplyEfficiency=efficiency;expect(applySupplyEffect(p,'armor')).toBe(true);expect(p.mArmor).toBe(40);expect(p.mLife).toBe(91);
  }
  expect(applySupplyEffect(p,'armor')).toBe(false);p.mLife=0;p.mArmor=0;expect(supplyCanBenefit(p,'armor')).toBe(false);
 }finally{g.quit();}
});
it('skips full/dead cooperative pickers and exposes exact capped armor previews without refilling',()=>{
 const g=createHeadlessGame({mode:'Coop'}),[a,b]=g.players(),w=g.world();try{
  refillArmor(a);b.mArmor=0;expect(livingPicker({mObjects:{a,b}},'armor')).toBe(b);a.mLife=0;expect(livingPicker({mObjects:{a,b}},'armor')).toBe(b);
  b.mArmor=7;const stats=capturePlayerStats(w).find(s=>s.index===1)!;expect(stats.previews!.armor![0]).toBe(42);
  applyWaveReward(w,1,'armor',1);expect([armorMaximum(b),b.mArmor]).toEqual([42,7]);
  for(const [level,maximum]of [[10,44],[30,59]]){w.mUpgrades.lanGrowth.players[1].level=level;w.mUpgrades.waveDraft.bonuses[1].armor=0;syncVitals(b,'level');expect(armorMaximum(b)).toBe(maximum);}
  w.mUpgrades.waveDraft.bonuses[1].armor=1000;expect(armorMaximum(b)).toBe(Math.floor(b.mMaxLife*.4));
  for(let n=0;n<20;n++)expect(rewardOffers(b)).not.toContain('armor');
 }finally{g.quit();}
});
it('absorbs 40 of a 50 damage hit and overlays blue armor on unchanged authored health',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  p.mLife=160;refillArmor(p);new Thing.Affect.CThing_Affect_Bullet(p,p,50,p.mAngle).AffectThing(p);expect([p.mLife,p.mArmor]).toEqual([150,0]);
  refillArmor(p);w.mHud.UpdatePlayer(p,{x:320,y:240});const head=w.mHud.mcPlayers[0],health=head.mcLife.getBounds(head),armor=head._ArmorBar.getBounds(head);
  expect(armor).toEqual(health);expect(head.mcLife._visible).toBe(true);
  const width=()=>{const fill=head._ArmorBar.getInstanceAtDepth(3).getBounds(head._ArmorBar);return fill.xMax-fill.xMin;};
  const full=width();p.mArmor=24;w.mHud.UpdatePlayer(p,{x:320,y:240});expect(width()).toBeLessThan(full);
  expect(head._ArmorBar.getInstanceAtDepth(1)._visible).toBe(false);
  expect(head._ArmorBar.getInstanceAtDepth(3).filters[0].matrix.slice(0,15)).toEqual([0,0,0,0,54,0,0,0,0,173,0,0,0,0,235]);
 }finally{g.quit();}
});
it('migrates old v3 armor fractions once and rejects unsupported new saves before mutation',()=>{
 let saved:any;const old=createHeadlessGame({classicFeatures:['fragile-armor-v1']});try{old.players()[0].mArmor=30;saved=capture(old.world());}finally{old.quit();}
 const g=createHeadlessGame();try{
  expect(applyToWorld(g.world(),saved)).toBe(true);expect(g.players()[0].mArmor).toBe(20);
  saved=capture(g.world());expect(applyToWorld(g.world(),saved)).toBe(true);expect(g.players()[0].mArmor).toBe(20);
 }finally{g.quit();}
 const legacy=createHeadlessGame({classicFeatures:['fragile-armor-v1']});try{const before=capture(legacy.world());expect(applyToWorld(legacy.world(),saved)).toBe(false);expect(capture(legacy.world())).toEqual(before);}finally{legacy.quit();}
});
it('shows confirmed LAN armor while the predicted player is already damaged',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world(),session=new NetSession(0,{send(){}});try{
  p.mArmor=20;session.confirmedPlayerStats=capturePlayerStats(w);p.mArmor=0;
  w.mHud.UpdatePlayer(p,{x:320,y:240});const bar=w.mHud.mcPlayers[0]._ArmorBar;
  expect(bar._visible).toBe(true);expect(bar._currentframe).toBe(Math.floor(bar._totalframes*.5+1));
  expect(bar.getBounds(w.mHud.mcPlayers[0])).toEqual(w.mHud.mcPlayers[0].mcLife.getBounds(w.mHud.mcPlayers[0]));
  session.confirmedPlayerStats![0].armor=0;w.mHud.UpdatePlayer(p,{x:320,y:240});expect(bar._visible).toBe(false);
 }finally{g.quit();}
});
