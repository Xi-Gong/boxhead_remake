// Serialized baseline/candidate comparisons: the same packaged LAN movement load, alternating three rounds.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=process.cwd(),version=JSON.parse(readFileSync('package.json')).version;
const out=path.resolve(process.env.BOXHEAD_GROWTH_COMPARE_OUT??`generated/reports/v${version.replaceAll('.','')}/performance-final`);mkdirSync(out,{recursive:true});
const exes={baseline:path.resolve(process.env.BOXHEAD_GROWTH_BASELINE_EXE??'generated/baseline-v027/win-unpacked/Boxhead 2Play Rooms.exe'),
 candidate:path.resolve(process.env.BOXHEAD_GROWTH_CANDIDATE_EXE??'release/win-unpacked/Boxhead 2Play Rooms.exe')};
const phaseCoverage=process.env.BOXHEAD_NET_PROBE_PHASES==='1';
const sha=exe=>createHash('sha256').update(readFileSync(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex');
const machine={node:process.version,os:os.version(),cpu:os.cpus()[0]?.model,cpus:os.cpus().length,
 builds:Object.fromEntries(Object.entries(exes).map(([k,e])=>[k,{exe:e,asarSha256:sha(e)}])),
 workload:'3s warmup, 20s steering/fire; 256 mixed explosives at max upgrades every 100 ticks from tick 200; 30ms one-way delay; seed 0.424242',
 samplingInterval:4194304,metricsVersion:3,inputProbeVersion:phaseCoverage?2:1,
 inputProbePhases:phaseCoverage?['free',0,10,20,30]:['free'],
 acceptance:{version:2,normalInputMaxMs:60,explosiveInputMaxMs:100,
  basis:'User requested practical latency criteria on 2026-10-18; retain frame/resource and correctness gates.'}};
const machineFile=path.join(out,'machine.json');
if(existsSync(machineFile)){
 const old=JSON.parse(readFileSync(machineFile));
 if((old.inputProbeVersion??1)!==machine.inputProbeVersion||old.metricsVersion!==machine.metricsVersion||old.samplingInterval!==machine.samplingInterval||Object.keys(exes).some(kind=>old.builds[kind].asarSha256!==machine.builds[kind].asarSha256))throw new Error('comparison configuration changed; use a fresh output directory');
}
writeFileSync(machineFile,JSON.stringify(machine,null,2));
const runs=[];
const complete=report=>(report.inputProbeVersion??1)===machine.inputProbeVersion&&report.performance&&Object.values(report.probes??{}).length===2&&Object.values(report.probes).every(p=>!p.skipped&&p.simAtMs!=null&&(!phaseCoverage||p.samples?.length===5));
const usable=(kind,report)=>complete(report)&&(report.ok||kind==='baseline'&&report.errors.every(e=>/probe:|simulation response|sustained stall/.test(e)));
for(let repetition=1;repetition<=3;repetition++)for(const kind of ['baseline','candidate']){
 console.log(`GROWTH PERFORMANCE ${repetition}/3 ${kind}`);
 const dir=path.join(out,`${repetition}-${kind}`),saved=path.join(dir,'net_smooth_report.json');
 if(existsSync(saved)){
  const report=JSON.parse(readFileSync(saved));
  if(usable(kind,report)){
   console.log(report.ok?'REUSING VERIFIED RUN':'REUSING RECORDED BASELINE PERFORMANCE FAILURE');runs.push({repetition,kind,report});continue;
  }
 }
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['tests/sim/playtest.netsmooth.mjs','30'],{cwd:root,windowsHide:true,stdio:'inherit',
   env:{...process.env,BOXHEAD_QA_EXE:exes[kind],BOXHEAD_NETCODE:'rollback-v2',BOXHEAD_NET_WINDOW_MS:'20000',BOXHEAD_NET_COMBAT:'1',BOXHEAD_NET_RECOVERY:'0',BOXHEAD_NET_EXPLOSIONS:'256',BOXHEAD_NET_PROBE_PHASES:phaseCoverage?'1':'0',BOXHEAD_NET_ALLOCATION_INTERVAL:String(machine.samplingInterval)}});
  child.once('error',reject);child.once('exit',resolve);
 });
 mkdirSync(dir,{recursive:true});
 for(const entry of readdirSync('generated/reports/qa',{withFileTypes:true}).filter(e=>e.isFile()&&e.name.startsWith('net_smooth')))cpSync(path.join('generated/reports/qa',entry.name),path.join(dir,entry.name));
 const report=JSON.parse(readFileSync(path.join(dir,'net_smooth_report.json')));
 if(!usable(kind,report)||kind==='candidate'&&code!==0)throw new Error(`invalid ${repetition} ${kind}`);
 if(!report.ok)console.log('BASELINE PERFORMANCE ASSERTION FAILED (retained): '+report.errors.join(' | '));
 if(sha(exes[kind])!==machine.builds[kind].asarSha256)throw new Error('build changed during comparison');
 runs.push({repetition,kind,report});writeFileSync(path.join(out,'runs.json'),JSON.stringify(runs,null,2));
}
const median=a=>{a=[...a].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const summary={ok:true,machine,baselineFailures:runs.filter(r=>r.kind==='baseline'&&!r.report.ok).map(r=>({repetition:r.repetition,errors:r.report.errors})),roles:{}};
for(const role of ['host','client']){
 const values={};
 for(const kind of ['baseline','candidate']){
  const data=runs.filter(r=>r.kind===kind).map(r=>r.report),perf=data.map(r=>r.performance[role]);
  values[kind]={frameP50:median(perf.map(p=>p.frameP50)),frameP95:median(perf.map(p=>p.frameP95)),
   busyRatio:median(perf.map(p=>p.taskMs/p.elapsedMs)),allocationBytesPerSecond:median(perf.map(p=>p.estimatedAllocatedBytes/p.elapsedMs*1000)),
   heapAfterGC:median(perf.map(p=>p.heapAfterGC)),inputProbeMax:Math.max(...data.map(r=>r.probes[role].simAtMs)),
   maxWork:median(perf.map(p=>Math.max(...p.frames))),maxInterval:median(perf.map(p=>Math.max(...p.intervals))),
   disposedBitmapRefs:perf.map(p=>p.disposedBitmapRefs),objects:perf.map(p=>p.objects),filterPixels:perf.map(p=>p.filterPixels)};
 }
 const b=values.baseline,c=values.candidate;
 const gates={frameP95:c.frameP95<=b.frameP95+Math.max(.5,b.frameP95*.1),
  input:c.inputProbeMax<=machine.acceptance.explosiveInputMaxMs,
  burstTail:c.maxWork<=b.maxWork&&c.maxInterval<=b.maxInterval,
  cpu:c.busyRatio<=b.busyRatio*1.15,allocation:c.allocationBytesPerSecond<=b.allocationBytesPerSecond*1.15,
  heap:c.heapAfterGC<=b.heapAfterGC+Math.max(4*1024*1024,b.heapAfterGC*.1),resources:c.disposedBitmapRefs.every(n=>n===0)};
 summary.roles[role]={...values,gates};summary.ok&&=Object.values(gates).every(Boolean);
}
writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary.roles,null,2));
if(!summary.ok)throw new Error('growth performance gate failed; inspect the raw paired runs');
console.log('GROWTH PERFORMANCE COMPARISON PASSED');
