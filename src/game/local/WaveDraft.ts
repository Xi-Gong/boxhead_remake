import {random} from '../../engine/runtime.ts';
import {CMain,Thing,World} from '../packages.ts';
import {clearWaveCombat,timedWave,timedWavesConfigured} from './TimedWaves.ts';
import {netSession} from './Net/NetSession.ts';
import {infiniteGrowthWeapon} from './Net/Growth.ts';
import {SLOT_ORDER} from './Net/NetSlot.ts';
import {syncVitals} from './SurvivalRules.ts';
import {takeDraftChoice} from './WaveDraftInput.ts';
import {WAVE_DRAFT_RULE,DRAFT_READY_RULE,DRAFT_CONFIRM,REWARDS,newWaveDraft,decodeDraftChoice,type Reward,type WaveDraftState} from './WaveDraftRules.ts';
const classic=new WeakSet<object>();
const classicReady=new WeakSet<object>();
export function setClassicDraftReadyFixture(main:object):void{classicReady.add(main);}
export function draftReadyConfigured():boolean{
 const s=netSession();return waveDraftConfigured()&&(s?s.startOpts?.cfg.draftReady===DRAFT_READY_RULE:!classicReady.has(CMain._this));
}
export function setClassicWaveDraftFixture(main:object):void {classic.add(main);}
export function waveDraftConfigured():boolean {
  const s=netSession();return timedWavesConfigured()&&(s?s.startOpts?.cfg.waveDraft===WAVE_DRAFT_RULE:!classic.has(CMain._this));
}
export function waveDraft(world:any):WaveDraftState|undefined{return world?.mUpgrades?.waveDraft;}
export function initializeWaveDraft(world:any):void {
  if(waveDraftConfigured())world.mUpgrades.waveDraft??=newWaveDraft(world.mUpgrades.mLevelIndex);
}
function player(world:any,index:number):any {
  return (Object.values(world.mThing_Collection.mPlayerThings) as any[]).find(p=>p.mPlayerIndex===index);
}
function finiteWeapons(p:any):any[] {
  return (p?.mWeaponList??[]).filter((e:any)=>e.mActive&&e.mThing&&!infiniteGrowthWeapon(e.mThing)).map((e:any)=>e.mThing);
}
export function rewardOffers(p:any):Reward[] {
  const alive=p&&p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD);
  const pool=REWARDS.filter(r=>r!=='damage'&&(r!=='heal'||alive&&p.mLife<p.mMaxLife)
    &&(r!=='ammo'||finiteWeapons(p).some(w=>w.mAmmo<w.mTotalAmmo)));
  return ['damage',pool.splice(random(pool.length),1)[0]!,pool.splice(random(pool.length),1)[0]!];
}
function heldBits(p:any,playerIndex=0,consumeTap=false):number {
  return SLOT_ORDER.reduce((bits,name,index)=>{
    const slot=p?.mControls[name]??CMain.mInput?.['KEY_'+name+(playerIndex?'2':'')],tap=consumeTap&&slot?.IsPressed();
    return bits|(slot?.IsDown()||tap?1<<index:0);
  },0);
}
export function beginWaveDraft(world:any,multiplier=1):void {
  const state=waveDraft(world),timed=timedWave(world);if(!state||!timed||timed.phase==='draft')return;
  clearWaveCombat(world);timed.phase='draft';
  const count=World.CWorld.mGameMode==='Single'?1:2,indices=Array.from({length:count},(_,i)=>i);
  // Discard battle latches, while retaining held flags for the entry release guard.
  for(const i of indices)heldBits(player(world,i),i,true);
  state.round={wave:world.mUpgrades.mLevelIndex,remainingTicks:Math.ceil(CMain.mFPS*12),multiplier,
    ...(draftReadyConfigured()?{readyRule:DRAFT_READY_RULE,remainingTicks:0}:{}),
    offers:indices.map(i=>rewardOffers(player(world,i))),selected:indices.map(()=>0),confirmed:indices.map(()=>false),
    armed:indices.map(i=>!(heldBits(player(world,i),i)&16)),previousBits:indices.map(i=>heldBits(player(world,i),i))};
}
export function applyWaveReward(world:any,index:number,reward:Reward,multiplier:number):void {
  const state=waveDraft(world)!;const p=player(world,index);
  if(reward==='damage'||reward==='health'||reward==='armor'||reward==='capacity')state.bonuses[index]![reward]+=multiplier;
  if(!p)return;
  if(reward==='health')syncVitals(p,'level');
  else if(reward==='damage'||reward==='capacity'){
    for(const entry of p.mWeaponList??[])if(entry.mActive&&entry.mThing)world.mUpgrades.ApplyUpgrade_Weapon(entry.mThing);
  }
  else if(reward==='heal'&&p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD))p.mLife=Math.min(p.mMaxLife,p.mLife+p.mMaxLife*.35*multiplier);
  else if(reward==='ammo')for(const weapon of finiteWeapons(p))weapon.mAmmo=Math.min(weapon.mTotalAmmo,weapon.mAmmo+Math.ceil(weapon.mTotalAmmo*.35*multiplier));
}
export function processWaveDraft(world:any):void {
  const state=waveDraft(world)!,round=state.round;if(!round)return;
  for(let index=0;index<round.offers.length;index++){
    if(round.confirmed[index])continue;
    const p=player(world,index),s=netSession();
    const bits=s?SLOT_ORDER.reduce((value,name,i)=>value|(s.slot(index,name)?.IsDown()?1<<i:0),0)
      :takeDraftChoice(world,index)??heldBits(p,index,true);
    const direct=decodeDraftChoice(bits),previous=round.previousBits[index]!,fresh=bits&~previous;
    if(!(bits&16))round.armed[index]=true;
    if(round.readyRule&&bits>=100&&bits<=102)round.selected[index]=bits-100;
    else if(round.readyRule&&bits===DRAFT_CONFIRM)round.confirmed[index]=true;
    else if(direct!==undefined){round.selected[index]=direct;round.confirmed[index]=true;}
    else {
      if(fresh&(1|4|64))round.selected[index]=(round.selected[index]!+2)%3;
      else if(fresh&(2|8|32))round.selected[index]=(round.selected[index]!+1)%3;
      if(round.armed[index]&&(fresh&16))round.confirmed[index]=true;
    }
    round.previousBits[index]=bits;
  }
  if(!round.readyRule&&--round.remainingTicks<=0){
    for(let i=0;i<round.confirmed.length;i++)if(!round.confirmed[i]){round.selected[i]=0;round.confirmed[i]=true;}
  }
  if(round.confirmed.every(Boolean)){
    if(state.lastRewardWave<round.wave){
      state.lastRewardWave=round.wave;
      for(let i=0;i<round.offers.length;i++)applyWaveReward(world,i,round.offers[i]![round.selected[i]!]!,round.multiplier);
    }
    delete state.round;
    world.mUpgrades.AdvanceTimedWave();
  }
}
export function installWaveDraft():void {
  const character=Thing.Creature.CThing_Creature_Player.prototype as any,addWeapon=character.AddWeapon;
  character.AddWeapon=function(this:any,...args:any[]):any{
    const entry=addWeapon.apply(this,args);
    if(waveDraft(this.mWorld)&&entry?.mThing)this.mWorld.mUpgrades.ApplyUpgrade_Weapon(entry.mThing);
    return entry;
  };
  const world=World.CWorld.prototype as any,init=world.InitFinished;
  world.InitFinished=function(this:any):any{const value=init.call(this);initializeWaveDraft(this);return value;};
  const u=World.CUpgrades.prototype as any,finish=u.FinishTimedWave,process=u.Process;
  u.FinishTimedWave=function(this:any,multiplier=1):any{
    if(waveDraft(this.mWorld))return beginWaveDraft(this.mWorld,multiplier);return finish.call(this,multiplier);
  };
  u.Process=function(this:any):any{
    if(timedWave(this.mWorld)?.phase==='draft')return processWaveDraft(this.mWorld);return process.call(this);
  };
  const collection=Thing.CThing_Collection.prototype as any,tick=collection.Process;
  collection.Process=function(this:any):any{if(timedWave(this.mWorld)?.phase==='draft')return;return tick.call(this);};
}
