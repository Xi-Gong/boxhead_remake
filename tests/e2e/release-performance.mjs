// Functional-release comparison: report costs and benefits without claiming a speedup.
// The historical v0.2.8 optimization gates remain in growth-compare.mjs unchanged.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,cpSync,createWriteStream,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// User revoked background heavy QA while working. Never opt in on the user's behalf.
if(process.env.BOXHEAD_QA_HEAVY_AUTHORIZED!=='1')throw new Error('Heavy QA is disabled: obtain fresh explicit user authorization before enabling BOXHEAD_QA_HEAVY_AUTHORIZED=1. No test process was launched.');
const version=JSON.parse(readFileSync('package.json')).version,out=path.resolve(`generated/reports/v${version.replaceAll('.','')}/performance`);mkdirSync(out,{recursive:true});
const exes={baseline:path.resolve('generated/baseline-v028/win-unpacked/Boxhead 2Play Rooms.exe'),candidate:path.resolve('release/win-unpacked/Boxhead 2Play Rooms.exe')};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const machine={version,cpu:os.cpus()[0].model,os:os.version(),node:process.version,
 builds:Object.fromEntries(Object.entries(exes).map(([kind,exe])=>[kind,{exe,asarSha256:sha(path.join(path.dirname(exe),'resources/app.asar'))}])),
 harnessSha256:sha('tests/sim/playtest.netsmooth.mjs'),metricsSha256:sha('tests/e2e/perf-metrics.mjs'),portIsolationSha256:sha('tests/e2e/lan-isolation.mjs'),comparisonSha256:sha(import.meta.filename),
 qaPorts:{discovery:48630,tcp:[48631,48640]},
 warmupMs:3000,sampleMs:20000,oneWayDelayMs:30,allocationSamplingInterval:4194304,
 seed:(.424242*2**32)>>>0,inputSchedule:'Both roles alternate horizontal steering for 400 ms, then release for 100 ms; fire during each steering segment. Wall-clock input schedule, with actual tick cadence retained per run.',
 acceptance:'Complete common-confirmed gameplay/events, bounded stalls/resources, input <=60 ms ordinary or <=100 ms explosive. Relative changes are reported, not presumed improvements.'};
const identity=JSON.stringify(machine),runs=[];
writeFileSync(path.join(out,'machine.json'),JSON.stringify(machine,null,2));
const workloads=[{name:'ordinary',explosions:0,supplies:0},{name:'burst-and-200-permanent-supplies',explosions:256,supplies:200}];
for(const workload of workloads)for(let round=1;round<=3;round++)for(const kind of ['baseline','candidate']){
 const name=`${workload.name}/${round}-${kind}`,dir=path.join(out,name);mkdirSync(dir,{recursive:true});console.log('PERFORMANCE '+name);
 const saved=path.join(dir,'identity.json'),reportPath=path.join(dir,'net_smooth_report.json');
 if(existsSync(saved)&&readFileSync(saved,'utf8')===identity&&existsSync(reportPath)){
  const previous=JSON.parse(readFileSync(reportPath));
  if(kind==='candidate'&&!previous.ok)throw new Error('recorded candidate failure requires investigation, not resampling: '+name);
  if(previous.performance&&previous.probes&&previous.confirmed){runs.push({kind,round,workload:workload.name,report:previous});continue;}
 }
 const log=createWriteStream(path.join(dir,'run.log'));
 const code=await new Promise((resolve,reject)=>{
  const env={...process.env,BOXHEAD_QA_HIDDEN:'1',BOXHEAD_QA_EXE:exes[kind],BOXHEAD_NETCODE:'rollback-v2',BOXHEAD_NET_COMBAT:'1',BOXHEAD_NET_WINDOW_MS:'20000',BOXHEAD_NET_EXPLOSIONS:String(workload.explosions),
   BOXHEAD_NET_SUPPLY_STRESS:String(workload.supplies),BOXHEAD_NET_ALLOCATION_INTERVAL:'4194304',BOXHEAD_NET_PROBE_PHASES:'1',BOXHEAD_CLIENT_FIRST:round===2?'1':'0',
   BOXHEAD_ALL_RESPONSE:'0',BOXHEAD_RESPONSE_TRACE:'0',BOXHEAD_NET_RECOVERY:'0',BOXHEAD_QA_TCP_ONLY:'0',BOXHEAD_QA_JITTER:'0'};
  delete env.BOXHEAD_RENDER_GAP_ROLE;
  const p=spawn(process.execPath,['tests/sim/playtest.netsmooth.mjs','30'],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  p.stdout.pipe(log,{end:false});p.stderr.pipe(log,{end:false});p.once('error',reject);p.once('exit',resolve);
 });
 await new Promise(r=>log.end(r));
 for(const file of readdirSync('generated/reports/qa').filter(n=>n.startsWith('net_smooth')&&/\.(json|png)$/.test(n)))cpSync(path.join('generated/reports/qa',file),path.join(dir,file));
 writeFileSync(saved,identity);const report=JSON.parse(readFileSync(reportPath));
 // A recorded baseline failure is evidence, never a candidate pass or a silently discarded run.
 if(!report.performance||!report.probes||!report.confirmed)throw new Error('incomplete measurement '+name+': '+report.errors.join(' | '));
 if(kind==='candidate'&&(code!==0||!report.ok))throw new Error('candidate gate failed '+name+': '+report.errors.join(' | '));
 runs.push({kind,round,workload:workload.name,report});
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
const summaries=[];
const geometries=runs.map(({report:r})=>JSON.stringify([r.environment.width,r.environment.height,r.environment.dpr,r.environment.canvas]));
if(new Set(geometries).size!==1)throw new Error('matched performance runs used different rendering geometry');
machine.renderGeometry=JSON.parse(geometries[0]);
for(const workload of workloads)for(const role of ['host','client']){
 const row={workload:workload.name,role};
 for(const kind of ['baseline','candidate']){
  const selected=runs.filter(r=>r.kind===kind&&r.workload===workload.name);
  const raw=selected.map(({round,report:r})=>{const p=r.performance[role];return {round,ok:r.ok,errors:r.errors,environment:r.environment,
   p50:p.frameP50,p95:p.frameP95,tail:Math.max(...p.frames),intervalP50:percentile(p.intervals,.5),intervalP95:percentile(p.intervals,.95),intervalTail:Math.max(...p.intervals),
   allocationBytesPerSecond:p.estimatedAllocatedBytes/p.elapsedMs*1000,heapAfterGC:p.heapAfterGC,heapBefore:p.heapBefore,heapAfter:p.heapAfter,collectionMs:p.collectionElapsedMs,
   busyRatio:p.taskMs/p.elapsedMs,objects:p.objects,disposedBitmapRefs:p.disposedBitmapRefs,inputMax:r.probes[role].simAtMs,
   lateStalls:r.samples.at(-1)[role].stallCount-r.samples[Math.floor(r.samples.length/2)][role].stallCount,permanentSupplies:r.permanentSupplies};});
  row[kind]={raw,median:Object.fromEntries(['p50','p95','tail','intervalP50','intervalP95','intervalTail','allocationBytesPerSecond','heapAfterGC','heapBefore','heapAfter','collectionMs','busyRatio','objects','inputMax','lateStalls'].map(key=>[key,median(raw.map(r=>r[key]))]))};
 }
 row.deltaPercent=Object.fromEntries(Object.keys(row.baseline.median).map(key=>[key,row.baseline.median[key]?(row.candidate.median[key]/row.baseline.median[key]-1)*100:null]));summaries.push(row);
}
writeFileSync(path.join(out,'summary.json'),JSON.stringify({ok:true,machine,summaries,baselineFailures:runs.filter(r=>r.kind==='baseline'&&!r.report.ok).map(r=>({round:r.round,workload:r.workload,errors:r.report.errors}))},null,2));
console.log('TWELVE MATCHED PERFORMANCE RUNS COMPLETE; CANDIDATE RESPONSE/CORRECTNESS GATES PASSED');
