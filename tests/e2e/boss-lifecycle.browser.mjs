// Four naturally admitted Bosses; prepared camera/positions and a controlled lethal flag.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v037/boss-lifecycle';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'Real Wave25 menu and four natural Boss admissions; prepared positions/camera, real P pause. Controlled fourth lethal DEAD flag enters CheckForDead and normal LogKill. No damage/balance/performance claim.'};let g;
try{
 g=await openGame(browser,{query:'?scale=1'});await toMainMenu(g);
 await g.expr('(P.CMain.mSaveData.__set__mDifficulty(0),P.CMain.mSaveData.__set__mGameSpeed(1),P.CSaveData.mSharedObject.data.mMaxWaveReached=25)');
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type('25');await g.page.keyboard.press('Enter');await g.click(210,400);await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded&&m.mcWorld.mTick>=205&&m.mcWorld.mUpgrades.timedWave.boss.members.length===4&&m.mcWorld.mUpgrades.timedWave.boss.members.every(b=>b.id&&m.mcWorld.mThing_Collection.mThings[b.id]?.mNativeBossAttackStep>0)',30000));
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 report.before=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();
  w.mUpgrades.timedWave.boss.members.forEach((b,i)=>{const e=w.mThing_Collection.mThings[b.id];e.Move(new P.Thing.Math.CThing_Position(7.5+i*2.5,11.5,0));e.SetState('State_GotoPlayer');});
  w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
  return w.mUpgrades.timedWave.boss.members.map((_,i)=>{const c=w._BossHealthHud['_Boss'+i],r=c.getBounds(c);return {visible:c._visible,x:c._x,y:c._y,width:r.xMax-r.xMin,height:r.yMax-r.yMin};});
 });
 assert(report.before.every(b=>b.visible&&b.width===36&&b.height===7.5));
 await g.page.waitForTimeout(120);await g.shot(join(out,'four-alive.png'),false);
 report.after=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,boss=w.mUpgrades.timedWave.boss,e=w.mThing_Collection.mThings[boss.members[3].id];
  e.mLife=0;e.mFlags|=P.Thing.CThing.mFlag_DEAD;e.CheckForDead();w.LogKill(e);w.mUpgrades.Process();
  w.mPaused=false;w.Draw();w.mPaused=true;
  return {defeated:boss.members.map(b=>b.defeated),phase:w.mUpgrades.timedWave.phase,layer:w._BossHealthHud._visible,visible:[0,1,2,3].map(i=>w._BossHealthHud['_Boss'+i]._visible)};
 });
 await g.page.waitForTimeout(120);await g.shot(join(out,'fourth-dead.png'),false);
 assert.deepEqual(report.after.defeated,[false,false,false,true]);assert.equal(report.after.phase,'combat');assert(report.after.layer);assert.deepEqual(report.after.visible,[true,true,true,false]);
 const ink=name=>{const png=PNG.sync.read(readFileSync(join(out,name))),b=report.before[3];let n=0;for(let y=Math.ceil(b.y);y<Math.floor(b.y+b.height);y++)for(let x=Math.ceil(b.x);x<Math.floor(b.x+b.width);x++){const i=(y*png.width+x)*4;if(png.data[i]===255&&png.data[i+1]===174&&png.data[i+2]===100)n++;}return n;};
 report.pixels={before:ink('four-alive.png'),after:ink('fourth-dead.png')};assert(report.pixels.before>10);assert.equal(report.pixels.after,0);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log('FOURTH BOSS LIFECYCLE PASSED '+out);
