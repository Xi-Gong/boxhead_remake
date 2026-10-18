// Same live world and traversal order; alternate the committed/candidate snapshot captures.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {Session} from 'node:inspector';
import { createHeadlessGame } from '../tests/sim/harness.ts';
import { explosionBurst } from '../tests/sim/explosionFixture.ts';
import * as candidate from '../src/game/local/Net/WorldSnap.ts';
mkdirSync('generated/reports/v028',{recursive:true});
const baselineRef=process.env.BOXHEAD_SNAPSHOT_BASELINE??'202b0aa';
const before=execFileSync('git',['show',baselineRef+':src/game/local/Net/WorldSnap.ts'],{encoding:'utf8'})
  .replaceAll('../../../engine/','../src/engine/').replaceAll('../../packages.ts','../src/game/packages.ts');
writeFileSync('generated/snap-before.ts',before);
const baseline=await import(pathToFileURL(resolve('generated/snap-before.ts')).href);
const game=createHeadlessGame({mode:'Coop',room:1}),world=game.world();
explosionBurst(world,256);game.tick(5);
const implementations={baseline,candidate},contexts=Object.fromEntries(Object.entries(implementations).map(([k,v])=>[k,v.makeSnapCtx(world)]));
const expected=JSON.stringify(baseline.captureWorldSnap(world,contexts.baseline,false));
for(const [kind,impl] of Object.entries(implementations))for(let n=0;n<20;n++)impl.captureWorldSnap(world,contexts[kind],false);
const runs=[];
const profiler=process.env.BOXHEAD_SNAPSHOT_PROFILE==='1'?new Session():undefined;profiler?.connect();
const send=(method,params={})=>new Promise((resolve,reject)=>profiler.post(method,params,(error,result)=>error?reject(error):resolve(result)));
for(let round=1;round<=3;round++)for(const [kind,impl] of Object.entries(implementations)){
  globalThis.gc?.();if(profiler)await send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  const start=performance.now();let snap;
  for(let n=0;n<100;n++)snap=impl.captureWorldSnap(world,contexts[kind],false);
  const ms=performance.now()-start;
  if(JSON.stringify(snap)!==expected)throw new Error('snapshot format/order changed');
  let allocatedBytes;
  if(profiler){const {profile}=await send('HeapProfiler.stopSampling');allocatedBytes=0;const stack=[profile.head];while(stack.length){const node=stack.pop();allocatedBytes+=node.selfSize;stack.push(...node.children);}}
  runs.push({round,kind,iterations:100,ms,things:Object.keys(snap.things).length,...(profiler?{allocatedBytes}: {})});
}
profiler?.disconnect();
writeFileSync(process.env.BOXHEAD_SNAPSHOT_OUT??'generated/reports/v028/snapshot-methods-paired.json',JSON.stringify({node:process.version,baselineRef,profiled:!!profiler,runs},null,2));
console.log(JSON.stringify(runs));game.quit();
