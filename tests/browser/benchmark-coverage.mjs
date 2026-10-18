// Compare the real coverage functions; fixture layouts are stable just like cached TextField layouts.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const path='src/engine/swf/render/renderer.ts';
async function load(source){
 const sf=ts.createSourceFile('coverage.ts',source,ts.ScriptTarget.Latest,true);
 const fn=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ftEditCodesCovered');
 const declaration=sf.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(sf)==='ftCoverage'));
 const body='let engine={library:null};export const setLibrary=L=>engine.library=L;\n'+(declaration?.getText(sf)??'')+'\n'+fn.getText(sf);
 const js=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const old=await load(execFileSync('git',['show','v0.2.5:'+path],{encoding:'utf8'}));
const current=await load(readFileSync(path,'utf8'));
const map=new Map(Array.from({length:95},(_,i)=>[i+32,i]));
const library={fontCodeMap:()=>map},alternate={fontCodeMap:()=>new Map([[65,0]])};
const font={font:{}},fmt={};
const layout=s=>({lines:[{glyphs:[...s].map(c=>({code:c.codePointAt(0),fmt}))}]});
let live=layout('AB');const mutable={$embed:true,$getLayout:()=>live,$font:()=>font};
for(let n=0;n<20000;n++){
 const lib=n%31===0?alternate:library;old.setLibrary(lib);current.setLibrary(lib);
 if(n%17===0)live=layout(['AB','A王B',' A B ','*'][n%4]);
 mutable.$embed=n%43!==0;assert.equal(current.ftEditCodesCovered(mutable),old.ftEditCodesCovered(mutable));
}
old.setLibrary(library);current.setLibrary(library);
const fields=Array.from({length:120},(_,i)=>{const l=layout('Upgrade '+i+': Pistol Double Ammo');return {$embed:true,$getLayout:()=>l,$font:()=>font};});
function run(m){let covered=0;const start=performance.now();for(let i=0;i<240000;i++)covered+=Number(m.ftEditCodesCovered(fields[i%fields.length]));return {ms:performance.now()-start,covered};}
run(old);run(current);const baseline=[],candidate=[];for(let n=0;n<3;n++){baseline.push(run(old));candidate.push(run(current));}
const median=r=>r.map(x=>x.ms).sort((a,b)=>a-b)[1];
const report={equivalent:true,mutationChecks:20000,calls:240000,baseline,candidate,medianMs:{baseline:median(baseline),candidate:median(candidate)},speedup:median(baseline)/median(candidate)};
mkdirSync('generated/reports/v026',{recursive:true});writeFileSync('generated/reports/v026/coverage-perf.json',JSON.stringify(report,null,2));console.log(report);
