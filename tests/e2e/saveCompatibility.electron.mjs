// Generate a save with the released v0.2.5 app, then continue it using the current candidate.
import assert from 'node:assert/strict';
import {mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {_electron} from 'playwright-core';
import {Game,toMainMenu} from './lib.mjs';
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const root=process.cwd(),out=resolve(`generated/reports/v${version.replaceAll('.','')}`),data=join(out,'save-compatibility');
assert.ok(relative(out,data) && !relative(out,data).startsWith('..'));
rmSync(data,{recursive:true,force:true});mkdirSync(data,{recursive:true});
const flags=['--boxhead-multi','--boxhead-hidden','--window-position=-32000,0','--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling'];
async function open(exe,version){
 const app=await _electron.launch({executablePath:resolve(exe),cwd:root,args:flags,env:{...process.env,BOXHEAD_USER_DATA:data},timeout:60000});
 try{
  assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
  const page=await app.firstWindow(),g=new Game(page,app.context(),[]);
  assert.ok(await g.waitExpr('g.ready',120000));await toMainMenu(g);return {app,g};
 }catch(e){await app.close();throw e;}
}
let old,current,stored;
try{
 old=await open('generated/reports/v026/baseline/win-unpacked/Boxhead 2Play Rooms.exe','0.2.5');
 const g=old.g;await g.clickClip('m.mcScreen.mcSinglePlay');assert.ok(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert.ok(await g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
 await g.page.keyboard.press('p');assert.ok(await g.waitExpr('m.mcWorld.mPaused && !!m.mcWorld.mHud.mcScreenPause?._SaveQuit'));
 await g.expr('(()=>{const p=Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0];p.NewWeapon("uzi");p.mWeapons.uzi.mThing.mAmmo=17;p.mLife=137;m.mcWorld.mHud.nTotalScore=1234;P.CMain.mSaveData.mPlayer1_KeyShoot=70;P.CMain.mSaveData.SaveData();g.__setWaveUnlock(7);return true;})()');
 await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert.ok(await g.waitScreen('State_Main','Screen_Main'));
 stored=await g.page.evaluate(()=>JSON.parse(localStorage.getItem('SO:BXHD_2PLAY_6')));
 assert.equal(stored.mResumeData.version,2);assert.equal(stored.mMaxWaveReached,7);assert.equal(stored.mPlayer1_KeyShoot,70);
 await old.app.close();old=undefined;
 current=await open(process.env.BOXHEAD_QA_EXE??'release/win-unpacked/Boxhead 2Play Rooms.exe',version);
 assert.ok(await current.g.expr('!!m.mcScreen.mcContinue'));
 assert.equal(await current.g.expr('P.CMain.mSaveData.mPlayer1_KeyShoot'),70);
 assert.equal(await current.g.page.evaluate(()=>JSON.parse(localStorage.getItem('SO:BXHD_2PLAY_6')).mMaxWaveReached),7);
 // Capture immediately after the real resume hook, before ordinary gameplay can heal/move the player.
 await current.g.page.evaluate(()=>{
  const proto=window.__game.pkg.World.CWorld.prototype,init=proto.InitFinished;
  proto.InitFinished=function(...args){init.apply(this,args);const p=Object.values(this.mThing_Collection.mPlayerThings)[0];
   window.__restoredSave={room:this.mWorldLibLink,score:this.mHud.nTotalScore,life:p.mLife,uzi:p.mWeapons.uzi.mThing.mAmmo};};
 });
 await current.g.clickClip('m.mcScreen.mcContinue');assert.ok(await current.g.waitExpr('m.mcWorld?.mLoaded && g.state()==="State_RunWorld"'));
 const restored=await current.g.page.evaluate(()=>window.__restoredSave);
 assert.equal(restored.room,stored.mResumeData.roomLibLink);assert.equal(restored.score,1234);assert.equal(restored.life,137);assert.equal(restored.uzi,17);
 assert.deepEqual(await current.g.scriptErrors(),[]);
 writeFileSync(join(out,'save-compatibility.json'),JSON.stringify({from:'0.2.5',to:version,storedVersion:stored.mResumeData.version,maxWave:7,fireKey:70,restored,ok:true},null,2));
 console.log('PASS: actual v0.2.5 save, progress, rebinding, health and ammo continue in',version);
}finally{await old?.app.close().catch(()=>{});await current?.app.close().catch(()=>{});}
