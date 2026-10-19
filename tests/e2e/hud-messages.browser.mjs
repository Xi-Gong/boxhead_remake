import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v030/hud-messages';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,cases:[],shots:[]};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 await g.eval(()=>{
  const G=window.__game,P=G.pkg,w=G.main().mcWorld,h=w.mHud;
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const t of Object.values(w.mThing_Collection.mThings))if(t._CLASSID_.includes('Creature_')&&!t._CLASSID_.endsWith('Player'))t.Delete();
  const q=window.__messageQA={samples:[],labels:new WeakMap()},render=P.World.CHud.RenderMovieClipAsBitmapObject,draw=h.DrawBMObject;
  P.World.CHud.RenderMovieClipAsBitmapObject=function(mc,...args){const bm=render.call(this,mc,...args);if(mc===P.World.CHud.mcMessage)q.labels.set(bm,mc.tfMessage.text);return bm;};
  h.DrawBMObject=function(bm,p,alpha){const text=q.labels.get(bm);if(text)q.samples.push({text,at:performance.now(),x:p.x,y:p.y,alpha,bounds:{x:p.x+bm.mDisp.x,y:p.y+bm.mDisp.y,w:bm.sBMD.width,h:bm.sBMD.height}});return draw.call(this,bm,p,alpha);};
 });
 await g.page.waitForTimeout(3100);
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(700);
  await g.eval(()=>{const h=window.__game.main().mcWorld.mHud;window.__messageQA.samples=[];h.AddMessage_Info('All ammo full!',0);});
  await g.page.waitForTimeout(250);
  await g.eval(()=>window.__game.main().mcWorld.mHud.AddMessage_Info('Rocket Launcher ammo full!',1));
  await g.page.waitForTimeout(250);
  await g.eval(()=>window.__game.main().mcWorld.mHud.AddMessage_Info('Health full!',0));
  await g.page.waitForTimeout(750); // local gameplay draws at 25Hz; collect >10 real samples for the newest row.
  const file=`${out}/${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const rows=await g.eval(()=>{
   const q=window.__messageQA,w=window.__game.main().mcWorld,p=window.__game.platform.presenter,r=p.canvas.getBoundingClientRect();
   return {samples:q.samples,screen:{x:w.mScreenSize.x,y:w.mScreenSize.y},canvas:{x:r.x,y:r.y},scale:r.width/p.stageW};
  });
  const last=[...new Map(rows.samples.map(r=>[r.text,r])).values()];assert.equal(last.length,3);
  assert.deepEqual(last.map(r=>r.text),['P1: All ammo full!','P2: Rocket Launcher ammo full!','P1: Health full!']);
  assert(Math.abs(last[1].y-last[0].y-22)<.01&&Math.abs(last[2].y-last[1].y-22)<.01);
  for(const text of last.map(r=>r.text)){
   const samples=rows.samples.filter(r=>r.text===text);assert(samples.length>10);
   for(let n=1;n<samples.length;n++)assert(samples[n].y<=samples[n-1].y+.01,'message cannot jitter downwards');
  }
  const png=PNG.sync.read(readFileSync(file));
  for(const row of last){
   assert(row.bounds.x>=0&&row.bounds.x+row.bounds.w<=rows.screen.x);
   assert(row.bounds.y>=0&&row.bounds.y+row.bounds.h<=rows.screen.y);
   let white=0;
   const b=row.bounds,x0=rows.canvas.x+b.x*rows.scale,y0=rows.canvas.y+b.y*rows.scale;
   for(let y=Math.max(0,Math.ceil(y0));y<Math.min(height,y0+b.h*rows.scale);y++)for(let x=Math.max(0,Math.ceil(x0));x<Math.min(width,x0+b.w*rows.scale);x++){
    const i=(y*png.width+x)*4;if(png.data[i]>240&&png.data[i+1]>240&&png.data[i+2]>240)white++;
   }
   assert(white>10,'each authored white message must have visible pixels');
  }
  report.cases.push({width,height,last,samples:rows.samples.length});
  await g.page.waitForTimeout(3100);
 }
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('HUD MESSAGES UI PASSED');
