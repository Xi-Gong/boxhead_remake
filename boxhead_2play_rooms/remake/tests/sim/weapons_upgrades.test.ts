// Lane X2: the 58 multiplier upgrades (World/CUpgrades.as InitLists, bytecode generated/disasm/World.CUpgrades.txt
// @543813..) checked through the REAL CUpgrades path (__set__mMultiplier one step at a time, as SetDifficulty /
// LogKills do) against an independent model of ApplyUpgrade_Weapon (stats always derived from the ORIGINAL stats), and
// behaviourally (fire patterns, pellet fans, ranges, explosion fan-outs).
import { describe, expect, it } from 'vitest';
import { KEYS } from './harness.ts';
import {
  deg, holdMultiplier, ofClass, openFloorGame, placePlayer, raiseMultiplier, recordAdds, recordMessages, select,
  tapFire,
} from './fxkit.ts';
import { Thing } from '../../src/game/packages.ts';

/** [multiplier, class, prop, value, HUD name] — transcribed from the bytecode listing, NOT from src/game. */
const TABLE: [number, string, string, string | true, string][] = [
  [3, 'CThing_Weapon_Pistol', 'FastFire', true, 'Pistol+: Fast Fire'],
  [5, 'CThing_Creature_Player', 'NW_uzi', 'uzi', 'New Weapon: UZI (Key 2)'],
  [8, 'CThing_Weapon_Pistol', 'DoubleDamage', true, 'Pistol+: Double Damage'],
  [10, 'CThing_Creature_Player', 'NW_shotgun', 'shotgun', 'New Weapon: Shotgun (Key 3)'],
  [13, 'CThing_Weapon_UZI', 'RapidFire', true, 'UZI+: Rapid Fire'],
  [15, 'CThing_Creature_Player', 'NW_barrel', 'barrel', 'New Weapon: Barrel (Key 4)'],
  [17, 'CThing_Weapon_UZI', 'DoubleAmmo', true, 'UZI+: Double Ammo'],
  [18, 'CThing_Weapon_Shotgun', 'FastFire', true, 'Shotgun+: Fast Fire'],
  [20, 'CThing_Creature_Player', 'NW_grenade', 'grenade', 'New Weapon: Grenade (Key 5)'],
  [21, 'CThing_Weapon_Shotgun', 'DoubleAmmo', true, 'Shotgun+: Double Ammo'],
  [23, 'CThing_Weapon_UZI', 'LongShot', true, 'UZI+: Long Shot'],
  [26, 'CThing_Weapon_Barrel', 'DoubleAmmo', true, 'Barrel+: Double Ammo'],
  [30, 'CThing_Creature_Player', 'NW_fakewall', 'fakewall', 'New Weapon: Fake walls (Key 6)'],
  [31, 'CThing_Weapon_Shotgun', 'WideShot', true, 'Shotgun+: Wide Shot'],
  [32, 'CThing_Object_Barrel', 'BigBang', true, 'Barrel+: Big Bang'],
  [33, 'CThing_Weapon_Grenade', 'ClusterExplode', true, 'Grenade+: Cluster Explode'],
  [35, 'CThing_Weapon_Shotgun', 'LongShot', true, 'Shotgun+: Long Shot'],
  [36, 'CThing_Weapon_Barrel', 'QuadAmmo', true, 'Barrel+: Quad Ammo'],
  [37, 'CThing_Weapon_FakeWall', 'DoubleAmmo', true, 'Fake Wall+: Double Ammo'],
  [39, 'CThing_Weapon_UZI', 'QuadAmmo', true, 'UZI+: Quad Ammo'],
  [40, 'CThing_Creature_Player', 'NW_mine', 'mine', 'New Weapon: Claymore (Key 7)'],
  [41, 'CThing_Weapon_Shotgun', 'QuadAmmo', true, 'Shotgun+: Quad Ammo'],
  [42, 'CThing_Weapon_Grenade', 'DoubleAmmo', true, 'Grenade+: Double Ammo'],
  [43, 'CThing_Weapon_Shotgun', 'RapidFire', true, 'Shotgun+: Rapid Fire'],
  [44, 'CThing_Object_Barrel', 'BiggerBang', true, 'Barrel+: Bigger Bang'],
  [45, 'CThing_Weapon_Grenade', 'BigBang', true, 'Grenade+: Big Bang'],
  [47, 'CThing_Object_Mine', 'ClusterExplode', true, 'Claymore+: Cluster Explode'],
  [48, 'CThing_Weapon_UZI', 'DoubleDamage', true, 'UZI+: Double Damage'],
  [50, 'CThing_Creature_Player', 'NW_rocket', 'rocket', 'New Weapon: Rocket (Key 8)'],
  [51, 'CThing_Weapon_Shotgun', 'WiderShot', true, 'Shotgun+: Wider Shot'],
  [52, 'CThing_Weapon_Grenade', 'QuadAmmo', true, 'Grenade+: Quad Ammo'],
  [53, 'CThing_Weapon_FakeWall', 'QuadAmmo', true, 'Fake Wall+: Quad Ammo'],
  [54, 'CThing_Weapon_Mine', 'DoubleAmmo', true, 'Claymore+: Double Ammo'],
  [55, 'CThing_Creature_Player', 'NW_chargepack', 'chargepack', 'New Weapon: Chargepack (Key 9)'],
  [56, 'CThing_Weapon_Shotgun', 'DoubleDamage', true, 'Shotgun+: Double Damage'],
  [57, 'CThing_Weapon_Grenade', 'BiggerBang', true, 'Grenade+: Bigger Bang'],
  [58, 'CThing_Object_Mine', 'BigBang', true, 'Claymore+: Big Bang'],
  [59, 'CThing_Weapon_Rocket', 'FastFire', true, 'Rocket+: Fast Fire'],
  [61, 'CThing_Weapon_UZI', 'InfinateRange', true, 'UZI+: Infinate Range'],
  [62, 'CThing_Object_Mine', 'BiggerBang', true, 'Claymore+: Bigger Bang'],
  [63, 'CThing_Object_ChargePack', 'ClusterExplode', true, 'Charge Pack+: Cluster Explode'],
  [64, 'CThing_Weapon_Mine', 'QuadAmmo', true, 'Claymore+: Quad Ammo'],
  [66, 'CThing_Weapon_Rocket', 'DoubleAmmo', true, 'Rocket+: Double Ammo'],
  [68, 'CThing_Weapon_ChargePack', 'DoubleAmmo', true, 'Charge Pack+: Double Ammo'],
  [70, 'CThing_Creature_Player', 'NW_railgun', 'railgun', 'New Weapon: Railgun (Key 0)'],
  [72, 'CThing_Weapon_Rocket', 'BigBang', true, 'Rocket+: Big Bang'],
  [74, 'CThing_Object_ChargePack', 'BigBang', true, 'Charge Pack+: Big Bang'],
  [76, 'CThing_Weapon_ChargePack', 'QuadAmmo', true, 'Charge Pack+: Quad Ammo'],
  [78, 'CThing_Weapon_Railgun', 'FastFire', true, 'Railgun+: Fast Fire'],
  [80, 'CThing_Weapon_Railgun', 'DoubleAmmo', true, 'Railgun+: Double Ammo'],
  [85, 'CThing_Weapon_Rocket', 'QuadAmmo', true, 'Rocket+: Quad Ammo'],
  [90, 'CThing_Weapon_UZI', 'QuadDamage', true, 'UZI+: Quad Damage'],
  [95, 'CThing_Object_ChargePack', 'BiggerBang', true, 'Charge Pack+: Bigger Bang'],
  [100, 'CThing_Weapon_Railgun', 'RapidFire', true, 'Railgun+: Rapid Fire'],
  [105, 'CThing_Weapon_Rocket', 'BiggerBang', true, 'Rocket+: Bigger Bang'],
  [110, 'CThing_Weapon_Railgun', 'QuadAmmo', true, 'Railgun+: Quad Ammo'],
  [120, 'CThing_Weapon_Rocket', 'RapidFire', true, 'Rocket+: Rapid Fire'],
  [125, 'CThing_Weapon_Railgun', 'LongShot', true, 'Railgun+: Long Shot'],
];

const ORIGINAL: Record<string, { rate: number; ammo: number; dmg: number; range: number | undefined; auto: boolean }> = {
  CThing_Weapon_Pistol: { rate: 8, ammo: 999999, dmg: 26, range: 8, auto: false },
  CThing_Weapon_UZI: { rate: 4, ammo: 100, dmg: 35, range: 8, auto: true },
  CThing_Weapon_Shotgun: { rate: 12, ammo: 20, dmg: 51, range: 7, auto: false },
  CThing_Weapon_Barrel: { rate: 1, ammo: 10, dmg: 150, range: undefined, auto: false },
  CThing_Weapon_Grenade: { rate: 12, ammo: 20, dmg: 150, range: 6, auto: false },
  CThing_Weapon_FakeWall: { rate: 1, ammo: 5, dmg: 100, range: undefined, auto: false },
  CThing_Weapon_Mine: { rate: 1, ammo: 10, dmg: 100, range: undefined, auto: false },
  CThing_Weapon_Rocket: { rate: 12, ammo: 20, dmg: 250, range: undefined, auto: false },
  CThing_Weapon_ChargePack: { rate: 1, ammo: 10, dmg: 150, range: undefined, auto: false },
  CThing_Weapon_Railgun: { rate: 5, ammo: 15, dmg: 100, range: 10, auto: false },
};

/** Expected weapon stats after ApplyUpgrade_Weapon with the upgrades active at multiplier m. */
function model(cls: string, m: number): { dmg: number; rate: number; auto: boolean; total: number; range: number | undefined; wide: number | undefined; bang: number | undefined; cluster: number | undefined } {
  const o = ORIGINAL[cls] ?? { rate: NaN, ammo: NaN, dmg: NaN, range: undefined, auto: false };
  const on = new Set(TABLE.filter(([i, c]) => i <= m && c === cls).map(([, , p]) => p));
  return {
    dmg: o.dmg * (on.has('QuadDamage') ? 4 : on.has('DoubleDamage') ? 2 : 1),
    rate: on.has('RapidFire') ? Math.round(Math.max(o.rate / 4, 2)) : o.rate,
    auto: on.has('RapidFire') || on.has('FastFire') ? true : o.auto,
    total: o.ammo * (on.has('QuadAmmo') ? 4 : on.has('DoubleAmmo') ? 2 : 1),
    range: on.has('InfinateRange') ? 100 : on.has('LongShot') ? o.range! * 1.5 : o.range,
    wide: cls === 'CThing_Weapon_Shotgun' ? (on.has('WiderShot') ? 2 : on.has('WideShot') ? 1 : 0) : undefined,
    bang: on.has('BiggerBang') ? 2 : on.has('BigBang') ? 1 : undefined,
    cluster: on.has('ClusterExplode') ? 1 : undefined,
  };
}

describe('the upgrade table', () => {
  it('equals the 58-entry bytecode table, in order, with the HUD names', () => {
    const g = openFloorGame();
    const list = g.world().mUpgrades.__get__mMultiplierList();
    expect(list.map((e: any) => [e.mIndex, e.mClassID, e.mProp, e.mValue, e.mName])).toEqual(TABLE);
    expect(g.errors).toEqual([]);
  });
});

describe('raising the multiplier 1 -> 125 one kill at a time', () => {
  it('activates each upgrade once at its threshold (green HUD message), unlocks weapons, and the weapon stats follow the model', () => {
    const g = openFloorGame();
    holdMultiplier(g);
    const msgs = recordMessages(g);
    const u = g.world().mUpgrades;
    const p = g.players()[0];
    for (let m = 2; m <= 125; m++) {
      u.__set__mMultiplier(m);
      holdMultiplier(g);
      const now = TABLE.filter(([i]) => i === m).map(([, , , , n]) => n);
      expect(msgs.filter((x) => x.color === 0x00ff00 && !x.silent).map((x) => x.text)).toEqual(TABLE.filter(([i]) => i <= m).map(([, , , , n]) => n));
      void now;
      // weapons unlocked so far
      const unlocked = ['pistol', ...TABLE.filter(([i, c]) => i <= m && c === 'CThing_Creature_Player').map(([, , , v]) => v as string)];
      expect(p.mWeaponList.filter((w: any) => w.mActive).map((w: any) => w.mNameID).sort()).toEqual(unlocked.sort());
      for (const w of p.mWeaponList) {
        if (!w.mActive) continue;
        const t = w.mThing;
        u.ApplyUpgrade_Weapon(t); // what the weapon's own Update() does every tick it is selected
        const e = model(t._CLASSID_, m);
        const got = { dmg: t.mDamage, rate: t.mFireRate, auto: !!t.mAuto, total: t.mTotalAmmo, range: t.mRange, wide: t.mWideShot, bang: t.mBiggerBang, cluster: t.mClusterExplode };
        expect(got, `${t._CLASSID_} at x${m}`).toEqual({ ...e, bang: e.bang ?? t.mBiggerBang, cluster: e.cluster ?? t.mClusterExplode });
      }
      // object upgrades (applied to every new barrel / mine / charge pack)
      for (const cls of ['CThing_Object_Barrel', 'CThing_Object_Mine', 'CThing_Object_ChargePack']) {
        const e = model(cls, m);
        const obj: any = { _CLASSID_: cls, mBiggerBang: 0, mClusterExplode: 0 };
        u.Register_Object(obj);
        expect([obj.mBiggerBang, obj.mClusterExplode], `${cls} at x${m}`).toEqual([e.bang ?? 0, e.cluster ?? 0]);
      }
    }
    expect(g.errors).toEqual([]);
  });

  it('an ammo upgrade REFILLS the weapon when it is next re-applied (stats are rebuilt from the original stats)', () => {
    const g = openFloorGame();
    raiseMultiplier(g, 16);
    holdMultiplier(g);
    const w = select(g, 'uzi');
    g.tick(1);
    w.mAmmo = 3;
    g.tick(1);
    expect(w.mAmmo).toBe(3); // nothing new for the UZI: no re-apply
    raiseMultiplier(g, 17); // UZI+: Double Ammo
    holdMultiplier(g);
    g.tick(1);
    expect([w.mAmmo, w.mTotalAmmo]).toEqual([200, 200]);
    expect(g.errors).toEqual([]);
  });
});

describe('upgrade behaviour in play', () => {
  it('Pistol FastFire (x3): holding fire repeats every 8 ticks; DoubleDamage (x8): 52 per bullet', () => {
    const g = openFloorGame();
    raiseMultiplier(g, 8);
    holdMultiplier(g);
    const adds = recordAdds(g);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(24);
    g.keyUp(KEYS.P1.FIRE);
    const b = ofClass(adds, 'CThing_Shot_Bullet');
    expect(b).toHaveLength(3);
    expect(b.every((x) => x.mDamage === 52)).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('UZI RapidFire (x13): a bullet every 2 ticks; LongShot (x23): range 12; InfinateRange (x61): range 100', () => {
    const g = openFloorGame();
    placePlayer(g, 1.5, 8.5, 0);
    for (const [m, perTick, range] of [[13, 2, 8], [23, 2, 12], [61, 2, 100]] as const) {
      raiseMultiplier(g, m);
      holdMultiplier(g);
      const w = select(g, 'uzi');
      g.tick(1);
      w.mAmmo = 100;
      const adds = recordAdds(g);
      g.keyDown(KEYS.P1.FIRE);
      g.tick(20);
      g.keyUp(KEYS.P1.FIRE);
      const b = ofClass(adds, 'CThing_Shot_Bullet');
      expect(b.length, `x${m}`).toBe(20 / perTick);
      expect(w.mRange).toBe(range);
      // the shot's destination: start + range (shortened by the far wall at x = 21 for ranges > 19)
      const reach = b[0].mDestination.mX - b[0].mPosition.mX;
      expect(reach, `x${m}`).toBeLessThanOrEqual(Math.min(range, 20) + 0.5);
      if (range <= 12) expect(reach, `x${m}`).toBeGreaterThan(range - 1);
      g.world().mThing_Collection.AddThing = Object.getPrototypeOf(g.world().mThing_Collection).AddThing;
      g.tick(5);
    }
    expect(g.errors).toEqual([]);
  });

  it('Shotgun WideShot (x31): 5 pellets at 0, +-2.5, +-5 deg, the outer pair one tick late; WiderShot (x51): +-3.75, +-7.5', () => {
    const g = openFloorGame();
    for (const [m, step] of [[31, 2.5], [51, 3.75]] as const) {
      raiseMultiplier(g, m);
      holdMultiplier(g);
      select(g, 'shotgun');
      g.tick(14);
      const adds = recordAdds(g);
      tapFire(g);
      const pel = ofClass(adds, 'CThing_Shot_Bullet');
      expect(pel.map((b) => [deg(b.mAngle.mAngle), b.mDelay]).sort((a, b) => (a[0] as number) - (b[0] as number)))
        .toEqual([[-2 * step, true], [-step, false], [0, false], [step, false], [2 * step, true]]);
      g.world().mThing_Collection.AddThing = Object.getPrototypeOf(g.world().mThing_Collection).AddThing;
    }
    expect(g.errors).toEqual([]);
  });

  it('Shotgun RapidFire (x43): automatic, every 3 ticks', () => {
    const g = openFloorGame();
    raiseMultiplier(g, 43);
    holdMultiplier(g);
    const w = select(g, 'shotgun');
    g.tick(1);
    expect([w.mAuto, w.mFireRate]).toEqual([true, 3]);
    const adds = recordAdds(g);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(12);
    g.keyUp(KEYS.P1.FIRE);
    expect(ofClass(adds, 'CThing_Effect_MuzzleFlash')).toHaveLength(4);
    expect(g.errors).toEqual([]);
  });

  it('Railgun RapidFire (x100): every 2 ticks; LongShot (x125): range 15', () => {
    const g = openFloorGame();
    raiseMultiplier(g, 125);
    holdMultiplier(g);
    const w = select(g, 'railgun');
    g.tick(1);
    expect([w.mAuto, w.mFireRate, w.mRange, w.mTotalAmmo]).toEqual([true, 2, 15, 60]);
    expect(g.errors).toEqual([]);
  });
});

describe('explosion upgrades (ClusterExplode / BigBang / BiggerBang)', () => {
  // CThing_Effect_Explosion.Process_Init [BC @301615..@302189]: cluster -> 4 shells (one per quadrant);
  // BigBang (1) -> 2 extra explosions, BiggerBang (2) -> 3, around the centre, delayed 2..5 ticks.
  const run = (m: number, weapon: string): { shells: number; extra: number; delays: number[] } => {
    const g = openFloorGame();
    // no map barrels: the padded square of an explosion would chain them (tested in fx_effects)
    for (const b of g.things().filter((t) => t._CLASSID_ === 'CThing_Object_Barrel')) b.Delete();
    g.tick(1);
    raiseMultiplier(g, m);
    holdMultiplier(g);
    placePlayer(g, 4.5, 9.5, 0);
    select(g, weapon);
    g.tick(1);
    const adds = recordAdds(g);
    if (weapon === 'grenade') {
      g.keyDown(KEYS.P1.FIRE);
      g.tick(2);
      g.keyUp(KEYS.P1.FIRE);
      g.tick(64);
    } else if (weapon === 'rocket') {
      placePlayer(g, 18.5, 9.5, 0);
      g.tick(1);
      tapFire(g);
      g.tick(8);
    } else {
      tapFire(g); // place under the player
      placePlayer(g, 1.5, 9.5, 0);
      if (weapon === 'mine') {
        // a zombie steps on it
        const z = new Thing.Creature.CThing_Creature_Zombie(new Thing.Math.CThing_Position(4.5, 9.5, 0));
        g.world().mThing_Collection.AddThing(z);
        g.tick(60);
      } else {
        g.tick(2);
        tapFire(g); // detonate
        g.tick(10);
      }
    }
    const ex = ofClass(adds, 'CThing_Effect_Explosion');
    expect(g.errors).toEqual([]);
    return { shells: ofClass(adds, 'CThing_Shot_ClusterShell').length, extra: ex.length - 1, delays: ex.slice(1).map((e) => e.mDelay) };
  };

  for (const [weapon, m, shells, extra] of [
    ['grenade', 32, 0, 0], ['grenade', 33, 4, 0], ['grenade', 45, 4, 2], ['grenade', 57, 4, 3],
    ['chargepack', 62, 0, 0], ['chargepack', 63, 4, 0], ['chargepack', 74, 4, 2], ['chargepack', 95, 4, 3],
    ['rocket', 71, 0, 0], ['rocket', 72, 0, 2], ['rocket', 105, 0, 3],
    ['mine', 46, 0, 0], ['mine', 47, 4, 0], ['mine', 58, 4, 2], ['mine', 62, 4, 3],
  ] as const) {
    it(`${weapon} at x${m}: ${shells} cluster shells, ${extra} extra explosions`, () => {
      const r = run(m, weapon);
      expect(r.shells).toBe(shells);
      // counted before the cluster shells (16..23 ticks) explode on their own
      expect(r.extra, JSON.stringify(r)).toBe(extra);
      expect(r.delays.every((d) => d >= -1 && d <= 5)).toBe(true);
    });
  }
});
