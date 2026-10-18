import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { awardKill, copyGrowth, GROWTH_RULE, growthOf, newGrowth } from '../../src/game/local/Net/Growth.ts';
import { capture, applyToWorld } from '../../src/game/local/Resume.ts';
import { captureWorldSnap, makeSnapCtx, restoreWorldSnap } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { Thing } from '../../src/game/packages.ts';

function boot(wave = 1, difficulty = 0, progression = true) {
  const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
  const session = new NetSession(0, { send() {} });
  session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, wave, netcode: 'rollback-v2',
    cfg: { ...(progression ? { progression: GROWTH_RULE } : {}), difficulty, gameSpeed: 1, devils: true, collisions: true,
      damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 } }, game.main());
  expect(game.waitRunning(3000)).toBe(true);
  return { game, session, world: game.world() };
}
function kill(world: any, player: any, devil = false) {
  const ctor = devil ? Thing.Creature.CThing_Creature_Devil : Thing.Creature.CThing_Creature_Zombie;
  const victim = new ctor(player.mPosition.Clone(), player.mAngle.Clone());
  world.mThing_Collection.AddThing(victim);
  victim.Process_Init();
  victim.mLife = 10;
  const hit = new Thing.Affect.CThing_Affect_Bullet(player, player, 10, player.mAngle);
  hit.AffectThing(victim);
  world.LogKill(victim);
  return victim;
}

describe('LAN personal growth', () => {
  it('scores before leveling, carries XP and caps without overflow', () => {
    const p = { score: 0, level: 1, xp: 4 };
    expect(awardKill(p, 100, 5)).toBe(100);
    expect(p).toEqual({ score: 100, level: 2, xp: 4 });
    p.level = 124;
    awardKill(p, 100, 5);
    expect(p.level).toBe(125); expect(p.xp).toBe(0);
    awardKill(p, 100, 5);
    expect(p.level).toBe(125); expect(p.xp).toBe(0);
  });
  it.each([[1,0,1],[10,0,10],[20,0,30],[35,0,50],[5,3,50]])('starts wave %s with difficulty %s at level %s', (wave,difficulty,level) => {
    const { world, session } = boot(wave, difficulty);
    expect(growthOf(world)).toEqual(newGrowth(level));
    expect(session.netCheckpoint?.snap.growth).toEqual(newGrowth(level));
    expect(session.netCheckpoint?.snap.wave).toBe(wave);
  });
  it('keeps kills independent, uses first fatal affect, and does not count a corpse twice', () => {
    const { game, world } = boot();
    const [p1,p2] = game.players();
    const victim = kill(world, p1);
    new Thing.Affect.CThing_Affect_Bullet(p2, p2, 100, p2.mAngle).AffectThing(victim);
    world.LogKill(victim);
    expect(growthOf(world)!.players[0].xp).toBe(1);
    expect(growthOf(world)!.players[1].score).toBe(0);
    kill(world, p2, true);
    expect(growthOf(world)!.players[1].level).toBe(2);
    expect(world.mHud.nTotalScore).toBe(growthOf(world)!.players.reduce((sum,p)=>sum+p.score,0));
  });
  it('does not give environmental deaths or nonfatal damage personal credit', () => {
    const { game, world } = boot();
    const p = game.players()[0];
    const victim = new Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone(),p.mAngle.Clone());
    world.mThing_Collection.AddThing(victim); victim.Process_Init(); victim.mLife=20;
    new Thing.Affect.CThing_Affect_Bullet(p,p,1,p.mAngle).AffectThing(victim);
    new Thing.Affect.CThing_Affect_Bullet(undefined,p,100,p.mAngle).AffectThing(victim);
    world.LogKill(victim);
    expect(growthOf(world)).toEqual(newGrowth(1)); expect(world.mHud.nTotalScore).toBe(0);
  });
  it('unlocks and applies upgrades only to the killer without refilling every level', () => {
    const { game, world } = boot(); const [a,b] = game.players();
    for (let n=0;n<20;n++) kill(world,a);
    expect(growthOf(world)!.players[0].level).toBe(5);
    expect(a.mWeapons.uzi.mActive).toBe(true); expect(b.mWeapons.uzi.mActive).toBe(false);
    a.mWeapons.uzi.mThing.mAmmo=7;
    for (let n=0;n<5;n++) kill(world,a);
    world.mUpgrades.ApplyUpgrade_Weapon(a.mWeapons.uzi.mThing);
    expect(a.mWeapons.uzi.mThing.mAmmo).toBe(7);
    expect(world.mUpgrades.mMultiplierIndex).toBe(1);
  });
  it('round-trips growth, fatal attribution and score through pre-input rollback', () => {
    const { game, world } = boot(); const a=game.players()[0];
    const ctx=makeSnapCtx(world);
    const data=captureWorldSnap(world,ctx,false);
    const slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs}; const before=simulationDigest(slot.data);
    kill(world,a,true); expect(growthOf(world)!.players[0].level).toBe(2);
    restoreWorldSnap(world,slot,ctx);
    expect(growthOf(world)).toEqual(newGrowth(1));
    expect(simulationDigest(captureWorldSnap(world,ctx))).toEqual(before);
    kill(world,a,true); expect(growthOf(world)!.players[0].level).toBe(2);
  });
  it('restores checkpoint growth and ammo without an upgrade refill on the next update', () => {
    const { game, world, session } = boot(20); const a=game.players()[0];
    kill(world,a,true); world.mUpgrades.ApplyUpgrade_Weapon(a.mWeapons.uzi.mThing);
    a.mWeapons.uzi.mThing.mAmmo=7;
    const snap=capture(world), saved=copyGrowth(growthOf(world)!);
    kill(world,a,true);
    expect(applyToWorld(world,snap)).toBe(true);
    world.mUpgrades.ApplyUpgrade_Weapon(a.mWeapons.uzi.mThing);
    expect(growthOf(world)).toEqual(saved); expect(a.mWeapons.uzi.mThing.mAmmo).toBe(7);
    expect(session.netCheckpoint!.snap.growth).toEqual(newGrowth(30));
  });
  it('leaves old cooperation unchanged when the capability is absent', () => {
    const {world}=boot(1,0,false); expect(growthOf(world)).toBeUndefined(); expect(capture(world).growth).toBeUndefined();
  });
  it('retries the very first wave from its initial growth, score and inventory', () => {
    const {game,world,session}=boot(20);
    kill(world,game.players()[0],true);
    session.markEnded();
    session.startLocalGame(session.retryStart(),game.main());
    expect(game.waitRunning(3000)).toBe(true);
    expect(growthOf(game.world())).toEqual(newGrowth(30));
    expect(game.world().mUpgrades.mLevelIndex).toBe(20);
    expect(game.world().mHud.nTotalScore).toBe(0);
    expect(game.errors).toEqual([]);
  });
});
