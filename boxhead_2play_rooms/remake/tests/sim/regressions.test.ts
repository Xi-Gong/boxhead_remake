// Lane Q: regression tests for the porting bugs found by the soak runs (each fix is tagged [BC] in src/game).
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS, type GameMode } from './harness.ts';
import { Bot, runBots } from './bots.ts';
import { DrawPrimitive } from '../../src/game/packages.ts';

describe('CMain.DeleteWorld before any screen exists [BC CMain @204284]', () => {
  it('the original debug boot (_global.mDebug: State_Init -> State_SelectWorld_DeathMatch) reaches a running room', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 3, seed: 1, debugBoot: true });
    expect(g.state()).toBe('State_RunWorld');
    expect(g.errors).toEqual([]);
  });
});

describe('spawn markers outside the map [BC World.CWorld @117451]', () => {
  for (const mode of ['Single', 'Coop', 'DeathMatch'] as GameMode[]) {
    it(`room 13 (TIGHT 2) loads in ${mode}; the 4 zombie + 2 devil markers on row 34 (map height 34) are dropped`, () => {
      const g = createHeadlessGame({ mode, room: 13, seed: 13 });
      expect(g.state()).toBe('State_RunWorld');
      const w = g.world();
      expect(w.mArea.height / 32).toBe(34);
      expect(w.mSpawnPoint_Zombie).toHaveLength(4);
      expect(w.mSpawnPoint_Devil).toHaveLength(2);
      for (const sp of [...w.mSpawnPoint_Zombie, ...w.mSpawnPoint_Devil]) {
        expect(sp.mCell).toBeDefined();
        expect(sp.mNextCell).toBeDefined();
      }
      g.step(600);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('fresh XSI animation object without an animation [BC DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation @261589]', () => {
  it('GetWeaponPosition / Render of a just-created animation object read undefined like AS2 (no throw)', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1 });
    const p = g.players()[0];
    const keep = p.mXSI_Animation;
    p.mXSI_Animation = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation.CreateAnimationObject(p.mXSI_Collection);
    const pos = p.GetWeaponPosition();
    expect([pos.mX, pos.mY, pos.mZ]).toEqual([p.mPosition.mX, p.mPosition.mY, p.mPosition.mZ]);
    expect(() => p.Draw()).not.toThrow();
    p.mXSI_Animation = keep;
  });

  it('Coop: FIRE held while dead fires on the respawn tick and the respawn still completes', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 3, seed: 5, difficulty: 1 });
    const w = g.world();
    const DOWN = ['State_Dying', 'State_Dead', 'State_Respawn'];
    const p2 = new Bot(1);
    let respawned = 0;
    let wasDown = false;
    for (let t = 0; t < 3000 && respawned < 2 && g.state() === 'State_RunWorld'; t++) {
      const p1 = g.players()[0];
      const down = DOWN.includes(p1.mStateID);
      // P1 stands still and holds FIRE while down: on the respawn tick State_Respawn -> SetState("State_PlayerControl")
      // runs the weapon Update (x10: the pistol is automatic) BEFORE the new animation object got an animation
      g.setKeys(down ? [KEYS.P1.FIRE] : [], [KEYS.P1.FIRE]);
      g.setKeys(p2.decide(g), p2.managed());
      g.tick(1);
      const nowDown = DOWN.includes(g.players()[0].mStateID);
      if (wasDown && !nowDown) {
        respawned++;
        const q = g.players()[0];
        expect(q.mStateID).toBe('State_PlayerControl');
        expect(q.Process).toBe(q.Process_Normal);
        expect(q.mLife).toBe(200);
        expect(q.mWeapon_Current.mNameID).toBe('pistol');
        expect(w.mUpgrades.mPlayerCount).toBe(g.players().filter((x) => !DOWN.includes(x.mStateID)).length);
      }
      wasDown = nowDown;
    }
    expect(respawned).toBeGreaterThan(0);
    expect(g.errors).toEqual([]);
  });

  it('Death Match: two bots fragging each other for 3000 ticks keep respawning cleanly', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 9, seed: 9, options: { gameAmount: 3 } });
    runBots(g, [new Bot(0, { cycleEvery: 40 }), new Bot(1, { cycleEvery: 45 })], 3000);
    expect(g.errors).toEqual([]);
    for (const p of g.players()) expect(Number.isFinite(p.mLife)).toBe(true);
  });
});
