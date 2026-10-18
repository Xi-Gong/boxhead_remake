// Exercise actual prediction in a separate test module; production stays depth zero until release gates pass.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/game/local/Net/protocol.ts', async importOriginal => ({
  ...await importOriginal<any>(), PREDICT_MAX_LAG_TICKS: 6,
}));
import { createHeadlessGame, KEYS } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { applyCorrections } from '../../src/game/local/Net/Rollback.ts';
import { getRandomState } from '../../src/engine/flash/rng.ts';
import { CSound, World } from '../../src/game/packages.ts';
import type { GameConfig } from '../../src/game/local/Net/protocol.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';

const cfg: GameConfig = { difficulty: 0, gameSpeed: 1, devils: true, collisions: true,
  damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 };
const input = (t: number): number => (t < 2 ? 0 : ((t % 17 < 8 ? 8 : 1) | (t % 7 < 4 ? 16 : 0)));

function run(delay: number, modern = false) {
  World.Map.CMap_Cell.mCurrentSessionID = 0;
  const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
  const session = new NetSession(1, { send() {} });
  session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg, seed: 4242, rollback: true,
    netcode: modern ? 'rollback-v2' : undefined }, game.main());
  expect(game.waitRunning(3000)).toBe(true);
  const w = game.world();
  const delivered = new Set<number>();
  const deliver = (t: number) => {
    if (t >= 0 && !delivered.has(t)) {
      delivered.add(t);
      session.onNetMessage({ t: 'in', tick: t, bits: input(t) });
    }
  };
  deliver(0);
  const total = 160;
  for (let frame = 0; frame < total * 4 && session.tickIndex(w) < total; frame++) {
    for (let t = 0; t <= Math.floor(frame / 2) - delay; t++) deliver(t);
    game.step(1);
  }
  expect(session.tickIndex(w)).toBe(total);
  for (let t = 0; t < total; t++) deliver(t);
  applyCorrections(session, w);
  if (modern) session.commitConfirmed(w);
  if (modern) expect(session.events.confirmedCount).toBeGreaterThan(10);
  const rows = game.things().map(t => ({
    cls: t._CLASSID_, p: t.mPosition && [t.mPosition.mX, t.mPosition.mY, t.mPosition.mZ],
    // Bit 8 is only written by CMap.Draw and never read by simulation; replay intentionally does not draw.
    angle: t.mAngle?.mRadians, life: t.mLife, flags: t.mFlags & ~8, state: t.mStateID,
    count: t.mStateCount, delta: t.mDelta && [t.mDelta.mX, t.mDelta.mY, t.mDelta.mZ],
    ammo: t.mAmmo, anim: t.mXSI_Animation?.mCurrentFrameID,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const nav = World.Map.CMap_Cell;
  const result = { rows, rng: getRandomState(), score: w.mHud.nTotalScore,
    full: simulationDigest(captureWorldSnap(w, makeSnapCtx(w, (session as any).slots))),
    events: modern ? [session.events.confirmedCount, session.events.confirmedHash] : undefined,
    decals: modern ? [session.decals.confirmedCount, session.decals.confirmedHash] : undefined,
    navigationClock: [nav.nSTimer, nav.nSID, nav.nState, nav.nSDist] };
  const stats = { ...session.rollbackStats };
  expect(game.errors).toEqual([]);
  expect(session.correctionPending).toBeUndefined();
  game.quit();
  return { result, stats };
}

describe('actual rollback prediction', () => {
  it('input starvation requests repair without claiming a checksum desync', () => {
    const game = createHeadlessGame({ menuOnly: 'Main' });
    const sent: any[] = [];
    const s = new NetSession(0, { send: m => sent.push(m) });
    s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg, seed: 4242, netcode: 'rollback-v2' }, game.main());
    expect(game.waitRunning(3000)).toBe(true);
    s.onNetMessage({ t: 'in', tick: 0, bits: 0 });
    game.step(30);
    expect(s.stallSince).toBeDefined();
    s.stallSince = performance.now() - 6000;
    expect(s.beginTick(game.world())).toBe('stall');
    expect(s.phase).toBe('playing');
    expect(sent.some(m => m.t === 'input-gap')).toBe(true);
    expect(sent.some(m => m.t === 'desync')).toBe(false);
    s.stallSince = performance.now() - 31000;
    s.beginTick(game.world());
    expect(s.endReason).toBe('timeout');
    expect(s.diagnostics.some(d => d.event === 'input-timeout')).toBe(true);
    game.quit();
  });
  it('rejected history recovery falls back to a checkpoint with rollback mode preserved', () => {
    const game = createHeadlessGame({ menuOnly: 'Main' });
    const sent: any[] = [];
    const s = new NetSession(0, { send: m => sent.push(m) });
    s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg, seed: 4242, netcode: 'rollback-v2' }, game.main());
    expect(game.waitRunning(3000)).toBe(true);
    s.captureCheckpoint(game.world());
    s.onPeerEvent({ connected: false });
    s.onHello({});
    const offer = sent.find(m => m.t === 'recover');
    expect(offer.stage).toBe('offer');
    s.onNetMessage({ ...offer, stage: 'reject' });
    expect(sent.find(m => m.t === 'start')).toMatchObject({ netcode: 'rollback-v2', snap: expect.any(Object) });
    expect(s.phase).toBe('starting');
    game.quit();
  });
  it.each([0, 1] as const)('player %i applies new input on the next tick without a remote frame', role => {
    const game = createHeadlessGame({ menuOnly: 'Main' });
    const sent: any[] = [];
    const s = new NetSession(role, { send: m => sent.push(m) });
    s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg, seed: 4242,
      netcode: 'rollback-v2' }, game.main());
    expect(game.waitRunning(3000)).toBe(true);
    s.onNetMessage({ t: 'in', tick: 0, bits: 0 });
    game.tick(1);
    const tick = s.tickIndex(game.world());
    const before = game.players()[role].mPosition.mX;
    game.setKeys([KEYS.P1.RIGHT, KEYS.P1.FIRE]);
    game.tick(1);
    expect(s.inputDelay).toBe(0);
    expect(sent.some(m => m.t === 'in' && m.tick === tick && (m.bits & 8))).toBe(true);
    expect(game.players()[role].mPosition.mX).toBeGreaterThan(before);
    expect(s.rollbackStats.predictions).toBeGreaterThan(0);
    expect(CSound.mSamples.Weapon_Pistol_Fire_wav.mPlaying).toBe(true);
    expect(game.errors).toEqual([]);
    game.quit();
  });
  it.each([1, 2, 4])('zero-delay mode with %i ticks late input reproduces the reference', delay => {
    const reference = run(0, true);
    const candidate = run(delay, true);
    expect(candidate.stats.predictions).toBeGreaterThan(0);
    expect(candidate.stats.corrections).toBeGreaterThan(0);
    expect(candidate.result).toEqual(reference.result);
  });
  it.each([1, 2, 4])('repeated corrections with %i ticks late input reproduce all live entities', delay => {
    const reference = run(0);
    const candidate = run(delay);
    expect(candidate.stats.predictions).toBeGreaterThan(0);
    expect(candidate.stats.corrections).toBeGreaterThan(0);
    expect(candidate.result).toEqual(reference.result);
  });
});
