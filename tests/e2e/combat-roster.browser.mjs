import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/combat-roster-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch();let g;const report={ok:false,method:'Single production browser, prepared new-enemy art/telegraph scene, direct pixel checks'};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(320,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));await g.page.waitForTimeout(700);
 const art=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,at=(x,y)=>new P.Thing.Math.CThing_Position(x,y,0),p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  w.mPaused=true;const enemies=[];p.Move(at(10.5,8.5));p.mInvincible=0;p.mAlpha=100;
  for(const [i,kind]of ['runner','brute'].entries()){
   const e=new P.Thing.Creature.CThing_Creature_Zombie(at(6.5+i*2,8.5));e.mCombatKind=kind;w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mCombatCooldown=w.mTick+500;e.mXSI_Animation.SetAnimation_FORCED('stand');enemies.push(e);
  }
  window.__rosterQA=enemies;const images={},metrics=[];
  const canvas=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#e7e2d9';x.fillRect(0,0,width,height);x.fillStyle='#242a2c';x.font='12px Arial';return [c,x];};
  const [details,dc]=canvas(1100,400);
  for(const [row,e]of enemies.entries()){
   const set=e.mXSI_Animation.mCollection,keys=Object.keys(set.mItems),rows=keys.reduce((n,k)=>n+set.mItems[k].mAnimationObject.mFrameCount,0),[sheet,sc]=canvas(1150,rows*80+20);let r=0;
   for(const key of keys){const a=set.mItems[key].mAnimationObject;for(let f=0;f<a.mFrameCount;f++,r++){
    sc.fillText(key+' '+f,4,r*80+25);
    for(let d=0;d<16;d++){const frame=a.mDirections[a.mLookup256[d*16]].mFrames[f];assertFrame(frame);sc.drawImage(frame.sBMD.toImageSource(),105+d*64+frame.mDisp.x,r*80+66+frame.mDisp.y,frame.sBMD.width,frame.sBMD.height);}
   }}images[e.mCombatKind+'-actions.png']=sheet.toDataURL();
   dc.fillText(e.mCombatKind,6,row*200+20);for(let d=0;d<8;d++){const a=set.mItems.stand.mAnimationObject,frame=a.mDirections[a.mLookup256[d*32]].mFrames[0];dc.save();dc.translate(95+d*135,row*200+170);dc.scale(2.5,2.5);dc.drawImage(frame.sBMD.toImageSource(),frame.mDisp.x,frame.mDisp.y,frame.sBMD.width,frame.sBMD.height);dc.restore();}
   metrics.push({kind:e.mCombatKind,hp:e.mMaxLife,speed:e.mSpeed,actions:keys,walkFrames:set.mItems.walk.mAnimationObject.mFrameCount});
  }
  function assertFrame(frame){if(!frame?.sBMD||!Number.isFinite(frame.mDisp.x)||!Number.isFinite(frame.mDisp.y))throw Error('invalid frame');}
  images['details.png']=details.toDataURL();const b=enemies[1];b.mCombatAimX=1;b.mCombatAimY=0;b.SetState('State_CombatSmash');
  w.mPaused=false;w.Draw();w.mPaused=true;return {images,metrics};
 });
 for(const [name,data]of Object.entries(art.images))writeFileSync(out+'/'+name,Buffer.from(data.split(',')[1],'base64'));report.metrics=art.metrics;
 assert(art.metrics[0].speed>art.metrics[1].speed);await g.page.waitForTimeout(100);const buffer=await g.page.screenshot();writeFileSync(out+'/warning.png',buffer);
 const png=PNG.sync.read(buffer);let gold=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i]>200&&png.data[i+1]>140&&png.data[i+1]<230&&png.data[i+2]<150)gold++;assert(gold>70);report.warningPixels=gold;
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('COMBAT ROSTER PASSED '+out);
