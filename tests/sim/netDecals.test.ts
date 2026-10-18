import { expect, it, vi } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { DrawPrimitive } from '../../src/game/packages.ts';
import { flash } from '../../src/engine/runtime.ts';

it('persistent decals discard a wrong branch and stamp only the confirmed position once', () => {
  const game = createHeadlessGame({ menuOnly: 'Main' });
  const s = new NetSession(0, { send() {} });
  s.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242, netcode: 'rollback-v2',
    cfg: { difficulty: 0, gameSpeed: 1, devils: true, collisions: true, damage: true,
      gameAmount: 0, detail: true, charP1: 0, charP2: 0 } }, game.main());
  expect(game.waitRunning(3000)).toBe(true);
  const world = game.world(), floor = world.bmFloor;
  const stamped: number[] = [];
  const copyPixels = vi.fn((_bitmap, _rect, point) => stamped.push(point.x));
  world.bmFloor = { copyPixels };
  const proto = DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional.prototype;
  const decal = Object.assign(Object.create(proto), { mAnimationPosition: 0, bmList: [[{ mDisp: { x: 0, y: 0 }, sBMD: { rectangle: {} } }]] });
  try {
    s.soundRecordingTick = 0;
    s.decals.begin(0);
    decal.QRender_Mask(world.bmFloor, new flash.geom.Point(10, 20), 0, {});
    expect(copyPixels).not.toHaveBeenCalled();
    s.decals.begin(0); // correction replaces the speculative event.
    decal.QRender_Mask(world.bmFloor, new flash.geom.Point(30, 20), 0, {});
    s.soundRecordingTick = undefined;
    s.decals.confirm(0);
    expect(stamped).toEqual([30]);
    expect(s.decals.retainedEvents).toBe(0);
  } finally { world.bmFloor = floor; game.quit(); }
});
