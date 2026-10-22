import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {launch,openGame,toMainMenu} from './lib.mjs';

export async function verifyHeldFire(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,method:'Real keyboard down/up and two injected controller mappings; normal simulation cooldown, original infinite-life test switch; no physical-controller claim',phases:[]};
 const count=()=>g.eval(()=>window.qaHeldShots.length);
 const waitShots=async n=>assert(await g.waitFor(n=>window.qaHeldShots.length>=n,n,5000),'held fire continues without new press edges');
 const released=async()=>{const n=await count();await g.page.waitForTimeout(450);assert.equal(await count(),n,'release stops firing');};
 try{
  await g.eval(async()=>{
   await window.__game.__setInfiniteLife(true);
   const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
   if(!w.mUpgrades.features.includes('held-fire-v1'))throw new Error('held-fire capability missing');
   p.SelectWeapon('pistol');window.qaHeldGun=p.mWeapon_Current;window.qaHeldOriginal=Object.getOwnPropertyDescriptor(window.qaHeldGun,'Fire');window.qaHeldFire=window.qaHeldGun.Fire;window.qaHeldShots=[];
   window.qaHeldGun.Fire=function(...args){window.qaHeldShots.push(w.mTick);return window.qaHeldFire.apply(this,args);};
  });
  await g.page.keyboard.down('Space');await waitShots(5);await g.page.keyboard.up('Space');await released();
  report.phases.push({input:'keyboard Space held without release',ticks:await g.eval(()=>window.qaHeldShots.slice())});
  await g.eval(()=>{
   window.qaHeldPads=['8BitDo SN30 Pro','Xbox controller'].map((id,index)=>({id,index,connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))}));
   window.qaHeldGetPads=navigator.getGamepads;navigator.getGamepads=()=>window.qaHeldPads;
  });await g.page.waitForTimeout(150);
  let before=await count();await g.eval(()=>window.qaHeldPads[0].buttons[0].pressed=true);await waitShots(before+5);
  report.phases.push({input:'Nintendo B held, second controller idle',ticks:await g.eval(n=>window.qaHeldShots.slice(n),before)});
  // Hand over without a neutral sample; the idle/disconnected peer must never cancel the active one.
  await g.eval(()=>{window.qaHeldPads[1].buttons[1].pressed=true;window.qaHeldPads[0].buttons[0].pressed=false;});before=await count();await waitShots(before+4);
  report.phases.push({input:'Xbox B held, first controller idle',ticks:await g.eval(n=>window.qaHeldShots.slice(n),before)});
  await g.eval(()=>{const p=Object.values(window.__game.main().mcWorld.mThing_Collection.mPlayerThings)[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=1;});before=await count();
  await waitShots(before+4);assert(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mNameID==="pistol"'));
  assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapons.uzi.mThing.mAmmo'),0);
  report.phases.push({input:'last UZI round returns to pistol and the same held button continues',ticks:await g.eval(n=>window.qaHeldShots.slice(n),before)});
  await g.eval(()=>window.qaHeldPads[1].buttons[1].pressed=false);await g.page.waitForTimeout(100);await released();
  report.rate=await g.eval(()=>window.qaHeldGun.mFireRate);for(const phase of report.phases)for(let i=1;i<phase.ticks.length;i++)assert.equal(phase.ticks[i]-phase.ticks[i-1],report.rate,'held fire preserves the simulation cooldown');
  report.audio=await g.expr('g.audio()');assert.equal(report.audio.decoded,31);assert.deepEqual(report.audio.failed,[]);assert.deepEqual(await g.scriptErrors(),[]);await g.shot(out+'/held-fire.png',false);report.ok=true;
 }finally{
  await g.page.keyboard.up('Space').catch(()=>{});
  await g.eval(()=>{if(window.qaHeldGun){if(window.qaHeldOriginal)Object.defineProperty(window.qaHeldGun,'Fire',window.qaHeldOriginal);else delete window.qaHeldGun.Fire;}if(window.qaHeldGetPads)navigator.getGamepads=window.qaHeldGetPads;}).catch(()=>{});
  writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const browser=await launch();let g;try{g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await verifyHeldFire(g,process.env.BOXHEAD_QA_OUT??'generated/reports/v035/held-fire-ui');console.log('HELD FIRE INPUT PASSED');}finally{await g?.close();await browser.close();}}
