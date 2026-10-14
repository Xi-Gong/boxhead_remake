// Lane X1: UI "monkey" robustness run of the REAL game (headless): random mouse clicks over the whole stage (through
// Player picking, like real clicks) and random key presses (menu keys, Esc, P, both players' keys, digits, letters for
// the name field / rebinding) for thousands of enterFrames, across every screen the clicks reach (menus, options and
// controls windows, rooms, pause, debrief, winner). Asserts: no engine script error, CMain always in a known state,
// the save stays consistent (every option / key binding a valid value), and the menus keep working afterwards.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { CInput, CMain } from '../../src/game/packages.ts';

/** Small deterministic PRNG (mulberry32): the run is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [27, 80, 13, 8, 32, 37, 38, 39, 40, 65, 68, 69, 75, 81, 83, 87, 113, 186, 188, 190, 191, 48, 49, 50, 51];
const STATES = new Set(['State_Init', 'State_Intro', 'State_Main', 'State_Instructions', 'State_SelectWorld_Single', 'State_SelectWorld_Coop',
  'State_SelectWorld_DeathMatch', 'State_LoadWorld', 'State_LoadingWorld', 'State_InitWorld', 'State_RunWorld', 'State_Debrief', 'State_Debrief_Winner',
  // v0.1.2 SAVE_QUIT_RESUME: transient states of the save & quit / continue wiring.
  'State_SaveQuitMenu', 'State_Continue']);

function monkey(seed: number, frames: number): { visited: Set<string>; errors: string[] } {
  const g = createHeadlessGame({ mode: 'Single', seed, menuOnly: 'Main' });
  const rnd = prng(seed);
  const visited = new Set<string>();
  const p = g.player as any;
  for (let f = 0; f < frames; f++) {
    const r = rnd();
    if (r < 0.12) {
      // click somewhere (biased to the button rows of the menus)
      const x = Math.floor(rnd() * 640), y = Math.floor(rnd() < 0.5 ? 180 + rnd() * 220 : rnd() * 480);
      p.mouseMove(x, y);
      p.mouseDown();
      p.mouseUp();
    } else if (r < 0.2) {
      const k = KEYS[Math.floor(rnd() * KEYS.length)]!;
      g.keyDown(k);
      p.keyInput({ key: k === 8 ? 'Backspace' : String.fromCharCode(k), keyCode: k, type: 'down' });
      g.keyUp(k);
    } else if (r < 0.205 && g.world()) {
      // finish a running room now and then (debrief / winner screens)
      g.world().mCompleteState = ['quit', 'player dead', 'player1 wins', 'player2 wins'][Math.floor(rnd() * 4)];
    }
    g.step(1);
    const st = g.state();
    if (st) visited.add(st);
    if (st && !STATES.has(st)) throw new Error(`unknown state ${st}`);
    if (g.errorCount) break;
  }
  return { visited, errors: g.errors };
}

describe('UI monkey run', () => {
  it('regression [BC @475711]: SelectWeapon without weapons is the AS2 silent no-op (DM load races the pause key)', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 99 });
    const p = g.players()[0]!;
    const cur = p.mWeapon_Current;
    delete (p as any).mWeapons; // what the race leaves behind (InitCleanUp -> ResetWeapons before InitWeapons)
    expect(() => p.SelectWeapon('pistol')).not.toThrow();
    expect(p.mWeapon_Current).toBe(cur); // nothing selected, no crash
    expect(g.errors).toEqual([]);
  });

  it('random clicks and keys over every screen (5 seeds): no script errors, valid states and save values', () => {
    const all = new Set<string>();
    for (const seed of [7, 1234, 99, 2024, 31337]) {
      const { visited, errors } = monkey(seed, 6000);
      expect(errors, `seed ${seed}`).toEqual([]);
      for (const v of visited) all.add(v);
      const sd: any = CMain.mSaveData;
      expect([0, 1, 2, 3]).toContain(sd.mDifficulty);
      expect([0, 1, 2]).toContain(sd.mGameSpeed);
      for (const f of ['mDevilsActive', 'mCollisionsActive', 'mDamageActive']) expect([0, 1]).toContain(sd[f]);
      expect([0, 1, 2, 3]).toContain(sd.mGameAmount);
      for (const m of ['Single', 'Coop', 'DeathMatch']) {
        expect(sd['mLevelIndex_' + m]).toBeGreaterThanOrEqual(0);
        expect(sd['mLevelIndex_' + m]).toBeLessThan(18);
      }
      for (const pl of [1, 2]) {
        expect([0, 1, 2, 3]).toContain(sd[`mPlayer${pl}_CharacterIndex`]);
        for (const k of ['Shoot', 'MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'NextWeapon', 'PrevWeapon']) {
          expect(CInput.isValidKey(sd[`mPlayer${pl}_Key${k}`])?.mValid, `P${pl} ${k} = ${sd[`mPlayer${pl}_Key${k}`]}`).toBe(true);
        }
      }
    }
    // together the runs reached every kind of screen
    for (const st of ['State_Main', 'State_Instructions', 'State_SelectWorld_Single', 'State_SelectWorld_Coop', 'State_SelectWorld_DeathMatch', 'State_RunWorld', 'State_Debrief']) {
      expect(all.has(st), `${st} visited (${[...all].join(', ')})`).toBe(true);
    }
  });
});
