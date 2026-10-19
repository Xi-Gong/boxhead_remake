import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v029/explosion-flash';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,comparisons:[]};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.click(380,230);
 assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?.mLoaded'));
 await g.page.waitForTimeout(700);
 await g.eval(()=>{
  const w=window.__game.main().mcWorld;w.Process=()=>{};w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
  for(const t of Object.values(w.mThing_Collection.mThings))if(t._CLASSID_!=='CThing_Creature_Player'&&t._CLASSID_!=='CThing_Object_Wall')t.Delete();
  w.mThing_Collection.Process();
  for(const p of Object.values(w.mThing_Collection.mPlayerThings))p.mInvincible=100000;
  w.mHud.mMessages=[];w.mHud.mSilentMessages=true;w.Process_Shake=()=>{};w.mShake.x=w.mShake.y=0;
  const tracking=w.Process_Tracking();w.Process_Tracking=()=>tracking;
 });
 for(const kind of ['rocket','grenade','barrel','mine','chargepack','burst']){
  const result=await g.eval(kind=>{
   const g=window.__game,w=g.main().mcWorld,P=g.pkg,tc=w.mThing_Collection,owner=Object.values(tc.mPlayerThings)[0];
   for(const t of Object.values(tc.mThings))if(t._CLASSID_==='CThing_Effect_Explosion')t.Delete();
   tc.Process();
   const p=owner.mPosition.Clone();p.mX+=2;
   const create=(type,index)=>{
    const pos=p.Clone();pos.mY+=index*.25;const angle=new P.Thing.Math.CThing_Angle(0);let object;
    if(type==='rocket'||type==='grenade'){
     const C=type==='rocket'?P.Thing.Shot.CThing_Shot_Rocket:P.Thing.Shot.CThing_Shot_Grenade;
     object=new C(pos,angle,owner,100,0);tc.AddThing_Shot(object);object.Process_Explode();
    }else if(type==='barrel'){
     object=new P.Thing.Object.CThing_Object_Barrel(pos,angle,owner,100);tc.AddThing(object);object.Process_Init();
     object.mAffectors.push(new P.Thing.Affect.CThing_Affect_Bullet(owner,owner,1,angle));object.Process_Normal();
    }else{
     const C=type==='mine'?P.Thing.Object.CThing_Object_Mine:P.Thing.Object.CThing_Object_ChargePack;
     object=new C(pos,angle,owner,100);tc.AddThing(object);object.Process_Init();object.mDetonateCounter=0;object.Process_Detonate();
    }
   };
   if(kind==='burst')for(let i=0;i<12;i++)create(['rocket','grenade','barrel','mine'][i%4],i);else create(kind,0);
   const effects=Object.values(tc.mThings).filter(t=>t._CLASSID_==='CThing_Effect_Explosion');
   for(const e of effects)if(!e.mcDrawObject)e.Process_Init();
   const current=w.Process_Brightness,images={},cpuCalls={};let offset;
   const cpu=w.bmDraw.colorMatrixCPU;
   for(const mode of ['unlit','original','reduced','cpu-reference']){
    cpuCalls[mode]=0;
    w.bmDraw.colorMatrixCPU=function(...args){cpuCalls[mode]++;return cpu.apply(this,args);};
    w.Process_Brightness=function(){this.mBrightness=mode==='unlit'?0:1;const f=current.call(this);
     if(mode==='original'||mode==='cpu-reference')for(const item of f)for(const i of [4,9,14])item.matrix[i]=this.mBrightness*255*(mode==='original'?1:.08);
     if(mode==='reduced')offset=f[0]?.matrix[4]??0;return f;};
    w.Draw();g.platform.presenter.render(g.player);images[mode]=g.platform.presenter.canvas.toDataURL('image/png');
   }
   w.Process_Brightness=current;
   delete w.bmDraw.colorMatrixCPU;
   return {images,offset,cpuCalls,count:effects.length};
  },kind);
  assert.equal(result.count,kind==='burst'?12:1);assert.equal(result.offset,16);
  assert.equal(result.cpuCalls.reduced,0,'soft flash must retain the GPU fast path');
  assert.equal(result.cpuCalls['cpu-reference'],1,'reference must exercise the previous fractional CPU path');
  const pixels=mode=>PNG.sync.read(Buffer.from(result.images[mode].split(',')[1],'base64')).data;
  assert.deepEqual(pixels('reduced'),pixels('cpu-reference'),'GPU wash must exactly preserve the previous softer pixels');
  const values={};
  for(const [mode,data]of Object.entries(result.images)){
   const buffer=Buffer.from(data.split(',')[1],'base64');writeFileSync(`${out}/${kind}-${mode}.png`,buffer);
   const png=PNG.sync.read(buffer);let sum=0,white=0,n=0;
   for(let y=80;y<png.height-30;y++)for(let x=0;x<png.width;x++){
    const i=(y*png.width+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];sum+=(r+g+b)/3;n++;if(Math.min(r,g,b)>=250)white++;
   }values[mode]={mean:sum/n,white};
  }
  assert(values.original.mean>values.reduced.mean+20);
  assert(values.reduced.mean-values.unlit.mean<(values.original.mean-values.unlit.mean)*.45);
  assert(values.reduced.white<values.original.white);
  report.comparisons.push({kind,count:result.count,offset:result.offset,cpuCalls:result.cpuCalls,exactCpuPixelMatch:true,...values});
 }
 assert.deepEqual(await g.expr('g.errors'),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await browser.close();}
console.log('EXPLOSION FLASH PASSED',JSON.stringify(report.comparisons));
