// Bounded serial combat checks: normal selected-wave stats, prepared encounter positions and real input.
// These short samples measure single-hit danger and cadence; they are not win-rate or performance estimates.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BALANCE_OUT??`generated/reports/v034/balance-${Date.now()}`;mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'One hidden 640x480 game at a time; four difficulties, waves 5/15/25, prepared positions, real move/fire keys, unchanged derived HP/damage/ammo',cases:[]};let g;
try{
 for(const difficulty of [0,1,2,3])for(const wave of [5,15,25]){
  await g?.close();g=await openGame(browser,{query:'?scale=1'});await toMainMenu(g);
  await g.expr(`(P.CMain.mSaveData.__set__mDifficulty(${difficulty}),P.CMain.mSaveData.__set__mGameSpeed(1),P.CMain.mSaveData.__set__mDetail(false),P.CSaveData.mSharedObject.data.mMaxWaveReached=25)`);
  await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type(String(wave));await g.page.keyboard.press('Enter');await g.click(210,400);await g.click(380,230);
  assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));assert(await g.waitExpr('m.mcWorld.mUpgrades.timedWave.boss.members.every(m=>m.id)'));
  const before=await g.eval(()=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);
   const enemies=w.mUpgrades.timedWave.boss.members.map((m,i)=>{const e=w.mThing_Collection.mThings[m.id];e.Move(new P.Thing.Math.CThing_Position(8.5+i,11.5,0));return {kind:e.mBossKind,speed:e.mSpeed,damage:e.mAttackDamage,attackStep:e.mNativeBossAttackStep,projectileSpeed:e.mAttackSpeed,range:e.mAttackRange,life:e.mLife,variant:e.mEnemyVariant};});
   return {level:w.mUpgrades.lanGrowth.players[0].level,life:p.mLife,maximum:p.mMaxLife,speed:p.mSpeed,enemies};
  });
  assert(before.enemies.every(e=>e.kind==='devil'&&!e.variant&&e.attackStep>0&&e.attackStep<=1&&e.damage<before.maximum),'a full-health player must survive one ordinary Boss fireball');
  await g.page.keyboard.down('Slash');for(const key of ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown']){await g.page.keyboard.down(key);await g.page.waitForTimeout(450);await g.page.keyboard.up(key);}await g.page.keyboard.up('Slash');
  const after=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];return {tick:w.mTick,life:p.mLife,armor:p.mArmor??0,phase:w.mUpgrades.timedWave.phase,boss:w.mUpgrades.timedWave.boss,errors:g.errors};})()');
  assert.deepEqual(after.errors,[]);assert.equal(after.phase,'combat');assert(after.life>0);await g.shot(`${out}/d${difficulty}-w${wave}.png`,false);
  report.cases.push({difficulty,wave,before,after,hitFraction:before.enemies[0].damage/before.maximum});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 }
 report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('NATIVE BOSS BALANCE CHECKS PASSED '+out);
