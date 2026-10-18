// Added-UI production visual/interaction gate, with a controlled discovery transport.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v026/ui';mkdirSync(out,{recursive:true});
const browser=await launch();
try {
 const g=await openGame(browser,{viewport:{width:960,height:720},init:()=>{
  localStorage.setItem('SO:BXHD_2PLAY_6',JSON.stringify({mResumeData:{version:2,players:[],objects:[],roomLibLink:'ROOM_Single_0001',wave:1}}));
  window.__qa={};
  window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
   onHosts(cb){window.__qa.hosts=cb;},onPeer(cb){window.__qa.peer=cb;},onMessage(cb){window.__qa.message=cb;},
   discoverStart:async()=>({ok:true}),discoverStop(){},hostStart:async()=>({ok:true,port:47631}),hostSetStatus(){},hostStop(){},
   connect:async()=>({ok:true}),send(){},closePeer(){},shutdown(){},addresses:async()=>['192.168.1.5']}};
 }});
 await toMainMenu(g);
 assert.deepEqual(await g.expr('[m.mcScreen.mcSinglePlay,m.mcScreen.mcCoopPlay,m.mcScreen.mcDeathPlay,m.mcScreen.mcInstructions,m.mcScreen.mcContinue,m.mcScreen.mcLanGame].map(b=>b._y)'),[226,256,286,316,346,376]);
 for(const [w,h] of [[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width:w,height:h});await g.page.waitForTimeout(750);await g.shot(`${out}/main-${w}x${h}.png`,false);
 }
 await g.clickClip('m.mcScreen.mcLanGame');
 assert.ok(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.page.waitForTimeout(750);await g.shot(`${out}/lan-empty.png`,false);
 await g.page.evaluate(()=>window.__qa.hosts([
  {ip:'192.168.1.2',name:'AVAILABLE ROOM',status:'lobby',players:1,port:47631},
  {ip:'192.168.1.3',name:'FULL ROOM',status:'lobby',players:2,port:47631},
  {ip:'192.168.1.4',name:'IN PROGRESS',status:'playing',players:2,port:47631}]));
 await g.page.waitForTimeout(500);await g.shot(`${out}/lan-discovery.png`,false);
 assert.equal(await g.expr('m.mcScreen.hostRows.filter(r=>r._visible).length'),3);
 assert.deepEqual(await g.expr('m.mcScreen.hostRows.slice(0,3).map(r=>r.enabled)'),[true,false,false]);
 for(const [w,h] of [[640,480],[1280,720]]){
  await g.page.setViewportSize({width:w,height:h});await g.page.waitForTimeout(750);await g.shot(`${out}/lan-discovery-${w}x${h}.png`,false);
 }
 await g.clickClip('m.mcScreen.entryEls.find(b=>b?._Contents?._Label?.text==="CREATE ROOM")');
 assert.ok(await g.waitExpr('g.lan().bridge==="hosting"'));
 await g.page.waitForTimeout(500);await g.shot(`${out}/lan-host-waiting.png`,false);
 await g.page.evaluate(()=>window.__qa.message({t:'hello',name:'QA GUEST',sid:'qa',char:0}));
 assert.ok(await g.waitExpr('g.lan().bridge==="lobby"'));
 assert.equal(await g.expr('m.mcScreen.startBtn.enabled'),false);
 await g.page.waitForTimeout(500);await g.shot(`${out}/lan-host-not-ready.png`,false);
 await g.page.evaluate(()=>window.__qa.message({t:'ready',ready:true}));
 assert.ok(await g.waitExpr('m.mcScreen.startBtn.enabled===true'));
 await g.clickClip('m.mcScreen.startBtn');
 assert.ok(await g.waitScreen('State_LanSetup','Screen_LanSetup'));
 await g.page.waitForTimeout(750);await g.shot(`${out}/lan-setup-host-coop.png`,false);
 await g.clickClip('m.mcScreen.bMode');await g.page.waitForTimeout(500);
 assert.equal(await g.expr('g.lan().sel.mode'),'DeathMatch');await g.shot(`${out}/lan-setup-host-dm.png`,false);
 await g.page.mouse.move(5,5);await g.page.waitForTimeout(200);
 const ink=await g.page.evaluate(()=>{
  const p=window.__game.platform.presenter,c=document.querySelector('canvas.game-canvas'),r=c.getBoundingClientRect();
  return [[30,12,55,16],[260,390,120,18]].map(([x,y,w,h])=>{
   const a=p.contentToClient(x,y),b=p.contentToClient(x+w,y+h),sx=c.width/r.width,sy=c.height/r.height;
   const pixels=c.getContext('2d').getImageData(Math.round((a.x-r.left)*sx),Math.round((a.y-r.top)*sy),Math.round((b.x-a.x)*sx),Math.round((b.y-a.y)*sy)).data;
   let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)n++;return n;
  });
 });
 assert.ok(ink.every(n=>n>30),'mode and difficulty remain painted after switching modes: '+ink);
 await g.clickClip('m.mcScreen.bDiff');assert.equal(await g.expr('g.lan().sel.difficulty'),1);
 await g.clickClip('m.mcScreen.bBack');assert.ok(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.clickClip('m.mcScreen.closeBtn');
 const ip=g.page.locator('input[type=text]');await ip.waitFor({state:'visible'});
 await ip.click();await g.page.keyboard.type('192.168.1.5');await g.page.keyboard.press('Enter');
 assert.ok(await g.waitExpr('g.lan().bridge==="lobby" && !g.lan().isHost'));
 await g.page.evaluate(()=>window.__qa.message({t:'setup',sel:{mode:'Coop',charP1:0,charP2:1,levelIdx:2,difficulty:2,gameAmount:0,wave:3,maxWave:10}}));
 assert.ok(await g.waitScreen('State_LanSetup','Screen_LanSetup'));
 assert.equal(await g.expr('m.mcScreen.bMode.enabled'),false);
 assert.equal(await g.expr('m.mcScreen.bStart._visible'),false);
 await g.page.waitForTimeout(750);await g.shot(`${out}/lan-setup-guest.png`,false);
 assert.equal(await g.page.locator('input[type=text]').count(),0,'lobby DOM is removed on transition');
 await g.expr('m.SetState("State_SelectWorld_Single")');
 assert.ok(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('m.mcScreen.LoadLevel(0)');
 assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state() === "State_RunWorld"'));
 await g.page.keyboard.press('p');
 assert.ok(await g.waitExpr('!!m.mcWorld?.mHud?.mcScreenPause?._SaveQuit'));
 const bounds=await g.expr('(()=>{const p=m.mcWorld.mHud.mcScreenPause;return {save:p._SaveQuit.getBounds(p),quit:p._Quit.getBounds(p)};})()');
 assert.ok(bounds.save.yMax<=65.75,'save action stays inside header');
 assert.ok(bounds.save.xMin>=bounds.quit.xMax+8,'pause actions have separate hit areas');
 for(const [w,h] of [[640,480],[1280,720]]){
  await g.page.setViewportSize({width:w,height:h});await g.page.waitForTimeout(750);await g.shot(`${out}/pause-${w}x${h}.png`,false);
 }
 await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');
 assert.ok(await g.waitScreen('State_Main','Screen_Main'));
 assert.ok(await g.expr('!!m.mcScreen.mcContinue'));
 await g.clickClip('m.mcScreen.mcContinue');
 assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state() === "State_RunWorld"'));
 assert.deepEqual(await g.scriptErrors(),[]);
 console.log('PASS: main menu with all entries, four aspect ratios, LAN entry and controlled discovery');
 await g.close();
}finally{await browser.close();}
