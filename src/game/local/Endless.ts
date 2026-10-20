// ENDLESS_PVE: wrap derived wave/creature paths without editing mechanical ports.
import { CMain, Thing, World } from '../packages.ts';
import { balancedWorld, classicWaveFixture } from './Balance.ts';
import { difficultyIndex } from './BalanceRules.ts';
import { ENDLESS_RULE, endlessWave, enemyGrowth } from './EndlessRules.ts';
import { classicGrowthFixture, localGrowthEnabled } from './LocalGrowth.ts';
import { netSession } from './Net/NetSession.ts';
const classic=new WeakSet<object>();
const worlds=new WeakMap<object,{difficulty:number;devils:boolean;players:number}>();
export function setClassicEndlessFixture(main:object):void {classic.add(main);}
export function endlessConfigured():boolean {
  const s=netSession(),c=s?.startOpts?.cfg;
  return s? s.mode==='Coop'&&c?.endless===ENDLESS_RULE&&c.progression==='personal-growth-v1'&&c.supplies==='armor-ammo-v1'
    &&c.survival==='survival-v1'&&c.loot==='supply-crates-v2'&&c.balance==='pve-balance-v1'
    :localGrowthEnabled()&&!classic.has(CMain._this)&&!classicWaveFixture(CMain._this);
}
export function endlessSelectionEnabled():boolean {
  return netSession()?endlessConfigured():!classic.has(CMain._this)&&!classicWaveFixture(CMain._this)&&!classicGrowthFixture(CMain._this);
}
export function endlessWorld(world:any):boolean {return worlds.has(world);}
export function worldEnemyGrowth(world:any):{health:number;damage:number} {
  const rule=worlds.get(world);return rule?enemyGrowth(world.mUpgrades.mLevelIndex,rule.devils,rule.players):{health:1,damage:1};
}
export function installEndlessScope():void {
  const creature=Thing.Creature.CThing_Creature.prototype as any,hit=creature.State_BulletHit_Init;
  creature.State_BulletHit_Init=function(this:any):any {
    // The authored impulse grows with damage; unbounded damage could jump over map walls in one tick.
    // Keep damage intact and bound only the physical impulse to the original explosion impulse ceiling.
    if(endlessWorld(this.mWorld)&&this.mDelta.__get__mLength()>.3)this.mDelta.Normalize(.3);
    return hit.call(this);
  };
  const u=World.CUpgrades.prototype as any,init=u.InitLists,level=u.__set__mLevel;
  u.InitLists=function(this:any):any {
    const value=init.call(this);
    if(endlessConfigured()&&balancedWorld(this.mWorld)){
      const c=netSession()?.startOpts?.cfg;
      worlds.set(this.mWorld,{difficulty:difficultyIndex(c?.difficulty??CMain.mSaveData.__get__mDifficulty()),
        devils:c?.devils??!!CMain.mSaveData.__get__mDevilsActive(),players:World.CWorld.mGameMode==='Single'?1:2});
      this.__set__mLevel(this.mLevelIndex);
    }
    return value;
  };
  u.__set__mLevel=function(this:any,wave:any):any {
    const result=level.call(this,wave),rule=worlds.get(this.mWorld);
    if(rule){
      const tuning=endlessWave(wave,rule.difficulty,CMain.mFPS);
      if(!rule.devils){tuning.Devil_Count=0;tuning.Devil_TotalCount=0;}
      for(const key of ['Zombie_SpawnRate','Zombie_Count','Zombie_TotalCount','Devil_SpawnRate','Devil_Count','Devil_TotalCount'])this.Level[key]=(tuning as any)[key];
      if(this.timedWave){this.Level.Zombie_TotalCount=0;this.Level.Devil_TotalCount=0;}
      this.Level.mSpawnCount_Zombie=tuning.Zombie_SpawnRate;this.Level.mSpawnCount_Devil=tuning.Devil_SpawnRate;
    }
    return result;
  };
  for(const ctor of [Thing.Creature.CThing_Creature_Zombie,Thing.Creature.CThing_Creature_Devil]){
    const p=ctor.prototype as any,initialize=p.Process_Init;
    p.Process_Init=function(this:any):any {
      const result=initialize.call(this);
      if(endlessWorld(this.mWorld)){
        const factor=worldEnemyGrowth(this.mWorld);
        this.mLife=this.mMaxLife=this.mMaxLife*factor.health;
        if(this._CLASSID_==='CThing_Creature_Zombie')this.mDamage*=factor.damage;
        else this.mAttackDamage*=factor.damage;
      }
      return result;
    };
  }
}
