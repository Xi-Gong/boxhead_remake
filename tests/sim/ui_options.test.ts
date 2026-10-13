// Lane X1: what the options window and the right-click "Quality" item DO in the game (headless real game).
// Covered elsewhere (tests/sim/rules.test.ts): difficulty start levels / multipliers, Death Match x200 + damage forced
// on, zombie cap 60 / 40, speed -> ticks per enterFrame, devils off. Here: object collisions, friendly fire, number of
// games (Death Match), the menus' fixed 25 Hz, the speed in real ticks per second, and the LOW-detail behaviours
// (_root._quality "LOW" only inside a room; no score pop-ups, no corpse fade, no brightness flash; menus stay HIGH).
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS, thingList } from './harness.ts';
import { _root } from '../../src/engine/swf/Player.ts';
import { buildMenuRows } from '../../src/engine/platform/ContextMenu.ts';
import { CMain, World } from '../../src/game/packages.ts';

const quality = (): string => (_root as any)._quality;

describe('object collisions option (CMap_Collide.PlayerCollide: Collide_Mapwho only when on)', () => {
  for (const collisions of [1, 0] as const) {
    it(`collisions ${collisions ? 'on: player 1 is stopped by player 2' : 'off: player 1 walks through player 2'}`, () => {
      // BUTTONS (Coop): P1 starts at (12.5, 10.5), P2 at (12.5, 16.5) in the same open column
      const g = createHeadlessGame({ mode: 'Coop', room: 2, seed: 1, options: { collisions, devils: 0, infiniteLife: true } });
      const [p1, p2] = g.players();
      expect([p1.mPosition.mX, p2.mPosition.mX]).toEqual([12.5, 12.5]);
      g.keyDown(KEYS.P1.DOWN);
      let minDist = Infinity;
      for (let i = 0; i < 60; i++) {
        g.tick(1);
        minDist = Math.min(minDist, Math.hypot(p1.mPosition.mX - p2.mPosition.mX, p1.mPosition.mY - p2.mPosition.mY));
      }
      g.keyUp(KEYS.P1.DOWN);
      if (collisions) {
        expect(p1.mPosition.mY).toBeLessThan(p2.mPosition.mY);
        expect(minDist).toBeGreaterThan(0.5);
      } else {
        expect(p1.mPosition.mY).toBeGreaterThan(p2.mPosition.mY + 1);
        expect(minDist).toBeLessThan(0.1);
      }
      expect(g.errors).toEqual([]);
    });
  }
});

describe('friendly fire option (CThing_Creature.mDamageActive, set by LoadLevel)', () => {
  for (const damage of [1, 0] as const) {
    it(`Coop, damage ${damage ? 'on: player 1 can shoot player 2' : 'off: bullets do not hurt player 2'}`, () => {
      // BIG BOXY (Coop): P1 (16.5, 17.5), P2 (24.5, 17.5) on the same row, 8 cells apart
      const g = createHeadlessGame({ mode: 'Coop', room: 9, seed: 1, options: { damage, devils: 0 } });
      const [p1, p2] = g.players();
      expect(p1.mPosition.mY).toBe(p2.mPosition.mY);
      p2.mInvincible = 0; // skip the 8 s spawn protection
      // P2 steps one cell up so the bullet line (gun held 0.33 to the right = south when facing east) meets it
      g.keyDown(KEYS.P2.LEFT); g.tick(4); g.keyUp(KEYS.P2.LEFT);
      g.keyDown(KEYS.P1.RIGHT); g.tick(1); g.keyUp(KEYS.P1.RIGHT); // face east
      const life0 = p2.mLife;
      for (let i = 0; i < 12; i++) {
        g.keyDown(KEYS.P1.FIRE); g.tick(1); g.keyUp(KEYS.P1.FIRE); g.tick(8);
        p2.mInvincible = 0;
      }
      if (damage) expect(p2.mLife).toBeLessThan(life0);
      else expect(p2.mLife).toBe(life0);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('number of games option (Death Match: first to 5 / 10 / 20 / 50 frags)', () => {
  for (const amount of [0, 1, 2, 3] as const) {
    const n = [5, 10, 20, 50][amount]!;
    it(`game amount ${amount}: player 2 wins when player 1 died ${n} times`, () => {
      const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 1, options: { gameAmount: amount } });
      const w = g.world();
      w.mHud.mPlayer1_Deaths = n - 1;
      w.PlayerDead();
      expect(w.mCompleteState).toBeUndefined();
      w.mHud.mPlayer1_Deaths = n;
      w.PlayerDead();
      expect(w.mCompleteState).toBe('player2 wins');
      expect(g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner')).toBe(true);
      expect(g.main().mcScreen.tbWinner.text).toBe('PLAYER 2 WINS');
      // the winner's character: Death Match default player 2 = SWAT (index 0 -> frame 1)
      expect(g.main().mcScreen.mcWinners._currentframe).toBe(CMain.mSaveData.mPlayer2_CharacterIndex + 1);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('game speed in ticks per second (50 enterFrames per second)', () => {
  for (const [speed, perSecond] of [[0, 12.5], [1, 25], [2, 50]] as const) {
    it(`speed ${speed}: ${perSecond} world ticks per second; the menus run at 25 Hz again afterwards`, () => {
      const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1, options: { gameSpeed: speed } });
      const t0 = g.world().mTick;
      g.step(50 * 4); // 4 s
      expect((g.world().mTick - t0) / 4).toBe(perSecond);
      g.quit();
      expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
      expect(CMain.mFPS).toBe(25);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('detail (right-click "Quality: LOW") -> _root._quality', () => {
  it('LOW only inside a room; toggling the menu item in a room switches at once; the menus are HIGH', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1 });
    expect(quality()).toBe('HIGH');
    const row = (): any => buildMenuRows((_root as any).menu, _root).find((r) => r.caption.startsWith('Quality:'));
    expect(row().caption).toBe('Quality: BEST');
    row().select();
    expect(row().caption).toBe('Quality: LOW');
    expect(quality()).toBe('LOW');
    expect(CMain.mSaveData.mDetail).toBe(false);
    row().select();
    expect(row().caption).toBe('Quality: BEST');
    expect(quality()).toBe('HIGH');
    row().select();
    expect(quality()).toBe('LOW');
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    expect(quality()).toBe('HIGH');
    expect(g.errors).toEqual([]);
  });

  for (const detail of [true, false]) {
    it(`${detail ? 'HIGH' : 'LOW'}: score pop-ups ${detail ? 'shown' : 'skipped'}, corpses ${detail ? 'fade' : 'do not fade'}`, () => {
      const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 6, difficulty: 1, options: { detail, devils: 0 } });
      const w = g.world();
      const hud = w.mHud;
      // wait for a zombie, kill it with a lethal hit and let it rot
      const walking = (t: any): boolean => t._CLASSID_ === 'CThing_Creature_Zombie' && t.mSound != undefined && !['State_EnterMap', 'State_Dying', 'State_Dead'].includes(t.mStateID);
      expect(g.stepUntil(() => thingList(w).some(walking), 4000)).toBe(true);
      const z = thingList(w).find(walking);
      z.mLife = 0;
      const before = hud.mScores.length;
      z.SetState('State_Dying'); // what a lethal hit leads to (State_Dying_Init -> CWorld.LogKill -> CHud.AddScore)
      const popups = hud.mScores.length - before;
      const alphas: number[] = [];
      g.stepUntil(() => { if (z.mStateID === 'State_Dead') alphas.push(z.mAlpha); return z.mStateID === undefined || !thingList(w).includes(z); }, 2000);
      expect(popups).toBe(detail ? 1 : 0);
      expect(hud.nTotalScore).toBeGreaterThan(0);
      expect(hud.nTotalScore % 100).toBe(0);
      expect(alphas.length).toBeGreaterThan(10);
      if (detail) expect(Math.min(...alphas)).toBeLessThan(10); // fades out during its last second
      else expect(alphas.every((a) => a === 100)).toBe(true);
      expect(g.errors).toEqual([]);
    });
  }

  it('LOW: no brightness flash on explosions (CWorld.Draw skips Process_Brightness)', () => {
    for (const detail of [true, false]) {
      const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1, difficulty: 2, options: { detail, devils: 0 } });
      const w = g.world();
      let calls = 0;
      const orig = w.Process_Brightness;
      w.Process_Brightness = function (this: any, ...a: any[]): any { calls++; return orig.apply(this, a); };
      g.step(20);
      expect(calls > 0).toBe(detail);
      expect(g.errors).toEqual([]);
    }
  });
});

describe('Death Match LOW quality: split views scaled without smoothing', () => {
  it('bmDraw.draw(view, matrix, ..., smoothing = _quality != "LOW")', () => {
    for (const detail of [true, false]) {
      const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 1, options: { detail } });
      const w = g.world();
      const seen: boolean[] = [];
      const orig = w.bmDraw.draw;
      w.bmDraw.draw = function (this: any, src: any, m: any, ct: any, bm: any, clip: any, smoothing: any): any {
        if (src === w.mSplitScreen.bmDraw) seen.push(smoothing);
        return orig.call(this, src, m, ct, bm, clip, smoothing);
      };
      g.step(6);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((s) => s === detail)).toBe(true);
      expect(World.CWorld.mGameMode).toBe('DeathMatch');
      expect(g.errors).toEqual([]);
    }
  });
});
