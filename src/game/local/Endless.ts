// ENDLESS_PVE: wrap derived wave/creature paths without editing mechanical ports.
import { CMain, Thing, World } from '../packages.ts';
import { balancedWorld, classicWaveFixture } from './Balance.ts';
import { difficultyIndex } from './BalanceRules.ts';
import { ENDLESS_RULE, endlessWave, enemyGrowth } from './EndlessRules.ts';
import { classicGrowthFixture, localGrowthEnabled } from './LocalGrowth.ts';
import { netSession } from './Net/NetSession.ts';
import { timedStartLevel } from './TimedGrowthRules.ts';
import { waveSeconds } from './TimedWaveRules.ts';
import { bossWavesConfigured } from './BossWaves.ts';
import {tieredGrowthWorld} from './TieredGrowth.ts';
import {clearWavesWorld} from './ClearWaves.ts';
import {combatWorld,simplifiedWorld} from './CombatRules.ts';
import {mapPacing} from './CombatPacing.ts';
import {hasFeature} from './ModernFeatures.ts';
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
export function timedWorldStartLevel(world:any,wave:number,horde=hasFeature(world,'horde-balance-v1')):number {
  const rule=worlds.get(world)!;
  return timedStartLevel(wave,{...rule,horde,seconds:waveSeconds(world.mMap.mSize.x,world.mMap.mSize.y),bosses:bossWavesConfigured(),tiered:tieredGrowthWorld(world),clearable:clearWavesWorld(world),combat:combatWorld(world),simplified:simplifiedWorld(world),combatSeconds:combatWorld(world)?mapPacing(world).seconds:undefined});
}
// Only the current wave's immutable result is cached. Switching/replaying waves replaces it, never grows a table.
const growthCache=new WeakMap<object,{wave:number;tiered:boolean;clearable:boolean;combat:boolean;simplified:boolean;value:{health:number;damage:number}}>();
export function worldEnemyGrowth(world:any):{health:number;damage:number} {
  const rule=worlds.get(world);if(!rule)return {health:1,damage:1};
  const wave=world.mUpgrades.mLevelIndex;
  if(!world.mUpgrades.timedWave)return enemyGrowth(wave,rule.devils,rule.players);
  const tiered=tieredGrowthWorld(world),clearable=clearWavesWorld(world),combat=combatWorld(world),simplified=simplifiedWorld(world),cached=growthCache.get(world);if(cached?.wave===wave&&cached.tiered===tiered&&cached.clearable===clearable&&cached.combat===combat&&cached.simplified===simplified)return cached.value;
  const excess=Math.max(0,timedWorldStartLevel(world,wave,false)-125),value={health:1+.02*excess,damage:1+.008*excess};
  growthCache.set(world,{wave,tiered,clearable,combat,simplified,value});return value;
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
