import { createHeadlessGame, KEYS } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { applyCorrections } from '../../src/game/local/Net/Rollback.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';

const role = Number(process.argv[2]) as 0 | 1;
const options = JSON.parse(process.argv[3] ?? '{}');
const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
let sent: unknown[] = [];
const session = new NetSession(role, { send: message => sent.push(message) });
session.startLocalGame({ mode: options.mode ?? 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, netcode: 'rollback-v2',
  cfg: { difficulty: 0, gameSpeed: options.speed ?? 1, devils: true, collisions: true, damage: true,
    gameAmount: 3, detail: options.detail ?? true, charP1: 0, charP2: 0 } }, game.main());
if (!game.waitRunning(3000)) throw new Error('boot failed');
if (options.weapons) for (const player of game.players()) for (const name of Object.keys(player.mWeapons)) player.NewWeapon(name);
process.send?.({ ready: true, sent });
sent = [];
const originalWorld = game.world();
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
      game.step(1);
      for (const player of game.players()) if (player.mWeapon_Current) weapons.add(player.mWeapon_Current.mNameID);
      for (let i = 0; i < (m.extraDraws ?? 0); i++) world.Draw();
    }
    if (m.settle) { applyCorrections(session, world); session.commitConfirmed(world); }
    process.send?.({ sent, tick: session.tickIndex(world), phase: session.phase, paused: session.netPaused, sameWorld: world === originalWorld,
      ...(m.dumpTick !== undefined ? { snapshot: session.ring.find(slot => slot.tRel === m.dumpTick)?.data } : {}),
      desync: session.desyncDetail, complete: world.mCompleteState, state: game.state(), endReason: session.endReason,
      errors: game.errors, stats: session.rollbackStats, weapons: [...weapons],
      checkpoint: session.netCheckpoint?.tick, startTick: world.mTick - session.tickIndex(world),
      ...(m.settle ? { digest: simulationDigest(captureWorldSnap(world, makeSnapCtx(world, (session as any).slots), false)),
        events: [session.events.confirmedCount, session.events.confirmedHash],
        decals: [session.decals.confirmedCount, session.decals.confirmedHash] } : {}) });
    sent = [];
  } catch (error) { process.send?.({ error: String(error), stack: (error as Error).stack }); }
});
