import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=`generated/reports/v031/timed-arrival/run-${Date.now()}`;mkdirSync(out,{recursive:true});const browser=await launch(),report={ok:false};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(380,230);assert(await g.waitExpr('m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 report.arrival=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));
  const e=new P.Thing.Creature.CThing_Creature_Devil(new P.Thing.Math.CThing_Position(10.5,12.5,0));e.mEnemyVariant='priest';w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_VariantCast');
  w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
  return {cell:e.mCellID,registered:w.mMap.mCells[12][10].mObjects[e.sUniqueID]===e,position:w.GetScreenPosition(e.mPosition),state:e.mStateID,frame:e.mXSI_Animation.mCurrentFrameID};
 });assert(report.arrival.registered);assert.equal(report.arrival.state,'State_VariantCast');assert.equal(report.arrival.frame,0);
 await g.page.waitForTimeout(120);await g.shot(`${out}/first-cast.png`,false);
 const png=PNG.sync.read(readFileSync(`${out}/first-cast.png`)),p=report.arrival.position;let dark=0;
 for(let y=Math.max(0,Math.floor(p.y-65));y<Math.min(png.height,Math.ceil(p.y+2));y++)for(let x=Math.max(0,Math.floor(p.x-18));x<Math.min(png.width,Math.ceil(p.x+18));x++){
  const i=(y*png.width+x)*4;if(png.data[i]<125&&png.data[i+1]<105&&png.data[i+2]<105)dark++;
 }assert(dark>200);report.darkPixels=dark;assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('TIMED ARRIVAL LIGHT BROWSER PASSED '+out);
