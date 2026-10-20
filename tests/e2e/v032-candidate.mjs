// Current portable acceptance reuses the actual packaged game, real inputs and isolated save location.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyV032Candidate(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false};
 const bonuses=()=>g.expr('({...m.mcWorld.mUpgrades.waveDraft.bonuses[0]})');
 const choose=async()=>{const reward=await g.expr('m.mcWorld.mUpgrades.waveDraft.round.offers[0][0]'),before=await bonuses();await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');return {reward,before};};
 const awarded=(before,reward,n,after)=>{const expected={...before,[reward]:(before[reward]??0)+n};assert.deepEqual(after,expected);};
 try{
  const initial=await g.expr('(()=>{const w=m.mcWorld,u=w.mUpgrades,t=u.timedWave;return {wave:u.mLevelIndex,total:t.totalTicks,profile:t.mapPacing,combat:u.combat,clear:t.clear,growth:u.lanGrowth.players[0]};})()');report.initial=initial;
  assert.equal(initial.combat.rule,'combat-pve-v2');assert(initial.profile.seconds>=75&&initial.profile.seconds<=105);assert.equal(initial.total,initial.profile.seconds*25);assert.equal(initial.growth.tiered,'tiered-growth-v1');assert.equal(initial.clear.rule,'clearable-waves-v1');
  await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(80);await g.page.keyboard.up('ArrowRight');await g.page.keyboard.press('Slash');
  await g.expr('m.mcWorld.mUpgrades.timedWave.remainingTicks=1');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
  assert(await g.waitExpr('m.mcWorld._LanGrowthHud._Wave._Zombies.text==="0"&&m.mcWorld._LanGrowthHud._Wave._Devils.text==="0"'));
  await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));await g.page.waitForTimeout(700);report.header=await g.expr('(()=>{const h=m.mcWorld._WaveDraftHud;return [h._Title,h._Clock].map(t=>({text:t.text,width:t._width,format:t.getTextFormat(),rect:t.$rect,layout:t.$getLayout()}));})()');await g.shot(join(out,'stats.png'),false);await g.page.keyboard.press('Tab');
  await g.shot(join(out,'draft.png'),false);const first=await choose();assert(await g.waitExpr(`m.mcWorld.mUpgrades.mLevelIndex===${initial.wave+1}`));awarded(first.before,first.reward,1,await bonuses());
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  const saved=await g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks,bonuses:{...m.mcWorld.mUpgrades.waveDraft.bonuses[0]},growth:{...m.mcWorld.mUpgrades.lanGrowth.players[0]},clear:{...m.mcWorld.mUpgrades.timedWave.clear}})');report.saved=saved;
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  const restored=await g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks,bonuses:{...m.mcWorld.mUpgrades.waveDraft.bonuses[0]},growth:{...m.mcWorld.mUpgrades.lanGrowth.players[0]},clear:{...m.mcWorld.mUpgrades.timedWave.clear}})');report.restored=restored;
  assert.equal(restored.wave,saved.wave);assert(restored.remaining<=saved.remaining&&restored.remaining>saved.remaining-30);assert.deepEqual(restored.bonuses,saved.bonuses);assert.deepEqual(restored.growth,saved.growth);
  for(const key of ['rule','zombies','devils','killedZombies','killedDevils'])assert.equal(restored.clear[key],saved.clear[key]);
  assert(restored.clear.emittedZombies<=saved.clear.emittedZombies&&restored.clear.emittedZombies>=restored.clear.killedZombies);assert(restored.clear.emittedDevils<=saved.clear.emittedDevils&&restored.clear.emittedDevils>=restored.clear.killedDevils);
  await g.page.keyboard.press('KeyP');await g.expr('(m.mcWorld.mUpgrades.AdvanceTimedWave(),m.mcWorld.mUpgrades.__set__mLevel(15))');
  assert(await g.waitExpr('m.mcWorld.mUpgrades.timedWave.boss.members.every(b=>b.id&&m.mcWorld.mThing_Collection.mThings[b.id]?.mEnemyArmor>0)'));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  report.art=await g.expr('(()=>{const s=P.DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets;return {runner:!!s.FreshCombat_runner_stand,brute:!!s.FreshCombat_brute_stand,butcher:!!s.FreshDemon_butcherBoss_stand,hunter:!!s.FreshDemon_hunterBoss_stand,gunner:!!s.Gunner_3_shotgunstand,source:!!s.Zombie_Zombie_Stand};})()');assert(Object.values(report.art).every(Boolean));
  report.boss=await g.expr('(()=>{const w=m.mcWorld,b=w.mUpgrades.timedWave.boss,p=Object.values(w.mThing_Collection.mPlayerThings)[0];let i=0;for(const member of b.members){const e=w.mThing_Collection.mThings[member.id];e.Move(new P.Thing.Math.CThing_Position(p.mPosition.mX+(i++?2:-2),p.mPosition.mY+2,0));e.mLife=member.life=e.mMaxLife/2;e.mEnemyArmor/=2;}w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;return {kinds:b.members.map(m=>m.kind),armor:b.members.map(m=>w.mThing_Collection.mThings[m.id].mEnemyArmor),total:w.mUpgrades.timedWave.totalTicks,seconds:w.mUpgrades.timedWave.mapPacing.seconds,bars:[0,1].map(i=>({visible:w._BossHealthHud["_Boss"+i]._visible,width:w._BossHealthHud["_Boss"+i]._width,height:w._BossHealthHud["_Boss"+i]._height}))};})()');
  assert.equal(report.boss.kinds[0],'butcher');assert.equal(report.boss.total,(report.boss.seconds+30)*25);assert(report.boss.bars.every(b=>b.visible&&b.width===64&&b.height===7));await g.page.waitForTimeout(100);await g.shot(join(out,'boss.png'),false);
  await g.expr('(()=>{const w=m.mcWorld;for(const e of Object.values(w.mThing_Collection.mThings))if(e.mBossKind&&e.mLife>0){e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();}w.mUpgrades.Process();w.mPaused=false;w.Draw();})()');
  assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round?.multiplier===2&&m.mcWorld._WaveDraftHud?._visible'));const last=await choose();assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===16'));awarded(last.before,last.reward,2,await bonuses());
  assert.deepEqual(await g.scriptErrors(),[]);report.ok=true;
 }catch(error){report.error=String(error);throw error;}finally{writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
}
