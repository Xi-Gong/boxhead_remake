// Short serial display acceptance for the revised instructions, objective counts and tiered pause stats.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=`generated/reports/v031/pacing/ui-${Date.now()}`;mkdirSync(out,{recursive:true});
const report={ok:false};const browser=await launch();let g;
try{
 g=await openGame(browser,{query:'?scale=1'});await toMainMenu(g);await g.clickClip('m.mcScreen.mcInstructions');assert(await g.waitScreen('State_Instructions','Screen_Instructions'));await g.page.waitForTimeout(700);
 report.instructions=await g.expr(`Object.values(m.mcScreen).filter(f=>typeof f?.text==='string').map(f=>({text:f.text,w:f._width,h:f._height,tw:f.textWidth,th:f.textHeight}))`);
 for(const f of report.instructions)assert(f.th<=f.h+2,`clipped instructions ${f.text}`);
 await g.shot(`${out}/instructions.png`,false);await g.clickClip('m.mcScreen._Icon_Back');assert(await g.waitScreen('State_Main','Screen_Main'));
 await g.expr('(P.CMain.mSaveData.__set__mDetail(false),P.CSaveData.mSharedObject.data.mMaxWaveReached=5)');
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('5');await g.page.keyboard.press('Enter');await g.click(210,400);await g.click(380,230);assert(await g.waitExpr('m.mcWorld?.mLoaded'));
 await g.page.waitForTimeout(700);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(150);
 report.pause=await g.expr(`({text:m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text,life:Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mMaxLife,bounds:m.mcWorld.mHud.mcScreenPause._PersonalUpgrades.getBounds(m.mcWorld.mHud.mcScreenPause)})`);
 assert(report.pause.text.startsWith('HP '+String(Math.round(report.pause.life))+' / SHIELD '));assert(report.pause.bounds.yMax<=480);
 const shot=await g.shot(`${out}/pause.png`,false);const png=PNG.sync.read(shot);assert(png.data.some((v,i)=>i%4!==3&&v<200));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);throw error;}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(out);
