import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v035/power-ui';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'Headless production Chrome, three viewports, real card/READY/stats clicks',cases:[]};let g;
try{
 for(const viewport of [{width:640,height:480},{width:960,height:540},{width:480,height:720}]){
  await g?.close();g=await openGame(browser,{viewport});await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  await g.expr('(()=>{const w=m.mcWorld;w.mUpgrades.FinishTimedWave(2);w.mUpgrades.waveDraft.round.offers=[["enchantPower","endurance","health"]];})()');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._Player0._Card0._Label.text==="ENCHANT POWER"'));await g.page.waitForTimeout(700);
  const data=await g.expr('(()=>{const d=m.mcWorld._WaveDraftHud,c=d._Player0._Card0;return {bounds:d.getBounds(m._parent),stage:m.mcWorld.mScreenSize,benefit:c._Benefit.text,preview:c._Preview.text,font:c._Preview.getTextFormat().size};})()');
  const percent=await g.expr('m.mcWorld.mUpgrades.features?.includes("percent-stats-v1")');assert.equal(data.benefit,percent?'+6%':'+17.7%');assert.match(data.preview,percent?/15%.*21%/:/15.0%.*17.7%/);assert(data.font>=12);assert(data.bounds.xMin>=0&&data.bounds.xMax<=data.stage.x);assert(data.bounds.yMin>=0&&data.bounds.yMax<=data.stage.y);
  await g.shot(`${out}/power-${viewport.width}x${viewport.height}.png`,false);await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2&&m.mcWorld.mUpgrades.waveDraft.bonuses[0].enchantPower===2'));
  await g.expr('m.mcWorld.mUpgrades.FinishTimedWave()');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
  const stats=await g.expr(`({name:m.mcWorld._WaveDraftHud._Player0._Stats._Name${percent?9:8}.text,value:m.mcWorld._WaveDraftHud._Player0._Stats._Value${percent?9:8}.text,hint:m.mcWorld._WaveDraftHud._Player0._Hint.text})`);if(percent){assert.equal(stats.name,'ENCHANT DMG');assert.equal(stats.value,'+21% / 45%');}else{assert.equal(stats.name,'ENCHANT +17.7%');assert.match(stats.hint,/POWER 2/);}await g.shot(`${out}/stats-${viewport.width}x${viewport.height}.png`,false);report.cases.push({viewport,...data,stats});
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);
 }report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('ENCHANT POWER UI PASSED');
