// Inspect freshly built portable inputs before short runtime acceptance. No network or game launch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import asar from '@electron/asar';
const [folder,output]=process.argv.slice(2);assert(folder&&output,'pass external build folder and report filename');
const version=JSON.parse(readFileSync('package.json','utf8')).version,lock=JSON.parse(readFileSync('package-lock.json','utf8'));
assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);
const exe=resolve(folder,`Boxhead 2Play Rooms-${version}-portable.exe`),archive=resolve(folder,'win-unpacked/resources/app.asar');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(JSON.parse(asar.extractFile(archive,'package.json').toString()).version,version);
const files=[];function walk(folder){for(const name of readdirSync(folder).sort()){const path=join(folder,name);if(statSync(path).isDirectory())walk(path);else if(!path.endsWith('.map'))files.push(path);}}
walk('dist');walk('dist-electron');for(const file of files)assert(asar.extractFile(archive,file).equals(readFileSync(file)),`stale packaged file ${file}`);
const renderer=files.find(p=>/main-[\w-]+\.js$/.test(p));assert(renderer);const script=readFileSync(renderer,'utf8');
// Full animation names are composed during loading; inspect their prefixes here and the real sets at runtime.
for(const marker of ['tiered-growth-v1','clearable-waves-v1','boss-encounters-v1','Polished_','Boss_','ClassicVariant_','combat-pve-v2','draft-ready-v1','FreshCombat_','FreshDemon_','Gunner_',...(['0.3.4','0.3.5'].includes(version)?['fragile-armor-v1','empty-weapons-v1','weapon-bindings-v1','enchant-durability-v1','native-bosses-v1']:[]),...(version==='0.3.5'?['empty-weapon-feedback-v1','BOXHEAD_PAD_LAYOUT_V1','NINTENDO']:[])])assert(script.includes(marker),`missing new runtime marker ${marker}`);
const inputs=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>/^(src\/|electron\/|public\/assets\/|config\/|tools\/)/.test(p)||/^(package(?:-lock)?\.json|(?:gallery|index)\.html|vite\.config\.ts|electron-builder\.yml|tsconfig\.json)$/.test(p)).sort();
const identities=inputs.map(path=>({path,sha256:hash(readFileSync(path))})),runtimeInputsSHA256=hash(identities.map(i=>i.path+'\0'+i.sha256+'\n').join(''));
const report={ok:true,status:'candidate-not-published',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),version,exe,archive,exeBytes:statSync(exe).size,exeSHA256:hash(readFileSync(exe)),asarSHA256:hash(readFileSync(archive)),renderer:renderer.replaceAll('\\','/'),verifiedFiles:files.map(p=>p.replaceAll('\\','/')),runtimeInputsSHA256,inputCount:inputs.length,inputs:identities};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,verifiedFiles:files.length,inputs:undefined}));
