import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v029/modern-supplies';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[],geometry:[],pixels:[]};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const t of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil','CThing_Object_Pickup'].includes(t._CLASSID_))t.Delete();
  p.Move(new P.Thing.Math.CThing_Position(12.5,12.5,0));p.mLife=p.mMaxLife;p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;
  const q=window.__supplyQA={};
  for(const [kind,x]of[['armor',6.5],['medical',8.5],['ammo',10.5]]){
   const id='s'+w.mUpgrades.supplyState.nextId++;
   q[kind]=w.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(new P.Thing.Math.CThing_Position(x,8.5,0),kind,id));
  }
  w.mHud.mSilentMessages=true;w.mHud.mMessages=[];
 });
 for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
  const file=`${out}/boxes-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const geometry=await g.eval(()=>{
   const w=window.__game.main().mcWorld,C=window.__game.pkg.World.Map.CMap_Cell,p=window.__game.platform.presenter;
   const canvas=p.canvas.getBoundingClientRect(),scale=canvas.width/p.stageW;
   return Object.entries(window.__supplyQA).map(([kind,t])=>{const b=t.mcDrawObject.bmList[0];return {kind,id:t.mSupplyId,alpha:t.mAlpha,
    x:canvas.x+(t.mPosition.mX*C.mSize.x-w.mDrawPosition.x+b.mDisp.x)*scale,
    y:canvas.y+(t.mPosition.mY*C.mSize.y-w.mDrawPosition.y+b.mDisp.y)*scale,width:b.sBMD.width*scale,height:b.sBMD.height*scale};});
  });
  report.geometry.push({width,height,boxes:geometry});const png=PNG.sync.read(readFileSync(file));
  for(const box of geometry){
   assert(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height);assert.equal(box.alpha,100);
   let white=0,green=0,blue=0,gold=0,black=0;
   for(let y=Math.ceil(box.y);y<Math.floor(box.y+box.height);y++)for(let x=Math.ceil(box.x);x<Math.floor(box.x+box.width);x++){
    const i=(y*png.width+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];
    if(r>235&&g>245&&b>235)white++;if(g>r*1.8&&g>b*1.5&&g>60)green++;
    if(b>r+50&&b>g+20)blue++;if(r>180&&g>140&&b<150)gold++;if(r<35&&g<45&&b<45)black++;
   }
   assert(black>10,'original keyline and dark fixings');
   if(box.kind==='medical')assert(white>10&&green>40,'bright green shell and white medical cross');
   if(box.kind==='armor')assert(blue>20,'blue shield icon');if(box.kind==='ammo')assert(gold>10,'brass cartridge icon');
   report.pixels.push({width,height,kind:box.kind,white,green,blue,gold,black});
  }
 }
 await g.page.setViewportSize({width:640,height:480});
 await g.eval(()=>{const P=window.__game.pkg;Object.values(window.__game.main().mcWorld.mThing_Collection.mPlayerThings)[0].Move(new P.Thing.Math.CThing_Position(8.5,10.5,0));});
 await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused'));
 await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
 await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 const restored=await g.eval(()=>{
  const w=window.__game.main().mcWorld,q=window.__supplyQA={};w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const t of Object.values(w.mThing_Collection.mThings)){
   if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_))t.Delete();
   if(t.mSupplyId)q[t.mSupplyKind]=t;
  }
  return Object.values(q).map(t=>t.mSupplyId).sort();
 });assert.deepEqual(restored,['s1','s2','s3']);report.restored=restored;
 await g.page.mouse.click(320,300);await g.page.keyboard.down('ArrowUp');
 try{assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition.mY<8.8',5000));}
 finally{await g.page.keyboard.up('ArrowUp');}
 await g.page.waitForTimeout(300);assert.equal(await g.expr('window.__supplyQA.medical.mSupplyConsumed'),false);
 await g.eval(()=>{Object.values(window.__game.main().mcWorld.mThing_Collection.mPlayerThings)[0].mLife=73;});
 assert(await g.waitExpr('window.__supplyQA.medical.mSupplyConsumed',3000));
 assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mLife'),200);
 for(const [key,kind]of[['ArrowLeft','armor'],['ArrowRight','ammo']]){
  await g.page.keyboard.down(key);try{assert(await g.waitExpr(`window.__supplyQA.${kind}.mSupplyConsumed`,5000));}finally{await g.page.keyboard.up(key);}
 }
 report.final=await g.expr('(()=>{const p=Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0];return {life:p.mLife,armor:p.mArmor,ammo:p.mWeaponList.filter(e=>e.mActive).map(e=>[e.mNameID,e.mThing.mAmmo,e.mThing.mTotalAmmo])};})()');
 assert.equal(report.final.armor,200);assert(report.final.ammo.every(e=>e[1]===e[2]));
 await g.page.waitForTimeout(700);await g.shot(`${out}/picked-up.png`,false);report.shots.push(`${out}/picked-up.png`);
 assert.deepEqual(await g.expr('g.errors'),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await browser.close();}
console.log('MODERN SUPPLIES UI PASSED');
