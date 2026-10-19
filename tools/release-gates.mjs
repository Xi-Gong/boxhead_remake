// Serial release acceptance. Keep raw logs and stop on the first failure; never suppress assertions.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {extractFile} from '@electron/asar';
const from=process.argv[2];
if(from&&!/^[a-z0-9-]+$/.test(from))throw new Error('invalid starting gate');
const version=JSON.parse(readFileSync('package.json')).version,out=path.resolve(`generated/reports/v${version.replaceAll('.','')}/gates${from?'-from-'+from:''}`);
mkdirSync(out,{recursive:true});
const sourceFiles=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.ts')||file.endsWith('.mjs'))sourceFiles.push(file);}}
walk('src');walk('electron');walk('tests');sourceFiles.push('tools/release-gates.mjs','tools/balance-audit.mjs',
 'package.json','tsconfig.json','config/tsconfig.base.json','config/tsconfig.strict.json','config/tsconfig.tools.json',
 'vite.config.ts','vitest.config.ts','index.html','gallery.html','platform-smoke.html');const hash=createHash('sha256');
for(const file of sourceFiles.sort())hash.update(file).update(readFileSync(file));
const asar=path.join('release','win-unpacked','resources','app.asar');
if(JSON.parse(extractFile(asar,'package.json')).version!==version)throw new Error('stale packaged version');
for(const file of [path.join('dist-electron','main.cjs'),...readdirSync('dist/bundle').filter(n=>n.endsWith('.js')).map(n=>path.join('dist','bundle',n))]){
 if(!extractFile(asar,file).equals(readFileSync(file)))throw new Error('stale packaged code: '+file);
}
const identity={sourceSha256:hash.digest('hex'),asarSha256:createHash('sha256').update(readFileSync(asar)).digest('hex'),version};
const saved=path.join(out,'report.json'),report={...identity,cases:[]};
if(existsSync(saved)){const old=JSON.parse(readFileSync(saved));if(old.sourceSha256===identity.sourceSha256&&old.asarSha256===identity.asarSha256)report.cases=old.cases;}
const cases=[
 ['vitest','node_modules/vitest/vitest.mjs','run'],
 ['bitmap-blit','tests/e2e/bitmap-blit.browser.mjs'],['masked-copy','tests/e2e/masked-copy.browser.mjs'],['engine-browser','tests/browser/run-engine.ts'],
 ['ui','tests/e2e/ui.browser.mjs'],['audio','tests/e2e/audio.browser.mjs'],
 ...['wave-input','room-settings','menu-spacing','floating-scores','hud-messages','explosion-flash','local-growth','modern-supplies'].map(name=>[name,`tests/e2e/${name}.browser.mjs`]),
 ['survival-ui','tests/e2e/supplies-ui.browser.mjs'],
 ['growth-ui','tests/e2e/growth-ui.browser.mjs'],['balance-ui','tests/e2e/growth-ui.browser.mjs'],['supplies-ui','tests/e2e/supplies-ui.browser.mjs'],['added-ui','tests/e2e/added-ui.browser.mjs'],
 ['input-badge','tests/e2e/inputBadge.browser.mjs'],['viewport-pause','tests/e2e/viewportPause.browser.mjs'],
 ['browser','tests/sim/playtest.browser.mjs'],['electron-play','tests/sim/playtest.browser.mjs','--electron'],
 ['packaged-play','tests/sim/playtest.browser.mjs','--packaged'],
 ...['v012','v019','v020','v023','v024','typing','lanui','netretry','net'].map(name=>[name,`tests/sim/playtest.${name}.mjs`]),
 ['electron-smoke','tests/unit/platform/electron-smoke.run.ts'],['packaged-smoke','tests/unit/platform/electron-smoke.run.ts','--packaged-only'],
 ['old-save','tests/e2e/saveCompatibility.electron.mjs'],
 ['response-offline','tests/e2e/response-offline.browser.mjs','--electron'],
];
const start=from?cases.findIndex(c=>c[0]===from):0;
if(start<0)throw new Error('unknown starting gate: '+from);
for(const [name,...args]of cases.slice(start)){
 if(report.cases.some(c=>c.name===name&&c.code===0)){console.log('REUSE '+name);continue;}
 console.log('START '+name);const started=new Date().toISOString(),logFile=path.join(out,name+'.log'),log=createWriteStream(logFile);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env:{...process.env,BOXHEAD_SURVIVAL:name==='survival-ui'?'1':'0',BOXHEAD_GROWTH_BALANCED:name==='balance-ui'?'1':'0',GAME_URL:process.env.GAME_URL??'http://127.0.0.1:5311/'},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',reject);child.once('exit',resolve);
 });
 await new Promise(resolve=>log.end(resolve));report.cases=report.cases.filter(c=>c.name!==name);
 report.cases.push({name,code,started,finished:new Date().toISOString(),log:logFile});writeFileSync(saved,JSON.stringify(report,null,2));
 console.log('END '+name+' '+code);if(code!==0){console.log(readFileSync(logFile,'utf8').slice(-4500));process.exit(1);}
}
console.log(from?'SELECTED RELEASE GATES PASSED (from '+from+')':'ALL RELEASE GATES PASSED');

