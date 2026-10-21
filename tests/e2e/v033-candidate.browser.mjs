// Prepared UI fixtures are separate from the input-only balance playtests.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {pathToFileURL} from 'node:url';
import {launch,openGame,toMainMenu} from './lib.mjs';
export async function verifyV033Candidate(g,out){
mkdirSync(out,{recursive:true});const report={ok:false,method:'One isolated 640x480 renderer, prepared draft/Boss fixtures and real clicks/keys'};
try{
 report.initial=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.NewWeapon("uzi");p.SelectWeapon("uzi");p.mWeapon_Current.mPersistentEnchantment=true;p.mWeapon_Current.mEnchantedAmmo=p.mWeapon_Current.mAmmo;return {rule:w.mUpgrades.combat.rule,health:p.mMaxLife};})()');
 assert.equal(report.initial.rule,'combat-pve-v3');assert.equal(report.initial.health,160);
 await g.expr('(()=>{const w=m.mcWorld;w.mUpgrades.FinishTimedWave();w.mUpgrades.waveDraft.round.offers=[["health","armor","damage"]];})()');
 assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._Player0?._Card0?._Detail.text.includes("8%")'));
 await g.page.waitForTimeout(700);
 report.cards=await g.expr('m.mcWorld._WaveDraftHud._Player0._Card0._Preview.text+" | "+m.mcWorld._WaveDraftHud._Player0._Card1._Preview.text');
 assert.match(report.cards,/160.*173.*60.*64/);await g.shot(`${out}/cards.png`,false);
 await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
 report.stats=await g.expr('Array.from({length:9},(_,i)=>[m.mcWorld._WaveDraftHud._Player0._Stats["_Name"+i].text,m.mcWorld._WaveDraftHud._Player0._Stats["_Value"+i].text])');
 assert.equal(report.stats[7][0],'SUPPLY EFFECT');assert.equal(report.stats[8][1],'ACTIVE  +15% DAMAGE');await g.shot(`${out}/stats.png`,false);
 await g.page.keyboard.press('Tab');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');
 assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mMaxLife'),173);
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.shot(`${out}/pause.png`,false);
 assert.match(await g.expr('m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text'),/HP 173 \/ SHIELD 60/);
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
 report.bosses=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  w.mUpgrades.AdvanceTimedWave();w.mUpgrades.__set__mLevel(25);p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);
  w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();
  const boss=w.mUpgrades.timedWave.boss;
  const enemies=boss.members.map((member,i)=>{
   const C=member.kind==='charger'?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil;
   const e=new C(new P.Thing.Math.CThing_Position(8.5+i*3,11.5,0));e.mBossKind=member.kind;e.mBossSlot=i;if(member.kind==='charger')e.mEnemyVariant='charger';
   w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mLife=member.life=e.mMaxLife*[1,.5,.1][i];member.maximum=e.mMaxLife;
   // Prepared constructors bypass CWorld.Spawn, which normally owns the live family counters.
   w.mUpgrades.Level[member.kind==='charger'?'mZombieCount':'mDevilCount']++;
   return e;
  });
  w.Draw();w.mPaused=true;
  return enemies.map((e,i)=>{const b=w._BossHealthHud['_Boss'+i],bounds=b.getBounds(b),a=e.mXSI_Animation,o=a.mAnimationObject,f=o.mDirections[o.mLookup256[e.mAngle.__get__mAngle256()&255]].mFrames[a.mCurrentFrameID&16777215];
   return {kind:e.mBossKind,x:b._x,y:b._y,width:bounds.xMax-bounds.xMin,height:bounds.yMax-bounds.yMin,headTop:w.GetScreenPosition(e.mPosition).y+f.mDisp.y,armor:e.mEnemyArmor??0,fraction:e.mLife/e.mMaxLife,visible:b._visible};});
 });
 report.bossCount=await g.expr('m.mcWorld._LanGrowthHud._Wave._Devils.text');assert.equal(report.bossCount,'3');
 for(const b of report.bosses){assert(b.visible);assert.equal(b.width,b.kind==='charger'?44:40);assert.equal(b.height,5);assert.equal(b.armor,0);assert(b.y+b.height+3<=b.headTop);assert(b.x>=0&&b.x+b.width<=640);}
 await g.shot(`${out}/bosses.png`,false);const png=PNG.sync.read(readFileSync(`${out}/bosses.png`));
 for(const b of report.bosses){const rgb=b.kind==='charger'?[213,200,154]:[255,174,100];let pixels=0;
  for(let y=b.y+2;y<b.y+4;y++)for(let x=b.x;x<b.x+b.width;x++){const k=(y*png.width+x)*4;if(rgb.every((v,c)=>Math.abs(v-png.data[k+c])<4))pixels++;}
  assert(pixels>0);assert(pixels<=Math.ceil((b.width-2)*b.fraction)*2+4);b.fillPixels=pixels;
 }
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);if(g){report.scriptErrors=await g.scriptErrors();report.browserLog=g.log;await g.shot(`${out}/failed.png`,false);}throw error;}
finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.env.CANDIDATE_OUT??`generated/reports/v033/ui-${Date.now()}`,browser=await launch();let g;
 try{
  g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');
  if(!await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded',5000)){
   if(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld',1000))await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');
   assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  }
  await g.page.waitForTimeout(700);await verifyV033Candidate(g,out);console.log('V033 CANDIDATE UI PASSED '+out);
 }finally{await g?.close();await browser.close();}
}
