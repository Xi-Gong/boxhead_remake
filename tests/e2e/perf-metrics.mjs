// Renderer work measured through the real Player methods, with CDP CPU/heap metrics outside the sample window.
export async function startMetrics(page) {
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const before=await metrics(),started=Date.now();
 await page.evaluate(()=>{
  const p=window.__game.player,ef=p.enterFrame,render=p.render;
  const world=window.__game.main()?.mcWorld,draw=world?.Draw,ownDraw=world&&Object.getOwnPropertyDescriptor(world,'Draw');
  const state={frames:[],intervals:[],lastFrame:0,pending:0,inEF:false,ef,render,world,draw,ownDraw};window.__releasePerf=state;
  p.enterFrame=function(...args){const t=performance.now();state.inEF=true;try{return ef.apply(this,args);}finally{state.inEF=false;state.pending+=performance.now()-t;}};
  if(world&&draw)world.Draw=function(...args){const t=performance.now();try{return draw.apply(this,args);}finally{if(!state.inEF)state.pending+=performance.now()-t;}};
  p.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{state.frames.push(state.pending+performance.now()-t);state.pending=0;if(state.lastFrame)state.intervals.push(t-state.lastFrame);state.lastFrame=t;}};
 });
 return async()=>{
  const after=await metrics();const elapsedMs=Date.now()-started;
  const result=await page.evaluate(()=>{
   const s=window.__releasePerf,p=window.__game.player;p.enterFrame=s.ef;p.render=s.render;delete window.__releasePerf;
   if(s.world){if(s.ownDraw)Object.defineProperty(s.world,'Draw',s.ownDraw);else delete s.world.Draw;}
   const values=[...s.frames].sort((a,b)=>a-b),percent=q=>values[Math.min(values.length-1,Math.floor(values.length*q))]??0;
   const stack=[p.root];let objects=0,filterCaches=0,filterPixels=0,fontEntries=0,disposedBitmapRefs=0;
   while(stack.length){const o=stack.pop();objects++;if(o.$list)stack.push(...o.$list);const c=o.$fcache;
    if(c?.valid&&c.canvas){filterCaches++;filterPixels+=c.canvas.width*c.canvas.height;}
    fontEntries+=o.$fontCache?.size??0;if(o.$bmd?.disposed)disposedBitmapRefs++;
   }
   return {frames:s.frames,intervals:s.intervals,frameP50:percent(.5),frameP95:percent(.95),objects,filterCaches,filterPixels,fontEntries,disposedBitmapRefs,domInputs:document.querySelectorAll('input').length};
  });
  if (!result.frames.length || result.disposedBitmapRefs) throw new Error('invalid LAN frame/resource sample');
  await cdp.detach();return {...result,elapsedMs,taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,
   heapBefore:before.JSHeapUsedSize,heapAfter:after.JSHeapUsedSize,nodesBefore:before.Nodes,nodesAfter:after.Nodes};
 };
}
