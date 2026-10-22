import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v035/layout-ui';mkdirSync(out,{recursive:true});
const browser=await launch(),g=await openGame(browser),report={ok:false,method:'One headless Chrome; real menu/dropdown mouse and keys; injected positional pads, not physical hardware'};
async function press(index,ms=100){await g.eval(index=>window.qaLetterPad.buttons[index].pressed=true,index);await g.page.waitForTimeout(ms);await g.eval(index=>window.qaLetterPad.buttons[index].pressed=false,index);await g.page.waitForTimeout(120);}
try{
 await toMainMenu(g);await g.ctx.addInitScript(()=>{window.qaLetterPad={id:'8BitDo SN30 Pro',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))};navigator.getGamepads=()=>[window.qaLetterPad];});await g.page.reload();await toMainMenu(g);
 const layout=g.page.getByRole('combobox',{name:'PAD 1 button layout'});await layout.waitFor({state:'visible'});assert.match(await layout.locator('option').first().textContent(),/NINTENDO/);
 // Real keyboard selection from the native dropdown, rather than rewriting a stored preference.
 await layout.click();await g.page.keyboard.press('End');await g.page.keyboard.press('Enter');assert.equal(await layout.inputValue(),'nintendo');
 await g.page.reload();await toMainMenu(g);await layout.waitFor({state:'visible'});assert.equal(await layout.inputValue(),'nintendo');
 report.badges=[];for(const size of [{width:640,height:480},{width:960,height:540},{width:480,height:720}]){
  await g.page.setViewportSize(size);await g.page.waitForTimeout(300);const box=await layout.boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height);report.badges.push({size,box});await g.shot(`${out}/layout-${size.width}x${size.height}.png`,false);
 }
 await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(200);
 const button=await g.centreOf('m.mcScreen.mcSinglePlay'),[x,y]=await g.stageToPage(button.x,button.y);await g.page.mouse.move(x,y);await g.page.waitForTimeout(100);
 await press(0);assert.equal(await g.state(),'State_Main');await press(1);assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 await g.expr('(()=>{const p=Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0];p.NewWeapon("uzi");p.SelectWeapon("uzi");p.mWeapon_Current.mAmmo=100;})()');
 await press(0);assert(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mAmmo<100'));
 const ammo=await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mAmmo');await press(1,900);assert(await g.waitExpr('m.mcWorld.mUpgrades.weaponBindings[0].A==="uzi"'));assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mAmmo'),ammo);
 await press(2,900);assert(await g.waitExpr('m.mcWorld.mUpgrades.weaponBindings[0].Y==="uzi"&&!m.mcWorld.mUpgrades.weaponBindings[0].A'));
 await g.expr('m.mcWorld.mUpgrades.FinishTimedWave()');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));await press(3);assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
 await press(1);assert(await g.expr('!m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]'));await g.shot(`${out}/nintendo-stats.png`,false);
 report.beforeClose=await g.expr('({state:g.state(),round:m.mcWorld.mUpgrades.waveDraft.round,fire:m.mInput?.KEY_FIRE?.IsDown(),stats:m.mcWorld._WaveDraftHud._Player0._Stats._visible})');
 await press(3);report.afterClose=await g.expr('({state:g.state(),round:m.mcWorld.mUpgrades.waveDraft.round,stats:m.mcWorld._WaveDraftHud?._Player0?._Stats?._visible})');
 assert(await g.waitExpr('!m.mcWorld._WaveDraftHud._Player0._Stats._visible',5000));await press(1);assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);await g.shot(`${out}/failed.png`,false);throw error;}finally{await g.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('PRINTED LETTER LAYOUT UI PASSED');
