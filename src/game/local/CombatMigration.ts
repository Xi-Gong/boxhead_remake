// One-time v2-container migration. Operates only on reconstructed/cloned world state; never draws RNG.
import {CMain,World} from '../packages.ts';
import type {RunSnapshot} from './Resume.ts';
import {TIERED_GROWTH_RULE,tieredLevelStats} from './TieredGrowthRules.ts';
import {armorMaximum,ARMOR_MAX} from './Supplies.ts';
import {SURVIVAL_RULE} from './SurvivalRules.ts';
import {CLEAR_WAVES_RULE,type ClearWaveState} from './ClearWaveRules.ts';
import {modernBudget} from './CombatPacing.ts';
import {difficultyIndex} from './BalanceRules.ts';
import {netSession} from './Net/NetSession.ts';
import {timedWave,bossMembers} from './TimedWaves.ts';

function previousArmorMaximum(snap:RunSnapshot,index:number):number{
 if(snap.survival!==SURVIVAL_RULE)return ARMOR_MAX;
 const g=snap.growth?.players[index],level=g?.level??1;
 const base=g?.tiered===TIERED_GROWTH_RULE?tieredLevelStats(level).vitality:200+4*(Math.max(1,g?.endless?level:Math.min(125,level))-1);
 return Math.round(base*(1+.1*(snap.waveDraft?.bonuses[index]?.armor??0)));
}
export function prepareSimplifiedRestore(world:any):void{
 const draft=world.mUpgrades.waveDraft;
 if(draft){
  for(const b of draft.bonuses){b.damage+=b.penetration??0;delete b.penetration;}
  if(draft.round)draft.round.offers=draft.round.offers.map((row:string[])=>row.map(r=>r==='penetration'?'damage':r));
 }
 const state=timedWave(world);if(!state)return;
 state.clearable=CLEAR_WAVES_RULE;
 // Unborn legacy ground arrivals rejoin the finite budget and use an authored entrance next time.
 state.warnings=[];
 if(state.boss){
  state.boss.kind=state.boss.kind==='charger'?'charger':'devil';
  for(const member of bossMembers(state.boss))member.kind=member.kind==='charger'?'charger':'devil';
 }
}
export function finishSimplifiedRestore(world:any,snap:RunSnapshot):void{
 const things=Object.values(world.mThing_Collection.mThings)as any[];
 for(const p of Object.values(world.mThing_Collection.mPlayerThings)as any[]){
  const saved=snap.players.find(s=>s.index===p.mPlayerIndex);if(!saved)continue;
  p.mLife=saved.life>0?Math.max(1,Math.min(p.mMaxLife,Math.round(saved.life/Math.max(1,saved.maxLife)*p.mMaxLife))):saved.life;
  if(saved.armor!==undefined)p.mArmor=Math.round(Math.max(0,Math.min(1,saved.armor/previousArmorMaximum(snap,p.mPlayerIndex)))*armorMaximum(p));
 }
 for(const t of things)if(t.mEnchanted&&/^CThing_Object_(Barrel|Mine|ChargePack)$/.test(t._CLASSID_)&&typeof t.mDamage==='number')t.mDamage*=1.15/1.35;
 const state=timedWave(world);if(!state||state.boss||state.phase!=='combat')return;
 const cfg=netSession()?.startOpts?.cfg,budget=modernBudget(world,snap.wave,difficultyIndex(cfg?.difficulty??CMain.mSaveData.__get__mDifficulty()),cfg?.devils??!!CMain.mSaveData.__get__mDevilsActive(),World.CWorld.mGameMode==='Single'?1:2);
 const old=snap.timedWave?.clear,c:ClearWaveState={rule:CLEAR_WAVES_RULE,...budget,emittedZombies:0,emittedDevils:0,killedZombies:0,killedDevils:0};
 for(const family of ['Zombie','Devil']as const){
  const total=family==='Zombie'?'zombies':'devils',killed=family==='Zombie'?'killedZombies':'killedDevils',emitted=family==='Zombie'?'emittedZombies':'emittedDevils';
  const alive=things.filter(e=>e._CLASSID_==='CThing_Creature_'+family&&e.Process&&e.mLife>0&&!e.lanKillLogged).length;
  c[killed]=old&&old[total]>0?Math.floor(Math.max(0,Math.min(1,old[killed]/old[total]))*budget[total]):0;
  c[total]=Math.max(budget[total],c[killed]+alive);c[emitted]=c[killed]+alive;
 }
 state.clear=c;
}
