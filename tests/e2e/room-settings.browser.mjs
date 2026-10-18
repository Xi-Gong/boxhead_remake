import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v029/room-settings';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[],geometry:[]};let host,guest;
const init=()=>{
 const q=window.__roomQA={sent:[]};window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
  onHosts(){},onPeer(cb){q.peer=cb;},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},
  hostStart:async()=>({ok:true,port:47631}),hostSetStatus(){},hostStop(){},connect:async()=>({ok:true}),closePeer(){},shutdown(){},addresses:async()=>['127.0.0.1'],
  send(m){q.sent.push(m);}}};
};
const enter=async()=>{const g=await openGame(browser,{init});await toMainMenu(g);await g.clickClip('m.mcScreen.mcLanGame');assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));return g;};
const clickLabel=(g,label)=>g.clickClip(`m.mcScreen.panel.$list.find(c=>c._Contents?._Label?.text===${JSON.stringify(label)})`);
const value=(g,key)=>g.expr(`m.mcScreen._RoomSettings._PanelCard._Value_${key}._Contents._Label.text`);
const edit=(g,key)=>g.clickClip(`m.mcScreen._RoomSettings._PanelCard._Value_${key}`);
const shot=async(g,name)=>{const file=`${out}/${name}.png`;await g.shot(file,false);report.shots.push(file);return PNG.sync.read(readFileSync(file));};
try{
 host=await enter();await clickLabel(host,'CREATE ROOM');assert(await host.waitExpr('g.lan().bridge==="hosting"'));
 await clickLabel(host,'GAME SETTINGS');
 for(const key of ['damage','collisions','devils']){assert.equal(await value(host,key),'ON');await edit(host,key);assert.equal(await value(host,key),'OFF');}
 await edit(host,'gameSpeed');assert.equal(await value(host,'gameSpeed'),'FAST');
 await edit(host,'difficulty');assert.equal(await value(host,'difficulty'),'INTERMEDIATE');
 const selection=await host.expr('g.lan().sel');assert.equal(selection.settings.damage,false);
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await host.page.setViewportSize({width,height});await host.page.waitForTimeout(750);
  const geo=await host.eval(()=>{
   const g=window.__game,p=g.platform.presenter,r=p.canvas.getBoundingClientRect(),s=g.main().mcScreen;
   return {scale:r.width/p.stageW,left:r.left,top:r.top,fields:s._RoomSettings._PanelCard.$list.filter(c=>c._Contents?._Label).map(c=>({
    text:c._Contents._Label.text,bounds:c.getBounds(g.player.root),width:c._Contents._Label._width,textWidth:c._Contents._Label.textWidth}))};
  });
  assert.equal(geo.fields.length,7);assert(geo.fields.every(f=>f.textWidth<=f.width));
  const png=await shot(host,`host-${width}x${height}`);
  for(const f of geo.fields){const b=f.bounds;let dark=0;
   const x0=Math.max(0,Math.floor(geo.left+b.xMin*geo.scale)),y0=Math.max(0,Math.floor(geo.top+b.yMin*geo.scale));
   const x1=Math.min(width,Math.ceil(geo.left+b.xMax*geo.scale)),y1=Math.min(height,Math.ceil(geo.top+b.yMax*geo.scale));
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*png.width+x)*4;if(Math.min(png.data[i],png.data[i+1],png.data[i+2])<140)dark++;}
   assert(dark>10,`visible setting text: ${f.text}`);
  }
  report.geometry.push({width,height,...geo});
 }
 await host.page.setViewportSize({width:640,height:480});await host.page.waitForTimeout(750);
 await host.clickClip('m.mcScreen._RoomSettings._PanelCard._Close');
 await host.eval(()=>{const q=window.__roomQA;q.message({t:'hello',name:'guest',sid:'qa',features:['team-pass-v1']});q.message({t:'ready',ready:true});});
 await host.clickClip('m.mcScreen.startBtn');assert(await host.waitScreen('State_LanSetup','Screen_LanSetup'));
 await host.clickClip('m.mcScreen.widgets.$list.find(c=>c._Contents?._Label?.text==="GAME SETTINGS")');
 assert.equal(await value(host,'damage'),'OFF');assert.equal(await value(host,'gameSpeed'),'FAST');await shot(host,'host-setup');
 // Click where START GAME lives behind the modal; the backdrop must swallow it.
 await host.page.mouse.click(320,444);assert.equal(await host.expr('g.state()'),'State_LanSetup');
 guest=await enter();await guest.page.locator('input[placeholder="192.168.x.x"]').click();await guest.page.keyboard.type('127.0.0.1');await guest.page.keyboard.press('Enter');
 assert(await guest.waitExpr('g.lan().bridge==="lobby"'));
 await guest.eval(sel=>window.__roomQA.message({t:'lobby',sel}),selection);await clickLabel(guest,'GAME SETTINGS');
 assert.equal(await value(guest,'damage'),'OFF');await edit(guest,'damage');assert.equal(await value(guest,'damage'),'OFF');
 assert.equal(await guest.expr('g.lan().sel.settings.damage'),false);await shot(guest,'guest-readonly');
 for(const g of [host,guest]){assert.deepEqual(await g.expr('g.errors'),[]);assert.deepEqual(g.log,[]);}
 report.ok=true;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await host?.close();await guest?.close();await browser.close();}
console.log('ROOM SETTINGS PASSED');
