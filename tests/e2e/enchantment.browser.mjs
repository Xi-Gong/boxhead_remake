import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v030/enchantment';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[],geometry:[]};let g;
const repaint=async()=>{await g.eval(()=>{const w=window.__game.main().mcWorld,p=window.__enchantQA.p;w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();w.mPaused=false;w.Draw();w.mPaused=true;});await g.page.waitForTimeout(100);};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],pos=(x,y)=>new P.Thing.Math.CThing_Position(x,y,0);
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;for(const t of Object.values(w.mThing_Collection.mThings))if(t._BASECLASSID_==='CThing_Creature'&&t!==p)t.Delete();
  p.Move(pos(5.5,8.5));p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);p.mInvincible=0;p.mAlpha=100;p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=7;
  const crate=w.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(pos(6.5,8.5),'enchant','s900'));crate.Process_Init();
  window.__enchantQA={p,crate};w.mPaused=true;
 });
 await repaint();await g.shot(`${out}/purple-crate.png`,false);report.shots.push(`${out}/purple-crate.png`);
 report.crate=await g.eval(()=>{const w=window.__game.main().mcWorld,c=window.__enchantQA.crate,p=w.GetScreenPosition(c.mPosition),f=c.mcDrawObject.bmObject;return {x:p.x+f.mDisp.x,y:p.y+f.mDisp.y,width:f.sBMD.width,height:f.sBMD.height};});
 assert(report.crate.x>0&&report.crate.y>60&&report.crate.x+report.crate.width<640&&report.crate.y+report.crate.height<480);
 {const png=PNG.sync.read(readFileSync(`${out}/purple-crate.png`)),b=report.crate;let purple=0;for(let y=Math.floor(b.y);y<b.y+b.height;y++)for(let x=Math.floor(b.x);x<b.x+b.width;x++){const i=(y*png.width+x)*4;if(png.data[i+2]>png.data[i+1]*1.5&&png.data[i]>50)purple++;}assert(purple>40);report.crate.purplePixels=purple;}
 // A real keyboard walk, with the simulation stopping on pickup for a stable observation.
 await g.eval(()=>{const w=window.__game.main().mcWorld,process=w.Process;window.__enchantQA.process=process;w.Process=function(){const r=process.call(this);if(window.__enchantQA.p.mWeapon_Current.mEnchantedAmmo>0)this.mPaused=true;return r;};w.mPaused=false;});
 await g.page.keyboard.down('ArrowRight');assert(await g.waitExpr('window.__enchantQA.crate.mSupplyConsumed && m.mcWorld.mPaused',5000));await g.page.keyboard.up('ArrowRight');
 assert.equal(await g.expr('window.__enchantQA.p.mWeapon_Current.mEnchantedAmmo'),7);
 await g.eval(()=>{const w=window.__game.main().mcWorld;w.Process=window.__enchantQA.process;w.mPaused=false;});await g.page.waitForTimeout(350);await g.expr('(m.mcWorld.mPaused=true)');
 for(const [width,height]of [[640,480],[960,720],[1280,720],[640,889]]){
  await g.page.setViewportSize({width,height});await g.page.waitForTimeout(700);await repaint();const file=`${out}/ammo-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
  const bounds=await g.eval(()=>{const w=window.__game.main().mcWorld,p=window.__enchantQA.p,f=w.mHud.mcPlayers[p.mPlayerIndex].mcAmmo.tfAmount,r=f.getBounds(w),c=window.__game.platform.presenter.canvas.getBoundingClientRect();return {text:f.text,color:f.textColor,bounds:r,width:w.mScreenSize.x,height:w.mScreenSize.y,left:c.left,top:c.top,scale:c.width/w.mScreenSize.x};});
  assert.equal(bounds.color,0xce8fff);assert(bounds.text.includes('7'));const b=bounds.bounds;assert(b.xMin>=0&&b.yMin>=0&&b.xMax<=bounds.width&&b.yMax<=bounds.height);
  const png=PNG.sync.read(readFileSync(file));let purple=0;for(let y=Math.floor(bounds.top+b.yMin*bounds.scale);y<bounds.top+b.yMax*bounds.scale;y++)for(let x=Math.floor(bounds.left+b.xMin*bounds.scale);x<bounds.left+b.xMax*bounds.scale;x++){if(x<0||y<0||x>=png.width||y>=png.height)continue;const i=(y*png.width+x)*4;if(png.data[i]>125&&png.data[i+2]>170&&png.data[i+2]-png.data[i+1]>30)purple++;}assert(purple>8,'actual ammo text must have visible purple pixels');report.geometry.push({width,height,purple,...bounds});
 }
 // One small blast exercises the real recolored animation without an explosion stress scene.
 await g.page.setViewportSize({width:640,height:480});await g.page.waitForTimeout(700);
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,p=window.__enchantQA.p;p.NewWeapon('grenade');p.SelectWeapon('grenade');const crate=w.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(p.mPosition.Clone(),'enchant','s901'));crate.Process_Init();p.mWeapon_Current.Fire(p.mPosition.Clone(),p.mAngle.Clone(),0);const shot=Object.values(w.mThing_Collection.mThings).find(t=>t._CLASSID_==='CThing_Shot_Grenade');shot.mPosition.mX+=2;shot.Process_Explode();shot.mEffect.Process_Init();shot.mEffect.mcDrawObject.Animate(7.5);});
 await repaint();await g.shot(`${out}/enchanted-blast.png`,false);report.shots.push(`${out}/enchanted-blast.png`);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('ENCHANTMENT BROWSER PASSED');
