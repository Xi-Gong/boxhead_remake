import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/demons-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch();let g;const report={ok:false,method:'One production browser; prepared ordinary/Boss art, warning and armor scene, pixel/geometry checks'};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=2,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(3),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,2))');
 await g.click(320,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));await g.page.waitForTimeout(700);
 const art=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,at=(x,y)=>new P.Thing.Math.CThing_Position(x,y,0),p=Object.values(w.mThing_Collection.mPlayerThings)[0],enemies=[],used=new Set();w.mPaused=true;
  const open=[];for(const row of w.mMap.mCells)for(const c of row)if(c&&!(c.mCollide&P.World.Map.CMap_Cell.mCollide_Navigation))open.push(c);
  const nearest=(x,y)=>open.filter(c=>!used.has(c)).sort((a,b)=>Math.hypot(a.mID.x+.5-x,a.mID.y+.5-y)-Math.hypot(b.mID.x+.5-x,b.mID.y+.5-y))[0];
  const center=nearest(13.5,13.5);p.Move(at(center.mID.x+.5,center.mID.y+.5));p.mInvincible=0;p.mAlpha=100;
  const canvas=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#e7e2d9';x.fillRect(0,0,width,height);x.fillStyle='#242a2c';x.font='12px Arial';return [c,x];};
  const images={},metrics=[],[details,dc]=canvas(1100,800);
  for(const [i,spec]of [{kind:'butcher',boss:false},{kind:'butcher',boss:true},{kind:'hunter',boss:false},{kind:'hunter',boss:true}].entries()){
   const c=nearest(p.mPosition.mX+(i%2?3.5:-3.5),p.mPosition.mY+(i<2?-1.5:2.5));used.add(c);
   const e=new P.Thing.Creature.CThing_Creature_Devil(at(c.mID.x+.5,c.mID.y+.5));e.mCombatKind=spec.kind;if(spec.boss){e.mBossKind=spec.kind;e.mBossSlot=i===1?0:1;}
   w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mAngle.__set__mAngle(Math.PI/2);e.mXSI_Animation.SetAnimation_FORCED('stand');enemies.push(e);
   const set=e.mXSI_Animation.mCollection,name=spec.kind+(spec.boss?'Boss':''),keys=Object.keys(set.mItems),rows=keys.reduce((n,k)=>n+set.mItems[k].mAnimationObject.mFrameCount,0),[sheet,sc]=canvas(1500,rows*100+20);let r=0;
   for(const key of keys){const a=set.mItems[key].mAnimationObject;for(let f=0;f<a.mFrameCount;f++,r++){
    sc.fillText(key+' '+f,4,r*100+25);for(let d=0;d<16;d++){const frame=a.mDirections[a.mLookup256[d*16]].mFrames[f];if(!frame.sBMD)throw Error('not prebaked');sc.drawImage(frame.sBMD.toImageSource(),130+d*84+frame.mDisp.x,r*100+83+frame.mDisp.y,frame.sBMD.width,frame.sBMD.height);}
   }}images[name+'-actions.png']=sheet.toDataURL();dc.fillText(name,4,i*200+20);
   for(let d=0;d<8;d++){const a=set.mItems.stand.mAnimationObject,f=a.mDirections[a.mLookup256[d*32]].mFrames[0];dc.save();dc.translate(85+d*135,i*200+175);dc.scale(2.1,2.1);dc.drawImage(f.sBMD.toImageSource(),f.mDisp.x,f.mDisp.y,f.sBMD.width,f.sBMD.height);dc.restore();}
   metrics.push({name,hp:e.mMaxLife,armor:e.mEnemyArmorMaximum,walk:set.mItems.walk.mAnimationObject.mFrameCount});
   const angle=Math.atan2(p.mPosition.mY-e.mPosition.mY,p.mPosition.mX-e.mPosition.mX);e.mCombatAimX=Math.cos(angle);e.mCombatAimY=Math.sin(angle);e.mAngle.__set__mAngle(angle);e.SetState(spec.kind==='hunter'?'State_CombatHunt':'State_CombatCleave');e.mEnemyArmor/=2;
  }
  const members=enemies.filter(e=>e.mBossKind).map(e=>({id:e.sUniqueID,kind:e.mBossKind,life:e.mLife,maximum:e.mMaxLife,defeated:false}));w.mUpgrades.timedWave.boss={...members[0],members,reinforcementTicks:75};delete w.mUpgrades.timedWave.clear;
  window.__demonQA=enemies;w.lTrackPosition=p.mPosition.Clone();w.TrackThing(p);w.mPaused=false;w.Draw();w.mPaused=true;images['details.png']=details.toDataURL();return {images,metrics};
 });
 for(const [name,data]of Object.entries(art.images))writeFileSync(out+'/'+name,Buffer.from(data.split(',')[1],'base64'));report.metrics=art.metrics;assert(art.metrics.every(m=>m.armor>0&&m.walk===8));
 await g.page.waitForTimeout(100);const buffer=await g.page.screenshot();writeFileSync(out+'/warnings.png',buffer);
 const png=PNG.sync.read(buffer);let cyan=0,gold=0;for(let i=0;i<png.data.length;i+=4){if(png.data[i]>100&&png.data[i]<185&&png.data[i+1]>185&&png.data[i+2]>185)cyan++;if(png.data[i]>200&&png.data[i+1]>140&&png.data[i+1]<230&&png.data[i+2]<150)gold++;}report.pixels={cyan,gold};assert(cyan>30&&gold>70,JSON.stringify(report.pixels));
 report.bars=await g.expr('[0,1].map(i=>{const b=m.mcWorld._BossHealthHud["_Boss"+i];return {visible:b._visible,width:b._width,height:b._height};})');assert(report.bars.every(b=>b.visible&&b.width===64&&b.height===7));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('DEMONS PASSED '+out);
