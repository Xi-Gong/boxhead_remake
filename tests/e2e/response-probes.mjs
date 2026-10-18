// Opt-in diagnostics only. Deterministic setup is applied at tick 200 on both peers, before measurement.
export async function installResponseFixture(page,network=true){
 await page.evaluate(network=>{
  const g=window.__game,w=g.main().mcWorld,P=g.pkg,start=network?g.lan().startTick:w.mTick;
  const process=w.Process;
  for(const name of ['Spawn_Zombie','Spawn_Devil']){const original=w[name];w[name]=function(...args){return this.mTick-start>=200?false:original.apply(this,args);};}
  w.Process=function(...args){
   if(this.mTick-start===200){
    for(const t of Object.values(this.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_))t.Delete();
    const cells=this.mMap.mCells,C=P.World.Map.CMap_Cell,cy=Math.floor(cells.length/2),cx=Math.floor(cells[0].length/2),spots=[];
    for(let radius=0;radius<12&&spots.length<2;radius++)for(let y=cy-radius;y<=cy+radius&&spots.length<2;y++)for(let x=cx-radius;x<=cx+radius&&spots.length<2;x++){
     if(spots.some(s=>Math.hypot(s[0]-x,s[1]-y)<4))continue;
     let free=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!cells[y+dy]?.[x+dx]||(cells[y+dy][x+dx].mCollide&(C.mCollide_StaticImpassable|C.mCollide_Object)))free=false;
     if(free)spots.push([x+.5,y+.5]);
    }
    if(spots.length<2)throw new Error('response fixture needs two open central positions');
    for(const p of Object.values(this.mThing_Collection.mPlayerThings)){
     p.Move(new P.Thing.Math.CThing_Position(...spots[p.mPlayerIndex],0));
     p.mLife=p.mMaxLife;p.mInvincible=100000;p.NewWeapon('uzi');p.SelectWeapon('pistol');
    }
   }
   return process.apply(this,args);
  };
 },network);
}

export async function responseActions(page,role,{network=true,limit=60}={}){
 const rows=[];
 for(const action of ['move','fire','switch']){
  await page.waitForTimeout(800);
  const row=await page.evaluate(async({role,action,network})=>{
   const g=window.__game,w=g.main().mcWorld,me=()=>Object.values(w.mThing_Collection.mPlayerThings).find(p=>p.mPlayerIndex===role);
   const p=me();if(!p||p.mLife<=0||p.mStateID!=='State_PlayerControl')throw new Error('response player unavailable');
   const key=action==='move'?(role?'KeyS':'ArrowDown'):action==='fire'?(role?'Space':'Slash'):(role?'KeyE':'Period');
   const snap=()=>{const p=me(),d=network?g.lan().presentation:undefined;return {x:p.mPosition.mX,y:p.mPosition.mY,angle:p.mAngle.mRadians,
    displayedX:d?.x??p.mPosition.mX,displayedY:d?.y??p.mPosition.mY,weapon:p.mWeapon_Current.mNameID,fire:p.mWeapon_Current.mFireRateCount,
    cameraX:w.mDrawPosition.x,cameraY:w.mDrawPosition.y};};
   const event=type=>window.dispatchEvent(new KeyboardEvent(type,{code:key,key,bubbles:true}));
   if(action==='switch'){event('keydown');await new Promise(r=>setTimeout(r,100));}
   const before=snap(),result={action,role,key,before,inputAt:0,simulation:null,display:null,facing:null,camera:null,audio:null};
   const audioProto=AudioBufferSourceNode.prototype,originalStart=audioProto.start,render=g.player.render;
   const changed=s=>action==='move'?Math.hypot(s.x-before.x,s.y-before.y)>1e-5:action==='fire'?s.fire>0:s.weapon!==before.weapon;
   audioProto.start=function(...args){if(result.audio===null&&result.inputAt)result.audio=performance.now()-result.inputAt;return originalStart.apply(this,args);};
   g.player.render=function(...args){const answer=render.apply(this,args),s=snap(),elapsed=performance.now()-result.inputAt;
    if(result.inputAt&&changed(s)&&result.display===null)result.display=elapsed;
    if(result.inputAt&&Math.hypot(s.cameraX-before.cameraX,s.cameraY-before.cameraY)>1e-5&&result.camera===null)result.camera=elapsed;
    return answer;};
   g.__responseTrace?.(true);result.inputAt=performance.now();event(action==='switch'?'keyup':'keydown');
   try{
    await new Promise(resolve=>{const next=()=>{const s=snap(),elapsed=performance.now()-result.inputAt;
     if(changed(s)&&result.simulation===null)result.simulation=elapsed;
     if(Math.abs(s.angle-before.angle)>1e-5&&result.facing===null)result.facing=elapsed;
     if(elapsed>=180)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);});
    event('keyup');result.after=snap();result.trace=g.__responseTrace?.();
   }finally{event('keyup');g.__responseTrace?.(false);audioProto.start=originalStart;g.player.render=render;}
   return result;
  },{role,action,network});
  for(const field of ['simulation','display',...(action==='fire'?['audio']:[]),...(action==='move'?['camera']:[])]){
   if(row[field]===null||row[field]>limit)throw new Error(`response ${role} ${action} ${field}: ${JSON.stringify(row)}`);
  }
  rows.push(row);
 }
 return rows;
}
