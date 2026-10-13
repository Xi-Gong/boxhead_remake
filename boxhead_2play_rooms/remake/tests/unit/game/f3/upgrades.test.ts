// Lane F3: World.CUpgrades - wave table (InitLists), multiplier timer (GetTicks), difficulty start, upgrade table.
import { freshSaveData, fakeWorld } from './f3Setup.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CMain, World } from '../../../../src/game/packages.ts';

const W = (): any => World;

function newUpgrades(opts: { devils?: number; fps?: number; mode?: string; withThings?: boolean } = {}): { up: any; world: any } {
  const sd = freshSaveData();
  sd.mDevilsActive = opts.devils ?? 1;
  (CMain as any).mFPS = opts.fps ?? 25;
  W().CWorld.mGameMode = opts.mode ?? 'Single';
  const world = fakeWorld();
  const things = world.mThing_Collection;
  // in the game CUpgrades is created by CWorld.Init BEFORE the thing collection and the HUD exist
  delete world.mThing_Collection;
  const hud = world.mHud;
  delete world.mHud;
  const up = new (W().CUpgrades)(world);
  world.mHud = hud;
  if (opts.withThings !== false) world.mThing_Collection = things;
  return { up, world };
}

/** Level parameters of a level as the original's double arithmetic computes them (bytecode @543002..@543791). */
function expectedLevels(fps: number, devils: boolean): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  let zr = 1 * fps, zc = 10, zt = 10, dr = 10 * fps, dc = 0, dt = 0;
  for (let i = 1; i <= 100; i++) {
    const e: Record<string, number> = {
      Zombie_SpawnRate: Math.floor(zr), Zombie_Count: Math.floor(zc), Zombie_TotalCount: Math.floor(zt),
      ZombieSpeedUp: Math.min(1 + i / 100 * 10, 5),
    };
    zr = Math.max(zr - 1, 1); zc = Math.min(zc + 5, 60); zt = zt + 5;
    if (devils) {
      e.Devil_SpawnRate = Math.floor(dr); e.Devil_Count = Math.floor(dc); e.Devil_TotalCount = Math.floor(dt);
      e.DevilSpeedUp = Math.min(1 + i / 100 * 10, 5);
      dc = Math.min(i !== 1 ? dc + 0.3 : 1, 5);
      dt = i !== 1 ? dt + 0.25 : 1;
      dr = Math.max(dr - 1, fps);
    }
    out.push(e);
  }
  return out;
}

describe('CUpgrades.InitLists (wave table, levels 1..100)', () => {
  beforeEach(() => { (CMain as any).mFPS = 25; });

  it('builds 4 zombie + 4 devil entries per level with devils on', () => {
    const { up } = newUpgrades();
    for (let i = 1; i <= 100; i++) {
      const list = up.mLevels[i];
      expect(list.map((e: any) => `${e.mClassID}.${e.mProp}`)).toEqual([
        'Level.Zombie_SpawnRate', 'Level.Zombie_Count', 'Level.Zombie_TotalCount', 'CThing_Creature_Zombie.SpeedUp',
        'Level.Devil_SpawnRate', 'Level.Devil_Count', 'Level.Devil_TotalCount', 'CThing_Creature_Devil.SpeedUp',
      ]);
      expect(list.every((e: any) => e.mIndex === i)).toBe(true);
    }
    expect(up.mLevels[0]).toBeUndefined();
    expect(up.mLevels[101]).toBeUndefined();
  });

  it('matches the documented progression (spot checks)', () => {
    const { up } = newUpgrades();
    const v = (lvl: number, prop: string): number => up.mLevels[lvl].find((e: any) => e.mProp === prop && (prop !== 'SpeedUp')).mValue;
    const speed = (lvl: number, cls: string): number => up.mLevels[lvl].find((e: any) => e.mClassID === cls).mValue;
    // level 1
    expect([v(1, 'Zombie_SpawnRate'), v(1, 'Zombie_Count'), v(1, 'Zombie_TotalCount')]).toEqual([25, 10, 10]);
    expect([v(1, 'Devil_SpawnRate'), v(1, 'Devil_Count'), v(1, 'Devil_TotalCount')]).toEqual([250, 0, 0]);
    expect(speed(1, 'CThing_Creature_Zombie')).toBeCloseTo(1.1, 12);
    // level 2: devils start (count 1, total 1)
    expect([v(2, 'Zombie_SpawnRate'), v(2, 'Zombie_Count'), v(2, 'Zombie_TotalCount')]).toEqual([24, 15, 15]);
    expect([v(2, 'Devil_SpawnRate'), v(2, 'Devil_Count'), v(2, 'Devil_TotalCount')]).toEqual([249, 1, 1]);
    // spawn interval floors at 1 tick from level 25, on-screen count caps at 60 from level 11
    expect(v(25, 'Zombie_SpawnRate')).toBe(1);
    expect(v(24, 'Zombie_SpawnRate')).toBe(2);
    expect(v(11, 'Zombie_Count')).toBe(60);
    expect(v(10, 'Zombie_Count')).toBe(55);
    expect(v(100, 'Zombie_TotalCount')).toBe(505);
    // speed-up: min(1 + i/10, 5)
    expect(speed(40, 'CThing_Creature_Zombie')).toBe(5);
    expect(speed(39, 'CThing_Creature_Zombie')).toBeCloseTo(4.9, 12);
    expect(speed(100, 'CThing_Creature_Devil')).toBe(5);
    // devils: interval 250 - (i-1) down to mFPS, count +0.3 (max 5), total +0.25
    expect([v(100, 'Devil_SpawnRate'), v(100, 'Devil_Count'), v(100, 'Devil_TotalCount')]).toEqual([151, 5, 25]);
  });

  it('equals the double-arithmetic reference for every level (devils on and off)', () => {
    for (const devils of [true, false]) {
      const { up } = newUpgrades({ devils: devils ? 1 : 0 });
      const exp = expectedLevels(25, devils);
      for (let i = 1; i <= 100; i++) {
        const got: Record<string, number> = {};
        for (const e of up.mLevels[i]) got[e.mProp === 'SpeedUp' ? (e.mClassID === 'CThing_Creature_Zombie' ? 'ZombieSpeedUp' : 'DevilSpeedUp') : e.mProp] = e.mValue;
        expect(got).toEqual(exp[i - 1]);
      }
    }
  });

  it('uses CMain.mFPS for the spawn intervals (menus run at 25)', () => {
    const { up } = newUpgrades({ fps: 50 });
    expect(up.mLevels[1].find((e: any) => e.mProp === 'Zombie_SpawnRate').mValue).toBe(50);
    expect(up.mLevels[1].find((e: any) => e.mProp === 'Devil_SpawnRate').mValue).toBe(500);
    expect(up.mLevels[100].find((e: any) => e.mProp === 'Devil_SpawnRate').mValue).toBe(401);
  });

  it('starts at level 1, multiplier x1, applies the level-1 parameters to Level', () => {
    const { up } = newUpgrades();
    expect(up.mLevel).toBe(1);
    expect(up.mMultiplier).toBe(1);
    expect(up.mMultipleKill).toBe(0);
    expect(up.Level.Zombie_SpawnRate).toBe(25);
    expect(up.Level.mSpawnCount_Zombie).toBe(25);
    expect(up.Level.mSpawnCount_Devil).toBe(250);
    expect(up.Level.mZombieCount).toBe(0);
    expect(up.CThing_Creature_Zombie.SpeedUp).toBeCloseTo(1.1, 12);
  });

  it('level 101+ repeats level 100 and says FOREVER', () => {
    const { up, world } = newUpgrades();
    up.mLevel = 101;
    expect(up.Level.Zombie_TotalCount).toBe(505);
    expect(world.calls.level.at(-1)).toBe('-+-+-+- LEVEL 101 (FOREVER) -+-+-+-');
    up.mLevel = 7;
    expect(world.calls.level.at(-1)).toBe('-+-+-+- LEVEL 7 -+-+-+-');
  });
});

describe('CUpgrades.GetTicks (multiplier decay timer)', () => {
  it('x1 lasts 75 ticks at 25 fps (divisor 100000.00000000003)', () => {
    const { up } = newUpgrades();
    (CMain as any).mFPS = 25;
    expect(up.GetTicks(1)).toBeCloseTo(75, 10);
    expect(up.GetTicks(1)).toBe(Math.pow(100, 2.5) / 100000.00000000003 * 72 + 3);
    expect(up.GetTicks(1)).toBeLessThan(75); // 74.99999999999997
  });

  it('follows (101 - min(m,100))^2.5 / 1e5 * (3 fps - 3) + 3', () => {
    const { up } = newUpgrades();
    (CMain as any).mFPS = 25;
    for (const m of [1, 2, 5, 10, 25, 50, 99, 100, 150, 999]) {
      const i = 101 - Math.min(m, 100);
      expect(up.GetTicks(m)).toBeCloseTo(Math.pow(i, 2.5) / 1e5 * 72 + 3, 9);
    }
    expect(up.GetTicks(100)).toBeCloseTo(3.00072, 9);
    expect(up.GetTicks(500)).toBe(up.GetTicks(100));
    (CMain as any).mFPS = 50; // game speed FAST
    expect(up.GetTicks(1)).toBeCloseTo(150, 9);
    (CMain as any).mFPS = 12.5; // SLOW
    expect(up.GetTicks(1)).toBeCloseTo(37.5, 9);
  });

  it('the multiplier drops by one when its timer runs out; the kill chain resets', () => {
    const { up } = newUpgrades();
    (CMain as any).mFPS = 25;
    up.LogKills(3);
    expect(up.mMultiplier).toBe(4);
    expect(up.mMultipleKill).toBe(3);
    const t = up.mMultiplierTick;
    for (let i = 0; i <= Math.ceil(t); i++) up.Process();
    expect(up.mMultiplier).toBe(3);
  });
});

describe('CUpgrades.SetDifficulty', () => {
  const cases: [number, number, number][] = [[0, 1, 1], [1, 10, 10], [2, 20, 30], [3, 35, 50]];
  for (const [d, level, mult] of cases) {
    it(`difficulty ${d} starts at level ${level}, multiplier x${mult}`, () => {
      const { up, world } = newUpgrades();
      up.SetDifficulty(d);
      expect(up.mLevel).toBe(level);
      expect(up.mMultiplier).toBe(mult);
      expect(world.mHud.mSilentMessages).toBe(false);
    });
  }

  it('Death Match: multiplier x200 (all upgrades), level stays 1', () => {
    const { up } = newUpgrades({ mode: 'DeathMatch' });
    up.SetDifficulty(3);
    expect(up.mLevel).toBe(1);
    expect(up.mMultiplier).toBe(200);
    expect(up.__get__mMultiplierList().every((e: any) => e.mActive === true)).toBe(true);
    W().CWorld.mGameMode = 'Single';
  });

  it('messages are silent while the start level/multiplier is applied', () => {
    const { up, world } = newUpgrades();
    const before = world.calls.level.length + world.calls.upgrade.length;
    up.SetDifficulty(2);
    expect(world.calls.level.length + world.calls.upgrade.length).toBe(before);
  });
});

describe('CUpgrades multiplier upgrade table (58 entries)', () => {
  const THRESHOLDS = [3, 5, 8, 10, 13, 15, 17, 18, 20, 21, 23, 26, 30, 31, 32, 33, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45,
    47, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 66, 68, 70, 72, 74, 76, 78, 80, 85, 90, 95, 100, 105,
    110, 120, 125];

  it('has 58 entries at the original thresholds, in index order', () => {
    const { up } = newUpgrades();
    const list = up.mMultiplierList;
    expect(list).toHaveLength(58);
    expect(list.map((e: any) => e.mIndex)).toEqual(THRESHOLDS);
    expect(list[0]).toMatchObject({ mClassID: 'CThing_Weapon_Pistol', mProp: 'FastFire', mValue: true, mName: 'Pistol+: Fast Fire' });
    expect(list[57]).toMatchObject({ mClassID: 'CThing_Weapon_Railgun', mProp: 'LongShot', mName: 'Railgun+: Long Shot', mIndex: 125 });
  });

  it('unlocks the new weapons at x5, 10, 15, 20, 30, 40, 50, 55, 70', () => {
    const { up } = newUpgrades();
    const nw = up.mMultiplierList.filter((e: any) => e.mClassID === 'CThing_Creature_Player');
    expect(nw.map((e: any) => [e.mIndex, e.mValue])).toEqual([
      [5, 'uzi'], [10, 'shotgun'], [15, 'barrel'], [20, 'grenade'], [30, 'fakewall'], [40, 'mine'], [50, 'rocket'],
      [55, 'chargepack'], [70, 'railgun'],
    ]);
    expect(nw.map((e: any) => e.mName)).toEqual([
      'New Weapon: UZI (Key 2)', 'New Weapon: Shotgun (Key 3)', 'New Weapon: Barrel (Key 4)', 'New Weapon: Grenade (Key 5)',
      'New Weapon: Fake walls (Key 6)', 'New Weapon: Claymore (Key 7)', 'New Weapon: Rocket (Key 8)',
      'New Weapon: Chargepack (Key 9)', 'New Weapon: Railgun (Key 0)',
    ]);
  });

  it('reaching x5 activates the UZI once, tells the players and the HUD', () => {
    const { up, world } = newUpgrades();
    world.calls.newWeapon.length = 0;
    for (let i = 0; i < 4; i++) up.mMultiplier = up.mMultiplier + 1;
    expect(up.mMultiplier).toBe(5);
    expect(up.CThing_Creature_Player.NW_uzi).toBe('uzi');
    expect(up.CThing_Weapon_Pistol.FastFire).toBe(true);
    expect(world.calls.newWeapon).toContain('uzi');
    expect(world.calls.upgrade).toContain('New Weapon: UZI (Key 2)');
    const n = world.calls.upgrade.length;
    up.mMultiplier = 4;
    up.mMultiplier = 5; // already active: not applied twice
    expect(world.calls.upgrade.length).toBe(n);
  });

  it('numeric level values (SpeedUp) never reach NewWeapon (deviation UPGRADE_NUMERIC_NEWWEAPON)', () => {
    const { up, world } = newUpgrades();
    world.calls.newWeapon.length = 0;
    up.mLevel = 2;
    expect(world.calls.newWeapon).toEqual([]);
    expect(up.CThing_Creature_Zombie.SpeedUp).toBeCloseTo(1.2, 12);
    expect(up.Level.Devil_Count).toBe(1);
  });

  it('ApplyUpgrade_Weapon derives stats from the original stats', () => {
    const { up } = newUpgrades();
    const w: any = { _CLASSID_: 'CThing_Weapon_UZI', mAuto: true, mFireRate: 4, mAmmo: 100, mTotalAmmo: 100, mDamage: 35, mWideShot: 0, mBiggerBang: 0, mRange: 8 };
    up.Register_Weapon(w);
    up.AddUpgrade(undefined, 'CThing_Weapon_UZI', 'DoubleAmmo', true);
    up.AddUpgrade(undefined, 'CThing_Weapon_UZI', 'RapidFire', true);
    up.ApplyUpgrade_Weapon(w);
    expect([w.mAmmo, w.mTotalAmmo, w.mFireRate]).toEqual([200, 200, 2]);
    up.AddUpgrade(undefined, 'CThing_Weapon_UZI', 'QuadAmmo', true);
    up.ApplyUpgrade_Weapon(w);
    expect(w.mTotalAmmo).toBe(400); // QuadAmmo wins over DoubleAmmo, from the ORIGINAL 100
  });
});
