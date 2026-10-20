// Short, serial 640x480 UI acceptance. Run separately at ART_SCALE=1 and 2.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const scale=Number(process.env.ART_SCALE??2),out=`generated/reports/v031/compact-hud/run-${Date.now()}-${scale}x`;
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
   for(const e of Object.values(w.mThing_Collection.mThings))if(e._CLASSID_==='CThing_Creature_Zombie'||e._CLASSID_==='CThing_Creature_Devil'){e.ClearCollideCell();if(e.Process)e.Delete();e.Dispose();delete w.mThing_Collection.mThings[e.sUniqueID];}
   w.mUpgrades.__set__mLevel(kind==='charger'?5:10);p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));w.TrackThing(p);
   const C=kind==='charger'?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil;
   const e=new C(new P.Thing.Math.CThing_Position(10.5,11.5,0));e.mBossKind=e.mEnemyVariant=kind;w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');
   const boss=w.mUpgrades.timedWave.boss;boss.id=e.sUniqueID;
   const member=boss.members?.[0]??boss;
   e.mLife=member.life=boss.life=kind==='charger'?3000:934500;e.mMaxLife=member.maximum=boss.maximum=kind==='charger'?6000:1250000;
   w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
   const l=w._BossHealthHud._Boss0,f=e.mXSI_Animation.mCurrentFrame,position=w.GetScreenPosition(e.mPosition);
   const wave=w._LanGrowthHud._Wave;
   return {kind,id:e.sUniqueID,visible:l._visible,noNumber:!l._Health,x:l._x,y:l._y,width:64,height:7,
    headTop:position.y+f.mDisp.y,position,fraction:boss.life/boss.maximum,
    noExtraLayers:!w._TimedWaveHud&&!w._BossWaveHud,clock:wave._Clock.text,clockBounds:wave._Clock.getBounds(wave)};
  },kind);
  assert(result.visible&&result.noNumber&&result.noExtraLayers);assert.match(result.clock,/^\d+:\d{2}$/);
  assert(result.clockBounds.xMin>=54&&result.clockBounds.xMax<=118&&result.clockBounds.yMax<=46);
  assert(result.y+result.height+5<=result.headTop);assert(result.x>=0&&result.x+64<=640);
  await g.page.waitForTimeout(120);await g.shot(`${out}/${kind}.png`,false);
  const png=PNG.sync.read(readFileSync(`${out}/${kind}.png`));let fill=0;
  const accent=kind==='charger'?[213,200,154]:[255,174,100];
  for(let y=result.y;y<result.y+7;y++)for(let x=result.x;x<result.x+64;x++){
   const i=(y*png.width+x)*4,rgb=[...png.data.subarray(i,i+3)];
   if(y>=result.y+2&&y<result.y+6&&rgb.every((c,i)=>Math.abs(c-accent[i])<3))fill++;
  }
  assert(fill>62*result.fraction*2);result.fillPixels=fill;
  await g.expr('P.CMain.mSaveData.__set__mDetail(false)');
  await g.expr('(()=>{const w=m.mcWorld;w.mPaused=false;w.Draw();w.mPaused=true;})()');
  assert.equal(await g.expr('m.mcWorld._BossHealthHud._visible'),true);
  await g.page.waitForTimeout(120);await g.shot(`${out}/${kind}-low.png`,false);
  // Pause is real keyboard input; it must hide immediately even though world.Draw then stops.
  await g.expr('m.mcWorld.mPaused=false');await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  assert.equal(await g.expr('m.mcWorld._BossHealthHud._visible'),false);
  report.cases.push(result);
 }
 report.multiple=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  for(const e of Object.values(w.mThing_Collection.mThings))if(e._CLASSID_==='CThing_Creature_Zombie'||e._CLASSID_==='CThing_Creature_Devil'){e.ClearCollideCell();if(e.Process)e.Delete();e.Dispose();delete w.mThing_Collection.mThings[e.sUniqueID];}
  w.mUpgrades.__set__mLevel(25);p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);
  const boss=w.mUpgrades.timedWave.boss;
  const entities=boss.members.map((member,i)=>{
   const C=member.kind==='charger'?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil;
   const e=new C(new P.Thing.Math.CThing_Position(8.5+i*3,11.5,0));e.mBossKind=e.mEnemyVariant=member.kind;e.mBossSlot=i;
   w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mLife=member.life=e.mMaxLife*(i+1)/4;
   if(member.kind==='charger')w.mUpgrades.Level.mZombieCount++;else w.mUpgrades.Level.mDevilCount++;
   return e;
  });
  w.mUpgrades.Process();w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
  const layer=w._BossHealthHud,wave=w._LanGrowthHud._Wave;
  return {count:boss.members.length,devils:wave._Devils.text,zombies:wave._Zombies.text,
   bars:boss.members.map((_,i)=>({visible:layer['_Boss'+i]._visible,x:layer['_Boss'+i]._x,y:layer['_Boss'+i]._y})),clock:wave._Clock.text};
 });
 assert.equal(report.multiple.count,3);assert.equal(report.multiple.devils,'3');assert.equal(report.multiple.zombies,'0');
 assert(report.multiple.bars.every(b=>b.visible));assert.equal(new Set(report.multiple.bars.map(b=>b.x)).size,3);
 await g.page.waitForTimeout(120);await g.shot(`${out}/three-bosses.png`,false);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('BOSS HEALTH LIGHT BROWSER PASSED '+out);
