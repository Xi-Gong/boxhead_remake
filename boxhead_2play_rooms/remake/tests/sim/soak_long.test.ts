// Lane Q: LONG soak, off by default (minutes). Run with
//   SOAK=1 npx vitest run tests/sim/soak_long.test.ts            (SOAK_TICKS=n to change the length, default 6000)
// Every room x every mode, difficulty cycling 0..3, weapon-cycling bots; plus mortal Single/Coop games that go
// through game over -> debrief -> RETRY several times, and LOW quality / fast / slow game-speed variants.
import { describe, expect, it } from 'vitest';
import { soakAsync, summary } from './soak.ts';
import { expectHealthySoak } from './soakSuite.ts';
import { Bot, runBots } from './bots.ts';
import { createHeadlessGame, InvariantChecker, type GameMode } from './harness.ts';

const ON = !!process.env.SOAK;
const TICKS = Number(process.env.SOAK_TICKS ?? 6000);
const MODES: GameMode[] = ['Single', 'Coop', 'DeathMatch'];

describe.skipIf(!ON)(`long soak (${TICKS} ticks per room)`, () => {
  for (const mode of MODES) {
    for (let room = 1; room <= 18; room++) {
      const difficulty = (room % 4) as 0 | 1 | 2 | 3;
      it(`${mode} room ${room} difficulty ${difficulty}`, async () => {
        const r = await soakAsync({
          mode, room, seed: 7000 + room * 3 + mode.length, difficulty, ticks: TICKS,
          options: { infiniteLife: mode !== 'DeathMatch', gameAmount: 3 },
        });
        expect(r.ticks, summary(r)).toBe(TICKS);
        expectHealthySoak(r, { running: true, kills: TICKS >= 3000 });
        console.log(summary(r));
      }, 600_000);
    }
  }

  for (const [mode, room, options] of [
    ['Single', 5, { detail: false }], ['Coop', 8, { gameSpeed: 2 }], ['Single', 14, { gameSpeed: 0 }],
    ['Coop', 16, { detail: false, collisions: 0 }], ['DeathMatch', 7, { detail: false, gameSpeed: 2, gameAmount: 3 }],
  ] as [GameMode, number, object][]) {
    it(`${mode} room ${room} options ${JSON.stringify(options)}`, async () => {
      const r = await soakAsync({ mode, room, seed: 99 + room, difficulty: 3, ticks: TICKS, options: { infiniteLife: mode !== 'DeathMatch', ...options } });
      expect(r.errors).toEqual([]);
      expect(r.issues.filter((i) => i.kind !== 'spawn_solid')).toEqual([]);
      if ((options as any).detail === false) expect(r.max.zombies).toBeLessThanOrEqual(40);
      console.log(summary(r));
    }, 600_000);
  }

  for (const [mode, room] of [['Single', 3], ['Coop', 7], ['Single', 12], ['Coop', 18]] as [GameMode, number][]) {
    it(`${mode} room ${room}: mortal games, game over -> debrief -> RETRY x4`, async () => {
      const g = createHeadlessGame({ mode, room, seed: 500 + room, difficulty: 2 });
      const checker = new InvariantChecker();
      for (let round = 0; round < 5; round++) {
        const bots = mode === 'Single' ? [new Bot(0, { cycleEvery: 80, digits: true })] : [new Bot(0, { cycleEvery: 80 }), new Bot(1, { cycleEvery: 95 })];
        for (let done = 0; done < TICKS && g.state() === 'State_RunWorld'; done += 250) {
          runBots(g, bots, 250, () => { checker.check(g.world()); });
          await new Promise((res) => setImmediate(res));
        }
        g.releaseAll();
        if (g.state() === 'State_RunWorld') g.quit();
        expect(g.waitScreen('State_Debrief', 'Screen_Debrief', 800)).toBe(true);
        if (round < 4) {
          g.retry();
          expect(g.waitRunning()).toBe(true);
        }
      }
      expect(g.errors).toEqual([]);
      expect(checker.issues.filter((i) => i.kind !== 'spawn_solid')).toEqual([]);
    }, 600_000);
  }
});
