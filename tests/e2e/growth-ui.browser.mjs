// Controlled transport/visual fixtures. Real two-process TCP/UDP acceptance remains in net/netsmooth.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v028/growth-ui';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[],geometry:[],errors:[]};
let g;
try{
 g=await openGame(browser,{init:()=>{
  window.__growthQA={};const q=window.__growthQA;
  window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
   onHosts(){},onPeer(cb){q.peer=cb;},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},
   hostStart:async()=>({ok:true,port:47631}),hostSetStatus(){},hostStop(){},connect:async()=>({ok:true}),closePeer(){},shutdown(){},addresses:async()=>[],
   send(m){if(m.t==='in')setTimeout(()=>q.message({t:'in',tick:m.tick,bits:0}),0);}}};
 }});
 await toMainMenu(g);
 await g.clickClip('m.mcScreen.mcLanGame');
 assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.eval(async()=>{
  await window.__game.__setInfiniteLife(true);
  window.__growthQA.message({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',inputDelay:0,
   cfg:{progression:'personal-growth-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:3,charP2:0}});
 });
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 await g.eval(()=>{
  const w=window.__game.main().mcWorld,original=w.Process;
  for(const player of Object.values(w.mThing_Collection.mPlayerThings))player.mInvincible=0;
  w.Process=function(){const q=window.__growthQA;if(q.action){const a=q.action;delete q.action;
   if(a==='kill'){
    const P=window.__game.pkg,owner=Object.values(this.mThing_Collection.mPlayerThings).find(p=>p.mPlayerIndex===0);
    for(let n=0;n<5;n++){
     const victim=new P.Thing.Creature.CThing_Creature_Zombie(owner.mPosition.Clone(),owner.mAngle.Clone());
     this.mThing_Collection.AddThing(victim);victim.Process_Init();victim.mLife=1;
     new P.Thing.Affect.CThing_Affect_Bullet(owner,owner,1,owner.mAngle).AffectThing(victim);victim.SetState('State_Dying');
    }
   }else if(a==='max'){
    Object.assign(this.mUpgrades.lanGrowth.players[0],{score:999999999999999,level:125,xp:0});
    Object.assign(this.mUpgrades.lanGrowth.players[1],{score:12345,level:17,xp:3});
    this.mUpgrades.mLevelIndex=103;
   }
  }return original.call(this);};
 });
 const shot=async name=>{const file=`${out}/${name}.png`;await g.shot(file,false);report.shots.push(file);};
 await g.page.waitForTimeout(750);await shot('initial-640x480');
 await g.eval(()=>{window.__growthQA.action='kill';});
 assert(await g.waitExpr('m.mcWorld._LanGrowthHud._Player0._Level.text==="LV 2"'));
 assert.equal(await g.expr('m.mcWorld.mUpgrades.lanGrowth.players[0].score'),500);
 await shot('level-up-640x480');
 await g.page.waitForTimeout(800);
 assert.equal(await g.expr('m.mcWorld._LanGrowthHud._Player0._Experience.text'),'0 / 5 XP');
 await g.eval(()=>{window.__growthQA.action='max';});
 assert(await g.waitExpr('m.mcWorld._LanGrowthHud._Player0._Experience.text==="MAX"'));
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
  const geo=await g.eval(()=>{
   const w=window.__game.main().mcWorld,h=w._LanGrowthHud;
   return {stage:w.mScreenSize.x,left:h._Player0._x,right:h._Player1._x,center:h._Wave._x,
    score:h._Player0._Score.text,head:Object.values(w.mHud.mcPlayers).filter(Boolean).map(p=>({x:p._x,y:p._y,level:p._PersonalLevel?.text,visible:p._visible})),
    fields:[h._Player0._Score,h._Player1._Score].map(t=>({width:t._width,textWidth:t.textWidth}))};
  });
  assert.equal(geo.left,geo.stage-geo.right-210);assert(geo.center>=geo.left+222);
  assert(geo.right>=geo.center+124);assert(geo.fields.every(f=>f.textWidth<=f.width));
  assert(geo.head.every(p=>p.level==null),'levels belong only in the top HUD');
  report.geometry.push({width,height,...geo});await shot(`max-${width}x${height}`);
  if(width===640&&height===480){
   const png=PNG.sync.read(readFileSync(`${out}/max-640x480.png`));
   const green=(x,y)=>{const n=(y*png.width+x)*4;return png.data[n]===0&&png.data[n+1]===200&&png.data[n+2]===0;};
   let left=0,right=0;
   for(let y=43;y<47;y++){
    for(let x=20;x<214;x++)if(green(x,y))left++;
    for(let x=426;x<543;x++)if(green(x,y))right++;
    for(let x=550;x<620;x++)assert(!green(x,y),'3/5 XP must not fill the remaining track');
   }
   assert(left>=300&&right>=180,'pixel fill must match MAX and 3/5 XP');
   report.pixels={maxGreen:left,partialGreen:right};
  }
 }
 await g.page.setViewportSize({width:960,height:720});await g.page.waitForTimeout(750);
 await g.eval(()=>window.__game.main().mcWorld.mHud.Pause(true));
 await g.page.waitForTimeout(750);await shot('personal-upgrades');
 report.errors=await g.expr('g.errors');assert.deepEqual(report.errors,[]);
 assert.deepEqual(g.log,[]);report.ok=true;
}finally{
 writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await browser.close();
}
console.log('GROWTH UI PASSED');
