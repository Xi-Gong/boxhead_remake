import {CMain,Thing,World} from '../packages.ts';
import {difficultyIndex} from './BalanceRules.ts';
import {netSession} from './Net/NetSession.ts';
import {timedWave,timedWavesConfigured,livingWavePlayers} from './TimedWaves.ts';
import {CLEAR_WAVES_RULE,clearWaveKeys,newClearWave} from './ClearWaveRules.ts';
const classic=new WeakSet<object>();
export function setClassicClearWavesFixture(main:object):void{classic.add(main);}
export function clearWavesConfigured():boolean{
  const s=netSession();return timedWavesConfigured()&&(s?s.startOpts?.cfg.clearWaves===CLEAR_WAVES_RULE:!classic.has(CMain._this));
}
export function clearWavesWorld(world:any):boolean{
  const state=timedWave(world);return state?state.clearable===CLEAR_WAVES_RULE:clearWavesConfigured();
}
/** v2 saves omit ordinary live creatures. Return only those omitted arrivals to the unspawned budget. */
export function reconcileSavedClearWave(world:any):void{
  const state=timedWave(world)?.clear;if(!state)return;
  for(const family of ['Zombie','Devil']as const){
    const keys=clearWaveKeys(family),alive=(Object.values(world.mThing_Collection.mThings)as any[]).filter(e=>
      e._CLASSID_==='CThing_Creature_'+family&&e.Process&&e.mLife>0&&!e.lanKillLogged&&!(e.mFlags&Thing.CThing.mFlag_DEAD)).length;
    state[keys.emitted]=Math.min(state[keys.total],state[keys.killed]+alive);
  }
}
export function installClearWaves():void{
  const u=World.CUpgrades.prototype as any,level=u.__set__mLevel,process=u.Process;
  u.__set__mLevel=function(this:any,wave:number):any{
    // CUpgrades is still being constructed on the initial call; world.mUpgrades is assigned afterwards.
    const result=level.call(this,wave),state=this.timedWave,cfg=netSession()?.startOpts?.cfg;
    if(state&&clearWavesConfigured()){
      state.clearable=CLEAR_WAVES_RULE;
      if(!state.boss)state.clear=newClearWave(wave,state.totalTicks/CMain.mFPS,
        difficultyIndex(cfg?.difficulty??CMain.mSaveData.__get__mDifficulty()),cfg?.devils??!!CMain.mSaveData.__get__mDevilsActive(),World.CWorld.mGameMode==='Single'?1:2);
    }
    return result;
  };
  u.Process=function(this:any):any{
    const w=this.mWorld,state=timedWave(w),c=state?.clear;
    if(c&&state.phase==='combat'&&c.killedZombies>=c.zombies&&c.killedDevils>=c.devils&&w.mLoaded&&!w.mCompleteState&&livingWavePlayers(w).length){this.FinishTimedWave();return;}
    return process.call(this);
  };
  const world=World.CWorld.prototype as any;
  for(const family of ['Zombie','Devil']as const){
    const spawn=world['Spawn_'+family];world['Spawn_'+family]=function(this:any):any{
      const state=timedWave(this)?.clear,keys=clearWaveKeys(family);
      if(state&&state[keys.emitted]>=state[keys.total])return false;
      const result=spawn.call(this);if(state&&result)state[keys.emitted]++;return result;
    };
  }
  const kill=world.LogKill;
  world.LogKill=function(this:any,enemy:any):any{
    const state=timedWave(this)?.clear;
    if(state&&!enemy.mClearKillLogged&&['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(enemy._CLASSID_)){
      const keys=clearWaveKeys(enemy._CLASSID_==='CThing_Creature_Zombie'?'Zombie':'Devil');
      enemy.mClearKillLogged=true;state[keys.killed]=Math.min(state[keys.total],state[keys.killed]+1);
    }
    return kill.call(this,enemy);
  };
}
