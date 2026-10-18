// Real Canvas and keyboard walk-over pickups; controlled transport. Socket equivalence is a separate gate.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v028/supplies-ui';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[],states:[],geometry:[]};let g;
try{
 g=await openGame(browser,{init:()=>{
  const q=window.__supplyQA={};window.boxheadDesktop={isElectron:true,versions:{},toggleFullscreen(){},quit(){},isFullscreen:async()=>false,lan:{
   onHosts(){},onPeer(){},onMessage(cb){q.message=cb;},discoverStart:async()=>({ok:true}),discoverStop(){},
   hostSetStatus(){},shutdown(){},addresses:async()=>[],send(m){if(m.t==='in')setTimeout(()=>q.message({t:'in',tick:m.tick,bits:0}),0);}}};
 }});
 await toMainMenu(g);await g.clickClip('m.mcScreen.mcLanGame');assert(await g.waitScreen('State_LanLobby','Screen_LanLobby'));
 await g.eval(()=>window.__supplyQA.message({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',inputDelay:0,
  cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:3,charP2:0}}));
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
 await g.eval(()=>{
  const q=window.__supplyQA,w=window.__game.main().mcWorld,P=window.__game.pkg;
  // A received wire start takes the client path (role 1); this fixture does not run a real join handshake.
  const role=1,p=Object.values(w.mThing_Collection.mPlayerThings).find(p=>p.mPlayerIndex===role);q.role=role;
  p.Move(new P.Thing.Math.CThing_Position(7.5,9.5,0));p.mInvincible=0;p.mLife=137;
  for(const t of Object.values(w.mThing_Collection.mThings))if(t._CLASSID_==='CThing_Creature_Zombie'||t._CLASSID_==='CThing_Creature_Devil')t.Delete();
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const name of ['uzi','shotgun','grenade','mine'])p.NewWeapon(name);
  for(const entry of p.mWeaponList)if(entry.mActive&&entry.mNameID!=='pistol')entry.mThing.mAmmo=0;
  for(const [kind,dx]of[['armor',-2],['ammo',2]]){
   const crate=w.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(p.mPosition.Add(new P.Thing.Math.CThing_Position(dx,0,0)),kind));
   crate.SetDeleteCounter(P.CMain.mFPS*120);q[kind]=crate;
  }
  const process=w.Process;
  w.Process=function(){
   if(q.damage){const damage=q.damage;delete q.damage;p.mLife=137;
    new P.Thing.Affect.CThing_Affect_Bullet(p,p,damage,p.mAngle).AffectThing(p);q.result={life:p.mLife,armor:p.mArmor};}
   return process.call(this);
  };
 });
 const state=()=>g.eval(()=>{
  const q=window.__supplyQA,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings).find(p=>p.mPlayerIndex===q.role),h=w.mHud.mcPlayers[q.role];
  return {life:p.mLife,armor:p.mArmor??0,armorTaken:q.armor.mSupplyConsumed,ammoTaken:q.ammo.mSupplyConsumed,
   bar:!!h._ArmorBar?._visible,lifeBar:h.mcLife._visible,bounds:(h._ArmorBar??h.mcLife).getBounds(window.__game.player.root),
   ammo:p.mWeaponList.filter(e=>e.mActive).map(e=>({name:e.mNameID,ammo:e.mThing.mAmmo,total:e.mThing.mTotalAmmo}))};
 });
 const shot=async name=>{await g.page.waitForTimeout(700);const file=`${out}/${name}.png`;await g.shot(file,false);report.shots.push(file);return file;};
 await shot('boxes-640x480');
 await g.page.mouse.click(320,300);
 const walk=async(key,kind)=>{await g.page.keyboard.down(key);try{
  if(!await g.waitExpr(`window.__supplyQA.${kind}.mSupplyConsumed`,5000)){
   report.failure=await g.eval(()=>({lan:window.__game.lan(),players:Object.values(window.__game.main().mcWorld.mThing_Collection.mPlayerThings).map(p=>({index:p.mPlayerIndex,x:p.mPosition.mX,y:p.mPosition.mY,life:p.mLife,state:p.mStateID})),
    crate:{x:window.__supplyQA.armor.mPosition.mX,y:window.__supplyQA.armor.mPosition.mY,process:window.__supplyQA.armor.Process?.name,cell:window.__supplyQA.armor.mCurrentCell?.mCollide},active:document.activeElement?.tagName}));
   await shot('failed-walk');throw new Error('walk-over pickup failed: '+JSON.stringify(report.failure));
  }
 }finally{await g.page.keyboard.up(key);}};
 await walk('ArrowLeft','armor');let current=await state();assert.equal(current.armor,100);assert(current.life<200);assert(current.bar&&current.lifeBar);report.states.push(current);
 const full=await shot('armor-full-640x480');current=await state();
 const pixels=PNG.sync.read(readFileSync(full));let blue=0,green=0;
 for(let y=Math.floor(current.bounds.yMin);y<=Math.ceil(current.bounds.yMax);y++)for(let x=Math.floor(current.bounds.xMin);x<=Math.ceil(current.bounds.xMax);x++){
  const i=(y*pixels.width+x)*4,r=pixels.data[i],a=pixels.data[i+1],b=pixels.data[i+2];if(b>r+50&&b>a+20)blue++;if(a>r+50&&a>b+50)green++;
 }
 assert(blue>20&&green===0,'armor uses blue only, without revealing the green health fill');report.pixels={blue,green};
 await g.eval(()=>{window.__supplyQA.damage=40;});assert(await g.waitExpr('window.__supplyQA.result?.armor===60'));
 assert.deepEqual(await g.eval(()=>window.__supplyQA.result),{life:137,armor:60});
 const partial=PNG.sync.read(readFileSync(await shot('armor-partial-640x480')));current=await state();
 assert.equal(current.armor,60);let partialBlue=0,partialGreen=0;
 for(let y=Math.floor(current.bounds.yMin);y<=Math.ceil(current.bounds.yMax);y++)for(let x=Math.floor(current.bounds.xMin);x<=Math.ceil(current.bounds.xMax);x++){
  const i=(y*partial.width+x)*4,r=partial.data[i],a=partial.data[i+1],b=partial.data[i+2];
  if(b>r+50&&b>a+20)partialBlue++;if(a>r+50&&a>b+50)partialGreen++;
 }
 assert(partialBlue>0&&partialBlue<blue*.75&&partialGreen>0,'60% armor must shrink within the same authored green color band');
 report.sixtyPercentPixels={blue:partialBlue,green:partialGreen};
 for(const [width,height]of[[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await shot(`armor-partial-${width}x${height}`);
  current=await state();assert(current.bar&&current.lifeBar);report.geometry.push({width,height,bounds:current.bounds});
 }
 await g.page.setViewportSize({width:640,height:480});
 await g.eval(()=>{window.__supplyQA.damage=40;});assert(await g.waitExpr('window.__supplyQA.result?.armor===20'));
 assert.deepEqual(await g.eval(()=>window.__supplyQA.result),{life:137,armor:20});
 const low=PNG.sync.read(readFileSync(await shot('armor-low-640x480')));current=await state();
 let lowBlue=0,exposedGreen=0,blueLeft=Infinity,greenRight=-Infinity;
 for(let y=Math.floor(current.bounds.yMin);y<=Math.ceil(current.bounds.yMax);y++)for(let x=Math.floor(current.bounds.xMin);x<=Math.ceil(current.bounds.xMax);x++){
  const i=(y*low.width+x)*4,r=low.data[i],a=low.data[i+1],b=low.data[i+2];
  if(b>r+50&&b>a+20){lowBlue++;blueLeft=Math.min(blueLeft,x);}
  if(a>r+50&&a>b+50){exposedGreen++;greenRight=Math.max(greenRight,x);}
 }
 // The authored life clip fills from right to left; keep that direction for both layers.
 assert(lowBlue>0&&exposedGreen>0&&greenRight<blueLeft,'partial armor exposes the actual health fill beside it');
 report.partialPixels={blue:lowBlue,green:exposedGreen,blueLeft,greenRight};
 await g.eval(()=>{window.__supplyQA.damage=80;});assert(await g.waitExpr('window.__supplyQA.result?.armor===0'));
 assert.deepEqual(await g.eval(()=>window.__supplyQA.result),{life:77,armor:0});await shot('armor-empty-health-640x480');current=await state();assert(!current.bar&&current.lifeBar);
 await walk('ArrowRight','ammo');current=await state();assert(current.ammo.every(w=>w.ammo===w.total));assert(current.life<200);assert.equal(current.armor,0);
 report.states.push(current);await shot('ammo-picked-640x480');
 assert.deepEqual(await g.expr('g.errors'),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await browser.close();}
console.log('SUPPLIES UI PASSED');
