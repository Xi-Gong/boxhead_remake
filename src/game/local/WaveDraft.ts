import {random} from '../../engine/runtime.ts';
import {CMain,Thing,World} from '../packages.ts';
import {clearWaveCombat,timedWave,timedWavesConfigured} from './TimedWaves.ts';
import {netSession} from './Net/NetSession.ts';
import {infiniteGrowthWeapon,modernWeaponProjection} from './Net/Growth.ts';
import {combatWorld,simplifiedWorld,passiveBonuses,restoredSupply,replenishedAmmo} from './CombatRules.ts';
import {syncCombatPlayer} from './Combat.ts';
import {SLOT_ORDER} from './Net/NetSlot.ts';
import {syncVitals,playerArmorMaximum} from './SurvivalRules.ts';
import {takeDraftChoice,draftSampleBits} from './WaveDraftInput.ts';
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
  if(waveDraftConfigured())world.mUpgrades.waveDraft??=newWaveDraft(world.mUpgrades.mLevelIndex,combatWorld(world),simplifiedWorld(world));
}
function player(world:any,index:number):any {
  return (Object.values(world.mThing_Collection.mPlayerThings) as any[]).find(p=>p.mPlayerIndex===index);
}
function finiteWeapons(p:any):any[] {
  return (p?.mWeaponList??[]).filter((e:any)=>e.mActive&&e.mThing&&!infiniteGrowthWeapon(e.mThing)).map((e:any)=>e.mThing);
}
export function rewardOffers(p:any):Reward[] {
  const alive=p&&p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD);
  if(p&&combatWorld(p.mWorld)){
    const w=p.mWorld,b=waveDraft(w)!.bonuses[p.mPlayerIndex]!,weapons=(p.mWeaponList??[]).filter((e:any)=>e.mActive&&e.mThing).map((e:any)=>e.mThing);
    const canWeapon=(key:'haste'|'capacity')=>weapons.some((gun:any)=>{
      if(key==='capacity'&&infiniteGrowthWeapon(gun))return false;
      const next=modernWeaponProjection(w,p.mPlayerIndex,gun._CLASSID_,{...b,[key]:(b[key]??0)+1});
      return next&&(key==='capacity'?next.capacity>gun.mTotalAmmo:next.fireRate<gun.mFireRate);
    });
    const offense:Reward[]=simplifiedWorld(w)?['damage']:['damage','penetration'];if(canWeapon('haste'))offense.push('haste');
    const defense:Reward[]=['health'];if(playerArmorMaximum(p,{...b,armor:b.armor+1})>playerArmorMaximum(p,b))defense.push('armor');if(alive&&p.mLife<p.mMaxLife)defense.push('heal');
    const utility:Reward[]=['scavenging'];
    if(passiveBonuses({...b,mobility:(b.mobility??0)+1}).movement-passiveBonuses(b).movement>1e-6)utility.push('mobility');
    if(canWeapon('capacity'))utility.push('capacity');if(finiteWeapons(p).some(gun=>gun.mAmmo<gun.mTotalAmmo))utility.push('ammo');
    return [offense,defense,utility].map(pool=>pool[random(pool.length)]!);
  }
  const pool=REWARDS.filter(r=>r!=='damage'&&(r!=='heal'||alive&&p.mLife<p.mMaxLife)
    &&(r!=='ammo'||finiteWeapons(p).some(w=>w.mAmmo<w.mTotalAmmo)));
  return ['damage',pool.splice(random(pool.length),1)[0]!,pool.splice(random(pool.length),1)[0]!];
}
function heldBits(p:any,playerIndex=0,consumeTap=false):number {
  let pressed=0;
  const bits=SLOT_ORDER.reduce((bits,name,index)=>{
    const slot=p?.mControls[name]??CMain.mInput?.['KEY_'+name+(playerIndex?'2':'')],tap=consumeTap&&slot?.IsPressed();
    if(tap)pressed|=1<<index;
    return bits|(slot?.IsDown()||tap?1<<index:0);
  },0);
  return consumeTap?draftSampleBits(p?.mWorld,bits,pressed):bits;
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
  if(reward!=='heal'&&reward!=='ammo')state.bonuses[index]![reward]=(state.bonuses[index]![reward]??0)+multiplier;
  if(!p)return;
  if(reward==='health')syncVitals(p,'level');
  else if(reward==='damage'||reward==='capacity'||reward==='haste'){
    for(const entry of p.mWeaponList??[])if(entry.mActive&&entry.mThing)world.mUpgrades.ApplyUpgrade_Weapon(entry.mThing);
  }
  else if(reward==='heal'&&p.mLife>0&&!(p.mFlags&Thing.CThing.mFlag_DEAD))p.mLife=Math.min(p.mMaxLife,p.mLife+(combatWorld(world)?restoredSupply(p.mMaxLife,p.mSupplyEfficiency??0,.35*multiplier):p.mMaxLife*.35*multiplier));
  else if(reward==='ammo')for(const weapon of finiteWeapons(p))weapon.mAmmo=replenishedAmmo(world,weapon.mAmmo,weapon.mTotalAmmo,restoredSupply(weapon.mTotalAmmo,combatWorld(world)?p.mSupplyEfficiency??0:0,.35*multiplier));
  if(reward==='mobility'||reward==='penetration'||reward==='scavenging')syncCombatPlayer(p);
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
    else if(round.readyRule&&(bits===104||bits===105))round.selected[index]=(round.selected[index]!+(bits===104?2:1))%3;
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
