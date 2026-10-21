// Bounded serial combat checks: normal selected-wave stats, prepared encounter positions and real input.
// These short samples measure single-hit danger and cadence; they are not win-rate or performance estimates.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BALANCE_OUT??`generated/reports/v034/balance-${Date.now()}`;mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'One hidden 640x480 game at a time; four difficulties, waves 5/15/25. Prepared positions and zero initial invincibility; actual armor crate then controlled native-fireball shield break/overflow probe; real move/fire keys. Derived maxima, enemy damage and ammo unchanged; no scripted healing after the probe, original natural regeneration remains. Not win-rate evidence.',cases:[]};let g;
try{
 for(const difficulty of [0,1,2,3])for(const wave of [5,15,25]){
  await g?.close();g=await openGame(browser,{query:'?scale=1'});await toMainMenu(g);
  await g.expr(`(P.CMain.mSaveData.__set__mDifficulty(${difficulty}),P.CMain.mSaveData.__set__mGameSpeed(1),P.CMain.mSaveData.__set__mDetail(false),P.CSaveData.mSharedObject.data.mMaxWaveReached=25)`);
  await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type(String(wave));await g.page.keyboard.press('Enter');await g.click(210,400);await g.click(380,230);
  assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));assert(await g.waitExpr('m.mcWorld.mUpgrades.timedWave.boss.members.every(member=>member.id&&typeof m.mcWorld.mThing_Collection.mThings[member.id]?.mNativeBossAttackStep==="number")'));
  const before=await g.eval(()=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);
   const objects=w.mUpgrades.timedWave.boss.members.map((m,i)=>{const e=w.mThing_Collection.mThings[m.id];e.Move(new P.Thing.Math.CThing_Position(8.5+i,11.5,0));return e;});
   p.mInvincible=0;
   // Move updates mapwho; the normal player tick separately refreshes this collision flag.
   p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);
   const box=new P.Thing.Object.CThing_Object_SupplyCrate(p.mPosition.Clone(),'armor','s'+w.mUpgrades.supplyState.nextId++);w.mThing_Collection.AddThing(box);box.Process_Init();
   const e=objects[0],armorProbe={armorBefore:p.mArmor,lifeBefore:p.mLife,damage:e.mAttackDamage,hits:0};
   while(p.mArmor>0&&armorProbe.hits<8){new P.Thing.Affect.CThing_Affect_FireBall(e,e,e.mAttackDamage,e.mAngle).AffectThing(p);armorProbe.hits++;}
   armorProbe.armorAfter=p.mArmor;armorProbe.lifeAfter=p.mLife;
   const enemies=objects.map(e=>({kind:e.mBossKind,speed:e.mSpeed,damage:e.mAttackDamage,attackStep:e.mNativeBossAttackStep,projectileSpeed:e.mAttackSpeed,range:e.mAttackRange,life:e.mLife,variant:e.mEnemyVariant}));
   return {level:w.mUpgrades.lanGrowth.players[0].level,life:p.mLife,maximum:p.mMaxLife,speed:p.mSpeed,invincible:p.mInvincible,armorProbe,enemies};
  });
  report.pending={difficulty,wave,before};writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  assert(before.enemies.every(e=>e.kind==='devil'&&!e.variant&&e.attackStep>0&&e.attackStep<=1&&e.damage<before.maximum),'a full-health player must survive one ordinary Boss fireball: '+JSON.stringify(before));
  assert.equal(before.invincible,0);assert(before.armorProbe.armorBefore>0);assert.equal(before.armorProbe.armorAfter,0);assert(before.armorProbe.hits>0&&before.armorProbe.hits<=8);
  assert(Math.abs(before.armorProbe.lifeBefore-before.armorProbe.lifeAfter-Math.max(0,before.armorProbe.hits*before.armorProbe.damage-before.armorProbe.armorBefore))<1e-7,'armor absorbs exactly 1:1 with real native fireball overflow');
  await g.page.keyboard.down('Slash');for(const key of ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown']){await g.page.keyboard.down(key);await g.page.waitForTimeout(450);await g.page.keyboard.up(key);}await g.page.keyboard.up('Slash');
  const after=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];return {tick:w.mTick,life:p.mLife,armor:p.mArmor??0,phase:w.mUpgrades.timedWave.phase,boss:w.mUpgrades.timedWave.boss,errors:g.errors};})()');
  assert.deepEqual(after.errors,[]);assert.equal(after.phase,'combat');assert(after.life>0);await g.shot(`${out}/d${difficulty}-w${wave}.png`,false);
  report.cases.push({difficulty,wave,before,after,hitFraction:before.enemies[0].damage/before.maximum});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 }
 delete report.pending;report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('NATIVE BOSS BALANCE CHECKS PASSED '+out);
