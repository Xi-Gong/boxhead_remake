import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { forIn } from '../src/engine/flash/as2.ts';
const { forIn: baseline } = await import(pathToFileURL(resolve('generated/as2-before.ts')).href);
const implementations = { baseline, candidate: forIn }, runs: any[] = [];
for (const fn of Object.values(implementations)) for (let n = 0; n < 10000; n++) fn([1,2,3]);
for (let round=1; round<=3; round++) for (const length of [100,1000]) for (const [kind,fn] of Object.entries(implementations)) {
  (globalThis as any).gc?.();
  const input=Array.from({length},(_,n)=>n),start=performance.now();let sum=0;
  for(let n=0;n<20000;n++){const keys=fn(input);sum+=keys.length+Number(keys[0]);}
  runs.push({round,kind,length,iterations:20000,ms:performance.now()-start,sum});
}
mkdirSync('generated/reports/v028',{recursive:true});
writeFileSync('generated/reports/v028/enumeration-paired.json',JSON.stringify({node:process.version,runs},null,2));
console.log(JSON.stringify(runs));
