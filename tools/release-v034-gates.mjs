// Serial functional release gates. Preserve raw failures; no performance or extreme stress switches.
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {extractFile} from '@electron/asar';
const out=resolve(process.env.BOXHEAD_QA_GATE_OUT??'generated/reports/v034/release-gates');mkdirSync(out,{recursive:true});
const version=JSON.parse(readFileSync('package.json','utf8')).version,archive=process.env.BOXHEAD_QA_STAGED_ASAR;if(!archive)throw new Error('Set the freshly staged asar');
if(JSON.parse(extractFile(archive,'package.json')).version!==version)throw new Error('Stale package version');
const identity={version,asarSha256:createHash('sha256').update(readFileSync(archive)).digest('hex')},file=join(out,'report.json');
let report={...identity,ok:false,scope:'Serial hidden low-resolution functional acceptance, with isolated saves/ports; no performance benchmark or extreme stress',cases:[]};
try{const previous=JSON.parse(readFileSync(file,'utf8'));if(previous.asarSha256===identity.asarSha256)report=previous;}catch{}
const cases=[
 ['ui','tests/e2e/ui.browser.mjs'],['audio','tests/e2e/audio.browser.mjs'],['draft-stats','tests/e2e/draft-stats.browser.mjs'],['candidate','tests/e2e/v034-candidate.browser.mjs'],['native-balance','tests/e2e/native-balance.browser.mjs'],
 ['browser','tests/sim/playtest.browser.mjs'],['electron-play','tests/sim/playtest.browser.mjs','--electron'],['packaged-play','tests/sim/playtest.browser.mjs','--packaged'],
 ...['v012','v019','v020','v023','v024','typing','lanui','netretry','net'].map(name=>[name,`tests/sim/playtest.${name}.mjs`]),
 ...[30,60,100].map(delay=>['lan-functional-'+delay,'tests/sim/playtest.netsmooth.mjs',String(delay)]),
 ['electron-smoke','tests/unit/platform/electron-smoke.run.ts'],['packaged-smoke','tests/unit/platform/electron-smoke.run.ts','--packaged-only'],['native','tests/e2e/release-native.electron.mjs'],['old-save','tests/e2e/saveCompatibility.electron.mjs'],['portable','tests/e2e/portable.electron.mjs'],
];
const selected=process.argv.slice(2);if(selected.some(name=>!cases.some(c=>c[0]===name)))throw new Error('Unknown gate');
for(const [name,...args]of cases){
 if(selected.length&&!selected.includes(name))continue;
 if(report.cases.some(c=>c.name===name&&c.code===0)){console.log('REUSE '+name);continue;}
 console.log('START '+name);const started=new Date().toISOString(),attempt=report.cases.filter(c=>c.name===name).length+1,logPath=join(out,`${name}-${attempt}.log`),log=createWriteStream(logPath);
 const env={...process.env,GAME_URL:process.env.GAME_URL??'http://127.0.0.1:5311/',BOXHEAD_QA_FUNCTIONAL_ONLY:'1',BOXHEAD_QA_HIDDEN:'1',BOXHEAD_NETCODE:'rollback-v2',
  BOXHEAD_QA_OUT:join(out,name),BOXHEAD_QA_TIMED:'1',BOXHEAD_QA_RELEASE_GATES:name==='lan-functional-30'?'1':'0',BOXHEAD_QA_RELEASE_SCENARIO:'v034'};
 if(name==='portable')env.BOXHEAD_QA_EXE=process.env.BOXHEAD_QA_PORTABLE??resolve(`release/Boxhead 2Play Rooms-${version}-portable.exe`);
 const code=await new Promise((resolveCode,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',reject);child.once('exit',resolveCode);});
 await new Promise(done=>log.end(done));report.cases.push({name,code,started,finished:new Date().toISOString(),log:logPath});report.ok=cases.every(([name])=>report.cases.some(c=>c.name===name&&c.code===0));writeFileSync(file,JSON.stringify(report,null,2));
 console.log('END '+name+' '+code);if(code!==0){console.log(readFileSync(logPath,'utf8').slice(-4000));process.exit(1);}
}
console.log(report.ok?'ALL FUNCTIONAL RELEASE GATES PASSED':'SELECTED GATES PASSED; remaining gates still required');
