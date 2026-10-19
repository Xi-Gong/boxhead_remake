// Exercise the QA guard with a real uncaught main-process exception, without a desktop error dialog.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {_electron as electron} from 'playwright-core';
import {isolateLanPorts} from './lan-isolation.mjs';
const out=path.resolve('generated/reports/v029/main-error-guard');mkdirSync(out,{recursive:true});
const report={ok:true,errors:[]};
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Boxhead 2Play Rooms.exe'),
 args:['--boxhead-hidden','--boxhead-multi'],env:{...process.env,BOXHEAD_USER_DATA:path.join(out,'data')},timeout:60000});
try{
 await isolateLanPorts(app,report);
 const closed=once(app.process(),'close');
 await app.evaluate(()=>{setTimeout(()=>{throw new Error('QA intentional main failure');},50);});
 const [code]=await closed;
 assert.equal(code,1);assert.equal(report.ok,false);
 assert(report.errors.some(error=>error.includes('QA intentional main failure')));
 writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,expectedExitCode:code,captured:report},null,2));
 console.log('MAIN ERROR GUARD PASSED: real exception recorded; test failed closed without a dialog');
}finally{try{await app.close();}catch{}}
