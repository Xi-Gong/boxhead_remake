import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { advanceVirtual } from '../../src/engine/flash/clock.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { recordGrowthScore, SCORE_FLIGHT_MS } from '../../src/game/local/Net/FloatingScores.ts';
import { growthScoreTarget } from '../../src/game/local/Net/GrowthHud.ts';
import { captureWorldSnap, makeSnapCtx, restoreWorldSnap } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { _root } from '../../src/engine/runtime.ts';

it.each([0,1])('confirmed score for player %i stays smooth across replay, pause and resize', owner => {
  const game = createHeadlessGame({ menuOnly: 'Main' });
  const s = new NetSession(0, { send() {} });
  s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, netcode: 'rollback-v2',
    cfg: { progression: 'personal-growth-v1', difficulty: 0, gameSpeed: 1, devils: true, collisions: true,
      damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 } }, game.main());
  expect(game.waitRunning(3000)).toBe(true);
  const w = game.world(), hud = w.mHud, ctx = makeSnapCtx(w, (s as any).slots);
  hud.mMessages = []; w.Draw();
  const snap = captureWorldSnap(w, ctx, false), slot = { tRel: 0, data: snap, instances: ctx.instances, sharedObjs: ctx.sharedObjs };
  const before = simulationDigest(snap);
  const draws: { x: number; y: number }[] = [];
  hud.DrawBMObject = (bm: any, p: any) => draws.push({ x: p.x + bm.mDisp.x + bm.sBMD.width / 2, y: p.y + bm.mDisp.y + bm.sBMD.height / 2 });
  const record = () => {
    s.scores.begin(0); s.soundRecordingTick = 0;
    recordGrowthScore(w, game.players()[owner].mPosition, 8500, owner, 'victim');
    s.soundRecordingTick = undefined;
  };
  record(); w.Draw(); expect(draws).toEqual([]); // speculative kill never starts a flight
  record(); // correction rebuilds the same event
  s.scores.confirm(0); w.Draw(); expect(draws).toHaveLength(1);
  expect(hud.mScores).toEqual([]); // no mutable flight in the rollback graph
  for (let n = 0; n < 8; n++) { advanceVirtual(7); w.Draw(); }
  for (let n = 1; n < draws.length; n++) expect(draws[n]!.y).toBeLessThan(draws[n-1]!.y);
  expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);
  const last = draws.at(-1)!;
  restoreWorldSnap(w,slot,ctx); w.Draw();
  expect(draws.at(-1)).toEqual(last); // restoring a simulation snapshot cannot rewind display time
  hud.Pause(true); advanceVirtual(3000); hud.Pause(false); w.Draw();
  expect(draws.at(-1)).toEqual(last);
  w.mScreenSize.x = 960; w.Draw();
  const target = growthScoreTarget(hud,owner)!;
  expect(target.x).toBe(owner ? 858 : 132);
  advanceVirtual(SCORE_FLIGHT_MS - 56 - 1); w.Draw();
  expect(Math.abs(draws.at(-1)!.x - target.x)).toBeLessThan(.01);
  expect(Math.abs(draws.at(-1)!.y - target.y)).toBeLessThan(.1);
  const count = draws.length;
  advanceVirtual(1); w.Draw(); expect(draws).toHaveLength(count);
  expect(s.scores.confirmedCount).toBe(1);
  const quality = _root._quality;
  _root._quality = 'LOW'; s.scores.begin(1); s.soundRecordingTick = 1;
  recordGrowthScore(w,game.players()[owner].mPosition,100,owner,'low-quality');
  s.soundRecordingTick = undefined; s.scores.confirm(1); w.Draw();
  expect(draws).toHaveLength(count);
  _root._quality = quality;
  expect(game.errors).toEqual([]);
  game.quit();
});
