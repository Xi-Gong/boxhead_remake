// Actual authored life clips and Canvas pixels; fixture values do not establish combat balance.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {pathToFileURL} from 'node:url';
import {launch,openGame,toMainMenu} from './lib.mjs';
export async function verifyArmorOverlay(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,cases:[],method:'Real Canvas, authored blue armor overlay, three viewport shapes and real pause clicks; prepared stock'};
 try{
  assert(await g.waitExpr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];if(p.mInvincible&&p.mInvincible%2)return false;window.qaArmorProcess=w.Process;w.Process=()=>{};return true;})()'));
  for(const [width,height]of [[640,480],[960,540],[480,720]]){
   await g.page.setViewportSize({width,height});await g.page.waitForTimeout(150);
   for(const stock of [40,24,8,0]){
    const state=await g.expr(`(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.mLife=144;p.mArmor=${stock};w.Draw();const h=w.mHud.mcPlayers[0],root=m._parent;return {life:h.mcLife.getBounds(root),armor:h._ArmorBar.getBounds(root),visible:h._ArmorBar._visible,health:p.mLife,stock:p.mArmor};})()`);
    assert.deepEqual(state.armor,state.life);assert.equal(state.visible,stock>0);assert.equal(state.health,144);assert.equal(state.stock,stock);
    await g.page.waitForTimeout(150);const file=`${out}/${width}x${height}-${stock}.png`;await g.shot(file,false);
    const png=PNG.sync.read(readFileSync(file)),a=await g.stageToPage(state.life.xMin,state.life.yMin),b=await g.stageToPage(state.life.xMax,state.life.yMax);
    let blue=0,green=0,blueLeft=Infinity,greenRight=-Infinity;
    for(let y=Math.floor(a[1]);y<=Math.ceil(b[1]);y++)for(let x=Math.floor(a[0]);x<=Math.ceil(b[0]);x++){
     const n=(y*png.width+x)*4,r=png.data[n],c=png.data[n+1],d=png.data[n+2];
     if(d>r+50&&d>c+20){blue++;blueLeft=Math.min(blueLeft,x);}if(c>r+50&&c>d+50){green++;greenRight=Math.max(greenRight,x);}
    }
    const entry={width,height,stock,state,blue,green,blueLeft:Number.isFinite(blueLeft)?blueLeft:null,greenRight:Number.isFinite(greenRight)?greenRight:null};report.cases.push(entry);
    assert.equal(blue>0,stock>0);if(stock===40)assert.equal(green,0);else{assert(green>0);if(stock>0)assert(greenRight<blueLeft);}
   }
  }
  await g.page.setViewportSize({width:640,height:480});await g.expr('(m.mcWorld.Process=window.qaArmorProcess,delete window.qaArmorProcess,true)');
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');assert(await g.waitScreen('State_Debrief','Screen_Debrief'));
  assert.deepEqual(await g.scriptErrors(),[]);report.ok=true;
 }finally{await g.expr('(()=>{if(window.qaArmorProcess){m.mcWorld.Process=window.qaArmorProcess;delete window.qaArmorProcess;}return true;})()').catch(()=>{});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const browser=await launch();let g;try{g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await verifyArmorOverlay(g,process.env.BOXHEAD_QA_OUT??'generated/reports/v035-revision/armor-ui');console.log('ARMOR OVERLAY PASSED');}finally{await g?.close();await browser.close();}
}
