// Compare the actual production scheduling code with the v0.2.5 implementation; no game timing changes allowed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
const path = 'src/engine/platform/Loop.ts';
async function load(source) {
  const body = 'const EF_MS=20, MAX_EF_PER_RAF=4, MAX_SAMPLE_MS=250, SAMPLES=9, DEFAULT_INTERVAL=1000/60;\n' + source.slice(source.indexOf('export class FrameScheduler'), source.indexOf('export interface LoopPlayer'));
  const { outputText } = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))).FrameScheduler;
}
const old = await load(execFileSync('git', ['show', 'v0.2.5:' + path], { encoding: 'utf8' }));
const current = await load(readFileSync(path, 'utf8'));
const stamps = new Float64Array(240000);
let now = 0;
for (let i=0;i<stamps.length;i++) {
  now += i % 571 === 0 ? 1000 : [1000/60,1000/144,1000/30,16.2,17.1,0,20][i%7];
  stamps[i]=now;
}
const a=new old(),b=new current();
for (let i=0;i<stamps.length;i++) {
  if (i % 1793 === 0) { a.reset(); b.reset(); }
  assert.deepEqual(b.plan(stamps[i]),a.plan(stamps[i]),'scheduled EF sequence at ' + i);
  assert.equal(b.rafInterval,a.rafInterval);
  assert.equal(b.maxPerRaf,a.maxPerRaf);
}
function run(C) {
  const s=new C();let count=0;
  const start=performance.now();
  for (const t of stamps) count+=s.plan(t).length;
  return { ms: performance.now()-start, count };
}
run(old);run(current);
const baseline=[],candidate=[];
for(let n=0;n<3;n++) { baseline.push(run(old));candidate.push(run(current)); }
const median=r=>r.map(x=>x.ms).sort((a,b)=>a-b)[1];
const result={ samples:stamps.length,equivalent:true,baseline,candidate,medianMs:{baseline:median(baseline),candidate:median(candidate)},speedup:median(baseline)/median(candidate),removedMedianArraysPerPlan:1 };
mkdirSync('generated/reports/v026',{recursive:true});
writeFileSync('generated/reports/v026/scheduler-perf.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
