import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v029/wave-input';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,cases:[],geometry:[],shots:[]};let g,guest;
const init=()=>{
 const q=window.__waveQA={sent:[]};window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
  onHosts(){},onPeer(cb){q.peer=cb;},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},
  hostStart:async()=>({ok:true,port:47631}),hostSetStatus(){},hostStop(){},connect:async()=>({ok:true}),closePeer(){},shutdown(){},addresses:async()=>['127.0.0.1'],
  send(m){q.sent.push(m);}}};
};
const input=x=>x.page.getByRole('textbox',{name:'Start wave',includeHidden:true});
const type=async(x,value)=>{await input(x).click();await x.page.keyboard.press('Control+A');await x.page.keyboard.press('Backspace');await x.page.keyboard.type(value);};
const draft=x=>input(x).inputValue();
const shot=async(x,name)=>{await x.page.waitForTimeout(120);const file=`${out}/${name}.png`;await x.shot(file,false);report.shots.push(file);return PNG.sync.read(readFileSync(file));};
const enterLocal=async(mode)=>{await g.clickClip(`m.mcScreen.mc${mode==='Single'?'SinglePlay':'CoopPlay'}`);assert(await g.waitScreen(`State_SelectWorld_${mode}`,'Screen_SelectWorld'));await input(g).waitFor();};
const closeError=async(x)=>{
 await x.page.getByRole('dialog',{name:'Invalid wave'}).waitFor();
 const preserved=await draft(x);await x.page.getByRole('button',{name:'Close wave error'}).click();
 assert.equal(await draft(x),preserved);assert(await input(x).evaluate(e=>document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length));
};
const checkInvalid=async(x,value,trigger,selected)=>{
 await type(x,value);
 if(trigger==='Enter')await x.page.keyboard.press('Enter');
 else if(trigger==='arrow')await x.clickClip('m.mcScreen.mcStartWave.bRight');
 else if(trigger==='start')await x.click(380,230);
 else await x.click(210,400);
 assert.equal(await x.expr('m.mcScreen.waveInput.options.get()'),selected);
 assert.match(await x.state(),/SelectWorld|LanSetup/);
 await closeError(x);report.cases.push({value,trigger,selected});
};
try{
 g=await openGame(browser,{init});await toMainMenu(g);console.log('WAVE: local input');
 const baseListeners=await g.expr('g.platform.presenter.listeners.size');
 await g.expr('P.CSaveData.mSharedObject.data.mMaxWaveReached=100');await enterLocal('Single');
 for(const [raw,want]of[['1','1'],['100','100'],['00042','42'],['  00012  ','12']]){
  await type(g,raw);await g.page.keyboard.press('Enter');assert.equal(await draft(g),want);report.cases.push({raw,want});
 }
 await g.ctx.grantPermissions(['clipboard-read','clipboard-write']);await input(g).click();await g.page.keyboard.press('Control+A');
 await g.eval(()=>navigator.clipboard.writeText(' 00007 '));await g.page.keyboard.press('Control+V');await g.page.keyboard.press('Enter');assert.equal(await draft(g),'7');
 await g.page.keyboard.press('Control+A');await g.eval(()=>navigator.clipboard.writeText('1\n0'));await g.page.keyboard.press('Control+V');
 await g.page.keyboard.press('Enter');await closeError(g);await g.page.keyboard.press('Escape');assert.equal(await draft(g),'7');
 await type(g,'99');await g.page.keyboard.press('Escape');assert.equal(await draft(g),'7');
 for(const raw of ['','abc','中文','１２','1.5','+1','-1','1e1','0x10','1 0','0','101','9'.repeat(400)])await checkInvalid(g,raw,'Enter',7);
 for(const trigger of ['blur','arrow','start'])await checkInvalid(g,'12x',trigger,7);
 // The popup must swallow start and shortcuts even if they are aimed at controls below it.
 await type(g,'bad');await g.page.keyboard.press('Enter');await g.click(380,230);
 await g.page.keyboard.press('p');assert.equal(await g.state(),'State_SelectWorld_Single');await closeError(g);
 // Native IME composition: Enter while composing never submits or opens an error.
 await type(g,'');const cdp=await g.ctx.newCDPSession(g.page);
 await cdp.send('Input.imeSetComposition',{text:'１２',selectionStart:2,selectionEnd:2});
 await input(g).dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});
 assert.equal(await g.page.getByRole('dialog').count(),0);
 await cdp.send('Input.insertText',{text:'１２'});await g.page.keyboard.press('Enter');await closeError(g);
 await g.page.keyboard.press('Escape');assert.equal(await draft(g),'7');
 await type(g,'100');await g.clickClip('m.mcScreen.mcStartWave.bRight');assert.equal(await draft(g),'1');
 await g.clickClip('m.mcScreen.mcStartWave.bLeft');assert.equal(await draft(g),'100');
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);await type(g,'0050');await g.page.keyboard.press('Enter');
  const geometry=await input(g).evaluate(e=>{const b=e.getBoundingClientRect(),p=window.__game.platform.presenter,a=p.contentToClient(55,363),z=p.contentToClient(145,391);return {x:b.x,y:b.y,w:b.width,h:b.height,a,z};});
  assert(Math.abs(geometry.x-geometry.a.x)<1&&Math.abs(geometry.y-geometry.a.y)<1&&Math.abs(geometry.w-(geometry.z.x-geometry.a.x))<1);
  await g.click(210,400);const png=await shot(g,`single-${width}x${height}`);let ink=0;
  for(let y=Math.ceil(geometry.y);y<Math.floor(geometry.y+geometry.h);y++)for(let x=Math.ceil(geometry.x);x<Math.floor(geometry.x+geometry.w);x++){
   const i=(y*png.width+x)*4;if(Math.max(png.data[i],png.data[i+1],png.data[i+2])<120)ink++;
  }assert(ink>20);report.geometry.push({width,height,...geometry,ink});
  await type(g,'51x');await g.page.keyboard.press('Enter');await shot(g,`error-${width}x${height}`);await closeError(g);await g.page.keyboard.press('Escape');
 }
 console.log('WAVE: four sizes passed');await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(750);
 // Hiding or unloading removes the native overlay; returning preserves a valid draft or resets on re-entry.
 await g.clickClip('m.mcScreen._Game_Options');assert.equal(await input(g).count(),0);
 await g.clickClip('m.mcScreen.mcWindow_Options._Button_Close');await input(g).waitFor();assert.equal(await draft(g),'50');
 for(let n=0;n<3;n++){
  await g.clickClip('m.mcScreen._Icon_Back');assert(await g.waitScreen('State_Main','Screen_Main'));assert.equal(await input(g).count(),0);
  assert.equal(await g.expr('g.platform.presenter.listeners.size'),baseListeners);
  await enterLocal(n%2?'Single':'Coop');assert.equal(await input(g).count(),1);assert.equal(await draft(g),'1');
 }
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
  await type(g,'0012');await g.page.keyboard.press('Enter');assert.equal(await draft(g),'12');
  await checkInvalid(g,'12.0','start',12);await g.page.keyboard.press('Escape');await shot(g,`coop-${width}x${height}`);
 }
 await type(g,'00020');await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));assert.equal(await g.expr('m.mcWorld.mUpgrades.mLevelIndex'),20);assert.equal(await input(g).count(),0);
 // A fresh isolated context creates a host room without carrying local game state.
 await g.close();g=await openGame(browser,{init});await toMainMenu(g);await g.expr('P.CSaveData.mSharedObject.data.mMaxWaveReached=30');
 await g.clickClip('m.mcScreen.mcLanGame');assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.clickClip('m.mcScreen.panel.$list.find(c=>c._Contents?._Label?.text==="CREATE ROOM")');
 await g.eval(()=>{const q=window.__waveQA;q.message({t:'hello',name:'guest',sid:'qa'});q.message({t:'ready',ready:true});});
 await g.clickClip('m.mcScreen.startBtn');assert(await g.waitScreen('State_LanSetup','Screen_LanSetup'));
 await type(g,'00030');await g.page.keyboard.press('Enter');assert.equal(await g.expr('g.lan().sel.wave'),30);assert.equal(await draft(g),'30');
 const before=await g.expr('window.__waveQA.sent.length');await type(g,'31');await g.clickClip('m.mcScreen.bStart');await closeError(g);
 assert.equal(await g.expr('g.lan().sel.wave'),30);assert.equal(await g.expr('window.__waveQA.sent.length'),before);
 await g.page.keyboard.press('Escape');await g.clickClip('m.mcScreen.waveRight');assert.equal(await draft(g),'1');
 await g.clickClip('m.mcScreen.waveLeft');assert.equal(await draft(g),'30');
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
  await type(g,'00030');await g.page.keyboard.press('Enter');assert.equal(await draft(g),'30');await shot(g,`host-${width}x${height}`);
 }
 const sel=await g.expr('g.lan().sel');
 guest=await openGame(browser,{init});await toMainMenu(guest);await guest.clickClip('m.mcScreen.mcLanGame');assert(await guest.waitScreen('State_LanLobby','Screen_LanLobby'));
 await guest.page.locator('input[placeholder="192.168.x.x"]').click();await guest.page.keyboard.type('127.0.0.1');await guest.page.keyboard.press('Enter');
 assert(await guest.waitExpr('g.lan().bridge==="lobby"'));await guest.eval(sel=>window.__waveQA.message({t:'setup',sel}),sel);
 assert(await guest.waitScreen('State_LanSetup','Screen_LanSetup'));assert.equal(await draft(guest),'30');assert(await input(guest).evaluate(e=>e.readOnly));
 await input(guest).click();await guest.page.keyboard.type('123');assert.equal(await draft(guest),'30');await guest.clickClip('m.mcScreen.waveRight');assert.equal(await draft(guest),'30');
 await guest.eval(sel=>window.__waveQA.message({t:'setup',sel:{...sel,wave:12}}),sel);assert(await guest.waitExpr('m.mcScreen.bWave._Contents._Label.text==="12"'));
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await guest.page.setViewportSize({width,height});await guest.page.waitForTimeout(750);
  await input(guest).click();await guest.page.keyboard.type('99');assert.equal(await draft(guest),'12');await shot(guest,`guest-${width}x${height}`);
 }
 for(const x of [g,guest]){assert.deepEqual(await x.expr('g.errors'),[]);assert.deepEqual(x.log,[]);}report.ok=true;
}catch(error){report.error=String(error);await shot(g,'failure').catch(()=>{});throw error;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await guest?.close();await browser.close();}
console.log('WAVE INPUT PASSED');
