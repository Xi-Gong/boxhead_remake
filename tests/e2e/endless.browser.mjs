import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v030/endless';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,cases:[],shots:[]};let g;
try{
 g=await openGame(browser);await toMainMenu(g);
 await g.expr('P.CSaveData.mSharedObject.data.mMaxWaveReached=1000000');
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 const input=g.page.getByRole('textbox',{name:'Start wave'});
 for(const [width,height] of [[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(700);
  await input.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('1000000');await g.page.keyboard.press('Enter');
  assert.equal(await input.inputValue(),'1000000');await g.click(210,400);
  const fit=await g.expr('({value:m.mcScreen.mcStartWave.mcValue.textWidth,best:m.mcScreen.mcStartWave.mcBest.textWidth})');
  assert(fit.value<=84&&fit.best<=154);const file=`${out}/select-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  report.cases.push({kind:'selection',width,height,fit});
 }
 await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(700);
 await g.eval(()=>{const p=window.__game.pkg.World.CWorld.prototype;p.Spawn_Zombie=()=>false;p.Spawn_Devil=()=>false;});
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 const state=await g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,growth:m.mcWorld.mUpgrades.lanGrowth,budget:m.mcWorld.mUpgrades.Level.Zombie_TotalCount})');
 assert.equal(state.wave,1000000);assert(state.growth.players[0].level>125);assert.equal(state.budget,200);
 for(const [width,height] of [[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(700);
  const fit=await g.expr('(()=>{const w=m.mcWorld,u=w._LanGrowthHud,c=g.platform.presenter.canvas.getBoundingClientRect();return {wave:u._Wave._Number.textWidth,level:u._Player0._Level.textWidth,xp:u._Player0._Experience.textWidth,bounds:[u._Wave._Number,u._Player0._Level,u._Player0._Experience].map(t=>t.getBounds(w)),scale:c.width/w.mScreenSize.x,left:c.left,top:c.top,width:w.mScreenSize.x,height:w.mScreenSize.y};})()');
  assert(fit.wave<=60.1&&fit.level<=74.1&&fit.xp<=109.1);
  const file=`${out}/world-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const png=PNG.sync.read(readFileSync(file));assert(png.width===width&&png.height===height);
  for(const b of fit.bounds){
   assert(b.xMin>=0&&b.xMax<=fit.width&&b.yMin>=0&&b.yMax<=fit.height);
   let ink=0;
   for(let y=Math.ceil(fit.top+b.yMin*fit.scale);y<Math.floor(fit.top+b.yMax*fit.scale);y++)for(let x=Math.ceil(fit.left+b.xMin*fit.scale);x<Math.floor(fit.left+b.xMax*fit.scale);x++){
    const i=(y*png.width+x)*4;if(Math.max(png.data[i],png.data[i+1],png.data[i+2])<100)ink++;
   }
   assert(ink>5,'each high-wave HUD field must contain rendered text pixels');
  }
  await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused && m.mcWorld.mHud.mcScreenPause?._PersonalUpgrades'));
  await g.page.waitForTimeout(700);const pause=`${out}/pause-${width}x${height}.png`;await g.shot(pause,false);report.shots.push(pause);
  const stats=await g.expr('m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text');assert.match(stats,/GROWTH DMG \+\d+%/);
  report.cases.push({kind:'world',width,height,fit,stats});await g.page.keyboard.press('p');assert(await g.waitExpr('!m.mcWorld.mPaused'));
 }
 await g.eval(()=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.SelectWeapon('uzi');p.mLife=73;p.mArmor=37;p.mWeapon_Current.mAmmo=7;});
 await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');
 assert(await g.waitScreen('State_Main','Screen_Main'));await g.clickClip('m.mcScreen.mcContinue');
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 const restored=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];return {wave:w.mUpgrades.mLevelIndex,life:p.mLife,armor:p.mArmor,ammo:p.mWeapon_Current.mAmmo,weapon:p.mWeapon_Current.mNameID};})()');
 assert.equal(restored.wave,1000000);assert(restored.life>=73);assert.deepEqual([restored.armor,restored.ammo,restored.weapon],[37,7,'uzi']);report.restored=restored;
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('ENDLESS UI PASSED');
