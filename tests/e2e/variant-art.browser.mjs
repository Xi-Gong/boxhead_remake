// Run against the current Vite source server (GAME_URL): source import exposes the retained classic fixture
// to this review tool without adding test controls to the production game. Packaged smoke uses the built app.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const scale=Number(process.env.ART_SCALE??2),out=`generated/reports/v031/enemy-art/run-${Date.now()}-${scale}x`;mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,scale,shots:[]};let g;
const save=(name,data)=>{writeFileSync(`${out}/${name}`,Buffer.from(data.split(',')[1],'base64'));report.shots.push(name);};
try{
 g=await openGame(browser,{query:`?scale=${scale}`});await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=1,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(2),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await g.expr('m.mcWorld.mPaused=true');
 const art=await g.eval(async()=>{
  const api=await import('/src/game/local/VariantArt.ts'),P=window.__game.pkg,DI=P.DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
  const sets={charger:api.variantCollection('charger'),tyrant:api.variantCollection('charger',true),priest:api.variantCollection('priest'),lord:api.variantCollection('priest',true),oldCharger:api.classicVariantCollection('charger'),oldPriest:api.classicVariantCollection('priest')};
  while(!DI.RenderStack_Finished()){DI.RenderStack_Process(performance.now(),16);await new Promise(r=>setTimeout(r,0));}
  window.__enemyArtQA={sets};const metrics=[],images={};
  const canvas=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#e7e2d9';x.fillRect(0,0,width,height);x.fillStyle='#242a2c';x.font='12px Arial';return [c,x];};
  const draw=(ctx,set,key,d,f,x,y,zoom=1)=>{const a=set.mItems[key].mAnimationObject,frame=a.mDirections[a.mLookup256[d*16]].mFrames[f%a.mFrameCount];
   ctx.save();ctx.translate(x,y);ctx.scale(zoom,zoom);ctx.drawImage(frame.sBMD.toImageSource(),frame.mDisp.x,frame.mDisp.y,frame.sBMD.width,frame.sBMD.height);ctx.restore();};
  const [sheet,sc]=canvas(1140,6*90),[detail,dc]=canvas(1000,4*240);
  for(const [row,name]of ['oldCharger','charger','tyrant','oldPriest','priest','lord'].entries()){
   sc.fillText(name,4,row*90+40);for(let d=0;d<16;d++)draw(sc,sets[name],'stand',d,0,105+d*64,row*90+75);
  }images['all-directions.png']=sheet.toDataURL();
  for(const [row,name]of ['charger','tyrant','priest','lord'].entries()){
   const set=sets[name],keys=Object.keys(set.mItems),rows=keys.reduce((n,k)=>n+set.mItems[k].mAnimationObject.mFrameCount,0);
   let left=0,right=0,above=0,below=0;
   for(const key of keys)for(const d of set.mItems[key].mAnimationObject.mDirections)for(const f of d.mFrames){left=Math.max(left,-f.mDisp.x);right=Math.max(right,f.mDisp.x+f.sBMD.width);above=Math.max(above,-f.mDisp.y);below=Math.max(below,f.mDisp.y+f.sBMD.height);}
   const cellW=Math.ceil(left+right+16),cellH=Math.ceil(above+below+16),[actions,ac]=canvas(96+16*cellW,rows*cellH+16);let r=0;
   for(const key of keys){const a=set.mItems[key].mAnimationObject,startRow=r;for(let f=0;f<a.mFrameCount;f++,r++){
    ac.fillText(key+' '+f,4,r*cellH+32);for(let d=0;d<16;d++)draw(ac,set,key,d,f,96+left+8+d*cellW,r*cellH+above+8);
   }if(['walk','warning','cast','dying'].includes(key)){const [c,ctx]=canvas(actions.width,a.mFrameCount*cellH);ctx.drawImage(actions,0,startRow*cellH,actions.width,c.height,0,0,actions.width,c.height);images[name+'-'+key+'.png']=c.toDataURL();}}
   images[name+'-actions.png']=actions.toDataURL();
   dc.fillText(name,4,row*240+20);for(let d=0;d<4;d++)draw(dc,set,'stand',d*4,0,140+d*245,row*240+215,3);
   const sample=set.mItems.stand.mAnimationObject.mDirections[0].mFrames[0].sBMD;
   metrics.push({name,rows,cellW,cellH,left,right,above,below,backingScale:sample.toImageSource().width/sample.width});
  }images['details.png']=detail.toDataURL();
  return {images,metrics};
 });for(const [name,data]of Object.entries(art.images))save(name,data);report.metrics=art.metrics;assert(art.metrics.every(m=>m.backingScale===scale));
 if(scale===2){
  const video=await g.eval(async()=>{
   const sets=window.__enemyArtQA.sets,c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d'),stream=c.captureStream(15),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
   const done=new Promise(resolve=>rec.onstop=()=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});rec.start();
   const schedule=['walk','warning','charge','recovery','walk','cast','recovery','shothit_1','shothit_2','dying','dead'];
   for(let n=0;n<110;n++){x.fillStyle='#e7e2d9';x.fillRect(0,0,640,360);x.fillStyle='#242a2c';x.font='13px Arial';const key=schedule[Math.floor(n/10)];x.fillText(key+' / every logical frame including return and final poses',12,22);
    for(const [i,name]of ['charger','tyrant','priest','lord'].entries()){
     const a=sets[name].mItems[key].mAnimationObject,f=a.mDirections[a.mLookup256[Math.floor(n/7)%16*16]].mFrames[Math.min(a.mFrameCount-1,Math.floor((n%10)/9*(a.mFrameCount-1)))];
     x.save();x.translate(85+i*155,240);x.scale(2.2,2.2);x.drawImage(f.sBMD.toImageSource(),f.mDisp.x,f.mDisp.y,f.sBMD.width,f.sBMD.height);x.restore();x.fillText(name,45+i*155,295);
    }await new Promise(r=>setTimeout(r,66));
   }rec.stop();for(const track of stream.getTracks())track.stop();return done;
  });save('walk-skills.webm',video);
 }
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],qa=window.__enemyArtQA;
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;for(const t of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_)){t.ClearCollideCell();t.Delete();}
  const clear=[];for(let y=3;y<w.mMap.mCells.length-3;y++)for(let x=3;x<w.mMap.mCells[y].length-3;x++)if(!(w.mMap.mCells[y][x].mCollide&P.World.Map.CMap_Cell.mCollide_Navigation))clear.push({x,y});
  const center=clear.sort((a,b)=>Math.hypot(a.x-12,a.y-10)-Math.hypot(b.x-12,b.y-10))[0];p.Move(new P.Thing.Math.CThing_Position(center.x+.5,center.y+.5,0));p.mInvincible=0;p.mAlpha=100;
  qa.enemies=[];
  for(const [i,name]of ['charger','tyrant','priest','lord'].entries()){
   const kind=i<2?'charger':'priest',C=i<2?P.Thing.Creature.CThing_Creature_Zombie:P.Thing.Creature.CThing_Creature_Devil;
   const target={x:center.x+[-5,-3,3,5][i],y:center.y},cell=clear.sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
   const e=new C(new P.Thing.Math.CThing_Position(cell.x+.5,cell.y+.5,0));e.mEnemyVariant=kind;if(i%2)e.mBossKind=kind;
   w.mThing_Collection.AddThing(e);e.Process_Init();e.Move(e.mPosition);e.SetState('State_GotoPlayer');e.mVariantCooldown=w.mTick+500;e.mAngle.__set__mAngle(Math.PI/2);e.mXSI_Animation.SetAnimation_FORCED('stand');qa.enemies.push(e);
  }w.mPaused=false;
 });
 await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(80);await g.page.keyboard.up('ArrowRight');await g.page.keyboard.down('Slash');await g.page.waitForTimeout(80);await g.page.keyboard.up('Slash');await g.expr('m.mcWorld.mPaused=true');
 for(const old of [true,false]){
  await g.eval(old=>{const w=window.__game.main().mcWorld,qa=window.__enemyArtQA;for(const [i,e]of qa.enemies.entries()){
   e.mXSI_Animation.mCollection=old?qa.sets[i<2?'oldCharger':'oldPriest']:qa.sets[['charger','tyrant','priest','lord'][i]];e.mXSI_Animation.SetAnimation_FORCED('stand');
  }w.mPaused=false;w.Draw();w.mPaused=true;},old);await g.page.waitForTimeout(120);const file=`combat-${old?'classic':'new'}.png`;await g.shot(`${out}/${file}`,false);report.shots.push(file);
 }
 report.warnings=await g.eval(async()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,qa=window.__enemyArtQA,api=await import('/src/game/local/EnemyVariants.ts'),boss=await import('/src/game/local/BossWaves.ts');
  const e=qa.enemies[1],p=Object.values(w.mThing_Collection.mPlayerThings)[0],d=p.mPosition.Subtract(e.mPosition).Normalize2D(1);e.mChargeX=d.mX;e.mChargeY=d.mY;e.mAngle.__set__mAngle(Math.atan2(d.mY,d.mX));e.SetState('State_VariantCharge');
  const lord=qa.enemies[3];w.mUpgrades.enemyVariantState.zones=[];lord.mVariantCooldown=0;boss.beginBossCast(lord);P.CMain.mSaveData.__set__mDetail(false);
  w.mPaused=false;w.Draw();w.mPaused=true;return {corridor:api.chargeWarningGeometry(e),zones:api.emberZones(w).length,quality:(await import('/src/engine/runtime.ts'))._root._quality,centers:api.emberZones(w).map(z=>w.GetScreenPosition(z.mPosition))};
 });assert.equal(report.warnings.zones,3);assert.equal(report.warnings.quality,'LOW');assert(report.warnings.corridor.radius>10);
 await g.page.waitForTimeout(120);await g.shot(`${out}/warnings-low.png`,false);report.shots.push('warnings-low.png');
 const png=PNG.sync.read(readFileSync(`${out}/warnings-low.png`));let warningPixels=0;
 for(const p of report.warnings.centers)for(let y=Math.max(0,Math.floor(p.y-34));y<Math.min(png.height,Math.ceil(p.y+34));y++)for(let x=Math.max(0,Math.floor(p.x-34));x<Math.min(png.width,Math.ceil(p.x+34));x++){
  const i=(y*png.width+x)*4;if(png.data[i]>185&&png.data[i+1]>115&&png.data[i+2]<155&&png.data[i]-png.data[i+2]>60)warningPixels++;
 }assert(warningPixels>100);report.warningPixels=warningPixels;
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('ENEMY ART LIGHT BROWSER PASSED '+out);
