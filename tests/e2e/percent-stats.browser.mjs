import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v036/percent-ui';mkdirSync(out,{recursive:true});
const early=process.env.BOXHEAD_QA_CLEAR_REWARD==='1',multiple=early?2:1;
const browser=await launch(),report={ok:false,method:'Serial single hidden Chrome at low resolution. Real menu, card, stats and READY clicks; prepared offers, not balance evidence. Direct screenshots plus geometry and pixel checks.',cases:[]};let g;
try{
 for(const mode of process.env.BOXHEAD_QA_ONE?['Coop']:['Single','Coop'])for(const viewport of process.env.BOXHEAD_QA_ONE?[{width:640,height:480}]:[{width:640,height:480},{width:960,height:540},{width:480,height:720}]){
  await g?.close();g=await openGame(browser,{viewport});await toMainMenu(g);await g.clickClip('m.mcScreen.mc'+(mode==='Single'?'SinglePlay':'CoopPlay'));assert(await g.waitScreen('State_SelectWorld_'+mode,'Screen_SelectWorld'));
  const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('1');await g.page.keyboard.press('Enter');await g.page.keyboard.press('Tab');await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  if(early)await g.expr(`(()=>{const w=m.mcWorld,c=w.mUpgrades.timedWave.clear;c.zombies=c.devils=0;w.mUpgrades.Process();})()`);
  await g.expr(`(()=>{const w=m.mcWorld;if(w.mUpgrades.timedWave.phase!=='draft')w.mUpgrades.FinishTimedWave();w.mUpgrades.waveDraft.round.offers=Array.from({length:${mode==='Single'?1:2}},()=>['dodge','mobility','enchantPower']);})()`);
  assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._Player0._Card0._Label.text==="DODGE"'));await g.page.waitForTimeout(700);
  const prefix=`${mode}-${viewport.width}x${viewport.height}`;await g.shot(`${out}/${prefix}-cards.png`,false);
  const cards=await g.expr('Array.from({length:3},(_,i)=>{const c=m.mcWorld._WaveDraftHud._Player0["_Card"+i];return {amount:c._Benefit.text,preview:c._Preview.text,detail:c._Detail.text};})');assert.deepEqual(cards.map(c=>c.amount),early?['+6%','+8%','+6%']:['+3%','+4%','+3%']);assert.match(cards[0].preview,early?/0%.*6%/:/0%.*3%/);if(early)assert.match(await g.expr('m.mcWorld._WaveDraftHud._Title.text'),/EARLY CLEAR.*DOUBLE/);assert.equal(cards[0].detail,'max 50%');
  await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
  const data=await g.expr(`(()=>{const d=m.mcWorld._WaveDraftHud;return {bounds:d.getBounds(m._parent),stage:m.mcWorld.mScreenSize,players:Array.from({length:${mode==='Single'?1:2}},(_,i)=>{const s=d['_Player'+i]._Stats;return Array.from({length:12},(_,n)=>{const f=s['_Value'+n],name=s['_Name'+n];return {label:name.text,value:f.text,width:f._width,ink:f.textWidth,font:f.getTextFormat().size,bounds:f.getBounds(s),nameBounds:name.getBounds(s)};});})};})()`);
  assert(data.bounds.xMin>=0&&data.bounds.xMax<=data.stage.x&&data.bounds.yMin>=0&&data.bounds.yMax<=data.stage.y);
  for(const rows of data.players){assert.equal(rows[8].label,'DODGE');assert.equal(rows[8].value,'+0% / 50%');for(let i=0;i<rows.length;i++){const r=rows[i];assert(r.font>=12);assert(r.ink<r.width-2,`${prefix} ${r.label}: ${r.ink}/${r.width}`);assert(r.nameBounds.xMax<=r.bounds.xMin);if(i&&mode==='Coop')assert(rows[i-1].bounds.yMax<=r.bounds.yMin+1);}}
  await g.page.waitForTimeout(700);await g.shot(`${out}/${prefix}-stats.png`,false);const title=await g.expr('m.mcWorld._WaveDraftHud._Title.getBounds(m._parent)'),tl=await g.stageToPage(title.xMin,title.yMin),br=await g.stageToPage(title.xMax,title.yMax),shot=PNG.sync.read(readFileSync(`${out}/${prefix}-stats.png`));let titleInk=0;for(let y=Math.floor(tl[1]);y<br[1];y++)for(let x=Math.floor(tl[0]);x<br[0];x++){const n=(y*shot.width+x)*4;if(shot.data[n]>170&&shot.data[n+1]<100&&shot.data[n+2]<100)titleInk++;}assert(titleInk>100,'visible red settlement title while inspecting stats');await g.page.keyboard.press('Tab');assert(await g.waitExpr('!m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
  await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');if(mode==='Coop'){assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]'));await g.clickClip('m.mcWorld._WaveDraftHud._Player1._Ready');}
  assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses[0].dodge'),multiple);
  const png=PNG.sync.read(readFileSync(`${out}/${prefix}-cards.png`));let green=0;for(let n=0;n<png.data.length;n+=4)if(png.data[n]<100&&png.data[n+1]>80&&png.data[n+1]>png.data[n]*1.3&&png.data[n+2]<120)green++;assert(green>50);
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.cases.push({mode,viewport,cards,...data,green});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 }report.ok=true;
}catch(error){report.error=String(error);await g?.shot(`${out}/failed.png`,false).catch(()=>{});throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('PERCENT STATS UI PASSED '+out);
