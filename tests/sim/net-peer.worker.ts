import { createHeadlessGame, KEYS } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { applyCorrections } from '../../src/game/local/Net/Rollback.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';

const role = Number(process.argv[2]) as 0 | 1;
const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
let sent: unknown[] = [];
const session = new NetSession(role, { send: message => sent.push(message) });
session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, netcode: 'rollback-v2',
  cfg: { difficulty: 0, gameSpeed: 1, devils: true, collisions: true, damage: true,
    gameAmount: 0, detail: true, charP1: 0, charP2: 0 } }, game.main());
if (!game.waitRunning(3000)) throw new Error('boot failed');
process.send?.({ ready: true, sent });
sent = [];
const originalWorld = game.world();
process.on('message', (m: any) => {
  try {
    for (const message of m.messages ?? []) session.onNetMessage(message);
    const world = game.world();
    if (m.disconnect) session.onPeerEvent({ connected: false, reason: 'test interruption' });
    if (m.reconnect && role === 0) session.onHello({ capTick: session.netCheckpoint?.tick });
    if (typeof m.pause === 'boolean') session.setPaused(m.pause);
    if (m.step && session.tickIndex(world) < m.total) {
      const t = session.tickIndex(world);
      game.setKeys(t < 2 ? [] : [t % 21 < 10 ? (role ? KEYS.P1.LEFT : KEYS.P1.RIGHT) : KEYS.P1.UP,
        ...(t % 7 < 4 ? [KEYS.P1.FIRE] : [])]);
      game.step(1);
      for (let i = 0; i < (m.extraDraws ?? 0); i++) world.Draw();
    }
    if (m.settle) { applyCorrections(session, world); session.commitConfirmed(world); }
    process.send?.({ sent, tick: session.tickIndex(world), phase: session.phase, paused: session.netPaused, sameWorld: world === originalWorld,
      desync: session.desyncDetail, errors: game.errors, stats: session.rollbackStats,
      ...(m.settle ? { digest: simulationDigest(captureWorldSnap(world, makeSnapCtx(world, (session as any).slots), false)),
        events: [session.events.confirmedCount, session.events.confirmedHash],
        decals: [session.decals.confirmedCount, session.decals.confirmedHash] } : {}) });
    sent = [];
  } catch (error) { process.send?.({ error: String(error), stack: (error as Error).stack }); }
});
