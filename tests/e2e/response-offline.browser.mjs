import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {_electron} from 'playwright-core';
import {launch,openGame,toMainMenu,Game} from './lib.mjs';
import {installResponseFixture,responseActions} from './response-probes.mjs';
const packaged=process.argv.includes('--electron'),out='generated/reports/v029/response-offline'+(packaged?'-electron':'');mkdirSync(out,{recursive:true});
const browser=packaged?undefined:await launch(),report={ok:false,packaged,runs:[],environments:[]};let g,app;
const seed=(.424242*2**32)>>>0;
const initialize=seed=>{Math.random=()=>seed/0xffffffff;};
try{for(let run=0;run<3;run++){
 if(packaged){
  app=await _electron.launch({executablePath:resolve('release/win-unpacked/Boxhead 2Play Rooms.exe'),cwd:process.cwd(),timeout:60000,
   args:['--boxhead-multi','--boxhead-hidden','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'],
   env:{...process.env,BOXHEAD_USER_DATA:resolve(out,'data-'+run)}});
  const page=await app.firstWindow();await page.addInitScript(initialize,seed);await page.reload();g=new Game(page,page.context(),[]);assert(await g.waitExpr('g.ready',120000));
  await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],a=screen.getPrimaryDisplay().workArea;if(w.getOpacity()!==0||w.isFocusable())throw new Error('unsafe QA window');w.setPosition(a.x+40,a.y+40);w.setContentSize(960,720);});
 }else g=await openGame(browser,{init:initialize,initArg:seed});
 await toMainMenu(g);await g.clickClip('m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_Coop','Screen_SelectWorld'));
 await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.bLeft');
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
 await installResponseFixture(g.page,false);await g.page.waitForTimeout(10000);
 report.environments.push(await g.eval(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,width:innerWidth,height:innerHeight,canvas:[window.__game.platform.presenter.canvas.width,window.__game.platform.presenter.canvas.height]})));
 const rows={seed};for(const role of(run===1?[1,0]:[0,1]))rows[role]=await responseActions(g.page,role,{network:false});
 report.runs.push(rows);assert.deepEqual(await g.expr('g.errors'),[]);
 if(packaged){await app.close();app=undefined;}else await g.close();g=undefined;
 }report.ok=true;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));if(packaged)await app?.close();else await g?.close();await browser?.close();}
console.log('OFFLINE RESPONSE PASSED');
