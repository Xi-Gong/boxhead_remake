// Prepared visuals and real input are functional evidence, separate from input-only balance play.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {pathToFileURL} from 'node:url';
import {launch,openGame,toMainMenu} from './lib.mjs';
export async function verifyV034Candidate(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,method:'One hidden 640x480 renderer; prepared legitimate-value UI fixtures, real mouse/keys and injected standard gamepad'};
 try{
  report.initial=await g.expr(`(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mArmor=20;p.mWeapon_Current.mAmmo=0;p.mWeapon_Current.mEnchantDurability=97;p.mWeapon_Current.mEnchantMaximum=120;return {rule:w.mUpgrades.combat.rule,features:w.mUpgrades.features,health:p.mMaxLife};})()`);
  assert.equal(report.initial.rule,'combat-pve-v3');assert.equal(report.initial.health,160);assert(report.initial.features.includes('native-bosses-v1'));
  await g.eval(()=>{window.qaReleasePad={index:0,connected:true,id:'QA standard mapping',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[window.qaReleasePad];window.qaReleasePad.buttons[0]={pressed:true,value:1};});
  await g.page.waitForTimeout(450);assert(await g.expr('m.mcWorld.mHud.mcPlayers[0]._BindingProgress?._visible'));await g.shot(`${out}/binding-progress.png`,false);
  assert(await g.waitExpr('m.mcWorld.mUpgrades.weaponBindings[0].A==="uzi"'));await g.eval(()=>window.qaReleasePad.buttons[0]={pressed:false,value:0});await g.page.waitForTimeout(150);
  report.hud=await g.expr(`(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],h=w.mHud.mcPlayers[0],a=h._ArmorBar.getBounds(h),e=h._EnchantBar.getBounds(h);return {ammo:p.mWeapon_Current.mAmmo,durability:p.mWeapon_Current.mEnchantDurability,binding:h._WeaponBinding.text,armorHeight:a.yMax-a.yMin,enchantHeight:e.yMax-e.yMin,enchantWidth:e.xMax-e.xMin};})()`);
  assert.equal(report.hud.ammo,0);assert.equal(report.hud.durability,97);assert.equal(report.hud.binding,'A');assert(report.hud.armorHeight<=4&&report.hud.enchantHeight<=4);assert.equal(report.hud.enchantWidth,49);
  await g.shot(`${out}/gameplay.png`,false);
  await g.expr(`(()=>{const w=m.mcWorld;w.mUpgrades.FinishTimedWave();w.mUpgrades.waveDraft.round.offers=[['health','armor','endurance']];})()`);
  assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._Player0?._Card0?._Benefit.text==="+8%"'));await g.page.waitForTimeout(700);
  report.cards=await g.expr('Array.from({length:3},(_,i)=>{const c=m.mcWorld._WaveDraftHud._Player0["_Card"+i];return {benefit:c._Benefit.text,preview:c._Preview.text,x:c._x,y:c._y,width:c._cardWidth};})');
  assert.deepEqual(report.cards.map(c=>c.benefit),['+8%','+6%','+10%']);assert.match(report.cards[1].preview,/40.*42/);assert.match(report.cards[2].preview,/120.*131/);assert(report.cards[0].x<report.cards[1].x&&report.cards[1].x<report.cards[2].x);
  await g.shot(`${out}/cards.png`,false);await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
  report.stats=await g.expr('Array.from({length:9},(_,i)=>[m.mcWorld._WaveDraftHud._Player0._Stats["_Name"+i].text,m.mcWorld._WaveDraftHud._Player0._Stats["_Value"+i].text])');
  assert.equal(report.stats[7][0],'HEAL / AMMO');assert.equal(report.stats[8][1],'97 / 120');assert.match(report.stats[4][1],/\[A\]/);await g.shot(`${out}/stats.png`,false);
  await g.page.keyboard.press('Tab');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));
  assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mMaxLife'),173);
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.shot(`${out}/pause.png`,false);
  assert.match(await g.expr('m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text'),/HP 173 \/ SHIELD 40/);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
  report.bosses=await g.eval(()=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];w.mUpgrades.AdvanceTimedWave();w.mUpgrades.__set__mLevel(25);p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();
   const enemies=w.mUpgrades.timedWave.boss.members.map((member,i)=>{const e=new P.Thing.Creature.CThing_Creature_Devil(new P.Thing.Math.CThing_Position(8.5+i*3,11.5,0));e.mBossKind=member.kind;e.mBossSlot=i;w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mLife=member.life=e.mMaxLife*[1,.5,.1][i];member.maximum=e.mMaxLife;w.mUpgrades.Level.mDevilCount++;return e;});
   // Hold simulation positions while allowing the normal Draw/presenter frame to reach the canvas.
   w.Process=()=>{};w.Draw();return enemies.map((e,i)=>{const b=w._BossHealthHud['_Boss'+i],r=b.getBounds(b),a=e.mXSI_Animation,o=a.mAnimationObject,f=o.mDirections[o.mLookup256[e.mAngle.__get__mAngle256()&255]].mFrames[a.mCurrentFrameID&16777215];return {kind:e.mBossKind,x:b._x,y:b._y,width:r.xMax-r.xMin,height:r.yMax-r.yMin,headTop:w.GetScreenPosition(e.mPosition).y+f.mDisp.y,armor:e.mEnemyArmor??0,fraction:e.mLife/e.mMaxLife,visible:b._visible};});
  });
  assert.equal(await g.expr('m.mcWorld._LanGrowthHud._Wave._Devils.text'),'3');
  for(const b of report.bosses){assert.equal(b.kind,'devil');assert(b.visible);assert.equal(b.width,40);assert.equal(b.height,5);assert.equal(b.armor,0);assert(b.y+b.height+3<=b.headTop);}
  await g.page.waitForTimeout(150);await g.shot(`${out}/bosses.png`,false);const png=PNG.sync.read(readFileSync(`${out}/bosses.png`));for(const b of report.bosses){let pixels=0;for(let y=b.y+2;y<b.y+4;y++)for(let x=b.x;x<b.x+b.width;x++){const k=(y*png.width+x)*4;if([255,174,100].every((v,c)=>Math.abs(v-png.data[k+c])<4))pixels++;}assert(pixels>0&&pixels<=Math.ceil(38*b.fraction)*2+4);b.fillPixels=pixels;}
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
 }catch(error){report.error=String(error);report.scriptErrors=await g.scriptErrors();report.browserLog=g.log;await g.shot(`${out}/failed.png`,false);throw error;}
 finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.env.CANDIDATE_OUT??`generated/reports/v034/ui-${Date.now()}`,browser=await launch();let g;
 try{g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');
  if(!await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded',5000)){await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));}
  await g.page.waitForTimeout(700);await verifyV034Candidate(g,out);console.log('V034 CANDIDATE UI PASSED '+out);
 }finally{await g?.close();await browser.close();}
}
