// Real menu entry; normal vitals and spawns. No combat state is rewritten.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=resolve(process.env.BOXHEAD_QA_OUT??'generated/reports/v037/entrance-admission');mkdirSync(out,{recursive:true});
const report={ok:false,method:'Real menus/options/map arrows, normal Wave 1 stats and spawns, fixed seed, real pause. Observe both native opening enemies at tick >=100; no HP, collision, wave, enemy or clock mutation.',cases:[]},browser=await launch();let g;
try{for(const mode of ['Single','Coop']){
 const row={mode,ok:false};try{
  await g?.close();g=await openGame(browser,{viewport:{width:640,height:480},query:'?scale=1',init:seed=>{Math.random=()=>seed/0xffffffff;},initArg:7000+48+mode.length});await toMainMenu(g);
  await g.clickClip('m.mcScreen.mc'+(mode==='Single'?'SinglePlay':'CoopPlay'));assert(await g.waitScreen('State_SelectWorld_'+mode,'Screen_SelectWorld'));
  await g.clickClip('m.mcScreen._Game_Options');await g.clickClip('m.mcScreen.mcWindow_Options._Level_Beginner');await g.clickClip('m.mcScreen.mcWindow_Options._Button_Close');
  const index=await g.expr('P.CMain.mSaveData["mLevelIndex_'+mode+'"]'),right=(15-index+18)%18,left=(index-15+18)%18;
  for(let i=0;i<Math.min(right,left);i++)await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.'+(right<=left?'bRight':'bLeft'));
  const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('1');await g.page.keyboard.press('Enter');await g.page.keyboard.press('Tab');
  await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded&&m.mcWorld.mTick>=100',15000));
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  row.state=await g.expr('(()=>{const w=m.mcWorld;return {room:w.mWorldLibLink,wave:w.mUpgrades.mLevelIndex,tick:w.mTick,features:w.mUpgrades.features,players:Object.values(w.mThing_Collection.mPlayerThings).map(p=>({life:p.mLife,max:p.mMaxLife})),enemies:Object.values(w.mThing_Collection.mThings).filter(e=>e.Process&&e._CLASSID_==="CThing_Creature_Zombie").map(e=>({x:e.mPosition.mX,y:e.mPosition.mY,state:e.mStateID,base:e.mBaseStateID,collidable:!!(e.mFlags&P.Thing.CThing.mFlag_Collidable)}))};})()');
  await g.shot(join(out,mode+'.png'),false);assert.equal(row.state.room,'ROOM_Single_0016');assert.equal(row.state.wave,1);assert.equal(row.state.enemies.length,2);
  assert(row.state.enemies.every(e=>e.collidable&&e.base!=='State_EnterMap'),'both opening enemies completed entry');assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);row.ok=true;
 }catch(error){row.error=String(error);}report.cases.push(row);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));console.log(mode,row.ok?'PASS':row.error);
}}finally{await g?.close();await browser.close();report.ok=report.cases.length===2&&report.cases.every(c=>c.ok);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
if(!report.ok)process.exitCode=1;
