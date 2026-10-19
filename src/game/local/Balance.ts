// PVE_BALANCE: edit derived wave tables, never the mechanical ports or their spawn/AI/attack paths.
import {CMain,World} from '../packages.ts';
import {netActive,netSession} from './Net/NetSession.ts';
import {BALANCE_RULE,balancedWave,difficultyIndex} from './BalanceRules.ts';
const rules=new WeakMap<object,number>();
// Original port-contract fixtures also remain runnable beside the new tuned gameplay tests.
const classicFixtures=new WeakSet<object>();
export function setClassicWaveFixture(main:object):void{classicFixtures.add(main);}
export function classicWaveFixture(main:object):boolean{return classicFixtures.has(main);}
export function balancedWorld(world:any):boolean{return rules.has(world);}
export function installBalanceScope():void{
  const upgrades=World.CUpgrades.prototype as any,init=upgrades.InitLists;
  upgrades.InitLists=function(this:any):any{
    const session=netSession(),cfg=session?.startOpts?.cfg;
    const enabled=World.CWorld.mGameMode!=='DeathMatch'&&(netActive()?cfg?.balance===BALANCE_RULE:!classicFixtures.has(CMain._this));
    const difficulty=difficultyIndex(netActive()?cfg?.difficulty??0:CMain.mSaveData.__get__mDifficulty());
    if(enabled)rules.set(this.mWorld,difficulty);
    const result=init.call(this);
    if(enabled){
      for(let wave=1;wave<=100;wave++){
        const tuning=balancedWave(wave,difficulty,CMain.mFPS);
        for(const row of this.mLevels[wave]??[]){
          if(row.mClassID==='Level'&&Object.hasOwn(tuning,row.mProp))row.mValue=(tuning as any)[row.mProp];
          else if(row.mProp==='SpeedUp'&&row.mClassID==='CThing_Creature_Zombie')row.mValue=tuning.zombieSpeed;
          else if(row.mProp==='SpeedUp'&&row.mClassID==='CThing_Creature_Devil')row.mValue=tuning.devilSpeed;
        }
      }
      this.__set__mLevel(1);
    }
    return result;
  };
}
