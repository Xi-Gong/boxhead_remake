import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v030/enemy-variants';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,art:[],shots:[]};let g;
const repaint=async()=>g.eval(()=>{const w=window.__game.main().mcWorld;w.mPaused=false;w.Draw();w.mPaused=true;});
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld;w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const e of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(e._CLASSID_))e.Delete();
  const q=window.__variantsQA={enemies:{}};
  for(const kind of ['charger','priest']){const C=kind==='charger'?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil,e=new C(new P.Thing.Math.CThing_Position(5.5,kind==='charger'?8.5:10.5,0));e.mEnemyVariant=kind;w.mThing_Collection.AddThing(e);e.Process_Init();e.Move(e.mPosition);e.mFlags|=P.Thing.CThing.mFlag_Collidable;q.enemies[kind]=e;}
  w.mPaused=true;
 });
 const sheets=await g.eval(()=>{
  const rows=[],q=window.__variantsQA;
  for(const [kind,e]of Object.entries(q.enemies)){
   const items=e.mXSI_Animation.mCollection.mItems,keys=Object.keys(items),c=document.createElement('canvas');c.width=96+16*88;c.height=keys.length*100+24;const ctx=c.getContext('2d');ctx.fillStyle='#e7e2d9';ctx.fillRect(0,0,c.width,c.height);ctx.font='12px Arial';ctx.fillStyle='#252525';
   const metrics=[];
   for(let row=0;row<keys.length;row++){
    const key=keys[row],a=items[key].mAnimationObject;ctx.fillText(key,5,row*100+60);
    for(let d=0;d<a.mDirections.length;d++){
     const frames=a.mDirections[d].mFrames,f=frames[Math.floor(frames.length/2)],x=96+d*88+44,y=row*100+84,img=f.sBMD.toImageSource();
     ctx.strokeStyle='#b8b0a4';ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x+8,y);ctx.stroke();ctx.drawImage(img,x+f.mDisp.x,y+f.mDisp.y,f.sBMD.width,f.sBMD.height);ctx.fillStyle='#252525';ctx.fillText(String(d),x-4,row*100+98);
     for(const frame of frames){if(!frame.sBMD?.toImageSource())throw new Error('unbaked frame');if(!Number.isFinite(frame.mDisp.x)||!Number.isFinite(frame.mDisp.y))throw new Error('invalid anchor');}
    }metrics.push({key,directions:a.mDirections.length,frames:a.mFrameCount});
   }rows.push({kind,png:c.toDataURL('image/png'),metrics});
  }return rows;
 });
 for(const sheet of sheets){const file=`${out}/${sheet.kind}-all-directions.png`;writeFileSync(file,Buffer.from(sheet.png.split(',')[1],'base64'));report.shots.push(file);report.art.push({kind:sheet.kind,metrics:sheet.metrics});}
 const video=await g.eval(async()=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d'),stream=c.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];
  recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=async()=>{const b=new Blob(chunks,{type:'video/webm'}),reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(b);});recorder.start();
  const actions=['stand','walk','attack','shothit_1','shothit_2','warning','charge','cast','recovery','dying','dead'],start=performance.now();
  while(performance.now()-start<8000){
   const time=performance.now()-start,key=actions[Math.min(10,Math.floor(time/720))];ctx.fillStyle='#e7e2d9';ctx.fillRect(0,0,320,180);ctx.fillStyle='#222';ctx.font='14px Arial';ctx.fillText(key,12,22);
   for(const [i,e]of Object.values(window.__variantsQA.enemies).entries()){
    const a=e.mXSI_Animation.mCollection.mItems[key].mAnimationObject,d=Math.floor(time/450)%a.mDirections.length,frames=a.mDirections[d].mFrames,f=frames[Math.floor(time/70)%frames.length],x=90+i*150,y=148;
    ctx.save();ctx.translate(x,y);ctx.scale(1.7,1.7);ctx.drawImage(f.sBMD.toImageSource(),f.mDisp.x,f.mDisp.y,f.sBMD.width,f.sBMD.height);ctx.restore();
   }await new Promise(r=>setTimeout(r,65));
  }recorder.stop();for(const track of stream.getTracks())track.stop();return done;
 });writeFileSync(`${out}/actions.webm`,Buffer.from(video.split(',')[1],'base64'));
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.Move(new P.Thing.Math.CThing_Position(9.5,8.5,0));p.mInvincible=0;p.mAlpha=100;p.mArmor=200;p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);for(const e of Object.values(window.__variantsQA.enemies)){e.mVariantCooldown=0;e.SetState('State_GotoPlayer');e.State_GotoPlayer();}w.Draw();});
 const warning=await g.expr('({charger:window.__variantsQA.enemies.charger.mVariantPhase,priest:window.__variantsQA.enemies.priest.mStateID,zones:m.mcWorld.mUpgrades.enemyVariantState.zones.length})');assert.equal(warning.charger,'warning');assert.equal(warning.priest,'State_VariantCast');assert.equal(warning.zones,1);report.warning=warning;
 for(const [width,height]of [[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(700);await repaint();const file=`${out}/warning-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const geometry=await g.eval(()=>{const w=window.__game.main().mcWorld,c=window.__game.platform.presenter.canvas.getBoundingClientRect();return {width:w.mScreenSize.x,height:w.mScreenSize.y,scale:c.width/w.mScreenSize.x,left:c.left,top:c.top,zone:w.GetScreenPosition(w.mUpgrades.enemyVariantState.zones[0].mPosition),enemies:Object.values(window.__variantsQA.enemies).map(e=>{const p=w.GetScreenPosition(e.mPosition),f=e.mXSI_Animation.mCurrentFrame;return {x:p.x+f.mDisp.x,y:p.y+f.mDisp.y,w:f.sBMD.width,h:f.sBMD.height};})};});
  for(const b of geometry.enemies)assert(Number.isFinite(b.x)&&Number.isFinite(b.y)&&b.x>=0&&b.y>=0&&b.x+b.w<=geometry.width&&b.y+b.h<=geometry.height,'every enemy must be grounded and visible inside the world');
  const png=PNG.sync.read(readFileSync(file)),cx=geometry.left+geometry.zone.x*geometry.scale,cy=geometry.top+geometry.zone.y*geometry.scale;let ring=0;
  for(let y=Math.max(0,Math.ceil(cy-36*geometry.scale));y<Math.min(height,cy+36*geometry.scale);y++)for(let x=Math.max(0,Math.ceil(cx-36*geometry.scale));x<Math.min(width,cx+36*geometry.scale);x++){
   const d=Math.hypot(x-cx,y-cy)/geometry.scale,i=(y*png.width+x)*4;if(d>=28&&d<=35&&png.data[i]>200&&png.data[i+1]>150&&png.data[i+1]-png.data[i+2]>40)ring++;
  }assert(ring>50,'the actual warning ring must have visible gold pixels');(report.geometry??=[]).push({width,height,ring,...geometry});
 }
 await g.eval(()=>{const w=window.__game.main().mcWorld,q=window.__variantsQA,process=w.Process;q.stopTick=w.mTick+25;w.Process=function(){const r=process.call(this);if(this.mTick>=q.stopTick)this.mPaused=true;return r;};w.mPaused=false;});
 assert(await g.waitExpr('m.mcWorld.mPaused && m.mcWorld.mTick>=window.__variantsQA.stopTick'));
 assert(await g.expr('m.mcWorld.mUpgrades.enemyVariantState.zones.some(z=>m.mcWorld.mTick-z.born>=z.warning)'));
 await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(700);await repaint();await g.shot(`${out}/burn-640x480.png`,false);report.shots.push(`${out}/burn-640x480.png`);
 await g.expr('P.CMain.mSaveData.__set__mDetail(false)');await g.page.waitForTimeout(700);await repaint();await g.shot(`${out}/burn-low-640x480.png`,false);report.shots.push(`${out}/burn-low-640x480.png`);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('ENEMY VARIANTS ART PASSED');
