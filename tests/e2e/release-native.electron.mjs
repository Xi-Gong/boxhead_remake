// One hidden, low-resolution packaged native gate; actual portable gameplay is tested separately.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {_electron} from 'playwright-core';
import {Game,toMainMenu} from './lib.mjs';
import {isolateLanPorts} from './lan-isolation.mjs';

const out=resolve(process.env.BOXHEAD_QA_OUT??'generated/reports/v031/release-gates/native');mkdirSync(out,{recursive:true});
const data=join(out,'data'),report={ok:false,checks:[],errors:[]};let app,page;
const note=(name,value)=>{report.checks.push({name,value});console.log('PASS',name);};
const launch=async()=>{
 app=await _electron.launch({executablePath:resolve(process.env.BOXHEAD_QA_EXE??'release/v031-pacing-final/win-unpacked/Boxhead 2Play Rooms.exe'),cwd:process.cwd(),timeout:60000,
  args:['--boxhead-multi','--boxhead-hidden','--force-device-scale-factor=1','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion'],env:{...process.env,BOXHEAD_USER_DATA:data}});
 await isolateLanPorts(app,report);
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(String(e)));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(640,480));
 const g=new Game(page,page.context(),report.errors);assert(await g.waitExpr('g.ready',120000));await toMainMenu(g);return g;
};
const native=()=>app.evaluate(({BrowserWindow,app})=>{const w=BrowserWindow.getAllWindows()[0];return {size:w.getContentSize(),title:w.getTitle(),menu:w.isMenuBarVisible(),opacity:w.getOpacity(),focusable:w.isFocusable(),focused:w.isFocused(),fs:w.isFullScreen(),userData:app.getPath('userData')};});
const send=key=>app.evaluate(({BrowserWindow},key)=>{const wc=BrowserWindow.getAllWindows()[0].webContents;wc.sendInputEvent({type:'keyDown',keyCode:key.code,modifiers:key.mods??[]});wc.sendInputEvent({type:'keyUp',keyCode:key.code,modifiers:key.mods??[]});},key);
try{
 let g=await launch();let win=await native();assert.deepEqual(win.size,[640,480]);assert.equal(win.title,'Boxhead: 2Play Rooms');assert.equal(win.userData,data);assert.equal(win.menu,false);assert.equal(win.opacity,0);assert(!win.focusable&&!win.focused);note('native window, isolated save location and hidden/no-focus creation',win);
 assert(await page.evaluate(()=>window.boxheadDesktop.isElectron&&typeof window.require==='undefined'&&typeof window.process==='undefined'));note('isolated renderer with sandboxed preload API',true);
 assert.equal(page.url(),'app://game/index.html');
 const protocol=await page.evaluate(async()=>{const a=[];for(const url of ['assets/library.json','assets/sounds/558.mp3','nope.txt','/%2e%2e/package.json','/..%2f..%2fpackage.json']){const r=await fetch(url);a.push({url,status:r.status,type:r.headers.get('content-type')});}return a;});
 assert.equal(protocol[0].status,200);assert.match(protocol[0].type,/application\/json/);assert.equal(protocol[1].status,200);assert.equal(protocol[1].type,'audio/mpeg');assert.equal(protocol[2].status,404);assert(protocol.slice(3).every(r=>r.status!==200));note('packaged app protocol MIME, missing files and traversal protection',protocol);
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 const before=await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition.mX');await page.keyboard.down('ArrowRight');await page.waitForTimeout(220);await page.keyboard.up('ArrowRight');
 const after=await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition.mX');assert(after>before);await page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));note('real menu mouse input, gameplay keyboard and pause',{before,after});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(800,480));await page.waitForTimeout(250);
 assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight]),[800,480]);await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));note('native wide viewport and transformed pause click',await g.stageInfo());
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(640,480));await page.waitForTimeout(200);
 await page.evaluate(()=>{window.__nativeKeys=[];addEventListener('keydown',e=>window.__nativeKeys.push(e.code));});
 await send({code:'F11'});await page.waitForTimeout(900);assert((await native()).fs);assert(await page.evaluate(()=>innerWidth>=640&&innerHeight>=480));assert(!(await page.evaluate(()=>window.__nativeKeys)).includes('F11'));
 await page.evaluate(()=>window.boxheadDesktop.toggleFullscreen());await page.waitForTimeout(900);assert(!(await native()).fs);
 await send({code:'Enter',mods:['alt']});await page.waitForTimeout(900);assert((await native()).fs);await send({code:'Enter',mods:['alt']});await page.waitForTimeout(900);win=await native();assert(!win.fs&&!win.focusable&&!win.focused);assert.equal(win.opacity,0);assert.deepEqual(win.size,[640,480]);note('native F11, IPC and Alt+Enter fullscreen round trips remain hidden',win);
 const snap=await g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks})');await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
 await page.evaluate(()=>localStorage.setItem('v031-native-proof','persistent'));await app.close();app=null;
 g=await launch();assert.equal(await page.evaluate(()=>localStorage.getItem('v031-native-proof')),'persistent');await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 const restored=await g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,remaining:m.mcWorld.mUpgrades.timedWave.remainingTicks})');assert.equal(restored.wave,snap.wave);assert(restored.remaining<=snap.remaining&&restored.remaining>snap.remaining-30);note('native process restart preserves settings/save and remaining simulation time',{snap,restored});
 await g.shot(join(out,'native-final.png'),false);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.errors.push(String(error));throw error;}finally{await app?.close().catch(()=>{});report.ok=report.ok&&report.errors.length===0;writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
