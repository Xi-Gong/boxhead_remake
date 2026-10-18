// Serial actual-process acceptance; latency values are injected ONE WAY, not zero physical latency claims.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,cpSync,createWriteStream,existsSync} from 'node:fs';
import path from 'node:path';
const version=JSON.parse(readFileSync('package.json')).version,out=path.resolve(`generated/reports/v${version.replaceAll('.','')}/network`);
mkdirSync(out,{recursive:true});
const hash=createHash('sha256').update(readFileSync('release/win-unpacked/resources/app.asar')).digest('hex');
const harnessSha256=createHash('sha256').update(readFileSync('tests/sim/playtest.netsmooth.mjs')).update(readFileSync('tests/e2e/response-probes.mjs')).digest('hex');
const report={version,asarSha256:hash,harnessSha256,cases:[],ok:false};
const cases=[... [0,30,60,100].flatMap(delay=>[false,true].map(clientFirst=>({delay,clientFirst}))),
 {delay:30,clientFirst:true,jitter:20,tcpOnly:true,recovery:true,gapRole:0},
 {delay:100,clientFirst:false,jitter:20,recovery:true,gapRole:1}];
const selected=process.argv.includes('--faults-only')?cases.filter(c=>c.jitter):cases;
report.selectedCases=selected.length;
try{
 for(const config of selected){
  const name=`${config.delay}ms-${config.clientFirst?'client-first':'host-first'}${config.jitter?'-faults-'+(config.tcpOnly?'tcp':'udp'):''}`,dir=path.join(out,name);
  mkdirSync(dir,{recursive:true});const saved=path.join(dir,'identity.json');
  if(existsSync(saved)&&JSON.parse(readFileSync(saved)).asarSha256===hash&&JSON.parse(readFileSync(saved)).harnessSha256===harnessSha256){
   const previous=JSON.parse(readFileSync(path.join(dir,'net_smooth_report.json')));
   if(previous.ok&&previous.actionResponses){report.cases.push({name,config,ok:true,reused:true});continue;}
  }
  console.log('RESPONSE '+name);const log=createWriteStream(path.join(dir,'run.log'));
  const code=await new Promise((resolve,reject)=>{
   const env={...process.env,BOXHEAD_QA_HIDDEN:'1',BOXHEAD_NETCODE:'rollback-v2',BOXHEAD_ALL_RESPONSE:'1',BOXHEAD_RESPONSE_TRACE:'1',BOXHEAD_NET_PROBE_PHASES:'1',BOXHEAD_NET_ALLOCATION_INTERVAL:'4194304',
    BOXHEAD_CLIENT_FIRST:config.clientFirst?'1':'0',BOXHEAD_QA_JITTER:String(config.jitter??0),BOXHEAD_QA_TCP_ONLY:config.tcpOnly?'1':'0',BOXHEAD_NET_RECOVERY:config.recovery?'1':'0'};
   delete env.BOXHEAD_NET_EXPLOSIONS;delete env.BOXHEAD_NET_SUPPLY_STRESS;delete env.BOXHEAD_RENDER_GAP_ROLE;
   if(config.gapRole!==undefined)env.BOXHEAD_RENDER_GAP_ROLE=String(config.gapRole);
   const p=spawn(process.execPath,['tests/sim/playtest.netsmooth.mjs',String(config.delay)],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
   p.stdout.pipe(log,{end:false});p.stderr.pipe(log,{end:false});p.once('error',reject);p.once('exit',resolve);
  });
  await new Promise(r=>log.end(r));
  for(const file of readdirSync('generated/reports/qa').filter(n=>n.startsWith('net_smooth')&&/\.(json|png)$/.test(n)))cpSync(path.join('generated/reports/qa',file),path.join(dir,file));
  const result=JSON.parse(readFileSync(path.join(dir,'net_smooth_report.json')));writeFileSync(saved,JSON.stringify({asarSha256:hash,harnessSha256,config},null,2));
  report.cases.push({name,config,ok:code===0&&result.ok});writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(code!==0||!result.ok)throw new Error(name+': '+result.errors.join(' | '));
 }
 report.ok=true;
}finally{writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(`RESPONSE MATRIX PASSED (${selected.length} selected cases)`);
