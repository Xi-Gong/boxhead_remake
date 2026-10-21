// Real-time, one-instance gameplay probe. The controller only sends actual keyboard/mouse input.
// Combat HP/ammo/XP/spawns/clocks are never rewritten. High-wave setup unlocks are isolated QA menu data.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {launch,openGame,toMainMenu} from './lib.mjs';
const style=process.env.PLAY_STYLE??'active',wave=Number(process.env.PLAY_WAVE??1),room=Number(process.env.PLAY_ROOM??0);
const budget=Number(process.env.PLAY_BUDGET_MS??330000),tag=process.env.PLAY_TAG??'baseline';
const difficulty=Number(process.env.PLAY_DIFFICULTY??0),version=process.env.PLAY_REPORT_VERSION??'v031';
const evadeDistance=Number(process.env.PLAY_EVADE_DISTANCE??(process.env.PLAY_MODERN==='1'?1.65:1.35));
const coverFire=process.env.PLAY_COVER_FIRE==='1',coop=process.env.PLAY_COOP==='1';
const modernPlay=process.env.PLAY_MODERN==='1',seed=process.env.PLAY_SEED===undefined?undefined:Number(process.env.PLAY_SEED)>>>0;
const detail=process.env.PLAY_DETAIL==='1',orbit=process.env.PLAY_EVADE_ROUTE==='orbit';
const out=`generated/reports/${version}/pacing/${tag}-${style}-w${wave}-r${room}-${Date.now()}`;
mkdirSync(out,{recursive:true});const report={ok:false,style,wave,room,tag,samples:[],inputOnly:true,realTime:true};
const controllerSource=readFileSync(new URL(import.meta.url));writeFileSync(`${out}/controller.mjs`,controllerSource);report.controllerSourceSha256=createHash('sha256').update(controllerSource).digest('hex');
report.coop=coop;report.controller=coverFire?7:6;report.difficulty=difficulty;report.evadeDistance=evadeDistance;report.coverFire=coverFire;report.inputs=[];
if(modernPlay){report.controller=17;report.limitations='Automated controller reads positions, visible charge phases/projectiles, authored muzzle anchors, actual weapon range and stats, then sends real keys; this is not a human win-rate estimate. Grenade arcs are not modeled; rockets require clearance for their damage-dependent explosion radius. Owned guns are first selected with real keys so lazy upgrades are reflected in their stats.';}
report.seed=seed;report.detail=detail;
report.orbit=orbit;
report.events=[];
const browser=await launch();let g;const held=new Set();
async function keys(want){if(JSON.stringify([...held].sort())!==JSON.stringify([...want].sort()))report.inputs.push({at:Date.now(),keys:want});for(const k of [...held])if(!want.includes(k)){await g.page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await g.page.keyboard.down(k);held.add(k);}}
try{
 assert(wave>1||difficulty===0,'Start-wave 1 retains the authored difficulty start; use explicit wave 2 for an ordinary high-difficulty opening');
 g=await openGame(browser,{query:'?scale=1',...(seed===undefined?{}:{init:s=>{Math.random=()=>s/0xffffffff;},initArg:seed})});await toMainMenu(g);
 await g.expr(`(P.CMain.mSaveData.__set__mDetail(${detail}),P.CMain.mSaveData.__set__mGameSpeed(1),P.CMain.mSaveData.__set__mDifficulty(${difficulty}),P.CSaveData.mSharedObject.data.mMaxWaveReached=${wave})`);
 await g.clickClip(coop?'m.mcScreen.mcCoopPlay':'m.mcScreen.mcSinglePlay');assert(await g.waitScreen(coop?'State_SelectWorld_Coop':'State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr(`(P.CMain.mSaveData.mLevelIndex_${coop?'Coop':'Single'}=${room},m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(${room+1}),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,${room}))`);
 {const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type(String(wave));await g.page.keyboard.press('Enter');await g.click(210,400);}
 await g.click(380,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
 await g.page.waitForTimeout(700);report.renderer=await g.page.evaluate(()=>document.querySelector('script[type="module"]')?.src);
 const grid=await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,solid=P.World.Map.CMap_Cell.mCollide_StaticImpassable|P.World.Map.CMap_Cell.mCollide_Object;return w.mMap.mCells.map(row=>row.map(c=>!!c&&!(c.mCollide&solid)));});
 const h=grid.length,w=grid[0].length,goals=[[3,3],[w-4,3],[w-4,h-4],[3,h-4]].map(([x,y])=>{const cells=[];for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++)if(grid[cy][cx])cells.push([cx,cy]);return cells.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y))[0];});
 let waypoint=0;
 function escapeDirection(s,destination){
  if(Math.hypot(s.x-goals[waypoint][0]-.5,s.y-goals[waypoint][1]-.5)<1.2)waypoint=(waypoint+1)%goals.length;
  for(let i=0;i<4&&s.enemies.some(e=>Math.hypot(e.x-goals[waypoint][0]-.5,e.y-goals[waypoint][1]-.5)<2.5);i++)waypoint=(waypoint+1)%goals.length;
  const goalCell=destination?[Math.floor(destination.x),Math.floor(destination.y)]:goals[waypoint];
  const start=[Math.floor(s.x),Math.floor(s.y)],queue=[{q:start,cost:0}],parents=new Map([[start.join(),null]]),costs=new Map([[start.join(),0]]),goal=goalCell.join();let found;
  // Weighted routes avoid walking through the horde just to reach the next corner. This is controller-only.
  while(queue.length){queue.sort((a,b)=>b.cost-a.cost);const item=queue.pop(),q=item.q;if(item.cost!==costs.get(q.join()))continue;if(q.join()===goal){found=q;break;}
   for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){const next=[q[0]+dx,q[1]+dy],key=next.join();if(!grid[next[1]]?.[next[0]])continue;
    const danger=s.enemies.reduce((v,e)=>{const d=Math.hypot(e.x-next[0]-.5,e.y-next[1]-.5),devil=modernPlay&&e.kind==='CThing_Creature_Devil';return v+(d<(devil?6:4)?(devil?50:15)/Math.max(.35,d)**3:0);},0),cost=item.cost+1+danger;
    if(cost<(costs.get(key)??Infinity)){costs.set(key,cost);parents.set(key,q);queue.push({q:next,cost});}
   }
  }
  if(found){while(parents.get(found.join())?.join()!==start.join()&&parents.get(found.join()))found=parents.get(found.join());
   const dx=found[0]+.5-s.x,dy=found[1]+.5-s.y;
   return s.dirs.filter(d=>d.free).map(d=>({d:d.d,score:(Math.cos(d.d*Math.PI/4)*dx+Math.sin(d.d*Math.PI/4)*dy)/Math.max(.1,Math.hypot(dx,dy))+.08*d.space+s.enemies.slice(0,6).reduce((v,e)=>v-.5/Math.max(.2,Math.hypot(e.x-d.x,e.y-d.y))**2,0)})).sort((a,b)=>b.score-a.score)[0]?.d??-1;
  }return s.dirs.find(d=>d.free)?.d??-1;
 }
 const start=Date.now();let n=0,lastSample=-10000,lastShot=-30000,lastSwitch=-999,focusId,retreating=false,priorSample,auditionLevel;const seenGuns=new Set();const previous={x:NaN,y:NaN,stuck:0};
 while(Date.now()-start<budget){
  const s=await g.eval(refreshGeometry=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld;if(!w?.mThing_Collection)return {state:window.__game.state()};
   const p=Object.values(w.mThing_Collection.mPlayerThings)[0],u=w.mUpgrades,t=u.timedWave;
   const visible=e=>{const q=w.GetScreenPosition(e.mPosition);return q.x>=0&&q.x<=640&&q.y>=0&&q.y<=500;};
   const enemies=Object.values(w.mThing_Collection.mThings).filter(e=>['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(e._CLASSID_)&&e.Process&&e.mLife>0&&!e.lanKillLogged&&visible(e));
   const solid=P.World.Map.CMap_Cell.mCollide_StaticImpassable|P.World.Map.CMap_Cell.mCollide_Object;
   const px=p?.mPosition.mX??0,py=p?.mPosition.mY??0;
   const free=(x,y)=>[[-.35,-.35],[.35,-.35],[-.35,.35],[.35,.35]].every(([dx,dy])=>{const c=w.mMap.mCells[Math.floor(y+dy)]?.[Math.floor(x+dx)];return c&&!(c.mCollide&solid);});
   const positions=enemies.map(e=>({id:e.sUniqueID,x:e.mPosition.mX,y:e.mPosition.mY,radius:e.mRadius,boss:!!e.mBossKind,hp:e.mLife,kind:e.mCombatKind??e.mEnemyVariant??e._CLASSID_,phase:e.mVariantPhase,chargeX:e.mChargeX,chargeY:e.mChargeY})).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
   const dirs=Array.from({length:8},(_,d)=>{const a=d*Math.PI/4,x=px+Math.cos(a)*.7,y=py+Math.sin(a)*.7;return {d,x,y,free:free(x,y),space:[1,2,3].filter(r=>free(px+Math.cos(a)*r,py+Math.sin(a)*r)).length};});
   const weapons=Object.fromEntries(Object.entries(p?.mWeapons??{}).map(([k,v])=>[k,{active:v.mActive,ammo:v.mThing?.mAmmo,capacity:v.mThing?.mTotalAmmo,damage:v.mThing?.mDamage,rate:v.mThing?.mFireRate,range:v.mThing?.mRange,wide:v.mThing?.mWideShot,enchanted:!!v.mThing?.mPersistentEnchantment}]));
   const supplies=Object.values(w.mThing_Collection.mThings).filter(e=>e.Process&&e.Process!==e.Process_Count&&!e.mSupplyConsumed&&!e.mRedConsumed&&(e.mSupplyId||e._CLASSID_==='CThing_Object_Pickup')).map(e=>({x:e.mPosition.mX,y:e.mPosition.mY,kind:e.mSupplyKind??'red',id:e.mSupplyId??e.mRandomRedId??e.sUniqueID}));
   const fireballs=Object.values(w.mThing_Collection.mThings).filter(e=>e.Process&&e._CLASSID_==='CThing_Shot_FireBall'&&visible(e)).map(e=>({x:e.mPosition.mX,y:e.mPosition.mY,dx:e.mDelta.mX,dy:e.mDelta.mY}));
   const anim=p?.mXSI_Animation,o=anim?.mAnimationObject,muzzles=Array.from({length:8},(_,d)=>{
    const f=o?.mDirections[o.mLookup256[d*32]]?.mFrames[anim.mCurrentFrameID&16777215],v=f?.XSI_Info?.XSI_Model_GunPosition_Right?.nPosition;
    return v?{x:v.mX,y:v.mY}:{x:0,y:0};
   });
   return {state:window.__game.state(),phase:t?.phase,wave:u.mLevelIndex,tick:w.mTick,remaining:t?.remainingTicks,total:t?.totalTicks,
    players:Object.values(w.mThing_Collection.mPlayerThings).map(p=>({slot:p.mPlayerIndex,hp:p.mLife,armor:p.mArmor,x:p.mPosition.mX,y:p.mPosition.mY})),goal:t?.clear,life:p?.mLife,maxLife:p?.mMaxLife,armor:p?.mArmor??0,level:u.lanGrowth?.players[0]?.level,xp:u.lanGrowth?.players[0]?.xp,
    score:u.lanGrowth?.players[0]?.score,playerState:p?.mStateID,x:px,y:py,dir:p?.mAngle.__get__mDirection(),
    weapon:p?.mWeapon_Current?.mNameID,auto:p?.mWeapon_Current?.mAuto,ammo:p?.mWeapon_Current?.mAmmo,weapons,supplies,fireballs,muzzles,enemies:positions,dirs,boss:t?.boss,
    ...(refreshGeometry?{geometry:w.mMap.mCells.map(row=>row.map(c=>!!c&&!(c.mCollide&solid)))}:{})};
  },modernPlay&&n%12===0);
  if(s.geometry){s.geometry.forEach((row,i)=>grid[i]=row);delete s.geometry;}
  const elapsed=Date.now()-start;
  if(n===0)assert.equal(s.wave,wave,'real menu input selected the requested wave');
  if(priorSample){
   if(s.life<priorSample.life)report.events.push({ms:elapsed,type:'health-lost',before:priorSample.life,life:s.life,weapon:s.weapon,armor:s.armor,closest:s.enemies?.slice(0,2),fireballs:s.fireballs});
   if(priorSample.armor>0&&s.armor===0)report.events.push({ms:elapsed,type:'shield-broken',before:priorSample.armor,life:s.life});
   if(priorSample.weapon!==s.weapon)report.events.push({ms:elapsed,type:'weapon',weapon:s.weapon,ammo:s.ammo});
   for(const c of priorSample.supplies??[])if(!s.supplies?.some(next=>next.id===c.id)&&Math.hypot(c.x-priorSample.x,c.y-priorSample.y)<1.1)report.events.push({ms:elapsed,type:'nearby-crate-removed',kind:c.kind,id:c.id,life:s.life,armor:s.armor,weapon:s.weapon,ammo:s.ammo});
  }
  priorSample=s;
  if(elapsed-lastSample>=5000){report.samples.push({ms:elapsed,...s,closest:s.enemies?.slice(0,4),composition:s.enemies?.reduce((out,e)=>(out[e.kind]=(out[e.kind]??0)+1,out),{}),enemies:s.enemies?.length});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));lastSample=elapsed;}
  if(elapsed-lastShot>=30000){await g.shot(`${out}/play-${Math.round(elapsed/1000)}s.png`,false);lastShot=elapsed;console.log(JSON.stringify({ms:elapsed,wave:s.wave,level:s.level,life:Math.round(s.life??0),remaining:s.remaining,enemies:s.enemies?.length,score:s.score,bossHP:s.boss?.life}));}
  if(s.state!=='State_RunWorld'||s.phase==='draft'||s.wave!==wave){report.result={ms:elapsed,...s,enemies:s.enemies?.length};break;}
  const want=[];
  if(s.playerState==='State_PlayerControl'){
   if(modernPlay){if(auditionLevel!==Math.floor(s.level/5)){seenGuns.clear();auditionLevel=Math.floor(s.level/5);}seenGuns.add(s.weapon);}
   const line=e=>{const distance=Math.hypot(e.x-s.x,e.y-s.y);for(let r=.3;r<distance-.4;r+=.2)if(!grid[Math.floor(s.y+(e.y-s.y)*r/distance)]?.[Math.floor(s.x+(e.x-s.x)*r/distance)])return false;return true;};
   const distance=s.enemies[0]?Math.hypot(s.enemies[0].x-s.x,s.enemies[0].y-s.y):Infinity;
   const fireRange=modernPlay?(s.weapons[s.weapon]?.range??Infinity):7.5;
   const target=modernPlay?(distance>2.5?s.enemies.find(e=>(e.boss||e.kind==='CThing_Creature_Devil')&&Math.hypot(e.x-s.x,e.y-s.y)<fireRange&&line(e)):undefined)??s.enemies.find(e=>e.id===focusId&&line(e)&&Math.hypot(e.x-s.x,e.y-s.y)<fireRange+.5)??s.enemies.find(line):s.enemies.find(line);
   focusId=target?.id;
   const aimDistance=modernPlay&&target?Math.hypot(target.x-s.x,target.y-s.y):distance;
   const blastRadius=gun=>2+Math.max(0,(gun?.damage??0)*(gun?.enchanted?1.15:1)-100)*.005;
   const unsafeRocket=modernPlay&&s.weapon==='rocket'&&aimDistance<blastRadius(s.weapons.rocket)+1.5;
   const moved=Math.hypot(s.x-previous.x,s.y-previous.y);previous.stuck=[...held].some(k=>k.startsWith('Arrow'))&&moved<.01?previous.stuck+1:0;previous.x=s.x;previous.y=s.y;
   let direction=-1,shoot=-1,aim;
   if(target){
    let best=Infinity;
    for(let d=0;d<8;d++){const a=d*Math.PI/4,fx=Math.cos(a),fy=Math.sin(a),gx=s.x+(modernPlay?s.muzzles[d].x:fx*.6-fy*.33),gy=s.y+(modernPlay?s.muzzles[d].y:fy*.6+fx*.33);
     const dx=target.x-gx,dy=target.y-gy,signed=-fy*dx+fx*dy,perp=Math.abs(signed),along=fx*dx+fy*dy;
     if(along>-.15&&modernPlay&&(!aim||perp<aim.perp))aim={d,signed,perp};
     if(along>-.15&&perp<(modernPlay?(target.radius??.3)*.8+.03:.38)&&perp<best){best=perp;shoot=d;}}
   }
   const aligned=target&&aimDistance<fireRange&&shoot===s.dir;
   if(modernPlay){const devilDistance=Math.min(Infinity,...s.enemies.filter(e=>e.kind==='CThing_Creature_Devil').map(e=>Math.hypot(e.x-s.x,e.y-s.y))),safeDistance=s.enemies.length>5?Math.max(2.2,evadeDistance):evadeDistance;
    if(distance<safeDistance||devilDistance<4.5)retreating=true;else if(distance>safeDistance+.45&&devilDistance>5)retreating=false;}
   const evade=style==='survive'||distance<evadeDistance||previous.stuck>5||modernPlay&&retreating;
   let supply;
   if(modernPlay){
    const finite=['uzi','shotgun','rocket','railgun','grenade'].map(k=>s.weapons[k]).filter(g=>g?.active&&g.capacity>0&&g.capacity<999999),stock=finite.reduce((v,g)=>v+g.ammo,0),capacity=finite.reduce((v,g)=>v+g.capacity,0),mainGun=finite.slice().sort((a,b)=>b.damage/b.rate-a.damage/a.rate)[0],ammoNeed=Math.max(capacity?1-stock/capacity:0,mainGun?1-mainGun.ammo/mainGun.capacity:0);
    supply=s.supplies.map(c=>{const d=Math.hypot(c.x-s.x,c.y-s.y),danger=s.enemies.some(e=>Math.hypot(e.x-c.x,e.y-c.y)<1.5);
     const value=c.kind==='medical'&&s.life<s.maxLife*.7?5*(1-s.life/s.maxLife):c.kind==='armor'&&s.armor<s.maxLife*.25?2:c.kind==='ammo'&&ammoNeed>.55?4*ammoNeed:c.kind==='red'&&ammoNeed>.55?ammoNeed:c.kind==='enchant'&&!s.weapons[s.weapon]?.enchanted&&s.ammo>0?1.5:0;
     return {...c,priority:danger?0:value/(2+d)};
    }).filter(c=>c.priority>0).sort((a,b)=>b.priority-a.priority)[0];
   }
   const charge=modernPlay&&s.enemies.find(e=>e.kind==='charger'&&['warning','charge'].includes(e.phase)&&Math.hypot(e.x-s.x,e.y-s.y)<7&&Math.abs((s.x-e.x)*e.chargeY-(s.y-e.y)*e.chargeX)<1.15&&(s.x-e.x)*e.chargeX+(s.y-e.y)*e.chargeY>-.7);
   const incoming=modernPlay&&s.fireballs.find(f=>{const v=Math.hypot(f.dx,f.dy),along=((s.x-f.x)*f.dx+(s.y-f.y)*f.dy)/v,perp=Math.abs((s.x-f.x)*f.dy-(s.y-f.y)*f.dx)/v;return along>0&&along<v*12&&perp<.95;});
   if(incoming){
    const v=Math.hypot(incoming.dx,incoming.dy);
    direction=s.dirs.filter(d=>d.free).map(d=>({d:d.d,score:4*Math.min(2,Math.abs((d.x-incoming.x)*incoming.dy-(d.y-incoming.y)*incoming.dx)/v)+.3*d.space+Math.min(3,...s.enemies.map(e=>Math.hypot(e.x-d.x,e.y-d.y)))})).sort((a,b)=>b.score-a.score)[0]?.d??-1;
   }else if(charge){
    direction=s.dirs.filter(d=>d.free).map(d=>({d:d.d,score:3*Math.abs((d.x-charge.x)*charge.chargeY-(d.y-charge.y)*charge.chargeX)+.3*d.space+Math.min(3,...s.enemies.map(e=>Math.hypot(e.x-d.x,e.y-d.y)))})).sort((a,b)=>b.score-a.score)[0]?.d??-1;
   }else if(evade){
    direction=modernPlay&&(!orbit||s.enemies.length<=5)?s.dirs.filter(d=>d.free).map(d=>{
     const near=Math.min(...s.enemies.map(e=>Math.hypot(e.x-d.x,e.y-d.y)/(e.kind==='CThing_Creature_Devil'?4.5:2.2))),edge=Math.min(d.x,d.y,w-1-d.x,h-1-d.y);
     return {d:d.d,score:6*Math.min(2,near)+.5*d.space-.5/Math.max(.2,edge)};
    }).sort((a,b)=>b.score-a.score)[0]?.d??-1:escapeDirection(s);
   }else if(supply&&distance>2.5){direction=escapeDirection(s,supply);
   }else if(style==='active'&&aligned){if(s.auto||n%3!==0)want.push('Slash');}
   else if(target&&shoot>=0&&aimDistance<fireRange)direction=shoot;
   else if(modernPlay&&target&&aimDistance>=fireRange)direction=escapeDirection(s,target);
   else if(modernPlay&&target&&aim){direction=(Math.round(Math.atan2(Math.cos(aim.d*Math.PI/4)*Math.sign(aim.signed),-Math.sin(aim.d*Math.PI/4)*Math.sign(aim.signed))/(Math.PI/4))+8)%8;}
   else if(target){
    const dx=target.x-s.x,dy=target.y-s.y;
    if(Math.abs(dx)>=Math.abs(dy))direction=(target.y-(dx>0?.33:-.33)-s.y)>0?2:6;
    else direction=(target.x-(dy>0?-.33:.33)-s.x)>0?0:4;
    if(!s.dirs[direction]?.free)direction=s.dirs.filter(d=>d.free).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0]?.d??-1;
   }else direction=escapeDirection(s);
   if(direction>=0){if(!s.dirs[direction]?.free)direction=s.dirs.find(d=>d.free)?.d??-1;
    if(direction>=0){const dx=[1,1,0,-1,-1,-1,0,1][direction],dy=[0,1,1,1,0,-1,-1,-1][direction];if(dx)want.push(dx>0?'ArrowRight':'ArrowLeft');if(dy)want.push(dy>0?'ArrowDown':'ArrowUp');}}
   // The infinite fallback gun can cover movement; this changes only the input controller, never the game.
   if(coverFire&&style==='active'&&s.weapon==='pistol'&&n%3!==0&&!want.includes('Slash'))want.push('Slash');
   if(modernPlay&&style==='active'&&target&&(direction===shoot||direction<0&&aligned)&&(s.auto||n%3!==0)&&!want.includes('Slash'))want.push('Slash');
   if(unsafeRocket){const fire=want.indexOf('Slash');if(fire>=0)want.splice(fire,1);}
   const untried=modernPlay&&['uzi','shotgun','railgun'].find(k=>s.weapons[k]?.active&&!seenGuns.has(k));
   if(style==='active'&&(n-lastSwitch>30||unsafeRocket||untried)){
    const order=(modernPlay?['railgun','uzi','shotgun','pistol',...(target&&aimDistance>blastRadius(s.weapons.rocket)+1.5?['rocket']:[])]:['railgun','uzi','shotgun','pistol']).filter(k=>s.weapons[k]?.active).sort((a,b)=>{
     const power=k=>{const v=s.weapons[k];return v.damage*(k==='shotgun'?(v.wide?5:3)*(modernPlay&&aimDistance>3?.5:1):1)*25/Math.max(1,v.rate)*(modernPlay&&k!=='uzi'?.65:1);};return power(b)-power(a);
    });
    const selected=untried||order.find(k=>s.weapons[k]?.active&&(s.weapons[k].ammo>0||k==='pistol'));
    if(selected&&selected!==s.weapon){want.push({pistol:'Digit1',uzi:'Digit2',shotgun:'Digit3',grenade:'Digit5',rocket:'Digit8',railgun:'Digit0'}[selected]);lastSwitch=n;}
   }
  }
  if(coop){const other={ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD',Slash:'Space'};for(const k of [...want])if(other[k])want.push(other[k]);}
  await keys(want);await g.page.waitForTimeout(80);n++;
 }
 await keys([]);await g.shot(`${out}/final.png`,false);report.wallMs=Date.now()-start;report.last=report.samples.at(-1);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);
 report.outcome=report.result?.phase==='draft'?'wave-completed':report.result?.players?.every(p=>p.hp<=0)?'defeat':report.result?'state-transition':'interrupted';
 report.earlyClear=report.outcome==='wave-completed'&&report.result.remaining>0&&(report.result.boss?report.result.boss.defeated:report.result.goal?.killedZombies>=report.result.goal?.zombies&&report.result.goal?.killedDevils>=report.result.goal?.devils);
 assert(report.result,'play budget exhausted before a terminal wave/player result');report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('REAL-TIME PACING PLAY FINISHED '+out);
