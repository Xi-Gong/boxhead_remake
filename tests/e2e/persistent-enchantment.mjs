import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PNG} from 'pngjs';

/** Shared by Chrome and the actual portable EXE; one small scene and real keyboard pickups/fire. */
export async function verifyPersistentEnchantment(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,shots:[],checks:[]};
 const install=async(fresh)=>g.eval(fresh=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const t of Object.values(w.mThing_Collection.mThings))if(t!==p&&(t._BASECLASSID_==='CThing_Creature'||t._CLASSID_==='CThing_Object_Pickup'))t.Delete();
  p.Move(new P.Thing.Math.CThing_Position(5.5,8.5,0));p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);p.mInvincible=0;p.mAlpha=100;
  if(fresh){p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=3;}
  const q=window.__persistentQA={p,shots:[],goal:null,process:w.Process,add:w.mThing_Collection.AddThing};
  w.mThing_Collection.AddThing=function(t){const r=q.add.call(this,t);if(t._CLASSID_==='CThing_Shot_Bullet')q.shots.push({enchanted:!!t.mEnchanted,damage:t.mDamage});return r;};
  w.Process=function(){const r=q.process.call(this),gun=p.mWeapons.uzi.mThing;
   if(q.goal==='pickup'&&q.crate?.mSupplyConsumed||q.goal==='fire'&&gun.mAmmo<=q.stopAmmo)this.mPaused=true;
   return r;
  };w.mPaused=true;
 },fresh);
 const repaint=async()=>{await g.eval(()=>{const w=window.__game.main().mcWorld,p=window.__persistentQA.p;w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();w.mPaused=false;w.Draw();w.mPaused=true;});await g.page.waitForTimeout(100);};
 const walkPickup=async kind=>{
  await g.eval(kind=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,q=window.__persistentQA,p=q.p;
   p.Move(new P.Thing.Math.CThing_Position(5.5,8.5,0));p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);
   q.crate=w.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(new P.Thing.Math.CThing_Position(6.5,8.5,0),kind,'s'+w.mUpgrades.supplyState.nextId++));q.crate.Process_Init();q.goal='pickup';w.mPaused=false;
  },kind);
  await g.page.keyboard.down('ArrowRight');
  try{assert(await g.waitExpr('window.__persistentQA.crate.mSupplyConsumed && m.mcWorld.mPaused',5000),'real keyboard walk consumes '+kind+' crate');}
  finally{await g.page.keyboard.up('ArrowRight');}
 };
 const fireTo=async ammo=>{
  await g.eval(ammo=>{const w=window.__game.main().mcWorld,q=window.__persistentQA;q.p.SelectWeapon('uzi');q.stopAmmo=ammo;q.goal='fire';w.mPaused=false;},ammo);
  await g.page.keyboard.down('/');
  try{assert(await g.waitExpr('m.mcWorld.mPaused && window.__persistentQA.p.mWeapons.uzi.mThing.mAmmo<=window.__persistentQA.stopAmmo',5000),'real fire reaches target ammunition');}
  finally{await g.page.keyboard.up('/');}
 };
 const gunState=()=>g.eval(()=>{const p=window.__persistentQA.p,w=p.mWeapons.uzi.mThing;return {ammo:w.mAmmo,capacity:w.mTotalAmmo,enchanted:!!w.mPersistentEnchantment,selected:p.mWeapon_Current.mNameID,shots:window.__persistentQA.shots};});
 try{
  assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await install(true);
  await walkPickup('enchant');let state=await gunState();assert.equal(state.ammo,3);assert.equal(state.enchanted,true);
  await fireTo(2);await walkPickup('ammo');state=await gunState();assert.equal(state.ammo,state.capacity);assert.equal(state.enchanted,true);
  await fireTo(state.capacity-5);state=await gunState();assert(state.shots.length>=6);assert(state.shots.every(s=>s.enchanted));report.checks.push({step:'replenished-and-fired-beyond-old-stock',...state});
  await repaint();const file=join(out,'replenished-purple-ammo.png');await g.shot(file,false);report.shots.push(file);
  const bounds=await g.eval(()=>{const w=window.__game.main().mcWorld,p=window.__persistentQA.p,f=w.mHud.mcPlayers[p.mPlayerIndex].mcAmmo.tfAmount,b=f.getBounds(w),c=window.__game.platform.presenter.canvas.getBoundingClientRect();return {text:f.text,color:f.textColor,bounds:b,left:c.left,top:c.top,scale:c.width/w.mScreenSize.x};});
  assert.equal(bounds.color,0xce8fff);assert(bounds.text.includes(String(state.ammo)));const b=bounds.bounds;
  assert(b.xMin>=0&&b.yMin>=0&&b.xMax<=640&&b.yMax<=480);const png=PNG.sync.read(readFileSync(file));let purple=0;
  for(let y=Math.floor(bounds.top+b.yMin*bounds.scale);y<bounds.top+b.yMax*bounds.scale;y++)for(let x=Math.floor(bounds.left+b.xMin*bounds.scale);x<bounds.left+b.xMax*bounds.scale;x++){
   const i=(y*png.width+x)*4;if(png.data[i]>125&&png.data[i+2]>170&&png.data[i+2]-png.data[i+1]>30)purple++;
  }assert(purple>8);report.hud={...bounds,purplePixels:purple};
  const savedAmmo=state.ammo;
  await g.eval(()=>{const w=window.__game.main().mcWorld,q=window.__persistentQA;w.Process=q.process;w.mThing_Collection.AddThing=q.add;w.mPaused=false;});
  await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused && m.mcWorld.mHud.mcScreenPause'));
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
  await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await install(false);
  state=await gunState();assert.equal(state.ammo,savedAmmo);assert.equal(state.enchanted,true);report.checks.push({step:'save-continue',...state});
  await fireTo(savedAmmo-1);assert.equal((await gunState()).shots[0].enchanted,true);
  await g.eval(()=>{window.__persistentQA.p.mWeapons.uzi.mThing.mAmmo=1;});await fireTo(0);state=await gunState();assert.equal(state.enchanted,false);assert.equal(state.shots.at(-1).enchanted,true);
  await walkPickup('ammo');state=await gunState();assert.equal(state.ammo,state.capacity);assert.equal(state.enchanted,false);
  await fireTo(state.capacity-1);state=await gunState();assert.equal(state.shots.at(-1).enchanted,false);report.checks.push({step:'empty-refill-is-ordinary',...state});
  await repaint();const plain=join(out,'depleted-refilled-ordinary-ammo.png');await g.shot(plain,false);report.shots.push(plain);
  assert.notEqual(await g.expr('m.mcWorld.mHud.mcPlayers[0].mcAmmo.tfAmount.textColor'),0xce8fff);
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
 }finally{
  await g.eval(()=>{const w=window.__game?.main()?.mcWorld,q=window.__persistentQA;if(w&&q){w.Process=q.process;w.mThing_Collection.AddThing=q.add;}}).catch(()=>{});
  writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
 }
 return report;
}
