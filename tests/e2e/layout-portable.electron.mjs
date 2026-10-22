// Printed-letter override must survive the real portable launcher's extraction/relaunch cycle.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,sep,dirname} from 'node:path';
import asar from '@electron/asar';
import {chromium} from 'playwright-core';
import {Game,toMainMenu} from './lib.mjs';
const out=resolve(process.env.BOXHEAD_QA_OUT??'generated/reports/v035/extras/portable-layout');assert(out.startsWith(resolve('generated')+sep));mkdirSync(out,{recursive:true});
const exe=resolve(process.env.BOXHEAD_QA_PORTABLE??'release/Boxhead 2Play Rooms-0.3.5-portable.exe'),expected=JSON.parse(readFileSync('package.json','utf8')).version;
const report={ok:false,method:'Two actual hidden portable launches with the same isolated profile; explicit DOM focus and real End/Tab keys on a closed dropdown, with an injected generic XInput identity. Persistence/mapping evidence, not physical hardware.',launches:[],pending:undefined};
try{for(const attempt of [0,1]){
 const port=await new Promise(done=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>done(port));});});
 const child=spawn(exe,['--boxhead-multi','--boxhead-hidden','--window-position=-32000,0',`--remote-debugging-port=${port}`,'--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling','--force-device-scale-factor=1'],{windowsHide:true,stdio:'ignore',env:{...process.env,BOXHEAD_USER_DATA:join(out,'data')}});let browser,page;
 try{
  let ready=false;for(let i=0;i<120;i++){try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,500));}assert(ready);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];await page.setViewportSize({width:640,height:480});const errors=[];page.on('pageerror',error=>errors.push(String(error)));const g=new Game(page,page.context(),errors);assert(await g.waitExpr('g.ready',120000));await toMainMenu(g);
  const executable=execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Boxhead 2Play Rooms.exe' -and $_.CommandLine -like '*--remote-debugging-port=${port}*' } | Select-Object -First 1 -ExpandProperty ExecutablePath`],{encoding:'utf8',windowsHide:true}).trim();assert(executable);const archive=join(dirname(executable),'resources/app.asar');assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,expected);const sha256=createHash('sha256').update(readFileSync(archive)).digest('hex');assert.equal(sha256,createHash('sha256').update(readFileSync(process.env.BOXHEAD_QA_STAGED_ASAR??'release/v035/win-unpacked/resources/app.asar')).digest('hex'));
  await g.eval(()=>{window.qaPersistPad={index:0,id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))};navigator.getGamepads=()=>[window.qaPersistPad];});
  const layout=page.getByRole('combobox',{name:'PAD 1 button layout'});await layout.waitFor({state:'visible'});const before=await layout.inputValue();if(attempt===1)assert.equal(before,'nintendo','printed-letter override survives actual portable relaunch');
  report.pending={attempt:attempt+1,port,launcherPid:child.pid,executable,archive,asarSHA256:sha256,before};
  await layout.focus();assert(await layout.evaluate(el=>el===document.activeElement));await page.keyboard.press('End');await page.keyboard.press('Tab');assert.equal(await layout.inputValue(),'nintendo');await g.shot(join(out,`launch-${attempt+1}.png`),false);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(errors,[]);report.launches.push({attempt:attempt+1,archive,asarSHA256:sha256,before,after:await layout.inputValue()});report.pending=undefined;
 }catch(error){report.error=String(error);if(page){report.focus=await page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,300),focused:document.hasFocus()})).catch(()=>null);await page.screenshot({path:join(out,`failed-${attempt+1}.png`)}).catch(()=>{});}throw error;}finally{if(page)await page.evaluate(()=>window.boxheadDesktop.quit()).catch(()=>{});await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();}
 await new Promise(done=>setTimeout(done,1000));
}
report.ok=true;}finally{writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log('ACTUAL PORTABLE LAYOUT PERSISTENCE PASSED');
