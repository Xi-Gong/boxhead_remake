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
 assert.deepEqual(await g.scriptErrors(),[]);
 console.log('PASS: main menu with all entries, four aspect ratios, LAN entry and controlled discovery');
 await g.close();
}finally{await browser.close();}
