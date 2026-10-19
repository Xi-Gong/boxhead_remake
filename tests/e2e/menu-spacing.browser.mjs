// Controlled transport for row visuals; real independent transports have separate release gates.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v030/menu-spacing';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,cases:[],shots:[]};let g;
try{
 g=await openGame(browser,{init:()=>{
  const q=window.__menuQA={};window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
   onHosts(){},onPeer(){},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},
   hostStart:async()=>({ok:true,port:47631}),hostSetStatus(){},hostStop(){},closePeer(){},shutdown(){},addresses:async()=>['127.0.0.1'],
   send(m){if(m.t==='in')setTimeout(()=>q.message({t:'in',tick:m.tick,bits:0}),0);}}};
 }});
 await toMainMenu(g);await g.clickClip('m.mcScreen.mcLanGame');assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.clickClip('m.mcScreen.entryEls.find(b=>b?._Contents?._Label?.text==="CREATE ROOM")');
 await g.eval(()=>{const q=window.__menuQA;q.message({t:'hello',name:'QA GUEST',sid:'spacing',netcodes:['rollback-v2'],features:['personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1','reliable-supplies-v1','endless-pve-v1','enemy-variants-v1']});q.message({t:'ready',ready:true});});
 await g.clickClip('m.mcScreen.startBtn');assert(await g.waitScreen('State_LanSetup','Screen_LanSetup'));
 await g.clickClip('m.mcScreen.bStart');assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
 await g.eval(()=>{
  const w=window.__game.main().mcWorld,process=w.Process,q=window.__menuQA;
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  w.Process=function(){
   if(!q.checkpoint){q.checkpoint=true;const l=this.mUpgrades.Level;l.Zombie_Count=l.Devil_Count=l.Zombie_TotalCount=l.Devil_TotalCount=0;}
   if(q.end){q.end=false;const DEAD=window.__game.pkg.Thing.CThing.mFlag_DEAD;for(const p of Object.values(this.mThing_Collection.mPlayerThings)){p.mLife=0;p.mFlags|=DEAD;p.SetState('State_Dying');}}
   return process.call(this);
  };
 });
 assert(await g.waitExpr('g.lan().checkpoint!==null && m.mcWorld.mUpgrades.mLevelIndex>=2'));
 await g.eval(()=>{window.__menuQA.end=true;});assert(await g.waitScreen('State_Debrief','Screen_Debrief'));
 await g.page.waitForTimeout(700);await g.clickClip('m.mcScreen._Exit');
 if(!await g.waitScreen('State_LanLobby','Screen_LanLobby',3000)){await g.clickClip('m.mcScreen._Exit');assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));}
 assert(await g.waitExpr('m.mcScreen.resumeBtn?._visible'));
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
  const rows=await g.eval(()=>{
   const G=window.__game,s=G.main().mcScreen,p=G.platform.presenter,r=p.canvas.getBoundingClientRect();
   return {buttons:[...s.roomEls,s.bBack].filter(c=>c._visible&&c._Contents?._Label).map(c=>({label:c._Contents._Label.text,b:c.getBounds(s.panel),stage:c.getBounds(G.player.root),textWidth:c._Contents._Label.textWidth,width:c._Contents._Label._width})),scale:r.width/p.stageW,left:r.left,top:r.top};
  });
  assert(rows.buttons.some(b=>b.label==='RESUME GAME'));assert(rows.buttons.some(b=>b.label==='GAME SETTINGS'));
  for(let i=0;i<rows.buttons.length;i++){
   const a=rows.buttons[i];assert(a.textWidth<=a.width);
   for(const d of rows.buttons.slice(i+1)){
    const dx=Math.max(a.b.xMin,d.b.xMin)-Math.min(a.b.xMax,d.b.xMax),dy=Math.max(a.b.yMin,d.b.yMin)-Math.min(a.b.yMax,d.b.yMax);
    assert(Math.max(dx,dy)>=12,`${a.label}/${d.label} hit-area spacing`);
   }
  }
  const file=`${out}/resume-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const png=PNG.sync.read(readFileSync(file));
  for(const row of rows.buttons){
   const b=row.stage;let dark=0;
   for(let y=Math.max(0,Math.ceil(rows.top+b.yMin*rows.scale));y<Math.min(height,rows.top+b.yMax*rows.scale);y++)
    for(let x=Math.max(0,Math.ceil(rows.left+b.xMin*rows.scale));x<Math.min(width,rows.left+b.xMax*rows.scale);x++){
     const i=(y*png.width+x)*4;if(Math.max(png.data[i],png.data[i+1],png.data[i+2])<170)dark++;
    }
   assert(dark>10,`visible label ${row.label}`);
  }
  report.cases.push({width,height,...rows});
 }
 await g.clickClip('m.mcScreen.settingsBtn');assert(await g.waitExpr('m.mcScreen._RoomSettings._visible'));
 await g.clickClip('m.mcScreen._RoomSettings._PanelCard._Close');assert(await g.waitExpr('!m.mcScreen._RoomSettings._visible'));
 await g.eval(()=>window.__menuQA.message({t:'ready',ready:true}));await g.clickClip('m.mcScreen.resumeBtn');
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
 assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex>=2'));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('MENU RECOVERY SPACING PASSED');
