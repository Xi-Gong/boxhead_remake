// Lane Q: screen flow of the REAL game in the headless harness: boot through Intro -> Main -> mode button, game over
// -> Screen_Debrief (Single: the player dies; Coop: only when BOTH are down), RETRY / EXIT of the debrief screens,
// pause (P) freezes the world and lists the upgrades, QUIT from the pause screen, Death Match winner after
// [5, 10, 20, 50][gameAmount] kills -> Screen_Debrief_Winner, and the determinism of the whole simulation.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, debriefWinner, KEYS, type GameMode } from './harness.ts';
import { Bot, runBots } from './bots.ts';
import { hasCheckpoint } from '../../src/game/local/Resume.ts';
import { World } from '../../src/game/packages.ts';

describe('boot through the real menus', () => {
  for (const mode of ['Single', 'Coop', 'DeathMatch'] as GameMode[]) {
    it(`${mode}: Intro -> Main -> ${mode} button -> level icon -> room running`, () => {
      const g = createHeadlessGame({ mode, room: 2, seed: 1, fullBoot: true });
      expect(g.state()).toBe('State_RunWorld');
      expect(World.CWorld.mGameMode).toBe(mode);
      expect(g.world().mWorldLibLink).toBe('ROOM_Single_0002');
      expect(g.players().length).toBe(mode === 'Single' ? 1 : 2);
      // the intro plays its ~8 s (Sean Cooper logo, 250 frames at 30 fps) before the main menu
      expect(g.frames).toBeGreaterThan(400);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('Single: death -> debrief -> retry / exit', () => {
  it('a passive player dies, Screen_Debrief shows the HUD score; RETRY restarts the room, EXIT returns to the selection', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 2, seed: 21, difficulty: 2 });
    const world1 = g.world();
    const ticks = runBots(g, [new Bot(0, { passive: true })], 3000);
    expect(ticks).toBeLessThan(3000);
    expect(world1.mCompleteState).toBe('player dead');
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    const screen = g.main().mcScreen;
    expect(screen._CLASSID_).toBe('CScreen_Debrief');
    expect(screen.mScore.text).toBe(String(world1.mHud.mScore));
    // the world is gone once the debrief screen is up
    g.step(5);
    expect(g.main().mcWorld).toBeUndefined();
    // PIN: the passive bot killed nothing -> no wave advanced -> no checkpoint (WAVE_CHECKPOINT_RETRY), so RETRY
    // below takes the v0.2.0 fallback to the run's start wave - here the difficulty base (20), numerically identical
    // to the original fresh restart.
    expect(hasCheckpoint()).toBe(false);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    expect(g.world()).not.toBe(world1);
    expect(g.world().mWorldLibLink).toBe('ROOM_Single_0002');
    expect(g.snapshot().level).toBe(20); // difficulty 2 again
    // pause -> QUIT -> debrief (Single) -> EXIT -> level selection
    g.step(20);
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.exit();
    expect(g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld')).toBe(true);
    expect(g.main().mcWorld).toBeUndefined();
    expect(g.errors).toEqual([]);
  });
});

describe('Coop: the game ends only when both players are down', () => {
  it('a dead player respawns close to the living one (after 4 s dead + 1 s); debrief when the player count reaches 0', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 3, seed: 5, difficulty: 1 });
    const w = g.world();
    const DOWN = ['State_Dying', 'State_Dead', 'State_Respawn'];
    let sawOneDown = false;
    let respawns = 0;
    let wasDown = [false, false];
    runBots(g, [new Bot(0, { passive: true }), new Bot(1)], 4000, () => {
      const players = g.players();
      const down = players.map((p) => DOWN.includes(p.mStateID));
      // the living-player count of CUpgrades follows LogKill (-1) and State_Respawn (+1)
      expect(w.mUpgrades.mPlayerCount).toBe(down.filter((d) => !d).length);
      if (down.filter((d) => d).length === 1) {
        sawOneDown = true;
        expect(w.mCompleteState).toBeUndefined();
      }
      for (const i of [0, 1]) {
        if (wasDown[i] && !down[i]) {
          respawns++;
          const [a, b] = players;
          expect(Math.abs(a!.mPosition.mX - b!.mPosition.mX)).toBeLessThanOrEqual(19);
          expect(Math.abs(a!.mPosition.mY - b!.mPosition.mY)).toBeLessThanOrEqual(13);
          expect(players[i]!.mLife).toBe(200);
          expect(players[i]!.mInvincible).toBeGreaterThan(0);
        }
      }
      wasDown = down;
    });
    expect(sawOneDown).toBe(true);
    expect(respawns).toBeGreaterThan(0);
    expect(w.mCompleteState).toBe('player dead');
    expect(w.mUpgrades.mPlayerCount).toBe(0);
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    expect(g.errors).toEqual([]);
  });
});

describe('pause', () => {
  it('P freezes the world and shows HUD.Paused with every multiplier upgrade; P again resumes', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 5, difficulty: 1 });
    g.step(50);
    const w = g.world();
    g.keyDown(KEYS.PAUSE);
    g.step(2);
    g.keyUp(KEYS.PAUSE);
    expect(w.mPaused).toBe(true);
    const ps = w.mHud.mcScreenPause;
    expect(ps).toBeDefined();
    const rows = Object.keys(ps).filter((k) => /^upgrade_\d+$/.test(k));
    expect(rows.length).toBe(w.mUpgrades.mMultiplierList.length);
    // x10 at difficulty 1: rows up to x10 opaque, the rest at 25 % alpha
    const alphaOf = (i: number): number => ps['upgrade_' + i]._alpha;
    w.mUpgrades.mMultiplierList.forEach((e: any, i: number) => expect(alphaOf(i), e.mName).toBe(e.mIndex <= 10 ? 100 : 25));
    const t = w.mTick;
    const z = g.snapshot().zombies;
    g.step(300);
    expect(w.mTick).toBe(t);
    expect(g.snapshot().zombies).toBe(z);
    g.keyDown(KEYS.PAUSE);
    g.step(2);
    g.keyUp(KEYS.PAUSE);
    expect(w.mPaused).toBe(false);
    expect(w.mHud.mcScreenPause).toBeUndefined();
    g.step(20);
    expect(w.mTick).toBeGreaterThan(t);
    expect(g.errors).toEqual([]);
  });
});

describe('Death Match winner', () => {
  it('the first player to reach 5 kills (game amount 0) wins -> Screen_Debrief_Winner; QUIT of a Death Match goes back to the selection', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 41, options: { gameAmount: 0 } });
    const w = g.world();
    const n = runBots(g, [new Bot(0), new Bot(1)], 6000);
    expect(n).toBeLessThan(6000);
    const deaths = [w.mHud.mPlayer1_Deaths, w.mHud.mPlayer2_Deaths];
    expect(Math.max(...deaths)).toBe(5);
    // CWorld.PlayerDead tests player 1's deaths first, then player 2's: on a tie (both fragged by the same exchange)
    // the second test wins -> "player1 wins"
    const winner = deaths[1] === 5 ? 0 : 1;
    expect(w.mCompleteState).toBe(winner === 0 ? 'player1 wins' : 'player2 wins');
    expect(g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner')).toBe(true);
    expect(debriefWinner()).toBe(winner);
    expect(g.main().mcScreen.tbWinner.text).toBe(`PLAYER ${winner + 1} WINS`);
    // RETRY: the same Death Match room again, x200 with fresh frag counts (DM never advances waves -> no checkpoint,
    // so this is the original fresh restart).
    expect(hasCheckpoint()).toBe(false);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    expect(g.snapshot().multiplier).toBe(200);
    expect(g.snapshot().deaths).toEqual([0, 0]);
    g.step(10);
    g.quit();
    expect(g.waitScreen('State_SelectWorld_DeathMatch', 'Screen_SelectWorld')).toBe(true);
    expect(g.errors).toEqual([]);
  });
});

describe('determinism', () => {
  const run = (mode: GameMode, room: number, seed: number): string[] => {
    const g = createHeadlessGame({ mode, room, seed, difficulty: 1, options: { infiniteLife: true } });
    const bots = mode === 'Single' ? [new Bot(0, { cycleEvery: 50, digits: true })] : [new Bot(0, { cycleEvery: 50 }), new Bot(1, { cycleEvery: 60 })];
    const hashes: string[] = [];
    runBots(g, bots, 600, (t) => { if ((t + 1) % 150 === 0) hashes.push(g.hash()); });
    expect(g.errors).toEqual([]);
    return hashes;
  };
  for (const [mode, room] of [['Single', 3], ['Coop', 2], ['DeathMatch', 1]] as [GameMode, number][]) {
    it(`${mode}: same seed -> same state hash; another seed -> a different one`, () => {
      const a = run(mode, room, 77);
      const b = run(mode, room, 77);
      const c = run(mode, room, 78);
      expect(a).toHaveLength(4);
      expect(b).toEqual(a);
      expect(c).not.toEqual(a);
    });
  }
});
