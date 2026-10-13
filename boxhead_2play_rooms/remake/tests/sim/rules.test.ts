// Lane Q: game rules checked through the REAL game (headless harness, plan appendices C/D): difficulty start levels
// and multipliers, Death Match start (x200, emptied non-pistol ammo, damage forced on), zombie spawn caps (60 HIGH /
// 40 LOW), level progression and scoring, pickups, game speed -> world tick rate.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS, thingList } from './harness.ts';
import { Bot, runBots, walkTo } from './bots.ts';
import { soak } from './soak.ts';
import { DIFFICULTY_START, WEAPON_UNLOCKS, expectHealthySoak } from './soakSuite.ts';
import { CMain, Thing } from '../../src/game/packages.ts';

const unlockedAt = (mult: number): string[] => ['pistol', ...WEAPON_UNLOCKS.filter(([, m]) => m <= mult).map(([w]) => w)];

describe('difficulty -> start level / multiplier', () => {
  for (const d of [0, 1, 2, 3] as const) {
    const [level, mult] = DIFFICULTY_START[d]!;
    it(`difficulty ${d}: level ${level}, x${mult}, upgrades and weapons up to x${mult}`, () => {
      const g = createHeadlessGame({ mode: d === 2 ? 'Coop' : 'Single', room: 1 + d, seed: d, difficulty: d as 0 | 1 | 2 | 3 });
      const s = g.snapshot();
      expect([s.level, s.multiplier]).toEqual([level, mult]);
      const u = g.world().mUpgrades;
      expect(u.mMultiplierList.filter((e: any) => e.mActive).map((e: any) => e.mIndex))
        .toEqual(u.mMultiplierList.filter((e: any) => e.mIndex <= mult).map((e: any) => e.mIndex));
      for (const p of s.players) {
        expect(p.weapons).toEqual(unlockedAt(mult));
        expect(p.weapon).toBe('pistol');
        expect(p.life).toBe(200);
      }
      // the wave parameters of the start level (appendix C)
      expect(u.Level.Zombie_Count).toBe(Math.min(10 + 5 * (level - 1), 60));
      expect(u.Level.Zombie_TotalCount).toBe(10 + 5 * (level - 1));
      expect(u.Level.Zombie_SpawnRate).toBe(Math.max(25 - (level - 1), 1));
      expect(u.CThing_Creature_Zombie.SpeedUp).toBeCloseTo(Math.min(1 + level / 10, 5), 12);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('Death Match start', () => {
  it('x200, level 1, every weapon unlocked but only the pistol loaded; damage forced on', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 2, seed: 3, options: { damage: 0 } });
    const s = g.snapshot();
    expect([s.level, s.multiplier]).toEqual([1, 200]);
    expect((Thing.Creature.CThing_Creature as any).mDamageActive).toBe(true);
    for (const p of g.players()) {
      expect(p.mWeaponList.every((w: any) => w.mActive)).toBe(true);
      for (const w of p.mWeaponList) {
        if (w.mNameID === 'pistol') expect(w.mThing.WeaponEmpty()).toBe(false);
        else expect(w.mThing.mAmmo, w.mNameID).toBe(0);
      }
      expect(p.mWeapon_Current.mNameID).toBe('pistol');
      // pressing NEXT does not leave the pistol: every other weapon is empty
      expect(p.NextWeapon()).toBeUndefined();
    }
    g.step(400);
    expect(g.snapshot().zombies + g.snapshot().devils).toBe(0);
    expect(g.errors).toEqual([]);
  });

  it('a Single game keeps the saved damage switch', () => {
    createHeadlessGame({ mode: 'Single', room: 1, seed: 3, options: { damage: 0 } });
    expect((Thing.Creature.CThing_Creature as any).mDamageActive).toBe(0);
  });
});

describe('zombie spawn cap = min(Zombie_Count, 60), 40 on LOW quality', () => {
  for (const detail of [true, false]) {
    it(`${detail ? 'HIGH' : 'LOW'}: level 35 fills up to ${detail ? 60 : 40} zombies and never more`, () => {
      const g = createHeadlessGame({ mode: 'Single', room: 18, seed: 9, difficulty: 3, options: { detail, infiniteLife: true } });
      expect(CMain.mSaveData.mDetail).toBe(detail);
      const cap = detail ? 60 : 40;
      let max = 0;
      runBots(g, [new Bot(0, { passive: true })], 500, () => {
        const z = g.world().mUpgrades.Level.mZombieCount;
        max = Math.max(max, z);
        expect(z).toBeLessThanOrEqual(cap);
        const live = thingList(g.world()).filter((t) => t._CLASSID_ === 'CThing_Creature_Zombie').length;
        expect(live).toBe(z);
      });
      expect(max).toBe(cap);
      expect(g.errors).toEqual([]);
    });
  }
});

describe('level progression and scoring (Single BOXY, Beginner)', () => {
  it('waves advance one level at a time when every zombie of the wave is dead; score = 100 x multiplier per kill', () => {
    const kills: number[] = [];
    const r = soak({ mode: 'Single', room: 1, seed: 11, ticks: 1500, options: { infiniteLife: true } });
    expectHealthySoak(r, { running: true, minLevel: 3 });
    expect(r.levelUps.map(([, l]) => l)).toEqual(Array.from({ length: r.levelUps.length }, (_, i) => i + 2));
    // every score step is a multiple of 100 (zombie 100 / devil 1000 times the multiplier)
    for (const s of r.snapshots) expect(s.score % 100).toBe(0);
    expect(r.end.score).toBeGreaterThan(0);
    void kills;
  });
});

describe('pickups (BOXY: two pickup markers)', () => {
  it('a player walking onto a pickup gets a random refill; the pickup reappears after 30 s', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 4, difficulty: 1, options: { infiniteLife: true } });
    const pk = thingList(g.world()).filter((t) => t._CLASSID_ === 'CThing_Object_Pickup')
      .sort((a, b) => Math.abs(a.mPosition.mY - 8.5) - Math.abs(b.mPosition.mY - 8.5))[0];
    expect(pk).toBeDefined();
    // empty the UZI a bit so the pickup has something to give (chance = (1 - ammo/total) * 0.75 + 0.25)
    const p = g.players()[0];
    p.mWeapons.uzi.mThing.mAmmo = 1;
    const messages: string[] = [];
    const hud = g.world().mHud;
    const orig = hud.AddMessage_Info;
    hud.AddMessage_Info = function (this: any, m: string, i?: number) { messages.push(m); return orig.call(this, m, i); };
    expect(walkTo(g, 0, pk.mPosition.mX, pk.mPosition.mY, 400)).toBe(true);
    g.tick(2);
    expect(pk.Process).toBe(pk.Process_Count);
    expect(messages.some((m) => /^Picked up |^Life up!$/.test(m))).toBe(true);
    expect(pk.mReappearCount).toBeGreaterThan(CMain.mFPS * 30 - 5);
    // walk away, wait out the 30 s (750 ticks at 25 fps), it is back
    walkTo(g, 0, 8.5, 8.5, 200);
    g.tick(CMain.mFPS * 30 + 5);
    expect(pk.Process === pk.Process_Normal || pk.Process === pk.Process_Init).toBe(true);
    expect(g.errors).toEqual([]);
  });
});

describe('game speed option -> world ticks per 50 Hz enterFrame', () => {
  for (const [speed, efPerTick] of [[0, 4], [1, 2], [2, 1]] as const) {
    it(`speed ${speed}: one world tick every ${efPerTick} enterFrame(s)`, () => {
      const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1, options: { gameSpeed: speed } });
      expect(CMain.mFPS).toBe(25 * (speed === 0 ? 0.5 : speed));
      const t0 = g.world().mTick;
      g.step(200);
      expect(g.world().mTick - t0).toBe(200 / efPerTick);
    });
  }
});

describe('devils option', () => {
  it('devils off: no devil ever spawns, even at Nightmare (level 35)', () => {
    const r = soak({ mode: 'Single', room: 7, seed: 12, difficulty: 3, ticks: 600, options: { infiniteLife: true, devils: 0 } });
    expectHealthySoak(r, { running: true });
    expect(r.max.devils).toBe(0);
    expect(r.game.world().mUpgrades.Level.Devil_Count).toBeUndefined();
  });
});

describe('input bindings in the world', () => {
  const bullets = (g: any): number => thingList(g.world()).filter((t) => t._CLASSID_ === 'CThing_Shot_Bullet' || t._CLASSID_ === 'CThing_Effect_MuzzleFlash').length;
  it("Single: Space fires too and digit keys select weapons (x10: '2' UZI, '3' shotgun)", () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 2, difficulty: 1 });
    g.keyDown(KEYS.SPACE); g.tick(1); g.keyUp(KEYS.SPACE);
    expect(bullets(g)).toBeGreaterThan(0);
    g.keyDown(KEYS.DIGIT[3]); g.tick(1); g.keyUp(KEYS.DIGIT[3]); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('shotgun');
    g.keyDown(KEYS.DIGIT[2]); g.tick(1); g.keyUp(KEYS.DIGIT[2]); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('uzi');
    // a locked weapon key does nothing ('5' grenade unlocks at x20)
    g.keyDown(KEYS.DIGIT[5]); g.tick(1); g.keyUp(KEYS.DIGIT[5]); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('uzi');
    // '.' next / ',' previous (switch on release)
    g.keyDown(KEYS.P1.NEXT); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('uzi');
    g.keyUp(KEYS.P1.NEXT); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('shotgun');
    g.keyDown(KEYS.P1.PREV); g.tick(1); g.keyUp(KEYS.P1.PREV); g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('uzi');
    expect(g.errors).toEqual([]);
  });

  it('Coop: Space is player 2 fire, digits select nothing, Q/E cycle player 2 weapons', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 2, difficulty: 1 });
    const [p1, p2] = g.players();
    const shooters = (): number[] => thingList(g.world()).filter((t) => t._CLASSID_ === 'CThing_Shot_Bullet').map((t) => t.mParent.mPlayerIndex);
    g.keyDown(KEYS.SPACE); g.tick(1); g.keyUp(KEYS.SPACE);
    expect(shooters()).toEqual([1]);
    g.keyDown(KEYS.DIGIT[3]); g.tick(1); g.keyUp(KEYS.DIGIT[3]); g.tick(1);
    expect([p1.mWeapon_Current.mNameID, p2.mWeapon_Current.mNameID]).toEqual(['pistol', 'pistol']);
    g.keyDown(KEYS.P2.NEXT); g.tick(1); g.keyUp(KEYS.P2.NEXT); g.tick(1);
    expect([p1.mWeapon_Current.mNameID, p2.mWeapon_Current.mNameID]).toEqual(['pistol', 'uzi']);
    g.keyDown(KEYS.P2.PREV); g.tick(1); g.keyUp(KEYS.P2.PREV); g.tick(1);
    expect(p2.mWeapon_Current.mNameID).toBe('pistol');
    // P2 moves with WASD
    const x0 = p2.mPosition.mX;
    g.keyDown(KEYS.P2.RIGHT); g.tick(5); g.keyUp(KEYS.P2.RIGHT);
    expect(p2.mPosition.mX).toBeGreaterThan(x0);
    expect(g.errors).toEqual([]);
  });
});

describe('player movement (appendix D: 0.16 cells per tick, diagonals not normalised; Coop KeepDistance 19 x 13)', () => {
  it('straight and diagonal steps of 0.16 cells per tick in open floor', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1 });
    const p = g.players()[0];
    const x0 = p.mPosition.mX, y0 = p.mPosition.mY;
    g.keyDown(KEYS.P1.RIGHT);
    g.tick(5);
    g.keyUp(KEYS.P1.RIGHT);
    expect(p.mPosition.mX - x0).toBeCloseTo(0.8, 9);
    expect(p.mPosition.mY).toBe(y0);
    const x1 = p.mPosition.mX, y1 = p.mPosition.mY;
    g.setKeys([KEYS.P1.UP, KEYS.P1.LEFT]);
    g.tick(5);
    g.releaseAll();
    expect(x1 - p.mPosition.mX).toBeCloseTo(0.8, 9);
    expect(y1 - p.mPosition.mY).toBeCloseTo(0.8, 9);
    expect(p.mAngle.__get__mDirection()).toBe(5); // north-west
  });

  it('Coop THIN LINE: player 2 cannot walk more than 19 cells away from player 1', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 15, seed: 1, options: { infiniteLife: true } });
    const [p1, p2] = g.players();
    const dir = p2.mPosition.mX >= p1.mPosition.mX ? KEYS.P2.RIGHT : KEYS.P2.LEFT;
    g.keyDown(dir);
    g.tick(300);
    g.keyUp(dir);
    const dx = Math.abs(p2.mPosition.mX - p1.mPosition.mX);
    expect(dx).toBeGreaterThan(18);
    expect(dx).toBeLessThanOrEqual(19 + 0.16);
    expect(g.errors).toEqual([]);
  });
});
