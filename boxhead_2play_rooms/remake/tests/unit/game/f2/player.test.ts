// Lane F2: player weapon list (InitWeapons keys), RandomPickup cumulative chances (seeded RNG), weapon cycling,
// CThing_Collection.GetClosestPlayer running minimum, Coop KeepDistance.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, CMain, P, Thing, World, installFakes, makeWorld } from './f2Modules.ts';
import { mathRandom, seedRandom } from '../../../../src/engine/flash/rng.ts';
import { forIn } from '../../../../src/engine/flash/as2.ts';

let world: any;
beforeAll(() => installFakes());
beforeEach(() => {
  world = makeWorld(14, 10);
  (World.CWorld as any).mGameMode = 'Single';
});
afterEach(() => {
  (World.CWorld as any).mGameMode = 'Single';
});

function spawnPlayer(x: number, y: number, index = 0): any {
  const p = world.mThing_Collection.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(x, y), index));
  p.Process();
  return p;
}

const NAMES = ['pistol', 'uzi', 'shotgun', 'barrel', 'grenade', 'fakewall', 'mine', 'rocket', 'chargepack', 'railgun'];

describe('InitWeapons [BC @475335]', () => {
  it('mIndex = i, mKeyID = (i + 1) % 10, only the pistol is active and selected', () => {
    const p = spawnPlayer(3.5, 3.5);
    expect(p.mWeaponList.map((w: any) => [w.mIndex, w.mNameID, w.mKeyID, w.mActive])).toEqual(
      NAMES.map((n, i) => [i, n, (i + 1) % 10, n == 'pistol']),
    );
    expect(p.mWeapons.railgun.mClassID).toBe('CThing_Weapon_Railgun');
    expect(p.mWeapon_Current._CLASSID_).toBe('CThing_Weapon_Pistol');
    expect(p.mWeapon_Current.mThing_Collection).toBe(world.mThing_Collection);
    expect(world.messages).toContainEqual(['info', 'Pistol selected!', 0]);
    // Single-player key bindings SELECT0..SELECT9 [BC @472143].
    for (let i = 0; i < 10; i++) expect(p.mControls['SELECT' + i]).toBe(CMain.mInput['KEY_SELECT' + i]);
    expect([p.mLife, p.mMaxLife, p.mSpeed, p.mMass, p.mInvincible]).toEqual([200, 200, 0.16, 2, 200]);
    expect(p.mStateID).toBe('State_PlayerControl');
  });

  it('player 2 uses the "2" key set; in 2-player games the SELECT keys are not bound', () => {
    world = makeWorld(14, 10, { players: 2 });
    const p2 = spawnPlayer(5.5, 3.5, 1);
    expect(p2.mControl_PostFix).toBe('2');
    expect(p2.mControls.FIRE).toBe(CMain.mInput.KEY_FIRE2);
    expect(p2.mControls.SELECT1).toBeUndefined();
  });
});

describe('RandomPickup [BC @476024 / @476216 / @476416] cumulative chances', () => {
  it('chance_i = (1 - ammo/total) * 0.75 + 0.25 accumulated in for..in order; life = (1 - life/max) * sum', () => {
    const p = spawnPlayer(3.5, 3.5);
    for (const n of ['uzi', 'shotgun', 'rocket']) p.NewWeapon(n);
    p.mWeapons.uzi.mThing.mAmmo = 50; // 0.625
    p.mWeapons.shotgun.mThing.mAmmo = 20; // 0.25
    p.mWeapons.rocket.mThing.mAmmo = 0; // 1.0
    p.mLife = 100; // life chance 0.5 * sum
    // AS2 for..in over mWeapons = reverse creation order: railgun, chargepack, rocket, ..., shotgun, uzi, pistol.
    const order = forIn(p.mWeapons).filter((k) => p.mWeapons[k].mActive && k != 'pistol');
    expect(order).toEqual(['rocket', 'shotgun', 'uzi']);
    const table: [string, number][] = [['rocket', 1.0], ['shotgun', 1.25], ['uzi', 1.875], ['life', 1.875 + 0.5 * 1.875]];
    const total = table[3][1];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      seedRandom(seed);
      const r = mathRandom() * total;
      const expected = table.find(([, idx]) => r < idx)![0];
      // restore state for the call
      p.mLife = 100;
      for (const n of ['uzi', 'shotgun', 'rocket']) p.mWeapons[n].mThing.mAmmo = { uzi: 50, shotgun: 20, rocket: 0 }[n];
      const before = world.messages.length;
      seedRandom(seed);
      expect(p.RandomPickup()).toBe(true);
      const msg = world.messages[before];
      if (expected == 'life') {
        expect(msg).toEqual(['info', 'Life up!', 0]);
        expect(p.mLife).toBe(200);
      } else {
        expect(msg).toEqual(['info', 'Picked up ' + p.mWeapons[expected].mThing.mName, 0]);
        expect(p.mWeapons[expected].mThing.mAmmo).toBe(p.mWeapons[expected].mThing.mTotalAmmo); // refilled (new weapon object)
      }
      seen.add(expected);
    }
    expect([...seen].sort()).toEqual(['life', 'rocket', 'shotgun', 'uzi']);
  });

  it('only the pistol and full life -> nothing to pick (returns false)', () => {
    const p = spawnPlayer(3.5, 3.5);
    seedRandom(5);
    expect(p.RandomPickup()).toBe(false);
  });
});

describe('weapon cycling and selection', () => {
  it('NextWeapon / PrevWeapon skip inactive and empty weapons, wrapping around [BC @476992 / @477226]', () => {
    const p = spawnPlayer(3.5, 3.5);
    for (const n of ['shotgun', 'grenade', 'railgun']) p.NewWeapon(n);
    p.mWeapons.grenade.mThing.mAmmo = 0;
    expect(p.NextWeapon().mNameID).toBe('shotgun');
    expect(p.PrevWeapon().mNameID).toBe('railgun');
    p.SelectWeapon('railgun');
    expect(p.mWeapon_Current.mNameID).toBe('railgun');
    expect(p.NextWeapon().mNameID).toBe('pistol');
    expect(p.PrevWeapon().mNameID).toBe('shotgun');
  });

  it('SelectWeapon ignores inactive (never picked up) and empty weapons; message only in Single mode', () => {
    const p = spawnPlayer(3.5, 3.5);
    world.messages.length = 0;
    p.SelectWeapon('uzi'); // inactive, no mThing (AS2: undefined.WeaponEmpty() -> undefined)
    expect(p.mWeapon_Current.mNameID).toBe('pistol');
    p.NewWeapon('uzi');
    p.mWeapons.uzi.mThing.mAmmo = 0;
    p.SelectWeapon('uzi');
    expect(p.mWeapon_Current.mNameID).toBe('pistol');
    p.mWeapons.uzi.mThing.mAmmo = 5;
    (World.CWorld as any).mGameMode = 'Coop';
    p.SelectWeapon('uzi');
    expect(p.mWeapon_Current.mNameID).toBe('uzi');
    expect(world.messages).toEqual([]);
  });

  it('ResetWeapons empties every non-pistol weapon and selects the pistol', () => {
    const p = spawnPlayer(3.5, 3.5);
    p.NewWeapon('uzi');
    p.SelectWeapon('uzi');
    p.ResetWeapons();
    expect(p.mWeapons.uzi.mThing.mAmmo).toBe(0);
    expect(p.mWeapon_Current.mNameID).toBe('pistol');
  });

  it('a released SELECT key picks that weapon in State_PlayerControl', () => {
    const p = spawnPlayer(3.5, 3.5);
    p.NewWeapon('shotgun');
    CMain.mInput.KEY_SELECT3.released = true; // shotgun = index 2 -> key (2 + 1) % 10 = 3
    p.State_PlayerControl();
    expect(p.mWeapon_Current.mNameID).toBe('shotgun');
    // The animation name is computed BEFORE the weapon switch (statement order): one more tick of the pistol anim.
    expect(p.mCurrentAnim).toMatch(/^pistol(stand|walk)$/);
    p.State_PlayerControl();
    expect(p.mCurrentAnim).toMatch(/^shotgun(stand|walk)$/);
  });
});

describe('CThing_Collection.GetClosestPlayer [BC @276187..@276332] running minimum', () => {
  const fake = (id: number, x: number, y: number, flags = 0): any => ({ sUniqueID: 't' + id, _CLASSID_: 'CThing_Creature_Player', mFlags: flags, mPosition: P(x, y) });

  it('returns the nearest living player (not the last one)', () => {
    const c = world.mThing_Collection;
    const a = c.AddThing_Player(fake(1001, 2, 2));
    const b = c.AddThing_Player(fake(1002, 9, 9));
    expect(c.GetClosestPlayer(P(3, 3))).toBe(a);
    expect(c.GetClosestPlayer(P(8, 8))).toBe(b);
    a.mFlags = Thing.CThing.mFlag_DEAD;
    expect(c.GetClosestPlayer(P(3, 3))).toBe(b);
    b.mFlags = Thing.CThing.mFlag_DEAD;
    // All dead -> first key of the for..in (= the last added player).
    expect(c.GetClosestPlayer(P(3, 3))).toBe(b);
  });

  it('a single player is returned directly; GetOtherPlayer returns the other one', () => {
    const c = world.mThing_Collection;
    const a = c.AddThing_Player(fake(1001, 2, 2, Thing.CThing.mFlag_DEAD));
    expect(c.mThingCounters.CThing_Creature_Player).toBe(1);
    expect(c.GetClosestPlayer(P(9, 9))).toBe(a);
    const b = c.AddThing_Player(fake(1002, 9, 9));
    expect(c.GetOtherPlayer(a)).toBe(b);
    expect(c.GetOtherPlayer(b)).toBe(a);
  });
});

describe('Coop KeepDistance', () => {
  it('cancels the movement axis that would take the players more than 19 (x) / 13 (y) cells apart', () => {
    world = makeWorld(60, 40, { players: 2 });
    (World.CWorld as any).mGameMode = 'Coop';
    const p1 = spawnPlayer(2.5, 2.5, 0);
    const p2 = spawnPlayer(21.5, 15.5, 1);
    p2.mDelta = P(0.16, 0.16);
    p2.KeepDistance();
    expect([p2.mDelta.mX, p2.mDelta.mY]).toEqual([0, 0]);
    p2.mDelta = P(-0.16, -0.16);
    p2.KeepDistance();
    expect([p2.mDelta.mX, p2.mDelta.mY]).toEqual([-0.16, -0.16]);
    p1.mFlags |= Thing.CThing.mFlag_DEAD;
    p2.mDelta = P(0.16, 0.16);
    p2.KeepDistance();
    expect([p2.mDelta.mX, p2.mDelta.mY]).toEqual([0.16, 0.16]);
  });
});

describe('player death / respawn', () => {
  it('Dying -> Dead (fade, PlayerDead) -> Respawn with 125 invincible ticks, pistol only', () => {
    const p = spawnPlayer(3.5, 3.5);
    p.NewWeapon('uzi');
    const spawnAt = { mPosition: P(7.5, 5.5), mAngle: A(Math.PI / 2) };
    world.Spawn_Player_PositionObject = () => spawnAt;
    let dead = 0;
    world.PlayerDead = () => dead++;
    p.mLife = 0;
    p.CheckForDead();
    expect(p.mStateID).toBe('State_Dying');
    let guard = 0;
    while (p.mStateID != 'State_PlayerControl' && guard++ < 1000) p.Process();
    expect(guard).toBeLessThan(1000);
    expect(dead).toBeGreaterThan(0);
    // mInvincible = 25 * 5 = 125, already decremented once by the Process_Normal that ran State_Respawn.
    expect([p.mLife, p.mInvincible, p.mFlags, p.mAlpha]).toEqual([200, 124, Thing.CThing.mFlag_Collidable, 100]);
    expect([p.mPosition.mX, p.mPosition.mY]).toEqual([7.5, 5.5]);
    expect(p.mWeapons.uzi.mThing.mAmmo).toBe(0);
    expect(p.mWeapon_Current.mNameID).toBe('pistol');
    expect(world.mUpgrades.mPlayerCount).toBe(2);
  });
});
