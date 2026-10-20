import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/draft-input-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'Headless Chrome, real keyboard/mouse and injected gamepad mapping; one game only'};let g;
try{
 g=await openGame(browser,{init:()=>{
  window.qaPad={index:0,connected:true,id:'QA controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  navigator.getGamepads=()=>[window.qaPad,null];
 }});
 await toMainMenu(g);await g.clickClip('m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_Coop','Screen_SelectWorld'));
 await g.page.locator('button').filter({hasText:/^PAD 1/}).click();
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 await g.page.waitForTimeout(700);
 await g.eval(()=>{window.qaPad.buttons[0]={pressed:true,value:1};});await g.page.waitForTimeout(120);
 await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
 await g.eval(()=>{window.qaPad.buttons[0]={pressed:false,value:0};});await g.page.waitForTimeout(120);
 assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[false,false]);
 await g.eval(()=>{window.qaPad.axes[1]=1;});assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.selected[1]===1'));
 await g.eval(()=>{window.qaPad.axes[1]=0;});await g.page.waitForTimeout(100);
 await g.page.keyboard.press('KeyW');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.selected[1]===0'));
 await g.page.keyboard.press('KeyS');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.selected[1]===1'));
 await g.shot(out+'/p2-choice.png',false);
 report.selected=await g.expr('m.mcWorld.mUpgrades.waveDraft.round.selected');
 assert.deepEqual(report.selected,[0,1]);
 await g.page.keyboard.press('Space');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.confirmed[1]'));
 await g.page.waitForTimeout(14000);
 assert.equal(await g.expr('m.mcWorld.mUpgrades.mLevelIndex'),1);
 assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.readyRule'),'draft-ready-v1');
 assert(!/DEFAULT|\d+s/.test(await g.expr('m.mcWorld._WaveDraftHud._Clock.text')));
 await g.shot(out+'/ready-wait.png',false);report.waitedWithoutDefaultMs=14000;
 await g.page.keyboard.press('Slash');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('DRAFT INPUT PASSED '+out);
