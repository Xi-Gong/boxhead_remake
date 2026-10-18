import assert from 'node:assert/strict';
import { launch, openGame, toMainMenu } from './lib.mjs';
const browser=await launch();
try {
 const g=await openGame(browser,{viewport:{width:640,height:889}});await toMainMenu(g);
 await g.expr('m.SetState("State_SelectWorld_Single")');assert.ok(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('m.mcScreen.LoadLevel(0)');assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
 await g.page.keyboard.press('p');assert.ok(await g.waitExpr('!!m.mcWorld?.mHud?.mcScreenPause'));
 const frozen=await g.expr('m.mcWorld.mTick');
 for(const [w,h] of [[640,480],[1280,720],[640,889]]){
  await g.page.setViewportSize({width:w,height:h});await g.page.waitForTimeout(750);
  const actual=await g.expr('(()=>{const w=m.mcWorld,p=w.mHud.mcScreenPause,v=g.platform.presenter;return {x:p._x,y:p._y,ox:(v.stageW-640)/2,oy:(v.stageH-480)/2,bw:w.bmDraw.width,bh:w.bmDraw.height,sw:v.stageW,sh:v.stageH,t:w.mTick};})()');
  assert.equal(actual.x,actual.ox);assert.equal(actual.y,actual.oy);
  assert.equal(actual.bw,actual.sw);assert.equal(actual.bh,actual.sh);assert.equal(actual.t,frozen);
  await g.shot(`generated/reports/v026/ui/pause-resize-${w}x${h}.png`,false);
 }
 await g.page.keyboard.press('p');
 await g.expr('m.mcWorld.mCompleteState="quit"');
 assert.ok(await g.waitScreen('State_Debrief','Screen_Debrief'));
 assert.ok(await g.waitExpr('!m.mcWorld'));
 await g.expr('m.SetState("State_SelectWorld_DeathMatch")');
 assert.ok(await g.waitScreen('State_SelectWorld_DeathMatch','Screen_SelectWorld'));
 await g.page.setViewportSize({width:640,height:800});
 await g.expr('m.mcScreen.LoadLevel(0)');assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
 for(const height of [800,1000]) {
  await g.page.setViewportSize({width:640,height});await g.page.waitForTimeout(750);
  const split=await g.expr('(()=>{const w=m.mcWorld,s=w.mSplitScreen;return {actual:s.mOffsets[0].y,expected:(w.mScreenSize.y-s.mScreenSize.y*s.mScalar)/2};})()');
  assert.equal(split.actual,split.expected,'height-only resize recenters Death Match views');
 }
 assert.deepEqual(await g.scriptErrors(),[]);await g.close();console.log('PASS: paused resize preserves frozen state and Death Match height-only resize stays centered');
}finally{await browser.close();}
