// Short, serial 640x480 UI acceptance. Run separately at ART_SCALE=1 and 2.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const scale=Number(process.env.ART_SCALE??2),out=`generated/reports/v031/boss-health/run-${Date.now()}-${scale}x`;
mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,scale,cases:[]};let g;
try{
 g=await openGame(browser,{query:`?scale=${scale}`});await toMainMenu(g);
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(380,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
 await g.page.waitForTimeout(700);
 await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(100);await g.page.keyboard.up('ArrowRight');
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 for(const kind of ['charger','priest']){
  const result=await g.eval(kind=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
   P.CMain.mSaveData.__set__mDetail(true);
   for(const e of Object.values(w.mThing_Collection.mThings))if(e._CLASSID_==='CThing_Creature_Zombie'||e._CLASSID_==='CThing_Creature_Devil')e.Dispose();
   w.mUpgrades.__set__mLevel(kind==='charger'?5:10);p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));w.TrackThing(p);
   const C=kind==='charger'?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil;
   const e=new C(new P.Thing.Math.CThing_Position(10.5,11.5,0));e.mBossKind=e.mEnemyVariant=kind;w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');
   const boss=w.mUpgrades.timedWave.boss;boss.id=e.sUniqueID;
   e.mLife=boss.life=kind==='charger'?3000:934500;e.mMaxLife=boss.maximum=kind==='charger'?6000:1250000;
   w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
   const l=w._BossHealthHud,f=e.mXSI_Animation.mCurrentFrame,position=w.GetScreenPosition(e.mPosition);
   return {kind,id:e.sUniqueID,visible:l._visible,label:l._Health.text,x:l._x,y:l._y,width:118,height:28,
    headTop:position.y+f.mDisp.y,position,fraction:boss.life/boss.maximum};
  },kind);
  assert(result.visible);assert.equal(result.label,kind==='charger'?'3000 / 6000':'934.5K / 1.25M');
  assert(result.y+result.height+3<=result.headTop);assert(result.x>=0&&result.x+118<=640);
  await g.page.waitForTimeout(120);await g.shot(`${out}/${kind}.png`,false);
  const png=PNG.sync.read(readFileSync(`${out}/${kind}.png`));let fill=0,white=0;
  const accent=kind==='charger'?[213,200,154]:[255,174,100];
  for(let y=result.y;y<result.y+28;y++)for(let x=result.x;x<result.x+118;x++){
   const i=(y*png.width+x)*4,rgb=[...png.data.subarray(i,i+3)];
   if(y>=result.y+20&&y<result.y+25&&rgb.every((c,i)=>Math.abs(c-accent[i])<3))fill++;
   if(y<result.y+19&&rgb.every(c=>c>210))white++;
  }
  assert(fill>112*result.fraction*3);assert(white>25);result.fillPixels=fill;result.textPixels=white;
  await g.expr('P.CMain.mSaveData.__set__mDetail(false)');
  await g.expr('(()=>{const w=m.mcWorld;w.mPaused=false;w.Draw();w.mPaused=true;})()');
  assert.equal(await g.expr('m.mcWorld._BossHealthHud._visible'),true);
  await g.page.waitForTimeout(120);await g.shot(`${out}/${kind}-low.png`,false);
  // Pause is real keyboard input; it must hide immediately even though world.Draw then stops.
  await g.expr('m.mcWorld.mPaused=false');await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  assert.equal(await g.expr('m.mcWorld._BossHealthHud._visible'),false);
  report.cases.push(result);
 }
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('BOSS HEALTH LIGHT BROWSER PASSED '+out);
