// Prepared wave completion; the timer, keyboard/mouse actions and all transitions use the real game loop.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';

const round='m.mcWorld.mUpgrades.waveDraft.round';
const clear='m.mcWorld._WaveClearHud';
const draft='m.mcWorld._WaveDraftHud';
const method='One headless production Chrome game at a time; prepared wave completion, unchanged stats/timers, real keyboard/mouse, screenshots, geometry and pixel checks. No physical-controller or balance-win-rate claim.';

async function snapshot(g) {
 return g.expr(`(()=>{const w=m.mcWorld,r=w.mUpgrades.waveDraft.round;return {wave:w.mUpgrades.mLevelIndex,intro:r?.intro,chosen:r?.chosen,selected:r?.selected,confirmed:r?.confirmed,clearVisible:!!w._WaveClearHud?._visible,draftVisible:!!w._WaveDraftHud?._visible,lastRewardWave:w.mUpgrades.waveDraft.lastRewardWave};})()`);
}
async function picture(g,file,expr) {
 const geometry=await g.expr(`(()=>{const c=${expr};return {bounds:c.getBounds(m._parent),stage:m.mcWorld.mScreenSize,fields:[c._Title,c._Timer,c._Info].filter(Boolean).map(f=>({text:f.text,font:f.getTextFormat().size,width:f._width,inkWidth:f.textWidth,bounds:f.getBounds(m._parent)}))};})()`);
 assert(geometry.bounds.xMin>=0&&geometry.bounds.xMax<=geometry.stage.x,'window fits stage horizontally');
 assert(geometry.bounds.yMin>=0&&geometry.bounds.yMax<=geometry.stage.y,'window fits stage vertically');
 for(const f of geometry.fields){assert(f.font>=12,'readable text size');assert(f.inkWidth<f.width,'text fits field');}
 await g.shot(file,false);const pixels=PNG.sync.read(readFileSync(file));
 const title=geometry.fields[0],a=await g.stageToPage(title.bounds.xMin,title.bounds.yMin),b=await g.stageToPage(title.bounds.xMax,title.bounds.yMax);let red=0;
 for(let y=Math.max(0,Math.floor(a[1]));y<Math.min(pixels.height,Math.ceil(b[1]));y++)for(let x=Math.max(0,Math.floor(a[0]));x<Math.min(pixels.width,Math.ceil(b[0]));x++){
  const n=(y*pixels.width+x)*4;if(pixels.data[n]>160&&pixels.data[n+1]<110&&pixels.data[n+2]<110)red++;
 }
 assert(red>40,'visible settlement/upgrade title pixels');return {...geometry,titleRedPixels:red};
}

/** Start in a loaded, normal-speed PvE world; reusable for actual portable acceptance. */
export async function verifyWaveClearGate(g,out,{mode='Single',checkPause=false}={}) {
 mkdirSync(out,{recursive:true});const report={ok:false,mode,method,shots:[]};
 const save=()=>writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
 const keys=mode==='Coop'?['Slash','Space']:['Slash'],count=keys.length;
 try{
  assert(await g.expr('m.mcWorld.mUpgrades.features.includes("wave-clear-gate-v1")'),'new settlement capability');
  for(const key of keys)await g.page.keyboard.down(key);
  await g.page.waitForTimeout(100);
  report.start=await g.expr('(()=>{const w=m.mcWorld,at=performance.now();w.mUpgrades.FinishTimedWave();return {at,wave:w.mUpgrades.mLevelIndex,fps:P.CMain.mFPS,tick:w.mTick,remaining:w.mUpgrades.waveDraft.round.intro.remainingTicks};})()');
  assert.equal(report.start.remaining,Math.ceil(3*report.start.fps),'three full seconds of simulation ticks');
  assert(await g.waitExpr(`${clear}?._visible`));
  assert.equal(await g.expr(`${clear}._Info.text`),`REWARD x${await g.expr(`${round}.multiplier`)} / UPGRADES OPEN AFTER 3 SECONDS`,'locked result displays its exact reward multiplier');
  assert.deepEqual((await snapshot(g)).intro.entered,Array(count).fill(false));
  await g.clickClip(`${clear}._Player0._Continue`);
  await g.page.keyboard.press('Tab');
  if(mode==='Coop')await g.page.keyboard.press('KeyR');
  await g.page.waitForTimeout(200);
  const early=await snapshot(g);assert(early.intro.remainingTicks>0);assert.deepEqual(early.intro.entered,Array(count).fill(false));assert(!early.draftVisible);
  report.locked=await picture(g,join(out,'locked.png'),clear);report.shots.push('locked.png');
  if(checkPause){
   await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
   const paused=await g.expr(`${round}.intro.remainingTicks`);await g.page.waitForTimeout(350);
   assert.equal(await g.expr(`${round}.intro.remainingTicks`),paused,'pause freezes settlement timer');
   await g.page.keyboard.press('KeyP');assert(await g.waitExpr(`!m.mcWorld.mPaused&&${clear}._visible`));report.pauseFrozenTicks=paused;
  }
  assert(await g.waitExpr(`${round}.intro.remainingTicks===0`));
  assert(await g.waitExpr(`${clear}._Info.text===('REWARD x'+${round}.multiplier+' / CHOOSE YOUR UPGRADE NEXT')`),'unlocked result retains its exact reward multiplier');
  report.elapsedToUnlockMs=await g.expr(`performance.now()-${report.start.at}`);
  // FinishTimedWave can occur between tick boundaries; account for at most one tick plus clock sampling jitter.
  assert(report.elapsedToUnlockMs>=3000-1000/report.start.fps-20,'locked duration follows three-second tick budget');
  await g.page.waitForTimeout(180);assert.deepEqual((await snapshot(g)).intro.entered,Array(count).fill(false),'held battle fire cannot enter when countdown expires');
  report.unlocked=await picture(g,join(out,'unlocked.png'),clear);report.shots.push('unlocked.png');
  for(const key of keys)await g.page.keyboard.up(key);await g.page.waitForTimeout(120);
  if(mode==='Coop'){
   await g.page.keyboard.press('Slash');assert(await g.waitExpr(`${round}.intro.entered[0]`));
   assert.deepEqual((await snapshot(g)).intro.entered,[true,false]);assert(!(await snapshot(g)).draftVisible,'both players must enter');
   await g.page.keyboard.press('Slash');await g.page.waitForTimeout(120);
   assert.deepEqual((await snapshot(g)).intro.entered,[true,false]);
   await g.page.keyboard.down('Space');
  }else await g.page.keyboard.down('Slash');
  assert(await g.waitExpr(`!${round}.intro&&${draft}?._visible`));
  await g.page.waitForTimeout(250);
  const entered=await snapshot(g);assert.deepEqual(entered.chosen,Array(count).fill(false));assert.deepEqual(entered.confirmed,Array(count).fill(false));assert.equal(entered.wave,report.start.wave);
  for(const key of keys)await g.page.keyboard.up(key);await g.page.waitForTimeout(120);
  assert(await g.expr(`Array.from({length:${count}},(_,i)=>${draft}['_Player'+i]._Ready.enabled===false).every(Boolean)`),'READY disabled until explicit selection');
  assert(await g.expr(`Array.from({length:${count}},(_,i)=>[0,1,2].every(n=>!${draft}['_Player'+i]['_Card'+n]._SelectedMark._visible)).every(Boolean)`),'no default selection marker');
  await g.clickClip(`${draft}._Player0._Ready`);await g.page.keyboard.press('Slash');await g.page.waitForTimeout(120);
  assert.deepEqual((await snapshot(g)).chosen,Array(count).fill(false));assert.deepEqual((await snapshot(g)).confirmed,Array(count).fill(false),'confirm alone cannot select a default');
  await g.page.waitForTimeout(300);report.choices=await picture(g,join(out,'unselected-cards.png'),draft);report.shots.push('unselected-cards.png');
  await g.page.keyboard.press('ArrowRight');assert(await g.waitExpr(`${round}.chosen[0]&&${round}.selected[0]===0`),'first next selects first card');
  if(mode==='Coop'){
   await g.page.keyboard.press('KeyW');assert(await g.waitExpr(`${round}.chosen[1]&&${round}.selected[1]===2`),'first previous selects last card');
  }
  await g.clickClip(`${draft}._Player0._Card1`);assert(await g.waitExpr(`${round}.selected[0]===1`));
  assert.deepEqual((await snapshot(g)).confirmed,Array(count).fill(false),'clicking a card only selects');
  // Reproduce the OS repeat that can follow focus loss while the physical key stays held.
  await g.eval(()=>window.dispatchEvent(new Event('blur')));await g.page.waitForTimeout(120);
  await g.eval(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'/',code:'Slash',keyCode:191,repeat:true,bubbles:true,cancelable:true})));
  await g.page.waitForTimeout(120);assert.deepEqual((await snapshot(g)).confirmed,Array(count).fill(false),'focus-return repeat cannot READY a chosen card');
  report.focusRepeatBlocked=true;
  report.offers=await g.expr(`${round}.offers`);
  await g.clickClip(`${draft}._Player0._Ready`);
  if(mode==='Coop'){
   assert(await g.waitExpr(`${round}.confirmed[0]&&!${round}.confirmed[1]`));
   await g.clickClip(`${draft}._Player1._Card0`);assert(await g.waitExpr(`${round}.selected[1]===0`));
   assert.equal((await snapshot(g)).wave,report.start.wave);await g.clickClip(`${draft}._Player1._Ready`);
  }
  assert(await g.waitExpr(`m.mcWorld.mUpgrades.mLevelIndex===${report.start.wave+1}`));
  assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.lastRewardWave'),report.start.wave);
  report.bonuses=await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses');await g.page.waitForTimeout(150);
  assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses'),report.bonuses,'one reward settlement');
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;return report;
 }catch(error){report.error=String(error);report.failureState=await snapshot(g).catch(String);await g.shot(join(out,'failed.png'),false).catch(()=>{});throw error;}
 finally{for(const key of keys)await g.page.keyboard.up(key).catch(()=>{});save();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v038/wave-clear-gate';mkdirSync(out,{recursive:true});
 const browser=await launch(),report={ok:false,method,cases:[]};let g;
 try{
  for(const mode of process.env.BOXHEAD_QA_ONE?['Coop']:['Single','Coop'])for(const viewport of process.env.BOXHEAD_QA_ONE?[{width:640,height:480}]:[{width:640,height:480},{width:960,height:540},{width:480,height:720}]){
   await g?.close();g=await openGame(browser,{viewport});await toMainMenu(g);
   await g.expr('(P.CMain.mSaveData.__set__mGameSpeed(1),P.CMain.mSaveData.__set__mDetail(false),true)');
   await g.clickClip('m.mcScreen.mc'+(mode==='Single'?'SinglePlay':'CoopPlay'));assert(await g.waitScreen('State_SelectWorld_'+mode,'Screen_SelectWorld'));
   const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('1');await g.page.keyboard.press('Enter');await g.page.keyboard.press('Tab');
   await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
   const name=`${mode}-${viewport.width}x${viewport.height}`;
   const result=await verifyWaveClearGate(g,join(out,name),{mode,checkPause:mode==='Single'&&viewport.width===640});
   report.cases.push({mode,viewport,...result});writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
  }
  report.ok=true;
 }finally{await g?.close();await browser.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log('WAVE CLEAR GATE REAL INPUT CHECKS PASSED '+out);
}
