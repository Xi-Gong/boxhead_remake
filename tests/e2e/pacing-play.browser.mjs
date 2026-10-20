// Real-time, one-instance gameplay probe. The controller only sends actual keyboard/mouse input.
// Combat HP/ammo/XP/spawns/clocks are never rewritten. High-wave setup unlocks are isolated QA menu data.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const style=process.env.PLAY_STYLE??'active',wave=Number(process.env.PLAY_WAVE??1),room=Number(process.env.PLAY_ROOM??0);
const budget=Number(process.env.PLAY_BUDGET_MS??330000),tag=process.env.PLAY_TAG??'baseline';
const difficulty=Number(process.env.PLAY_DIFFICULTY??0),version=process.env.PLAY_REPORT_VERSION??'v031';
const evadeDistance=Number(process.env.PLAY_EVADE_DISTANCE??1.35);
const coverFire=process.env.PLAY_COVER_FIRE==='1';
const out=`generated/reports/${version}/pacing/${tag}-${style}-w${wave}-r${room}-${Date.now()}`;
mkdirSync(out,{recursive:true});const report={ok:false,style,wave,room,tag,samples:[],inputOnly:true,realTime:true};
report.controller=coverFire?7:6;report.difficulty=difficulty;report.evadeDistance=evadeDistance;report.coverFire=coverFire;report.inputs=[];
const browser=await launch();let g;const held=new Set();
async function keys(want){if(JSON.stringify([...held].sort())!==JSON.stringify([...want].sort()))report.inputs.push({at:Date.now(),keys:want});for(const k of [...held])if(!want.includes(k)){await g.page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await g.page.keyboard.down(k);held.add(k);}}
try{
 g=await openGame(browser,{query:'?scale=1'});await toMainMenu(g);
 await g.expr(`(P.CMain.mSaveData.__set__mDetail(false),P.CMain.mSaveData.__set__mGameSpeed(1),P.CMain.mSaveData.__set__mDifficulty(${difficulty}),P.CSaveData.mSharedObject.data.mMaxWaveReached=${wave})`);
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr(`(P.CMain.mSaveData.mLevelIndex_Single=${room},m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(${room+1}),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,${room}))`);
 if(wave>1){const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type(String(wave));await g.page.keyboard.press('Enter');await g.click(210,400);}
 await g.click(380,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
 await g.page.waitForTimeout(700);report.renderer=await g.page.evaluate(()=>document.querySelector('script[type="module"]')?.src);
 const grid=await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,solid=P.World.Map.CMap_Cell.mCollide_StaticImpassable|P.World.Map.CMap_Cell.mCollide_Object;return w.mMap.mCells.map(row=>row.map(c=>!!c&&!(c.mCollide&solid)));});
 const h=grid.length,w=grid[0].length,goals=[[3,3],[w-4,3],[w-4,h-4],[3,h-4]].map(([x,y])=>{const cells=[];for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++)if(grid[cy][cx])cells.push([cx,cy]);return cells.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y))[0];});
 let waypoint=0;
 function escapeDirection(s){
  if(Math.hypot(s.x-goals[waypoint][0]-.5,s.y-goals[waypoint][1]-.5)<1.2)waypoint=(waypoint+1)%goals.length;
  for(let i=0;i<4&&s.enemies.some(e=>Math.hypot(e.x-goals[waypoint][0]-.5,e.y-goals[waypoint][1]-.5)<2.5);i++)waypoint=(waypoint+1)%goals.length;
  const start=[Math.floor(s.x),Math.floor(s.y)],queue=[{q:start,cost:0}],parents=new Map([[start.join(),null]]),costs=new Map([[start.join(),0]]),goal=goals[waypoint].join();let found;
  // Weighted routes avoid walking through the horde just to reach the next corner. This is controller-only.
  while(queue.length){queue.sort((a,b)=>b.cost-a.cost);const item=queue.pop(),q=item.q;if(item.cost!==costs.get(q.join()))continue;if(q.join()===goal){found=q;break;}
   for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){const next=[q[0]+dx,q[1]+dy],key=next.join();if(!grid[next[1]]?.[next[0]])continue;
    const danger=s.enemies.reduce((v,e)=>{const d=Math.hypot(e.x-next[0]-.5,e.y-next[1]-.5);return v+(d<4?15/Math.max(.35,d)**3:0);},0),cost=item.cost+1+danger;
    if(cost<(costs.get(key)??Infinity)){costs.set(key,cost);parents.set(key,q);queue.push({q:next,cost});}
   }
  }
  if(found){while(parents.get(found.join())?.join()!==start.join()&&parents.get(found.join()))found=parents.get(found.join());
   const dx=found[0]+.5-s.x,dy=found[1]+.5-s.y;
   return s.dirs.filter(d=>d.free).map(d=>({d:d.d,score:(Math.cos(d.d*Math.PI/4)*dx+Math.sin(d.d*Math.PI/4)*dy)/Math.max(.1,Math.hypot(dx,dy))+.08*d.space+s.enemies.slice(0,6).reduce((v,e)=>v-.5/Math.max(.2,Math.hypot(e.x-d.x,e.y-d.y))**2,0)})).sort((a,b)=>b.score-a.score)[0]?.d??-1;
  }return s.dirs.find(d=>d.free)?.d??-1;
 }
 const start=Date.now();let n=0,lastSample=-10000,lastShot=-30000,lastSwitch=-999;const previous={x:NaN,y:NaN,stuck:0};
 while(Date.now()-start<budget){
  const s=await g.eval(()=>{
   const P=window.__game.pkg,w=window.__game.main().mcWorld;if(!w?.mThing_Collection)return {state:window.__game.state()};
   const p=Object.values(w.mThing_Collection.mPlayerThings)[0],u=w.mUpgrades,t=u.timedWave;
   const visible=e=>{const q=w.GetScreenPosition(e.mPosition);return q.x>=0&&q.x<=640&&q.y>=0&&q.y<=500;};
   const enemies=Object.values(w.mThing_Collection.mThings).filter(e=>['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(e._CLASSID_)&&e.Process&&e.mLife>0&&!e.lanKillLogged&&visible(e));
   const solid=P.World.Map.CMap_Cell.mCollide_StaticImpassable|P.World.Map.CMap_Cell.mCollide_Object;
   const px=p?.mPosition.mX??0,py=p?.mPosition.mY??0;
   const free=(x,y)=>[[-.35,-.35],[.35,-.35],[-.35,.35],[.35,.35]].every(([dx,dy])=>{const c=w.mMap.mCells[Math.floor(y+dy)]?.[Math.floor(x+dx)];return c&&!(c.mCollide&solid);});
   const positions=enemies.map(e=>({x:e.mPosition.mX,y:e.mPosition.mY,boss:!!e.mBossKind,hp:e.mLife,kind:e.mCombatKind??e.mEnemyVariant??e._CLASSID_})).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
   const dirs=Array.from({length:8},(_,d)=>{const a=d*Math.PI/4,x=px+Math.cos(a)*.7,y=py+Math.sin(a)*.7;return {d,x,y,free:free(x,y),space:[1,2,3].filter(r=>free(px+Math.cos(a)*r,py+Math.sin(a)*r)).length};});
   const weapons=Object.fromEntries(Object.entries(p?.mWeapons??{}).map(([k,v])=>[k,{active:v.mActive,ammo:v.mThing?.mAmmo,damage:v.mThing?.mDamage,rate:v.mThing?.mFireRate,range:v.mThing?.mRange,wide:v.mThing?.mWideShot}]));
   return {state:window.__game.state(),phase:t?.phase,wave:u.mLevelIndex,tick:w.mTick,remaining:t?.remainingTicks,total:t?.totalTicks,
    goal:t?.clear,life:p?.mLife,maxLife:p?.mMaxLife,armor:p?.mArmor,level:u.lanGrowth?.players[0]?.level,xp:u.lanGrowth?.players[0]?.xp,
    score:u.lanGrowth?.players[0]?.score,playerState:p?.mStateID,x:px,y:py,dir:p?.mAngle.__get__mDirection(),
    weapon:p?.mWeapon_Current?.mNameID,auto:p?.mWeapon_Current?.mAuto,ammo:p?.mWeapon_Current?.mAmmo,weapons,enemies:positions,dirs,boss:t?.boss};
  });
  const elapsed=Date.now()-start;
  if(elapsed-lastSample>=5000){report.samples.push({ms:elapsed,...s,composition:s.enemies?.reduce((out,e)=>(out[e.kind]=(out[e.kind]??0)+1,out),{}),enemies:s.enemies?.length});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));lastSample=elapsed;}
  if(elapsed-lastShot>=30000){await g.shot(`${out}/play-${Math.round(elapsed/1000)}s.png`,false);lastShot=elapsed;console.log(JSON.stringify({ms:elapsed,wave:s.wave,level:s.level,life:Math.round(s.life??0),remaining:s.remaining,enemies:s.enemies?.length,score:s.score,bossHP:s.boss?.life}));}
  if(s.state!=='State_RunWorld'||s.phase==='draft'||s.wave!==wave){report.result={ms:elapsed,...s,enemies:s.enemies?.length};break;}
  const want=[];
  if(s.playerState==='State_PlayerControl'){
   const line=e=>{const distance=Math.hypot(e.x-s.x,e.y-s.y);for(let r=.3;r<distance-.4;r+=.2)if(!grid[Math.floor(s.y+(e.y-s.y)*r/distance)]?.[Math.floor(s.x+(e.x-s.x)*r/distance)])return false;return true;};
   const target=s.enemies.find(line),distance=s.enemies[0]?Math.hypot(s.enemies[0].x-s.x,s.enemies[0].y-s.y):Infinity;
   const moved=Math.hypot(s.x-previous.x,s.y-previous.y);previous.stuck=[...held].some(k=>k.startsWith('Arrow'))&&moved<.01?previous.stuck+1:0;previous.x=s.x;previous.y=s.y;
   let direction=-1,shoot=-1;
   if(target){
    let best=Infinity;
    for(let d=0;d<8;d++){const a=d*Math.PI/4,fx=Math.cos(a),fy=Math.sin(a),gx=s.x+fx*.6-fy*.33,gy=s.y+fy*.6+fx*.33;
     const dx=target.x-gx,dy=target.y-gy,perp=Math.abs(-fy*dx+fx*dy),along=fx*dx+fy*dy;
     if(along>-.15&&perp<.38&&perp<best){best=perp;shoot=d;}}
   }
   const aligned=target&&distance<7.5&&shoot===s.dir;
   const evade=style==='survive'||distance<evadeDistance||previous.stuck>5;
   if(evade){
    direction=escapeDirection(s);
   }else if(style==='active'&&aligned){if(s.auto||n%3!==0)want.push('Slash');}
   else if(target&&shoot>=0&&distance<7.5)direction=shoot;
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
   if(style==='active'&&n-lastSwitch>30){
    const order=['railgun','uzi','shotgun','pistol'].filter(k=>s.weapons[k]?.active).sort((a,b)=>{
     const power=k=>{const v=s.weapons[k];return v.damage*(k==='shotgun'?(v.wide?5:3):1)*25/Math.max(1,v.rate);};return power(b)-power(a);
    });
    const selected=order.find(k=>s.weapons[k]?.active&&(s.weapons[k].ammo>0||k==='pistol'));
    if(selected&&selected!==s.weapon){want.push({pistol:'Digit1',uzi:'Digit2',shotgun:'Digit3',railgun:'Digit0'}[selected]);lastSwitch=n;}
   }
  }
  await keys(want);await g.page.waitForTimeout(80);n++;
 }
 await keys([]);await g.shot(`${out}/final.png`,false);report.wallMs=Date.now()-start;report.last=report.samples.at(-1);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);
 report.outcome=report.result?.life<=0?'defeat':report.result?.phase==='draft'?'wave-completed':report.result?'state-transition':'interrupted';
 assert(report.result,'play budget exhausted before a terminal wave/player result');report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('REAL-TIME PACING PLAY FINISHED '+out);
