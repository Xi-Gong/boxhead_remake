// Serial alternating runs: no concurrent CPU-heavy work during this measurement.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd(), out = path.join(root,'generated/reports/netcode/compare-60ms');
mkdirSync(out,{recursive:true});
const asar = path.join(root,'release/win-unpacked/resources/app.asar');
const runs=[];
const machine={node:process.version,os:os.version(),cpu:os.cpus()[0]?.model,asarSha256:createHash('sha256').update(readFileSync(asar)).digest('hex')};
if(existsSync(path.join(out,'machine.json'))&&JSON.parse(readFileSync(path.join(out,'machine.json'),'utf8')).asarSha256!==machine.asarSha256)throw new Error('comparison build changed');
writeFileSync(path.join(out,'machine.json'),JSON.stringify(machine,null,2));
for(let repetition=1;repetition<=3;repetition++)for(const mode of ['legacy','rollback-v2']){
  const dir=path.join(out,`${repetition}-${mode}`);mkdirSync(dir,{recursive:true});
  const saved=path.join(dir,'net_smooth_report.json');
  if(existsSync(saved)){
    const report=JSON.parse(readFileSync(saved,'utf8'));
    if(report.ok&&report.netcode===mode&&Object.values(report.probes??{}).every(p=>!p.skipped&&p.simAtMs!=null)){
      console.log(`REUSING VERIFIED RUN ${repetition} ${mode}`);
      runs.push({repetition,mode,environment:report.environment,probes:report.probes,performance:report.performance});continue;
    }
  }
  console.log(`COMPARISON ${repetition}/3 ${mode}`);
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tests/sim/playtest.netsmooth.mjs','30'],{cwd:root,windowsHide:true,
      stdio:'inherit',env:{...process.env,BOXHEAD_NETCODE:mode,BOXHEAD_NET_WINDOW_MS:'20000'}});
    child.once('error',reject);child.once('exit',resolve);
  });
  for(const entry of readdirSync('generated/reports/qa',{withFileTypes:true}).filter(e=>e.isFile()&&e.name.startsWith('net_smooth')))cpSync(path.join('generated/reports/qa',entry.name),path.join(dir,entry.name));
  const report=JSON.parse(readFileSync(path.join(dir,'net_smooth_report.json'),'utf8'));
  if(code!==0||!report.ok||Object.values(report.probes??{}).some(p=>p.skipped||p.simAtMs==null))throw new Error(`invalid comparison run ${repetition} ${mode}`);
  runs.push({repetition,mode,environment:report.environment,probes:report.probes,performance:report.performance});
  writeFileSync(path.join(out,'runs.json'),JSON.stringify(runs,null,2));
}
console.log('ALL SIX COMPARISON RUNS PASSED');
