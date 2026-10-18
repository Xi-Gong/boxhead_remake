// Real Canvas pressure gate with deterministic transport. TCP/UDP equivalence is verified independently.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
import {explosionBurst} from '../sim/explosionFixture.ts';
const out=process.env.BOXHEAD_EXPLOSION_OUT??'generated/reports/v028/explosions-browser';mkdirSync(out,{recursive:true});
const browser=await launch(),reports=[];
try{
 for(const count of process.env.BOXHEAD_EXPLOSION_COUNT?[Number(process.env.BOXHEAD_EXPLOSION_COUNT)]:[32,64,128,256]){
  const g=await openGame(browser,{viewport:{width:960,height:720},init:()=>{
   const q=window.__pressure={};window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
    onHosts(){},onPeer(){},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},hostSetStatus(){},shutdown(){},addresses:async()=>[],
    send(m){if(m.t==='in')setTimeout(()=>q.message({t:'in',tick:m.tick,bits:0}),0);}}};
  }});
  try{
   await toMainMenu(g);
   await g.eval(async()=>{
    await window.__game.__setInfiniteLife(true);
    window.__pressure.message({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',inputDelay:0,
     cfg:{progression:'personal-growth-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:3,charP2:0}});
   });
   assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
   await g.page.waitForTimeout(1000);
   const profiler=process.env.BOXHEAD_EXPLOSION_PROFILE?await g.page.context().newCDPSession(g.page):undefined;
   if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
   await g.eval(({source,count})=>{
    const q=window.__pressure,w=window.__game.main().mcWorld,P=window.__game.pkg;
    const burst=new Function('Thing','World','return ('+source+')')(P.Thing,P.World);
    q.frames=[];q.ticks=[];q.intervals=[];q.peak=0;q.start=performance.now();q.last=0;
    const process=w.Process,draw=w.Draw,render=window.__game.player.render;
    w.Process=function(){const at=performance.now();
     if(q.trigger){q.trigger=false;burst(this,count);q.burstAt=performance.now();}
     try{return process.call(this);}finally{q.ticks.push(performance.now()-at);q.peak=Math.max(q.peak,this.mThing_Collection.mThingCounters.CThing_Effect_Explosion??0);}
    };
    w.Draw=function(...args){const at=performance.now();try{return draw.apply(this,args);}finally{q.frames.push(performance.now()-at);}};
    window.__game.player.render=function(...args){const at=performance.now();if(q.last)q.intervals.push(at-q.last);q.last=at;return render.apply(this,args);};
    q.trigger=true;
   },{source:explosionBurst.toString(),count});
   await g.page.waitForTimeout(8000);
   if(profiler){writeFileSync(`${out}/profile-${count}.json`,JSON.stringify((await profiler.send('Profiler.stop')).profile));await profiler.detach();}
   const result=await g.eval(()=>{
    const q=window.__pressure,quant=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]??0;
    return {peakExplosions:q.peak,ticks:q.ticks,draws:q.frames,intervals:q.intervals,
     maxTick:Math.max(...q.ticks),maxDraw:Math.max(...q.frames),maxInterval:Math.max(...q.intervals),
     tickP95:quant(q.ticks,.95),drawP95:quant(q.frames,.95),session:window.__game.lan().session,errors:window.__game.errors};
   });
   await g.shot(`${out}/burst-${count}.png`,false);
   reports.push({count,...result});console.log(JSON.stringify({count,peak:result.peakExplosions,maxTick:result.maxTick,maxDraw:result.maxDraw,maxInterval:result.maxInterval}));
   assert(result.peakExplosions>=count,'the fixture must execute its explosions');assert.equal(result.session,'playing');assert.deepEqual(result.errors,[]);assert.deepEqual(g.log,[]);
  }finally{await g.close();}
 }
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));await browser.close();}
