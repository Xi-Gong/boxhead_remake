import { expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import { advanceVirtual } from '../../src/engine/flash/clock.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { Thing } from '../../src/game/packages.ts';

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
  const explosion=w.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(me.mPosition.Clone(),me.mAngle.Clone(),me,100));
  const explosionPosition=explosion.mPosition;
  const digest = () => simulationDigest(captureWorldSnap(w, makeSnapCtx(w, (s as any).slots), false));
  const before = digest(), displayed: number[] = [];
  s.presentation.capture(w);
  for (let i = 0; i < 5; i++) {
    advanceVirtual(7);
    s.presentation.draw(s, w, () => {
      displayed.push(me.mPosition.mX);
      expect([explosion.mPosition.mX,explosion.mPosition.mY,explosion.mPosition.mZ])
        .toEqual([explosionPosition.mX,explosionPosition.mY,explosionPosition.mZ]);
    });
    expect(me.mPosition).toBe(position);
    w.Draw();
    expect(digest()).toEqual(before);
  }
  expect(displayed[0]).toBeGreaterThan(position.mX);
  for (let i = 1; i < displayed.length; i++) expect(displayed[i]).toBeGreaterThan(displayed[i - 1]!);
  expect(game.errors).toEqual([]);
  // A moving explosion (e.g. a position shared with a grenade) still follows ordinary interpolation.
  explosionPosition.mX+=.25;s.presentation.capture(w);advanceVirtual(20);
  let rendered=0;s.presentation.draw(s,w,()=>{rendered=explosion.mPosition.mX;});
  expect(rendered).toBeGreaterThan(explosionPosition.mX-.25);expect(rendered).toBeLessThan(explosionPosition.mX);
  expect(explosion.mPosition).toBe(explosionPosition);
  const shell=w.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_ClusterShell(me.mPosition.Clone(),me.mAngle.Clone(),me,100));
  const shellPosition=shell.mPosition;shell.mP=shellPosition;s.presentation.capture(w);
  shellPosition.mX+=.25;s.presentation.capture(w);advanceVirtual(20);
  for(let n=0;n<3;n++){
    s.presentation.draw(s,w,()=>{
      expect(shell.mPosition.mX).toBeGreaterThan(shellPosition.mX-.25);
      expect(shell.mPosition.mX).toBeLessThan(shellPosition.mX);expect(shell.mP).toBe(shell.mPosition);
    });
    expect(shell.mPosition).toBe(shellPosition);expect(shell.mP).toBe(shellPosition);
  }
  expect(()=>s.presentation.draw(s,w,()=>{throw new Error('test draw failure');})).toThrow('test draw failure');
  expect(shell.mPosition).toBe(shellPosition);expect(shell.mP).toBe(shellPosition);
  game.quit();
});
