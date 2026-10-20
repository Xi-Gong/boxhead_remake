import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/draft-stats-'+Date.now();mkdirSync(out,{recursive:true});
const report={ok:false,shots:[],geometry:[],method:'Single headless Chrome, real keyboard/mouse, injected pad mapping, direct screenshots'};
const browser=await launch();let g;
const sheet=i=>`m.mcWorld._WaveDraftHud._Player${i}._Stats._visible`;
try{
 g=await openGame(browser,{init:()=>{
  window.qaStatsPad={index:1,connected:true,id:'QA P2',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  navigator.getGamepads=()=>[null,window.qaStatsPad];
 }});
 await toMainMenu(g);await g.clickClip('m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_Coop','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
 await g.shot(out+'/cards.png',false);report.shots.push('cards.png');
 for(let i=0;i<2;i++)for(let c=0;c<3;c++){
  const path=`m.mcWorld._WaveDraftHud._Player${i}._Card${c}`,b=await g.centreOf(path);assert(b.w>=279&&b.h>=63);
  assert(await g.expr(`${path}._Preview.textWidth<${path}._Preview._width`));
 }
 await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card2');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.selected[0]===2'));
 assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[false,false]);
 await g.page.keyboard.press('Tab');assert(await g.waitExpr(sheet(0)));assert(!(await g.expr(sheet(1))));
 await g.page.keyboard.down('Slash');await g.page.waitForTimeout(120);assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[false,false]);
 await g.page.keyboard.press('KeyS');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.selected[1]===1'));
 await g.shot(out+'/p1-stats.png',false);report.shots.push('p1-stats.png');
 await g.page.keyboard.press('Tab');assert(await g.waitExpr('!'+sheet(0)));await g.page.keyboard.up('Slash');
 await g.page.keyboard.press('KeyR');assert(await g.waitExpr(sheet(1)));
 await g.clickClip('m.mcWorld._WaveDraftHud._Player1._Stats._Bind');
 await g.page.keyboard.press('KeyS');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player1._Hint.text.includes("KEY IN USE")'));
 await g.page.keyboard.press('KeyT');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player1._Stats._Bind._Contents._Label.text.includes("T /")'));
 await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]'));
 for(const viewport of [{width:640,height:480},{width:960,height:540},{width:480,height:720}]){
  await g.page.setViewportSize(viewport);await g.page.waitForTimeout(250);
  const b=await g.centreOf('m.mcWorld._WaveDraftHud'),s=await g.stageInfo();
  assert(b.x-b.w/2>=0&&b.x+b.w/2<=s.w&&b.y-b.h/2>=0&&b.y+b.h/2<=s.h);
  const name=`stats-${viewport.width}x${viewport.height}.png`;await g.shot(out+'/'+name,false);report.shots.push(name);report.geometry.push({viewport,bounds:b,stage:s});
 }
 await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(200);
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 assert.equal(await g.expr('m.mcWorld._WaveDraftHud._visible'),false);
 await g.page.waitForTimeout(700);await g.shot(out+'/pause.png',false);report.shots.push('pause.png');
 await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
 await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
 assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.selected'),[2,1]);assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[true,false]);
 assert((await g.expr('m.mcWorld._WaveDraftHud._Player1._StatsButton._Contents._Label.text')).includes('T'));
 const pad=async(i,on)=>{await g.eval(([i,on])=>{window.qaStatsPad.buttons[i]={pressed:on,value:+on};},[i,on]);await g.page.waitForTimeout(120);};
 await pad(3,true);await pad(3,false);assert(await g.waitExpr(sheet(1)));
 await pad(0,true);assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[true,false]);
 await pad(3,true);await pad(3,false);assert(await g.waitExpr('!'+sheet(1)));
 assert.equal(await g.expr('m.mcWorld.mUpgrades.mLevelIndex'),1);await pad(0,false);await pad(0,true);await pad(0,false);
 assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));
 const png=PNG.sync.read(readFileSync(out+'/cards.png'));let light=0,red=0;
 for(let y=80;y<455;y++)for(let x=18;x<620;x++){const n=(y*png.width+x)*4,r=png.data[n],g=png.data[n+1],b=png.data[n+2];if(r>210&&g>210&&b>205)light++;if(r>160&&g<100&&b<100)red++;}
 assert(light>100000&&red>200);report.pixels={light,red};
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('DRAFT STATS PASSED '+out);
