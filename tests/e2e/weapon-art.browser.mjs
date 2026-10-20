import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const scale=Number(process.env.ART_SCALE??2),out=`generated/reports/v031/weapon-art/run-${Date.now()}-${scale}x`;mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,scale,skins:[],shots:[]};let g;
const save=(name,data)=>{writeFileSync(`${out}/${name}`,Buffer.from(data.split(',')[1],'base64'));report.shots.push(name);};
try{
 g=await openGame(browser,{query:`?scale=${scale}`});await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 await g.expr('m.mcWorld.mPaused=true');
 for(const skin of [0,1,2,3]){
  const data=await g.eval(async skin=>{
   const P=window.__game.pkg,X=P.DrawPrimitive.XSI,C=P.Thing.Creature.CThing_Creature_Player,modern=C.GetCollection(skin),classic=C.mXSI_Collections[skin];
   while(!X.CDrawPrimitive_XSI_DI.RenderStack_Finished()){X.CDrawPrimitive_XSI_DI.RenderStack_Process(performance.now(),16);await new Promise(r=>setTimeout(r,0));}
   const guns=['pistol','uzi','shotgun','rocket','railgun'],canvas=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#e7e2d9';x.fillRect(0,0,width,height);x.font='12px Arial';x.fillStyle='#242a2c';return [c,x];};
   const [sheet,ctx]=canvas(1120,740),[walk,wc]=canvas(1120,5*8*66+24),[detail,dc]=canvas(840,5*160+24),metrics=[];
   const draw=(ctx,collection,key,facing,frame,x,y,zoom=1)=>{
    const a=collection.mItems[key].mAnimationObject,f=a.mDirections[a.mLookup256[facing*16]].mFrames[frame%a.mFrameCount];
    if(!f.sBMD?.toImageSource())throw new Error('unbaked '+key);ctx.save();ctx.translate(x,y);ctx.scale(zoom,zoom);ctx.drawImage(f.sBMD.toImageSource(),f.mDisp.x,f.mDisp.y,f.sBMD.width,f.sBMD.height);ctx.restore();return f;
   };
   for(let k=0;k<guns.length;k++){
    const gun=guns[k];ctx.fillText(gun+' old',4,k*144+30);ctx.fillText(gun+' new',4,k*144+102);dc.fillText(gun,4,k*160+20);
    for(let d=0;d<16;d++){
     draw(ctx,classic,gun+'stand',d,0,96+d*64,60+k*144);draw(ctx,modern,gun+'stand',d,0,96+d*64,132+k*144);ctx.fillText(String(d),92+d*64,143+k*144);
     for(let f=0;f<8;f++){if(!d)wc.fillText(gun+' '+f,4,(k*8+f)*66+30);draw(wc,modern,gun+'walk',d,f,96+d*64,(k*8+f)*66+56);}
    }
    for(let d=0;d<4;d++){
     draw(dc,classic,gun+'stand',d*4,0,90+d*200,70+k*160,1.4);draw(dc,modern,gun+'stand',d*4,0,162+d*200,122+k*160,2.5);
    }
    let anchors=0;for(const action of ['stand','walk']){
     const a=classic.mItems[gun+action].mAnimationObject,b=modern.mItems[gun+action].mAnimationObject;
     if(a.mFrameCount!==b.mFrameCount)throw new Error('animation length');
     for(let d=0;d<a.mDirections.length;d++)for(let f=0;f<a.mFrameCount;f++){
      if(JSON.stringify(a.mDirections[d].mFrames[f].XSI_Info)!==JSON.stringify(b.mDirections[d].mFrames[f].XSI_Info))throw new Error('anchor mismatch');anchors++;
     }
    }metrics.push({gun,anchors});
   }
   const sample=modern.mItems.pistolstand.mAnimationObject.mDirections[0].mFrames[0].sBMD;
   const backingScale=sample.toImageSource().width/sample.width;
   window.__weaponArtQA??={};window.__weaponArtQA[skin]={modern,classic};return {sheet:sheet.toDataURL(),walk:walk.toDataURL(),detail:detail.toDataURL(),metrics,backingScale};
  },skin);
  assert.equal(data.backingScale,scale);
  for(const key of ['sheet','walk','detail'])save(`skin-${skin}-${key}.png`,data[key]);report.skins.push({skin,metrics:data.metrics,backingScale:data.backingScale});
 }
 if(scale===2){
  const video=await g.eval(async()=>{
   const c=document.createElement('canvas');c.width=640;c.height=320;const x=c.getContext('2d'),stream=c.captureStream(15),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];
   rec.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});rec.start();
   const start=performance.now(),guns=['pistol','uzi','shotgun','rocket','railgun'];
   while(performance.now()-start<8000){
    const elapsed=performance.now()-start,phase=Math.floor(elapsed/2000),skin=Math.min(3,phase),sets=window.__weaponArtQA[skin];
    x.fillStyle='#e7e2d9';x.fillRect(0,0,640,320);x.fillStyle='#242a2c';x.font='14px Arial';x.fillText(`Skin ${skin} / native walk cycle / OLD above, NEW below`,14,22);
    for(let i=0;i<5;i++)for(const [row,collection] of [sets.classic,sets.modern].entries()){
     const phaseTime=elapsed%2000,key=phaseTime<500?guns[i]+'stand':phaseTime<1400?guns[i]+'walk':phaseTime<1650?'shothit_1':phaseTime<1900?'shothit_2':guns[i]+'stand';
     const a=collection.mItems[key].mAnimationObject,d=a.mLookup256[Math.floor(elapsed/125)%16*16],f=a.mDirections[d].mFrames[Math.floor(elapsed/90)%a.mFrameCount];
     x.save();x.translate(65+i*125,140+row*150);x.scale(2,2);x.drawImage(f.sBMD.toImageSource(),f.mDisp.x,f.mDisp.y,f.sBMD.width,f.sBMD.height);x.restore();
     if(!row)x.fillText(guns[i],20+i*125,50);
    }await new Promise(r=>setTimeout(r,65));
   }rec.stop();for(const t of stream.getTracks())t.stop();return done;
  });save('walk-and-turn.webm',video);
 }
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;for(const t of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_)){t.ClearCollideCell();t.Delete();}
  for(const name of ['uzi','shotgun','rocket','railgun'])p.NewWeapon(name);p.SelectWeapon('pistol');p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));p.mInvincible=0;p.mAlpha=100;
  w.mPaused=false;
 });
 await g.page.keyboard.press('Period');assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mNameID==="uzi"'));
 for(const name of ['shotgun','rocket','railgun','pistol','uzi']){
  await g.page.keyboard.press('Period');assert(await g.waitExpr(`Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mNameID==="${name}"`));
 }
 await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(120);await g.page.keyboard.up('ArrowRight');
 await g.page.keyboard.down('Slash');await g.page.waitForTimeout(160);await g.page.keyboard.up('Slash');
 await g.expr('m.mcWorld.mPaused=true');
 for(const classic of [true,false]){
  await g.eval(classic=>{
   const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],a=p.mXSI_Animation,sets=window.__weaponArtQA[3];
   a.mCollection=classic?sets.classic:sets.modern;a.SetAnimation_FORCED('uzistand');a.mPreUpdate=false;w.mPaused=false;w.Draw();w.mPaused=true;
  },classic);
  await g.page.waitForTimeout(100);const name=`combat-${classic?'old':'new'}.png`;await g.shot(`${out}/${name}`,false);report.shots.push(name);
 }
 await g.eval(()=>{
  const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.mWeapon_Current.mPersistentEnchantment=true;p.mWeapon_Current.mEnchantedAmmo=p.mWeapon_Current.mAmmo;w.mPaused=false;
 });
 await g.page.keyboard.down('Slash');await g.page.waitForTimeout(120);await g.page.keyboard.up('Slash');await g.expr('m.mcWorld.mPaused=true');
 await g.page.waitForTimeout(100);await g.shot(`${out}/combat-enchanted.png`,false);report.shots.push('combat-enchanted.png');
 const hero=await g.expr('m.mcWorld.GetScreenPosition(Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition)');
 const a=PNG.sync.read(readFileSync(`${out}/combat-old.png`)),b=PNG.sync.read(readFileSync(`${out}/combat-new.png`));let changed=0;
 for(let y=Math.max(0,Math.floor(hero.y-65));y<Math.min(a.height,hero.y+10);y++)for(let x=Math.max(0,Math.floor(hero.x-45));x<Math.min(a.width,hero.x+45);x++){
  const i=(y*a.width+x)*4;if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2])changed++;
 }
 assert(changed>12);report.changedHeroPixels=changed;report.hero=hero;assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('WEAPON ART LIGHT BROWSER PASSED '+out);
