// Exercise actual prediction in a separate test module; production stays depth zero until release gates pass.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/game/local/Net/protocol.ts', async importOriginal => ({
  ...await importOriginal<any>(), PREDICT_MAX_LAG_TICKS: 6,
}));
import { createHeadlessGame } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { applyCorrections } from '../../src/game/local/Net/Rollback.ts';
import { getRandomState } from '../../src/engine/flash/rng.ts';
import type { GameConfig } from '../../src/game/local/Net/protocol.ts';

const cfg: GameConfig = { difficulty: 0, gameSpeed: 1, devils: true, collisions: true,
  damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 };
const input = (t: number): number => (t < 2 ? 0 : ((t % 17 < 8 ? 8 : 1) | (t % 7 < 4 ? 16 : 0)));

function run(delay: number) {
  const game = createHeadlessGame({ menuOnly: 'Main', options: { infiniteLife: true } });
  const session = new NetSession(1, { send() {} });
  session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg, seed: 4242, rollback: true }, game.main());
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
  const rows = game.things().map(t => ({
    cls: t._CLASSID_, p: t.mPosition && [t.mPosition.mX, t.mPosition.mY, t.mPosition.mZ],
    // Bit 8 is only written by CMap.Draw and never read by simulation; replay intentionally does not draw.
    angle: t.mAngle?.mRadians, life: t.mLife, flags: t.mFlags & ~8, state: t.mStateID,
    count: t.mStateCount, delta: t.mDelta && [t.mDelta.mX, t.mDelta.mY, t.mDelta.mZ],
    ammo: t.mAmmo, anim: t.mXSI_Animation?.mCurrentFrameID,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const result = { rows, rng: getRandomState(), score: w.mHud.nTotalScore };
  const stats = { ...session.rollbackStats };
  expect(game.errors).toEqual([]);
  expect(session.correctionPending).toBeUndefined();
  game.quit();
  return { result, stats };
}

describe('actual rollback prediction', () => {
  it.each([1, 2, 4])('repeated corrections with %i ticks late input reproduce all live entities', delay => {
    const reference = run(0);
    const candidate = run(delay);
    expect(candidate.stats.predictions).toBeGreaterThan(0);
    expect(candidate.stats.corrections).toBeGreaterThan(0);
    expect(candidate.result).toEqual(reference.result);
  });
});
