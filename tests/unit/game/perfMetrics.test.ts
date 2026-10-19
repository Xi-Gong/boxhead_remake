import {afterEach,expect,it,vi} from 'vitest';
import {startMetrics} from '../../e2e/perf-metrics.mjs';
afterEach(()=>vi.unstubAllEnvs());

it('freezes both peer samples before post-window collection and exports each sampler only once',async()=>{
 vi.stubEnv('BOXHEAD_QA_FUNCTIONAL_ONLY','0'); // This page is entirely mocked; no browser or profiler starts.
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
it('functional-only acceptance never opens CDP or starts a profiler',async()=>{
 vi.stubEnv('BOXHEAD_QA_FUNCTIONAL_ONLY','1');
 const page={context(){throw new Error('functional-only QA must not open CDP');}};
 const finish=await startMetrics(page);await finish.freeze();expect(await finish()).toEqual({status:'not-collected',reason:'Functional-only QA; no performance claim'});
});
