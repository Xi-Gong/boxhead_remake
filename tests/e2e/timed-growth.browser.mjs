import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
import {timedStartLevel} from '../../src/game/local/TimedGrowthRules.ts';
const out='generated/reports/v031/timed-growth/run-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.expr('P.CSaveData.mSharedObject.data.mMaxWaveReached=20');
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 const input=g.page.getByRole('textbox',{name:'Start wave'});await input.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('20');await g.page.keyboard.press('Enter');
 assert.equal(await input.inputValue(),'20');await g.click(210,400);await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 await g.page.waitForTimeout(400);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 const state=await g.expr('({level:m.mcWorld.mUpgrades.lanGrowth.players[0].level,bonuses:m.mcWorld.mUpgrades.waveDraft.bonuses[0],wave:m.mcWorld.mUpgrades.mLevelIndex,clock:m.mcWorld.mUpgrades.timedWave.totalTicks})');
 assert.equal(state.level,timedStartLevel(20,{seconds:180,difficulty:0,devils:true,players:1,bosses:true}));
 assert.deepEqual(state.bonuses,{damage:5,health:5,armor:5,capacity:4});assert.equal(state.wave,20);assert.equal(state.clock,6000);
 await g.page.waitForTimeout(700);await g.shot(`${out}/selected-growth.png`,false);
 const geometry=await g.centreOf('m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0');assert(geometry.x-geometry.w/2>=0&&geometry.x+geometry.w/2<=640);
 assert.equal(await g.expr('m.mcWorld._BossWaveHud._visible'),false);assert.equal(await g.expr('m.mcWorld._TimedWaveHud._visible'),false);
 const pixels=PNG.sync.read(readFileSync(`${out}/selected-growth.png`));let light=0;
 for(let y=Math.ceil(geometry.y-geometry.h/2);y<Math.floor(geometry.y+geometry.h/2);y++)for(let x=Math.ceil(geometry.x-geometry.w/2);x<Math.floor(geometry.x+geometry.w/2);x++){
  const i=(y*pixels.width+x)*4;if(pixels.data[i]>160&&pixels.data[i+1]>160&&pixels.data[i+2]>160)light++;
 }
 Object.assign(report,{state,geometry,light});assert(light>80);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('TIMED GROWTH LIGHT BROWSER PASSED '+out);
