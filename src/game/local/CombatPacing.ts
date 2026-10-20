// Derived modern wave tuning. Authored ports, spawn markers and global navigation remain untouched.
import {CMain,Thing,World} from '../packages.ts';
import {_root} from '../../engine/runtime.ts';
import {difficultyIndex,balancedWave} from './BalanceRules.ts';
import {combatWaveBudget} from './ClearWaveRules.ts';
import {waveSeconds} from './TimedWaveRules.ts';
import {combatWorld} from './CombatRules.ts';
import {netSession} from './Net/NetSession.ts';
import {variantSight} from './EnemyVariants.ts';
export interface MapPacing {area:number;entranceDistance:number;seconds:number}
const profiles=new WeakMap<object,MapPacing>();
export function walkDistances(world:any,starts:any[]):Map<any,number>{
 const cells=world.mMap.mCells,dist=new Map<any,number>(),queue:any[]=[];
 for(const p of starts){const c=cells[Math.floor(p.mY)]?.[Math.floor(p.mX)];if(c&&!dist.has(c)){dist.set(c,0);queue.push(c);}}
 for(let i=0;i<queue.length;i++){
  const c=queue[i],n=dist.get(c)!+1;
  for(const next of [c.mEast,c.mSouth,c.mWest,c.mNorth])if(next&&!dist.has(next)&&!(next.mCollide&World.Map.CMap_Cell.mCollide_Navigation)){dist.set(next,n);queue.push(next);}
 }return dist;
}
export function mapPacing(world:any):MapPacing{
 const old=profiles.get(world);if(old)return old;
 const starts=world.mSpawnPoint_PlayerStart?[world.mSpawnPoint_PlayerStart.mPosition]:(world.mSpawnPoint_Player??[]).slice(0,2).map((s:any)=>s.mPosition),dist=walkDistances(world,starts);
 const lengths=(world.mSpawnPoint_Zombie??[]).map((s:any)=>dist.get(s.mNextCell)).filter((n:any)=>n!==undefined).sort((a:number,b:number)=>a-b);
 const area=dist.size,entranceDistance=lengths.length?lengths[Math.floor(lengths.length/2)]!:12;
 const seconds=Math.max(75,Math.min(105,Math.round((90+6*Math.log2(Math.max(1,area)/800)+.5*(entranceDistance-12))/5)*5));
 const value={area,entranceDistance,seconds};if(area&&lengths.length)profiles.set(world,value);return value;
}
export function modernBudget(world:any,wave:number,difficulty:number,devils:boolean,players:number):{zombies:number;devils:number}{
 const size=world.mMap.mSize;return combatWaveBudget(wave,waveSeconds(size.x,size.y),difficulty,devils,players);
}
export function installCombatPacing():void{
 const u=World.CUpgrades.prototype as any,level=u.__set__mLevel;
 function tune(upgrades:any,wave:number):void{
  const world=upgrades.mWorld;
  if(upgrades.combat?.rule==='combat-pve-v2'&&upgrades.combat.pendingWave===undefined&&upgrades.timedWave){
   const state=upgrades.timedWave,cfg=netSession()?.startOpts?.cfg,d=difficultyIndex(cfg?.difficulty??CMain.mSaveData.__get__mDifficulty());
   const profile=mapPacing(world),seconds=profile.seconds+(state.boss?30:0);state.totalTicks=state.remainingTicks=seconds*CMain.mFPS;
   state.mapPacing={...profile};
   state.entranceCursor=0;
   const tuning=balancedWave(wave,d),limit=Math.floor(.4*Math.min(tuning.Zombie_Count,_root._quality==='LOW'?40:60));
   upgrades.Level.Zombie_Count=state.boss?1+(state.boss.members??[state.boss]).filter((m:any)=>m.kind==='charger').length:Math.max(1,limit);
   if(state.clear)Object.assign(state.clear,modernBudget(world,wave,d,cfg?.devils??!!CMain.mSaveData.__get__mDevilsActive(),World.CWorld.mGameMode==='Single'?1:2));
  }
 }
 u.__set__mLevel=function(this:any,wave:number):any{
  const result=level.call(this,wave);tune(this,wave);return result;
 };
 // The constructor's first level precedes authored marker creation. Refresh after loading, before resume/growth.
 const world=World.CWorld.prototype as any,finished=world.InitFinished;
 world.InitFinished=function(this:any):any{const result=finished.call(this);tune(this.mUpgrades,this.mUpgrades.mLevelIndex);return result;};
 // Distant arrivals travel quickly through the map, then settle to their family combat pace.
 const p=Thing.Creature.CThing_Creature.prototype as any,move=p.State_CellToCell_Init;
 p.State_CellToCell_Init=function(this:any):any{
  if(!combatWorld(this.mWorld)||!['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(this._CLASSID_))return move.call(this);
  const target=this.mThing_Collection.GetClosestPlayer(this.mPosition),speed=this.mSpeed,d=target?.mPosition.Distance2D(this.mPosition)??0;
  const hidden=target&&d>4&&!variantSight(this.mWorld,this.mPosition,target.mPosition)?(d-4)/6:0;
  this.mSpeed=Math.max(speed,Math.min(.18,Math.max(0,(d-10)/8,hidden)*.18));
  try{return move.call(this);}finally{this.mSpeed=speed;}
 };
}
