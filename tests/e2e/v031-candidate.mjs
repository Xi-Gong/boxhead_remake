// Short, one-instance candidate acceptance. Full release/play/LAN suites remain separate gates.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyV031Candidate(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false};
 try{
  const initial=await g.expr('(()=>{const w=m.mcWorld,t=w.mUpgrades.timedWave;return {wave:w.mUpgrades.mLevelIndex,total:t.totalTicks,size:w.mMap.mSize,damage:w.mUpgrades.waveDraft.bonuses[0].damage,clear:t.clear,growth:w.mUpgrades.lanGrowth.players[0]};})()');
  const {x,y}=initial.size,longest=Math.max(x,y),seconds=longest>=64||x*y>2000?300:x*y<=800&&longest<=40?180:240;
  assert.equal(initial.total,seconds*25);assert.equal(initial.clear.rule,'clearable-waves-v1');assert(initial.clear.zombies>0);assert.equal(initial.growth.tiered,'tiered-growth-v1');report.initial=initial;
  await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(80);await g.page.keyboard.up('ArrowRight');
  await g.page.keyboard.down('Slash');await g.page.waitForTimeout(80);await g.page.keyboard.up('Slash');
  await g.expr('m.mcWorld.mUpgrades.timedWave.remainingTicks=1');assert(await g.waitExpr('m.mcWorld.mUpgrades.timedWave.phase==="draft"'));
  assert(await g.waitExpr('m.mcWorld._LanGrowthHud._Wave._Zombies.text==="0"&&m.mcWorld._LanGrowthHud._Wave._Devils.text==="0"'));
  await g.page.waitForTimeout(120);await g.shot(join(out,'draft.png'),false);
  await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');assert(await g.waitExpr(`m.mcWorld.mUpgrades.mLevelIndex===${initial.wave+1}`));
  assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage'),initial.damage+1);
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  report.saved=await g.expr('({remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks,wave:m.mcWorld.mUpgrades.mLevelIndex,damage:m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage,clear:m.mcWorld.mUpgrades.timedWave.clear,growth:m.mcWorld.mUpgrades.lanGrowth.players[0]})');
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  report.restored=await g.expr('({remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks,wave:m.mcWorld.mUpgrades.mLevelIndex,damage:m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage,clear:m.mcWorld.mUpgrades.timedWave.clear,growth:m.mcWorld.mUpgrades.lanGrowth.players[0]})');
  assert.equal(report.restored.wave,report.saved.wave);assert.equal(report.restored.damage,report.saved.damage);assert(report.restored.remaining<=report.saved.remaining&&report.restored.remaining>report.saved.remaining-30);
  assert.deepEqual(report.restored.growth,report.saved.growth);assert.equal(report.restored.clear.killedZombies,report.saved.clear.killedZombies);assert.equal(report.restored.clear.killedDevils,report.saved.clear.killedDevils);assert.equal(report.restored.clear.zombies,report.saved.clear.zombies);
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
  await g.expr('(m.mcWorld.mUpgrades.AdvanceTimedWave(),m.mcWorld.mUpgrades.__set__mLevel(5))');
  assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mThings).some(e=>e.mBossKind&&e.mMaxLife>1000&&e.mCellID)'));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  report.boss=await g.expr('(()=>{const w=m.mcWorld,e=Object.values(w.mThing_Collection.mThings).find(e=>e.mBossKind),sets=P.DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets;return {kind:e.mBossKind,life:e.mLife,total:w.mUpgrades.timedWave.totalTicks,registered:!!e.mCellID,newBody:!!sets.Boss_charger_stand,newGun:!!sets.Polished_Player_Handgun_Stand,classicFoot:!!sets.Zombie_Zombie_Stand};})()');
  assert.equal(report.boss.total,(seconds+60)*25);assert(report.boss.newBody&&report.boss.newGun&&report.boss.classicFoot);
  report.boss.overhead=await g.expr('(()=>{const w=m.mcWorld,e=Object.values(w.mThing_Collection.mThings).find(e=>e.mBossKind),p=Object.values(w.mThing_Collection.mPlayerThings)[0],boss=w.mUpgrades.timedWave.boss;e.Move(new P.Thing.Math.CThing_Position(p.mPosition.mX,p.mPosition.mY+2,0));e.mLife=boss.life=e.mMaxLife/2;if(boss.members)boss.members[0].life=e.mLife;w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;const l=w._BossHealthHud._Boss0;return {visible:l?._visible,label:l?._Health?.text,x:l?._x,y:l?._y,clock:w._LanGrowthHud._Wave._Clock.text,devils:w._LanGrowthHud._Wave._Devils.text};})()');
  assert(report.boss.overhead.visible);assert.equal(report.boss.overhead.label,undefined);
  assert.equal(report.boss.overhead.devils,'1');assert.match(report.boss.overhead.clock,/^\d+:\d{2}$/);
  await g.page.waitForTimeout(120);await g.shot(join(out,'boss.png'),false);
  const damage=await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage');
  await g.expr('(()=>{const w=m.mcWorld,e=Object.values(w.mThing_Collection.mThings).find(e=>e.mBossKind);e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();w.mUpgrades.Process();w.mPaused=false;w.Draw();})()');
  assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.multiplier'),2);await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===6'));
  assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage'),damage+2);report.rewardDelta=2;
  assert.deepEqual(await g.scriptErrors(),[]);report.ok=true;
 }catch(error){report.error=String(error);throw error;}finally{writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
}
