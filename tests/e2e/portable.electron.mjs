// Launch the actual NSIS portable executable. Its launcher does not forward inspector stderr, so connect to CDP.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import asar from '@electron/asar';
import { chromium } from 'playwright-core';
import { Game, toMainMenu } from './lib.mjs';
import { verifyPersistentEnchantment } from './persistent-enchantment.mjs';
import { verifyV031Candidate } from './v031-candidate.mjs';
import {verifyV032Candidate} from './v032-candidate.mjs';
import {verifyV033Candidate} from './v033-candidate.browser.mjs';
import {verifyV034Candidate} from './v034-candidate.browser.mjs';
import {verifyEmptyFeedback} from './empty-feedback.browser.mjs';
import {verifyNameSpacing} from './name-spacing.browser.mjs';
import {verifyExactWaveCase} from './exact-wave.browser.mjs';

const expected=process.env.BOXHEAD_QA_VERSION??JSON.parse(readFileSync('package.json','utf8')).version;
const root=process.cwd(),out=resolve(process.env.BOXHEAD_QA_OUT??`generated/reports/v${expected.replaceAll('.','')}/portable`);
mkdirSync(out,{recursive:true});
const exe=process.env.BOXHEAD_QA_EXE??resolve(`release/Boxhead 2Play Rooms-${expected}-portable.exe`);
const port=await new Promise((resolvePort,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p));});});
const child=spawn(exe,['--boxhead-multi','--boxhead-hidden','--window-position=-32000,0',`--remote-debugging-port=${port}`,
 '--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling','--force-device-scale-factor=1'],
 {cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,BOXHEAD_USER_DATA:join(out,'data-'+expected)}});
let browser,page;
try{
 const endpoint=`http://127.0.0.1:${port}`;
 let ready=false;
 for(let i=0;i<120;i++){
  try{const r=await fetch(endpoint+'/json/version');if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 assert.ok(ready,'portable child exposes its CDP endpoint');
 browser=await chromium.connectOverCDP(endpoint);
 page=browser.contexts()[0].pages()[0];
 // Single-instance artifact smoke, not a performance benchmark: bound GPU work during office hours.
 await page.setViewportSize({width:640,height:480});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const g=new Game(page,browser.contexts()[0],errors);
 const executable=execFileSync('powershell.exe',['-NoProfile','-Command',
  `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Boxhead 2Play Rooms.exe' -and $_.CommandLine -like '*--remote-debugging-port=${port}*' } | Select-Object -First 1 -ExpandProperty ExecutablePath`],{encoding:'utf8',windowsHide:true}).trim();
 assert.ok(executable,'identify this portable child by its unique debug port');
 const archive=join(dirname(executable),'resources/app.asar');
 const version=JSON.parse(asar.extractFile(archive,'package.json').toString()).version;
 assert.equal(version,expected,'version inside the portable extraction');
 const extractedAsarSha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
 const verifiedRuntimeFiles=[];
 if(!process.env.BOXHEAD_QA_CAPTURE_ASAR){
  assert.equal(extractedAsarSha256,createHash('sha256').update(readFileSync(process.env.BOXHEAD_QA_STAGED_ASAR??'release/win-unpacked/resources/app.asar')).digest('hex'),'complete portable asar matches the validated unpacked build');
  for(const file of [join('dist-electron','main.cjs'),join('dist-electron','preload.cjs'),...readdirSync('dist/bundle').filter(n=>n.endsWith('.js')).map(n=>join('dist','bundle',n))]){
   assert.ok(asar.extractFile(archive,file).equals(readFileSync(file)),'portable contains current built code: '+file);
   verifiedRuntimeFiles.push(file.replaceAll('\\','/'));
  }
 }
 if(process.env.BOXHEAD_QA_CAPTURE_ASAR){const target=resolve(process.env.BOXHEAD_QA_CAPTURE_ASAR);mkdirSync(dirname(target),{recursive:true});copyFileSync(archive,target);}
 assert.ok(await g.waitExpr('g.ready',120000));await toMainMenu(g);
 const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
 assert.deepEqual(viewport,{width:640,height:480,dpr:1});
 if(!process.env.BOXHEAD_QA_CAPTURE_ASAR){
  if(process.env.BOXHEAD_QA_EXACT_WAVE==='1')await verifyExactWaveCase(g,join(out,'exact-wave'));
  await g.clickClip('m.mcScreen.mcSinglePlay');assert.ok(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');
  assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
  await page.keyboard.press('p');assert.ok(await g.waitExpr('m.mcWorld.mPaused'));
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert.ok(await g.waitScreen('State_Main','Screen_Main'));
  await g.clickClip('m.mcScreen.mcContinue');assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
  const audio=await g.expr('g.audio()');assert.equal(audio.decoded,31);assert.equal(audio.state,'running');
  if(process.env.BOXHEAD_QA_NAME_SPACING==='1')await verifyNameSpacing(g,join(out,'name-spacing'));
  if(process.env.BOXHEAD_QA_ENCHANTMENT==='1')await verifyPersistentEnchantment(g,join(out,'enchantment'));
  if(expected==='0.3.5'&&process.env.BOXHEAD_QA_TIMED==='1')await verifyEmptyFeedback(g,join(out,'empty-feedback'));
  if(process.env.BOXHEAD_QA_TIMED==='1')await (['0.3.4','0.3.5'].includes(expected)?verifyV034Candidate:expected==='0.3.3'?verifyV033Candidate:expected==='0.3.2'?verifyV032Candidate:verifyV031Candidate)(g,join(out,'timed-candidate'));
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(errors,[]);
  await g.shot(join(out,'final-portable.png'),false);
 }
 writeFileSync(join(out,'launch-'+version+'.json'),JSON.stringify({version,exe,executable,archive,extractedAsarSha256,verifiedRuntimeFiles,viewport,ok:true},null,2));
 console.log('PASS: actual portable',version,process.env.BOXHEAD_QA_CAPTURE_ASAR?'baseline extraction':'gameplay, save/continue and audio');
}finally{
 if(page)await page.evaluate(()=>window.boxheadDesktop.quit()).catch(()=>{});
 await browser?.close().catch(()=>{});
 if(child.exitCode===null)child.kill();
}
