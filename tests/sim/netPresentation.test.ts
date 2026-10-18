import { expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import { advanceVirtual } from '../../src/engine/flash/clock.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';

it('display frames interpolate movement, restore positions, and leave gameplay unchanged', () => {
  const game = createHeadlessGame({ menuOnly: 'Main' });
  const s = new NetSession(0, { send() {} });
  s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, netcode: 'rollback-v2',
    cfg: { difficulty: 0, gameSpeed: 1, devils: true, collisions: true, damage: true,
      gameAmount: 0, detail: true, charP1: 0, charP2: 0 } }, game.main());
  expect(game.waitRunning(3000)).toBe(true);
  s.onNetMessage({ t: 'in', tick: 0, bits: 0 });
  game.tick(1);
  game.setKeys([KEYS.P1.RIGHT]);
  game.tick(1);
  const w = game.world(), me = game.players()[0], position = me.mPosition;
  const digest = () => simulationDigest(captureWorldSnap(w, makeSnapCtx(w, (s as any).slots), false));
  const before = digest(), displayed: number[] = [];
  s.presentation.capture(w);
  for (let i = 0; i < 5; i++) {
    advanceVirtual(7);
    s.presentation.draw(s, w, () => displayed.push(me.mPosition.mX));
    expect(me.mPosition).toBe(position);
    w.Draw();
    expect(digest()).toEqual(before);
  }
  expect(displayed[0]).toBeGreaterThan(position.mX);
  for (let i = 1; i < displayed.length; i++) expect(displayed[i]).toBeGreaterThan(displayed[i - 1]!);
  expect(game.errors).toEqual([]);
  game.quit();
});
