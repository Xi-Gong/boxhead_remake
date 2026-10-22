import { createHeadlessGame, KEYS } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { applyCorrections } from '../../src/game/local/Net/Rollback.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { advanceVirtual } from '../../src/engine/flash/clock.ts';
import { Thing } from '../../src/game/packages.ts';
import { explosionBurst } from './explosionFixture.ts';
import {CThing_Object_SupplyCrate,armorValue,armorMaximum} from '../../src/game/local/Supplies.ts';
import { supplyIdentity, SUPPLY_KINDS } from '../../src/game/local/LootRules.ts';
import {MODERN_FEATURES} from '../../src/game/local/ModernFeatures.ts';

const role = Number(process.argv[2]) as 0 | 1;
const options = JSON.parse(process.argv[3] ?? '{}');
const modern=options.difficultyWaves?{progression:'personal-growth-v1' as const,supplies:'armor-ammo-v1' as const,balance:'pve-balance-v1' as const,survival:'survival-v1' as const,loot:'supply-crates-v2' as const,endless:'endless-pve-v1' as const,variants:'enemy-variants-v1' as const,enchantment:'persistent-enchantment-v1' as const,timedWaves:'timed-waves-v1' as const,waveDraft:'wave-draft-v1' as const,draftReady:'draft-ready-v1' as const,tieredGrowth:'tiered-growth-v1' as const,clearWaves:'clearable-waves-v1' as const,combat:'combat-pve-v3' as const,features:[...MODERN_FEATURES]}:{};
const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
let sent: unknown[] = [];
const session = new NetSession(role, { send: message => sent.push(message) });
session.startLocalGame({ mode: options.mode ?? 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, wave:options.wave, netcode: 'rollback-v2',
  cfg: { ...modern, ...(options.variants?{variants:'enemy-variants-v1' as const}:{}),...(options.endless?{endless:'endless-pve-v1' as const,refill:'reliable-supplies-v1' as const}:{}),...(options.loot?{loot:'supply-crates-v2' as const}:{}),...(options.survival?{survival:'survival-v1' as const}:{}),...(options.growth ? { progression: 'personal-growth-v1' as const } : {}), ...(options.supplies?{supplies:'armor-ammo-v1' as const}:{}),...(options.balance?{balance:'pve-balance-v1' as const}:{}),...(options.teamPass?{teamPass:'team-pass-v1' as const}:{}), difficulty: options.difficulty??0, gameSpeed: options.speed ?? 1, devils: true, collisions: true, damage: !options.teamPass,
    gameAmount: 3, detail: options.detail ?? true, charP1: 0, charP2: 0 } }, game.main());
if (!game.waitRunning(3000)) throw new Error('boot failed');
if(options.difficultyWaves&&(game.world().mUpgrades.mLevelIndex!==options.wave||!game.world().mUpgrades.features?.includes('difficulty-waves-v1')))throw new Error('exact wave/difficulty capability was not applied');
if (options.weapons||options.supplies) for (const player of game.players()) for (const name of Object.keys(player.mWeapons)) player.NewWeapon(name);
process.send?.({ ready: true, sent });
sent = [];
const originalWorld = game.world();
// Bring one ordinary timed delivery into this short functional scenario (no crate stress).
if(options.endless)originalWorld.mUpgrades.supplyState.nextDropTicks=50;
let peakExplosions = 0;
let peakArmor=0,ammoGrants=0,protectedHits=0;
const deliveredRedIds=new Set<string>();
const variantPhases=new Set<string>();
const enchantedShots=new Set<string>();
if (options.growth || options.explosions || options.supplies) {
  const processWorld = originalWorld.Process;
  originalWorld.Process = function (this: any) {
    const tick = session.tickIndex(this);
    // The original infinite-life option prevents terminal death, but permits nonpositive health.
    // Keep this delivery scenario alive so reachability has a valid player seed throughout its 27 seconds.
    if(options.loot)for(const player of game.players())player.mLife=player.mMaxLife;
    if(options.supplies&&tick>0&&tick%31===0){
      const player=game.players()[Math.floor(tick/31)%2];
      const kind=options.loot?SUPPLY_KINDS[Math.floor(tick/31)%3]!:Math.floor(tick/31)%2?'armor':'ammo';
      if(options.loot&&kind==='ammo')player.mWeapons.uzi.mThing.mAmmo=0;
      const crate=this.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(player.mPosition.Clone(),kind,options.loot?supplyIdentity(this,'s'):undefined));
      if(options.loot)crate.Process_Init();else crate.Process_DeleteCounter_Init();
      crate.PickedUp();
      peakArmor=Math.max(peakArmor,...game.players().map(p=>armorValue(p.mArmor,armorMaximum(p))));
      if(crate.mSupplyConsumed&&crate.mSupplyKind==='ammo'){
        if(!game.players().some(p=>p.mWeaponList.every((e:any)=>!e.mActive||e.mThing.mAmmo===e.mThing.mTotalAmmo)))throw new Error('ammo crate did not refill an entire inventory');
        ammoGrants++;
      }
      new Thing.Affect.CThing_Affect_ZombieAttack(player,35).AffectThing(player);
    }
    if(options.survival&&tick>0&&tick%29===0){
      const player=game.players()[Math.floor(tick/29)%2];
      player.mInvincible=0;player.mArmor=20;
      const enemy={mPosition:player.mPosition.Add(new Thing.Math.CThing_Position(1,0,0)),mAngle:player.mAngle};
      player.mAffectors=[new Thing.Affect.CThing_Affect_FireBall(enemy,enemy,30,enemy.mAngle)];
      const state=player.mStateID;player.ProcessAffects();
      if(player.mLife>0&&player.mStateID!==state)throw new Error('protected hit interrupted a player');
      protectedHits++;
    }
    if(options.supplies&&tick>0&&tick%47===0&&this.mUpgrades.Level.Devil_TotalCount>0){
      const owner=game.players()[0],victim=new Thing.Creature.CThing_Creature_Devil(owner.mPosition.Clone(),owner.mAngle.Clone());
      this.mThing_Collection.AddThing(victim);victim.Process_Init();victim.mLife=1;
      this.mUpgrades.__set__mDevilCount(this.mUpgrades.__get__mDevilCount()+1);
      new Thing.Affect.CThing_Affect_Bullet(owner,owner,1,owner.mAngle).AffectThing(victim);victim.SetState('State_Dying');
    }
    if (options.explosions && tick === 40) explosionBurst(this, options.explosions);
    if (options.growth && tick > 0 && tick % 19 === 0) {
      const owner = game.players()[Math.floor(tick / 19) % 2];
      const victim = new Thing.Creature.CThing_Creature_Zombie(owner.mPosition.Clone(), owner.mAngle.Clone());
      this.mThing_Collection.AddThing(victim); victim.Process_Init(); victim.mLife = 1;
      new Thing.Affect.CThing_Affect_Bullet(owner,owner,1,owner.mAngle).AffectThing(victim);
      victim.SetState('State_Dying'); // Exercise the original death bookkeeping inside this simulated step.
    }
    if(options.variants&&tick===20){
      for(const kind of ['charger','priest']){
        const C=kind==='charger'?Thing.Creature.CThing_Creature_Zombie:Thing.Creature.CThing_Creature_Devil,e:any=new C(new Thing.Math.CThing_Position(6.5,kind==='charger'?8.5:9.5,0));
        e.mEnemyVariant=kind;this.mThing_Collection.AddThing(e);e.Process_Init();e.Move(e.mPosition);e.mFlags|=Thing.CThing.mFlag_Collidable;
        e.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet|Thing.Affect.CThing_Affect.mAffect_Explosion|Thing.Affect.CThing_Affect.mAffect_FireBall);
        e.mLife=e.mMaxLife=1000000;e.SetState('State_GotoPlayer');
        if(kind==='charger')this.mUpgrades.Level.mZombieCount++;else this.mUpgrades.Level.mDevilCount++;
      }
    }
    if(options.variants&&tick===150)for(const e of Object.values(this.mThing_Collection.mThings)as any[])if(e.mEnemyVariant&&e.Process&&e.mLife>0){e.mLife=0;e.lanFatalSlot=0;e.SetState('State_Dying');}
    if(options.variants&&(tick===30||tick===55)){
      const p=game.players()[0],name=tick===30?'uzi':'grenade';p.NewWeapon(name);p.SelectWeapon(name);p.mWeapon_Current.mAmmo=7;
      const crate=this.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone(),'enchant',supplyIdentity(this,'s')));crate.Process_Init();
      p.mWeapon_Current.Fire(p.mPosition.Clone(),p.mAngle.Clone(),0);
    }
    const result = processWorld.call(this);
    if(options.variants)for(const e of Object.values(this.mThing_Collection.mThings)as any[])if(e.mEnemyVariant)variantPhases.add(e.mEnemyVariant+':'+(e.mVariantPhase||e.mStateID));
    if(options.variants)for(const e of Object.values(this.mThing_Collection.mThings)as any[])if(e.mEnchanted&&e._CLASSID_.startsWith('CThing_Shot_'))enchantedShots.add(e._CLASSID_);
    if(options.loot)for(const t of Object.values(this.mThing_Collection.mThings) as any[])if(t.mRandomRedId)deliveredRedIds.add(t.mRandomRedId);
    if (options.explosions) peakExplosions = Math.max(peakExplosions, this.mThing_Collection.mThingCounters.CThing_Effect_Explosion ?? 0);
    return result;
  };
}
const weapons = new Set<string>();
process.on('message', (m: any) => {
  try {
    for (const message of m.messages ?? []) session.onNetMessage(message);
    const world = game.world();
    if (m.disconnect) session.onPeerEvent({ connected: false, reason: 'test interruption' });
    if (m.reconnect && role === 0) session.onHello({ capTick: session.netCheckpoint?.tick });
    if (typeof m.pause === 'boolean') session.setPaused(m.pause);
    if (m.step && session.phase !== 'ended' && session.tickIndex(world) < m.total) {
      const t = session.tickIndex(world);
      game.setKeys(t < 2 ? [] : [t % 21 < 10 ? (role ? KEYS.P1.LEFT : KEYS.P1.RIGHT) : KEYS.P1.UP,
        ...(t % 7 < 4 ? [KEYS.P1.FIRE] : []), ...(options.weapons && t % 15 === 10 ? [KEYS.P1.NEXT] : [])]);
      if(m.renderGap)advanceVirtual(20);else game.step(1);
      for (const player of game.players()) if (player.mWeapon_Current) weapons.add(player.mWeapon_Current.mNameID);
      for (let i = 0; i < (m.extraDraws ?? 0); i++) world.Draw();
    }
    if (m.settle) { applyCorrections(session, world); session.commitConfirmed(world); }
    process.send?.({ sent, tick: session.tickIndex(world), phase: session.phase, paused: session.netPaused, sameWorld: world === originalWorld,
      ...(m.dumpTick !== undefined ? { snapshot: session.ring.find(slot => slot.tRel === m.dumpTick)?.data } : {}),
      desync: session.desyncDetail, complete: world.mCompleteState, state: game.state(), endReason: session.endReason,
      errors: game.errors, ...(game.errors.length?{enemyDiagnostics:Object.values(world.mThing_Collection.mThings).filter((t:any)=>t._CLASSID_==='CThing_Creature_Zombie').map((t:any)=>({id:t.sUniqueID,x:t.mPosition.mX,y:t.mPosition.mY,state:t.mStateID,speed:t.mSpeed,delta:t.mDelta,count:t.mStateCount}))}:{}), stats: session.rollbackStats, weapons: [...weapons],
      checkpoint: session.netCheckpoint?.tick, startTick: world.mTick - session.tickIndex(world),
      growth: world.mUpgrades.lanGrowth,
      confirmedEnemies: session.confirmedEnemies,
      armor:game.players().map(p=>armorValue(p.mArmor,armorMaximum(p))),
      enchantedShots:[...enchantedShots],variantPhases:[...variantPhases],peakArmor,ammoGrants,protectedHits,deliveredRedIds:[...deliveredRedIds],
      ...(options.loot?{supplyState:world.mUpgrades.supplyState,supplyBoxes:Object.values(world.mThing_Collection.mThings).filter((t:any)=>t.Process&&(t.mSupplyId||t.mRandomRedId)).map((t:any)=>[t.mSupplyId??t.mRandomRedId,t.mSupplyKind,t.mDeleteCounter])}:{}),
      peakExplosions,
      ...(m.settle ? { digest: simulationDigest(captureWorldSnap(world, makeSnapCtx(world, (session as any).slots), false)),
        events: [session.events.confirmedCount, session.events.confirmedHash],
        decals: [session.decals.confirmedCount, session.decals.confirmedHash] } : {}) });
    sent = [];
  } catch (error) { process.send?.({ error: String(error), stack: (error as Error).stack }); }
});
