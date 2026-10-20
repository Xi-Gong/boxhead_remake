import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=`generated/reports/v031/projectile-art/run-${Date.now()}`;mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,captures:[],shots:[]};let g;
const save=(name,data)=>{writeFileSync(`${out}/${name}`,Buffer.from(data.split(',')[1],'base64'));report.shots.push(name);};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 await g.page.waitForTimeout(700);
 await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];w.mPaused=true;
  w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;for(const t of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_)){t.ClearCollideCell();t.Delete();}
  for(const name of ['uzi','shotgun','rocket','railgun'])p.NewWeapon(name);p.Move(new P.Thing.Math.CThing_Position(8.5,8.5,0));p.mInvincible=0;p.mAlpha=100;
  const draw=w.Draw;window.__projectileQA={shots:[],pending:false};w.Draw=function(){draw.call(this);const qa=window.__projectileQA;
   if(qa.pending){const shots=Object.values(this.mThing_Collection.mThings).filter(t=>/^CThing_Shot_(Bullet|Rocket|Railgun)$/.test(t._CLASSID_)&&(t.mLife===1||t.mcDrawObject));
    if(shots.length){qa.current=shots;qa.shots.push(shots[0]);qa.pending=false;this.mPaused=true;}}
  };
 });
 for(const enchanted of [false,true])for(const [i,name]of ['pistol','uzi','shotgun','rocket','railgun'].entries()){
  await g.eval(enchanted=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
   for(const t of Object.values(w.mThing_Collection.mThings))if(t._CLASSID_.startsWith('CThing_Shot_'))t.Delete();
   for(const entry of Object.values(p.mWeapons)){const t=entry.mThing;if(t){t.mAmmo=t.mTotalAmmo;t.mPersistentEnchantment=enchanted;t.mEnchantedAmmo=enchanted?t.mAmmo:0;t.mFireRateCount=0;}}
   w.mPaused=false;
  },enchanted);
  await g.page.keyboard.press(String([1,2,3,8,0][i]));assert(await g.waitExpr(`Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mWeapon_Current.mNameID==="${name}"`));
  await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(45);await g.page.keyboard.up('ArrowRight');
  await g.expr('window.__projectileQA.pending=true');await g.page.keyboard.down('Slash');
  assert(await g.waitExpr('!window.__projectileQA.pending&&m.mcWorld.mPaused'));await g.page.keyboard.up('Slash');
  const state=await g.eval(()=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],shots=window.__projectileQA.current;
   return {count:shots.length,muzzle:w.GetScreenPosition(p.GetWeaponPosition()),shots:shots.map(t=>({class:t._CLASSID_,enchanted:!!t.mEnchanted,life:t.mLife}))};});
  assert(state.shots.every(s=>s.enchanted===enchanted));report.captures.push({name,enchanted,...state});
  await g.page.waitForTimeout(120);
  const file=`combat-${name}-${enchanted?'enchanted':'normal'}.png`;await g.shot(`${out}/${file}`,false);report.shots.push(file);
  if(!enchanted){
   await g.eval(()=>{
    const P=window.__game.pkg,w=window.__game.main().mcWorld,shots=window.__projectileQA.current,restore=[];
    try{for(const t of shots){restore.push([t,t.Draw]);t.Draw=function(){if(this._CLASSID_==='CThing_Shot_Rocket')this.mcDrawObject.Render(this.mWorld.bmCurrentDraw,this.mWorld.GetScreenPosition(this.mPosition),1,100);
     else P.DrawPrimitive.CDrawPrimitive_Line.Draw(this.mWorld.mcScratch,this.mWorld.GetScreenPosition(this.mPosition),this.mWorld.GetScreenPosition(this.mDestination),this._CLASSID_==='CThing_Shot_Railgun'?2:.5,this._CLASSID_==='CThing_Shot_Railgun'?10053375:13421772,this.mAlpha*(this._CLASSID_==='CThing_Shot_Railgun'?.75:1));};}
     w.mPaused=false;w.Draw();w.mPaused=true;
    }finally{for(const [t,draw]of restore)delete t.Draw;}
   });
   await g.page.waitForTimeout(120);
   const old=`combat-${name}-classic.png`;await g.shot(`${out}/${old}`,false);report.shots.push(old);
   const a=PNG.sync.read(readFileSync(`${out}/${file}`)),b=PNG.sync.read(readFileSync(`${out}/${old}`));let changed=0;
   for(let y=Math.max(0,state.muzzle.y-8);y<Math.min(a.height,state.muzzle.y+8);y++)for(let x=Math.max(0,state.muzzle.x+5);x<Math.min(a.width,state.muzzle.x+65);x++){
    const k=(y*a.width+x)*4;if(a.data[k]!==b.data[k]||a.data[k+1]!==b.data[k+1]||a.data[k+2]!==b.data[k+2])changed++;
   }
   assert(changed>8,`${name}: visible projectile pixels`);report.captures.at(-1).changedPixels=changed;
  }
 }
 const gallery=await g.eval(async()=>{
  const P=window.__game.pkg,shots=window.__projectileQA.shots,c=document.createElement('canvas');c.width=1056;c.height=720;const x=c.getContext('2d');
  const color=(n,a)=>`rgba(${n>>16&255},${n>>8&255},${n&255},${a/100})`;
  const adapter={fill:false,lineStyle(w=0,c=0,a=100){this.width=w;x.lineWidth=w;x.strokeStyle=color(c,a);x.lineCap='round';},beginFill(c,a=100){this.fill=true;x.beginPath();x.fillStyle=color(c,a);},endFill(){x.fill();this.fill=false;},moveTo(a,b){if(!this.fill)x.beginPath();x.moveTo(a,b);},lineTo(a,b){x.lineTo(a,b);if(!this.fill&&this.width)x.stroke();}};
  const V=P.Thing.Math.CThing_Position;
  const render=(t,d,cx,cy,zoom=1,tick=0)=>{
   const saved={mWorld:t.mWorld,mPosition:t.mPosition,mDestination:t.mDestination,mDelta:t.mDelta,mAngle:t.mAngle,mLife:t.mLife,mMaxLife:t.mMaxLife};
   const angle=d*Math.PI/8;Object.assign(t,{mWorld:{mTick:tick,mcScratch:adapter,createEmptyMovieClip:()=>adapter,getNextHighestDepth:()=>1,RenderMCToDraw:()=>{},GetScreenPosition:p=>({x:p.mX,y:p.mY})},mPosition:new V(0,0,0),mDestination:new V(Math.cos(angle)*24,Math.sin(angle)*24,0),mDelta:new V(0,0,0),mAngle:new P.Thing.Math.CThing_Angle(angle),mLife:tick%2?0:1,mMaxLife:2});
   try{x.save();x.translate(cx,cy);x.scale(zoom,zoom);t.Draw();x.restore();}finally{Object.assign(t,saved);}
  };
  const frame=tick=>{x.fillStyle='#dedbd2';x.fillRect(0,0,c.width,c.height);x.font='12px Arial';
   for(let r=0;r<10;r++){x.fillStyle=r<5?'#dedbd2':'#343d42';x.fillRect(0,r*70+20,c.width,70);x.fillStyle=r<5?'#242a2c':'#e4e1dc';x.fillText(['PISTOL','UZI','SHOTGUN','ROCKET','RAIL'][r%5],4,r*70+54);
    for(let d=0;d<16;d++)render(shots[r],d,96+d*61,r*70+54,1,tick);}
  };frame(0);const sheet=c.toDataURL();
  c.width=640;c.height=360;x.fillStyle='#dedbd2';x.fillRect(0,0,640,180);x.fillStyle='#343d42';x.fillRect(0,180,640,180);
  for(let i=0;i<10;i++)render(shots[i],14,40+(i%5)*125,100+Math.floor(i/5)*180,3,0);const detail=c.toDataURL();
  const stream=c.captureStream(15),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(resolve=>rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});rec.start();
  for(let f=0;f<64;f++){x.fillStyle='#dedbd2';x.fillRect(0,0,640,180);x.fillStyle='#343d42';x.fillRect(0,180,640,180);for(let i=0;i<10;i++)render(shots[i],Math.floor(f/4)%16,55+(i%5)*125,100+Math.floor(i/5)*180,2,f);await new Promise(r=>setTimeout(r,66));}
  rec.stop();for(const track of stream.getTracks())track.stop();return {sheet,detail,video:await done};
 });save('all-directions.png',gallery.sheet);save('detail.png',gallery.detail);save('tracers-and-rockets.webm',gallery.video);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('PROJECTILE ART LIGHT BROWSER PASSED '+out);
