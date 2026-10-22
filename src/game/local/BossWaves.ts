// BOSS_WAVES: snapshot-owned encounters layered over timed waves and the existing variant skills.
import {CMain,CSound,Thing,World} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {worldEnemyGrowth} from './Endless.ts';
import {combatWorld,combatState,simplifiedWorld,reinforcementLimit,SIMPLE_COMBAT_RULE} from './CombatRules.ts';
import {combatFamily,type BossKind} from './CombatRosterRules.ts';
import {variantsWorld,variantSight,emberZones} from './EnemyVariants.ts';
import {attemptTimedSpawn,bossMembers,livingWavePlayers,reachableSpawnCells,roomForTimedSpawn,timedSpawnRole,timedWave,timedWavesConfigured,type BossWaveState} from './TimedWaves.ts';
import {hasFeature} from './ModernFeatures.ts';

export const BOSS_WAVES_RULE='boss-waves-v1';
export const BOSS_ENCOUNTERS_RULE='boss-encounters-v1';
const classicEncounters=new WeakSet<object>();
export function setClassicBossEncountersFixture(main:object):void{classicEncounters.add(main);}
export function bossEncountersConfigured():boolean {
  const s=netSession();return bossWavesConfigured()&&(s?s.startOpts?.cfg.bossEncounters===BOSS_ENCOUNTERS_RULE:!classicEncounters.has(CMain._this));
}
export function bossCount(wave:number):number{return wave%5?0:Math.min(3,1+Math.floor((wave-5)/10));}
const classic=new WeakSet<object>();
export function setClassicBossWavesFixture(main:object):void{classic.add(main);}
export function bossWavesConfigured():boolean{
  const s=netSession();return timedWavesConfigured()&&(s?s.startOpts?.cfg.bossWaves===BOSS_WAVES_RULE&&s.startOpts.cfg.variants==='enemy-variants-v1':!classic.has(CMain._this));
}
export function bossKind(wave:number,devils=true,modern=false,simplified=false,native=false):BossKind|undefined{
  if(native)return wave%5?undefined:devils?'devil':'zombie';
  if(simplified)return wave%5?undefined:devils&&Math.floor(wave/5)%2===0?'devil':'charger';
  if(modern&&devils&&wave%5===0)return (['charger','priest','butcher','hunter']as const)[(Math.floor(wave/5)-1)%4];
  return wave%5?undefined:devils&&Math.floor(wave/5)%2===0?'priest':'charger';
}
export function bossMaximum(wave:number,health:number,coop:boolean):number{
  return 6000*health*(1+.25*Math.floor((wave-1)/5))*(coop?1.6:1);
}
const ticks=(seconds:number):number=>Math.ceil(CMain.mFPS*seconds);
function syncBoss(world:any,boss:BossWaveState):void{
  for(const member of bossMembers(boss)){
    const enemy=world.mThing_Collection.mThings[member.id??''];
    if(enemy&&!member.defeated){member.life=Math.max(0,enemy.mLife);member.maximum=enemy.mMaxLife;}
  }
  if(boss.members){
    boss.life=boss.members.reduce((n,m)=>n+m.life,0);boss.maximum=boss.members.reduce((n,m)=>n+m.maximum,0);
    boss.defeated=boss.members.every(m=>m.defeated);boss.id=boss.members[0]?.id;
  }
}
export function beginBossCast(enemy:any):boolean{
  const w=enemy.mWorld;if(enemy.mBossKind!=='priest'||w.mTick<(enemy.mVariantCooldown??0))return false;
  const targets=livingWavePlayers(w).filter(p=>p.mPosition.Distance2D(enemy.mPosition)<=7&&variantSight(w,enemy.mPosition,p.mPosition));
  const target=targets.sort((a,b)=>a.mPosition.Distance2D(enemy.mPosition)-b.mPosition.Distance2D(enemy.mPosition))[0];
  if(!target)return false;
  const p=target.mPosition,d=p.Subtract(enemy.mPosition).Normalize2D(1),used=new Set<any>();
  const cells=reachableSpawnCells(w,target).filter(c=>!(c.mCollide&World.Map.CMap_Cell.mCollide_Navigation));
  const positions=[0,-1.6,1.6].map(offset=>{
    const x=p.mX-d.mY*offset,y=p.mY+d.mX*offset;
    const cell=cells.filter(c=>!used.has(c)).sort((a,b)=>Math.hypot(a.mID.x+.5-x,a.mID.y+.5-y)-Math.hypot(b.mID.x+.5-x,b.mID.y+.5-y))[0];
    if(!cell)return;used.add(cell);return new Thing.Math.CThing_Position(cell.mID.x+.5,cell.mID.y+.5,0);
  });
  if(positions.some(p=>!p))return false;
  const state=w.mUpgrades.enemyVariantState;
  for(const position of positions)emberZones(w).push({id:state.nextZone++,caster:enemy.sUniqueID,target:target.mPlayerIndex,
    mPosition:position,mAngle:enemy.mAngle.Clone(),damage:enemy.mAttackDamage*.3,born:w.mTick,
    warning:ticks(.9),duration:ticks(1.6),interval:ticks(.4),lastPulse:-1});
  enemy.mVariantCooldown=w.mTick+ticks(enemy.mLife<=enemy.mMaxLife/2?6:8);
  enemy.SetState('State_VariantCast');enemy.PlaySound(CSound.mSamples.Creature_Zombie_Hit_1_wav);return true;
}
/** Restored enemies receive fresh allocation identities, but keep their captured skill and HP. */
export function reconnectSavedBoss(world:any):void{
  const state=timedWave(world)?.boss;if(!state||state.defeated)return;
  const enemies=(Object.values(world.mThing_Collection.mThings) as any[]).filter(e=>e.mBossKind&&e.Process&&e.mLife>0);
  for(const [index,member]of bossMembers(state).entries()){
    if(member.defeated)continue;
    const enemy=state.members?enemies.find(e=>e.mBossSlot===index):enemies[0];
    if(enemy){member.id=enemy.sUniqueID;member.life=enemy.mLife;member.maximum=enemy.mMaxLife;}else delete member.id;
  }
  syncBoss(world,state);
}
export function installBossWaves():void{
  const upgrades=World.CUpgrades.prototype as any,level=upgrades.__set__mLevel,spawn=upgrades.ProcessTimedSpawns,process=upgrades.Process;
  upgrades.__set__mLevel=function(this:any,wave:number):any{
    const value=level.call(this,wave),state=this.timedWave;
    if(bossWavesConfigured()&&variantsWorld(this.mWorld)&&state){
      const devils=netSession()?.startOpts?.cfg.devils??!!CMain.mSaveData.__get__mDevilsActive(),modern=combatState(this.combat),simple=modern&&this.combat.rule===SIMPLE_COMBAT_RULE;
      const native=simple&&this.features?.includes('native-bosses-v1'),kind=bossKind(wave,devils,modern,simple,native);
      if(kind){
        state.totalTicks+=ticks(60);state.remainingTicks=state.totalTicks;
        state.boss={kind,defeated:false,life:0,maximum:0,reinforcementTicks:ticks(2)};
        const available:BossKind[]=native?[devils?'devil':'zombie']:!devils?['charger']:simple?['charger','devil']:modern?wave>=20?['charger','priest','butcher','hunter']:wave>=15?['charger','priest','butcher']:['charger','priest']:['charger','priest'];
        if(bossEncountersConfigured())state.boss.members=Array.from({length:bossCount(wave)+(hasFeature(this.mWorld,'horde-balance-v1')?1:0)},(_,i)=>({
          kind:modern?available[(available.indexOf(kind)+i)%available.length]!:i%2===0?kind:kind==='charger'&&devils?'priest':'charger',
          defeated:false,life:0,maximum:0}));
        const members=bossMembers(state.boss);
        this.Level.Zombie_Count=4+members.filter(m=>combatFamily(m.kind)==='Zombie').length;this.Level.Devil_Count=members.filter(m=>combatFamily(m.kind)==='Devil').length;
      }
    }return value;
  };
  upgrades.ProcessTimedSpawns=function(this:any):any{
    const w=this.mWorld,state=timedWave(w)!,boss=state.boss;if(!boss)return spawn.call(this);
    const pending=bossMembers(boss).find(m=>!m.id&&!m.defeated);
    if(pending){
      if(!state.warnings.some(s=>s.role==='boss'))attemptTimedSpawn(w,combatFamily(pending.kind),'boss');
      return;
    }
    if(--boss.reinforcementTicks<=0){
      const adds=(Object.values(w.mThing_Collection.mThings)as any[]).filter(e=>e._CLASSID_==='CThing_Creature_Zombie'&&!e.mBossKind&&e.Process&&!e.lanKillLogged&&!(e.mFlags&Thing.CThing.mFlag_DEAD)).length;
      if((!boss.members&&!simplifiedWorld(w)||adds+state.warnings.filter(s=>s.role==='reinforcement').length<reinforcementLimit(w))&&roomForTimedSpawn(w,'Zombie'))attemptTimedSpawn(w,'Zombie','reinforcement');
      boss.reinforcementTicks=ticks(combatWorld(w)?3:2);
    }
  };
  upgrades.Process=function(this:any):any{
    const w=this.mWorld,boss=timedWave(w)?.boss;
    if(boss){
      syncBoss(w,boss);
      if(boss.defeated&&w.mLoaded&&!w.mCompleteState&&livingWavePlayers(w).length){this.FinishTimedWave(2);return;}
    }return process.call(this);
  };
  const collection=Thing.CThing_Collection.prototype as any,add=collection.AddThing;
  collection.AddThing=function(this:any,enemy:any):any{
    const result=add.call(this,enemy),role=timedSpawnRole(this.mWorld),boss=timedWave(this.mWorld)?.boss;
    if(boss&&role&&['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(enemy._CLASSID_)){
      if(role==='boss'){
        const members=bossMembers(boss),index=members.findIndex(m=>!m.id&&!m.defeated),member=members[index];
        if(member){
          enemy.mBossKind=member.kind;
          if(member.kind==='butcher'||member.kind==='hunter'){delete enemy.mEnemyVariant;enemy.mCombatKind=member.kind;}
          else if(member.kind==='devil'||member.kind==='zombie')delete enemy.mEnemyVariant;
          else enemy.mEnemyVariant=member.kind;
          member.id=enemy.sUniqueID;if(boss.members)enemy.mBossSlot=index;
        }
      }
      else delete enemy.mEnemyVariant;
    }return result;
  };
  for(const ctor of [Thing.Creature.CThing_Creature_Zombie,Thing.Creature.CThing_Creature_Devil]){
    const p=ctor.prototype as any,init=p.Process_Init,goto=p.State_GotoPlayer;
    p.Process_Init=function(this:any):any{
      const result=init.call(this);if(this.mBossKind){
        this.mLife=this.mMaxLife=bossMaximum(this.mWorld.mUpgrades.mLevelIndex,worldEnemyGrowth(this.mWorld).health,World.CWorld.mGameMode!=='Single');
        if(combatFamily(this.mBossKind)==='Zombie')this.mDamage*=1.5;else this.mAttackDamage*=1.5;
        const boss=timedWave(this.mWorld)?.boss;if(boss){
          if(boss.members&&this.mBossSlot===undefined)this.mBossSlot=boss.members.findIndex(m=>!m.id&&m.kind===this.mBossKind&&!m.defeated);
          const member=boss.members?boss.members[this.mBossSlot]:boss;
          if(member){member.id=this.sUniqueID;member.life=this.mLife;member.maximum=this.mMaxLife;}
          syncBoss(this.mWorld,boss);
        }
      }return result;
    };
    p.State_GotoPlayer=function(this:any):any{if(this.mBossKind==='priest'&&beginBossCast(this))return;return goto.call(this);};
  }
  const creature=Thing.Creature.CThing_Creature.prototype as any,chargeInit=creature.State_VariantCharge_Init,charge=creature.State_VariantCharge;
  creature.State_VariantCharge_Init=function(this:any):any{
    if(this.mBossKind==='charger')this.mBossChargesRemaining=this.mVariantPhase==='recovery'?0:this.mLife<=this.mMaxLife/2?1:0;
    return chargeInit.call(this);
  };
  creature.State_VariantCharge=function(this:any):any{
    if(this.mBossKind==='charger'&&this.mVariantPhase==='recovery'&&this.mVariantTicks<=1&&this.mBossChargesRemaining>0){
      const target=livingWavePlayers(this.mWorld).sort((a,b)=>a.mPosition.Distance2D(this.mPosition)-b.mPosition.Distance2D(this.mPosition))[0];
      if(target){
        const d=target.mPosition.Subtract(this.mPosition).Normalize2D(1);
        if(Number.isFinite(d.mX)&&Number.isFinite(d.mY)&&Math.hypot(d.mX,d.mY)>0){this.mChargeX=d.mX;this.mChargeY=d.mY;}
        this.mAngle.__set__mAngle(Math.atan2(this.mChargeY,this.mChargeX));this.SetState('State_VariantCharge');return;
      }
    }return charge.call(this);
  };
  // Only the synchronous affect batch is protected. HP, fatal ownership and death still follow normal wrappers.
  const reactions=new WeakMap<object,{fields:(PropertyDescriptor|undefined)[];angle:number}>(),keys=['mStateCount','mDelta','mHitAngle'];
  const affects=creature.ProcessAffects,setState=creature.SetState;
  creature.ProcessAffects=function(this:any):any{
    if(this.mBossKind&&(this.mStateID==='State_VariantCharge'||this.mStateID==='State_VariantCast'||this.mStateID==='State_CombatCleave'||this.mStateID==='State_CombatHunt'))
      reactions.set(this,{fields:keys.map(k=>Object.getOwnPropertyDescriptor(this,k)),angle:this.mAngle.mRadians});
    try{
      const result=affects.call(this);
      if(this.mBossKind&&this.mLife<=0&&!this.lanKillLogged&&this.mStateID!=='State_Dying'&&this.mStateID!=='State_Dead')this.CheckForDead();
      return result;
    }finally{reactions.delete(this);}
  };
  creature.SetState=function(this:any,state:string):any{
    const saved=reactions.get(this);
    if(saved&&this.mLife>0&&['State_BulletHit','State_ExplosionHit','State_ZombieHit'].includes(state)){
      keys.forEach((key,i)=>{const d=saved.fields[i];if(d)Object.defineProperty(this,key,d);else delete this[key];});
      this.mAngle.mRadians=saved.angle;return;
    }return setState.call(this,state);
  };
  const world=World.CWorld.prototype as any,kill=world.LogKill;
  world.LogKill=function(this:any,victim:any):any{
    const value=kill.call(this,victim),boss=timedWave(this)?.boss;
    if(boss&&victim.mBossKind&&victim.mLife<=0){
      const member=bossMembers(boss).find(m=>m.id===victim.sUniqueID);
      if(member){member.defeated=true;member.life=0;syncBoss(this,boss);}
    }
    return value;
  };
}
