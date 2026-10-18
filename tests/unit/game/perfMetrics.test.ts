import {expect,it} from 'vitest';
import {startMetrics} from '../../e2e/perf-metrics.mjs';

it('freezes both peer samples before post-window collection and exports each sampler only once',async()=>{
 const calls:string[]=[];
 const page=(name:string)=>{
  let evaluations=0;
  const cdp={async send(method:string){calls.push(name+':'+method);
   if(method==='Performance.getMetrics')return{metrics:[{name:'TaskDuration',value:1},{name:'ScriptDuration',value:1},{name:'JSHeapUsedSize',value:100},{name:'Nodes',value:2}]};
   if(method==='HeapProfiler.stopSampling')return{profile:{head:{selfSize:10,children:[]},samples:[]}};
   return{};
  },async detach(){calls.push(name+':detach');}};
  return{context:()=>({newCDPSession:async()=>cdp}),async evaluate(){return ++evaluations===1?undefined:{frames:[1],details:[],intervals:[8],disposedBitmapRefs:0};}};
 };
 const host=await startMetrics(page('host')),client=await startMetrics(page('client'));calls.length=0;
 await Promise.all([host.freeze(),client.freeze(),host.freeze()]);
 expect(calls.filter(c=>c.endsWith('HeapProfiler.stopSampling'))).toHaveLength(2);
 expect(calls.some(c=>c.endsWith('HeapProfiler.collectGarbage'))).toBe(false);
 const results=await Promise.all([host(),client()]);
 expect(Math.max(...results.map(r=>r.sampleEndedAt))).toBeLessThanOrEqual(Math.min(...results.map(r=>r.collectionStartedAt)));
 await host();expect(calls.filter(c=>c.endsWith('HeapProfiler.collectGarbage'))).toHaveLength(2);
});
