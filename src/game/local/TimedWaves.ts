// TIMED_WAVES: optional simulation wrapper; mechanical ports and classic peer RNG remain unchanged.
import { flash, forIn, _root } from '../../engine/runtime.ts';
import { CMain, CSound, Thing, World } from '../packages.ts';
import { endlessConfigured } from './Endless.ts';
import { difficultyIndex } from './BalanceRules.ts';
import { netSession } from './Net/NetSession.ts';
import { TIMED_WAVES_RULE, spawnIntervalSeconds, waveSeconds } from './TimedWaveRules.ts';

export interface SpawnWarning { family:'Zombie'|'Devil'; x:number; y:number; ticks:number }
export interface TimedWaveState {
  rule:typeof TIMED_WAVES_RULE;
  phase:'combat'|'draft';
  totalTicks:number; remainingTicks:number;
  zombieTicks:number; devilTicks:number;
  opening:number;
  warnings:SpawnWarning[];
}
const classic = new WeakSet<object>();
export function setClassicTimedWavesFixture(main:object):void { classic.add(main); }
export function timedWavesConfigured():boolean {
  const session=netSession();
  return endlessConfigured() && (session ? session.startOpts?.cfg.timedWaves===TIMED_WAVES_RULE : !classic.has(CMain._this));
}
export function timedWave(world:any):TimedWaveState|undefined { return world?.mUpgrades?.timedWave; }
export function copyTimedWave(world:any):TimedWaveState|undefined {
  const state=timedWave(world); return state ? {...state,warnings:state.warnings.map(w=>({...w}))} : undefined;
}
export function resetTimedWave(world:any,upgrades=world.mUpgrades):void {
  const size=world.mMap.mSize,totalTicks=waveSeconds(size.x,size.y)*CMain.mFPS;
  upgrades.timedWave={rule:TIMED_WAVES_RULE,phase:'combat',totalTicks,remainingTicks:totalTicks,
    zombieTicks:0,devilTicks:0,opening:3,warnings:[]} satisfies TimedWaveState;
}
export function livingWavePlayers(world:any):any[] {
  return (Object.values(world.mThing_Collection?.mPlayerThings??{}) as any[])
    .filter(p=>p.Process&&p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD)).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex);
}

// Search only the local reachable area. This never touches the original global navigation session or RNG.
export function reachableSpawnCells(world:any, target:any):any[] {
  const map=world.mMap, start=map.mCells[Math.floor(target.mPosition.mY)]?.[Math.floor(target.mPosition.mX)];
  if(!start)return [];
  const seen=new Set<any>([start]),queue=[start],distance=[0],out:any[]=[];
  for(let i=0;i<queue.length;i++){
    const cell=queue[i],depth=distance[i]!;out.push(cell);if(depth>=20)continue;
    for(const next of [cell.mEast,cell.mSouth,cell.mWest,cell.mNorth]){
      if(!next||seen.has(next)||next.mCollide&World.Map.CMap_Cell.mCollide_Navigation)continue;
      seen.add(next);queue.push(next);distance.push(depth+1);
    }
  }
  return out;
}
function vacant(world:any,x:number,y:number):boolean {
  const cell=world.mMap.mCells[Math.floor(y)]?.[Math.floor(x)];
  return !!cell&&!(cell.mCollide&World.Map.CMap_Cell.mCollide_NonMovable);
}
function safeDistance(players:any[],x:number,y:number):boolean {
  return players.every(p=>Math.hypot(p.mPosition.mX-x,p.mPosition.mY-y)>=4);
}
export function chooseTimedSpawn(world:any,family:'Zombie'|'Devil'): {point:any;warning:boolean}|undefined {
  const players=livingWavePlayers(world);if(!players.length)return;
  // Rotate targets by simulation tick; no subtype RNG is added to legacy spawning.
  const target=players[world.mTick%players.length],p=target.mPosition;
  const cells=reachableSpawnCells(world,target),reachable=new Set(cells);
  const entrances=(world['mSpawnPoint_'+family]??[]).filter((s:any)=>{
    const q=s.mPosition;
    return reachable.has(s.mNextCell)&&!(s.mCell.mCollide&World.Map.CMap_Cell.mCollide_NoSpawn)
      &&!(s.mNextCell.mCollide&World.Map.CMap_Cell.mCollide_NonMovable)
      &&safeDistance(players,q.mX,q.mY)&&q.Distance2D(p)<=12;
  }).sort((a:any,b:any)=>a.mPosition.Distance2D(p)-b.mPosition.Distance2D(p));
  if(entrances.length)return {point:entrances[0],warning:false};
  const warnings=timedWave(world)!.warnings;
  const ground=cells.filter(c=>{
    const x=c.mID.x+.5,y=c.mID.y+.5,d=Math.hypot(x-p.mX,y-p.mY);
    return d<=8&&safeDistance(players,x,y)&&vacant(world,x,y)&&!warnings.some(w=>Math.hypot(w.x-x,w.y-y)<1);
  }).sort((a,b)=>Math.abs(Math.hypot(a.mID.x+.5-p.mX,a.mID.y+.5-p.mY)-6)-Math.abs(Math.hypot(b.mID.x+.5-p.mX,b.mID.y+.5-p.mY)-6));
  const cell=ground[0];if(!cell)return;
  return {point:{mCell:cell,mPosition:new Thing.Math.CThing_Position(cell.mID.x+.5,cell.mID.y+.5,0)},warning:true};
}
const spawning=new WeakMap<object,any>();
function emit(world:any,family:'Zombie'|'Devil',point:any):boolean {
  spawning.set(world,point);
  try{return world['Spawn_'+family]();}finally{spawning.delete(world);}
}
function attempt(world:any,family:'Zombie'|'Devil'):boolean {
  const choice=chooseTimedSpawn(world,family);if(!choice)return false;
  if(!choice.warning)return emit(world,family,choice.point);
  const p=choice.point.mPosition;
  timedWave(world)!.warnings.push({family,x:p.mX,y:p.mY,ticks:Math.ceil(.8*CMain.mFPS)});return true;
}
function cap(world:any,family:'Zombie'|'Devil'):number {
  return Math.min(world.mUpgrades.Level[family+'_Count']??0,family==='Zombie'?(_root._quality==='LOW'?40:60):Infinity);
}
function roomFor(world:any,family:'Zombie'|'Devil'):boolean {
  return (world.mUpgrades.Level['m'+family+'Count']??0)+timedWave(world)!.warnings.filter(w=>w.family===family).length<cap(world,family);
}
function processWarnings(world:any):void {
  const state=timedWave(world)!;
  for(const warning of [...state.warnings]){
    if(--warning.ticks>0)continue;
    state.warnings.splice(state.warnings.indexOf(warning),1);
    if(!roomFor(world,warning.family))continue;
    const players=livingWavePlayers(world),cell=world.mMap.mCells[Math.floor(warning.y)]?.[Math.floor(warning.x)];
    const reachable=players.some(p=>Math.hypot(p.mPosition.mX-warning.x,p.mPosition.mY-warning.y)<=8&&reachableSpawnCells(world,p).includes(cell));
    if(reachable&&vacant(world,warning.x,warning.y)&&safeDistance(players,warning.x,warning.y)){
      emit(world,warning.family,{mPosition:new Thing.Math.CThing_Position(warning.x,warning.y,0)});
    }else attempt(world,warning.family); // A replacement always receives its own full warning.
  }
}
/** Dispose without LogKill/Affect so timeout never awards score, XP, loot or explosive chains. */
export function clearWaveCombat(world:any):void {
  const collection=world.mThing_Collection;
  for(const id of forIn(collection.mThings)){
    const thing=collection.mThings[id],cls=thing._CLASSID_ as string;
    if(cls==='CThing_Creature_Zombie'||cls==='CThing_Creature_Devil'||cls.startsWith('CThing_Shot_')||cls.startsWith('CThing_Effect_')){
      thing.ClearCollideCell?.();
      if(thing.Process)thing.Delete();
      thing.Dispose();delete collection.mThings[id];delete collection.mDeleteThings?.[id];
    }else if(thing.mAffectors)thing.mAffectors=[];
  }
  world.mUpgrades.Level.mZombieCount=0;world.mUpgrades.Level.mDevilCount=0;
  if(world.mUpgrades.enemyVariantState)world.mUpgrades.enemyVariantState.zones=[];
  const state=timedWave(world);if(state)state.warnings=[];
}
const views=new WeakMap<object,any>();
function drawWarnings(world:any):void {
  const state=timedWave(world);if(!state?.warnings.length)return;
  let clip=views.get(world);
  if(!clip){clip=world.createEmptyMovieClip('_ArrivalWarnings',world.getNextHighestDepth());clip._visible=false;views.set(world,clip);}
  for(const warning of state.warnings){
    const p=world.GetScreenPosition(new Thing.Math.CThing_Position(warning.x,warning.y,0));
    clip.clear();clip.lineStyle(2,0xf4d597,100);clip.beginFill(0x603826,22);
    for(let i=0;i<=16;i++){const a=i*Math.PI/8,x=Math.cos(a)*13,y=Math.sin(a)*13;i?clip.lineTo(x,y):clip.moveTo(x,y);}clip.endFill();
    clip.moveTo(-5,0);clip.lineTo(5,0);clip.moveTo(0,-5);clip.lineTo(0,5);
    world.bmCurrentDraw.draw(clip,new flash.geom.Matrix(1,0,0,1,p.x,p.y),undefined,'normal',undefined,true);
  }
}
/** Install before supply processing; later local/LAN/checkpoint wrappers stay outermost. */
export function installTimedWaves():void {
  const upgrades=World.CUpgrades.prototype as any,level=upgrades.__set__mLevel,process=upgrades.Process;
  upgrades.AdvanceTimedWave=function(this:any):void{
    clearWaveCombat(this.mWorld);this.__set__mLevel(this.mLevelIndex+1);CSound.mSamples.Click.PlaySound();
  };
  upgrades.FinishTimedWave=function(this:any):void{this.AdvanceTimedWave();};
  upgrades.__set__mLevel=function(this:any,wave:any):any{
    const result=level.call(this,wave);if(timedWavesConfigured())resetTimedWave(this.mWorld,this);return result;
  };
  for(const family of ['Zombie','Devil'] as const){
    const name='__set__m'+family+'Count',set=upgrades[name];
    upgrades[name]=function(this:any,count:number):any{
      const maximum=this.Level[family+'_Count'],result=set.call(this,count);
      if(timedWave(this.mWorld)){this.Level[family+'_Count']=maximum;this.Level[family+'_TotalCount']=0;}
      return result;
    };
  }
  upgrades.Process=function(this:any):any{
    const world=this.mWorld,state=timedWave(world);if(!state)return process.call(this);
    if(!world.mLoaded||world.mCompleteState||!livingWavePlayers(world).length)return;
    this.mTick++;
    if(--state.remainingTicks<=0){
      this.FinishTimedWave();return;
    }
    processWarnings(world);
    const difficulty=difficultyIndex(netSession()?.startOpts?.cfg.difficulty??CMain.mSaveData.__get__mDifficulty());
    const interval=Math.ceil(CMain.mFPS*spawnIntervalSeconds(difficulty,this.mLevelIndex,1-state.remainingTicks/state.totalTicks));
    const empty=(this.Level.mZombieCount??0)+(this.Level.mDevilCount??0)===0;
    const attempts=state.opening>0?state.opening:1;state.opening=0;
    if(--state.zombieTicks<=0||empty){
      for(let i=0;i<attempts&&roomFor(world,'Zombie');i++)attempt(world,'Zombie');
      state.zombieTicks=interval;
    }
    if(--state.devilTicks<=0){
      if(roomFor(world,'Devil'))attempt(world,'Devil');
      state.devilTicks=Math.max(CMain.mFPS*2,this.Level.Devil_SpawnRate??0);
    }
    if(this.mMultipleKillsTick--<0)this.__set__mMultipleKill(0);
    if(this.mMultiplierTick--<0)this.__set__mMultiplier(this.__get__mMultiplier()-1);
  };
  const world=World.CWorld.prototype as any;
  for(const name of ['Spawn_ValidPosition','Spawn_ValidPosition_NonStrict']){
    const original=world[name];world[name]=function(this:any,...args:any[]):any{return spawning.get(this)??original.apply(this,args);};
  }
  const map=World.Map.CMap.prototype as any,draw=map.Draw;
  map.Draw=function(this:any,...args:any[]):any{drawWarnings(this.mWorld);return draw.apply(this,args);};
}
