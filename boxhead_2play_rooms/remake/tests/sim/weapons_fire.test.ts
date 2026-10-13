// Lane X2: every player weapon fired through the REAL input path (fire key latch -> CThing_Weapon.Update ->
// Fire) in a running game: shots / objects created, ammo, fire rate (press / auto / on-release), muzzle flash,
// sounds (sample + volume), placement rules, out-of-ammo switching, HUD ammo text.
// Stats: plan appendix D, bytecode generated/disasm/Thing.Weapon.*.txt.
import { describe, expect, it } from 'vitest';
import { KEYS } from './harness.ts';
import {
  deg, holdMultiplier, live, ofClass, openFloorGame, placePlayer, raiseMultiplier, recordAdds, recordMessages,
  recordSounds, select, tapFire, things,
} from './fxkit.ts';
import { CMain, Thing } from '../../src/game/packages.ts';

const armed = (mult = 70): ReturnType<typeof openFloorGame> => {
  const g = openFloorGame();
  raiseMultiplier(g, mult);
  holdMultiplier(g);
  return g;
};

/** select + one tick: the stance animation (and with it the gun position) follows the weapon one tick later. */
const ready = (g: ReturnType<typeof openFloorGame>, name: string): any => {
  const w = select(g, name);
  g.tick(1);
  return w;
};

describe('weapon stats (constructors, bytecode)', () => {
  it('fire rate / ammo / damage / range / auto / on-release / names of the 10 weapons', () => {
    const g = armed();
    const p = g.players()[0];
    const stats = Object.fromEntries(p.mWeaponList.map((w: any) => {
      const t = w.mThing;
      const o = g.world().mUpgrades[t._CLASSID_].mOriginalStats;
      return [w.mNameID, [o.mFireRate, o.mTotalAmmo, o.mDamage, o.mRange, !!o.mAuto, !!t.mOnRelease, t.mName, t.mShortName, w.mKeyID]];
    }));
    expect(stats).toEqual({
      pistol: [8, 999999, 26, 8, false, false, 'Pistol', 'Pistol', 1],
      uzi: [4, 100, 35, 8, true, false, 'UZI', 'UZI', 2],
      shotgun: [12, 20, 51, 7, false, false, 'Shotgun', 'Shotgun', 3],
      barrel: [1, 10, 150, undefined, false, false, 'Barrels', 'Barrels', 4],
      grenade: [12, 20, 150, 6, false, true, 'Grenades', 'Grenades', 5],
      fakewall: [1, 5, 100, undefined, false, false, 'Fake Walls', 'Walls', 6],
      mine: [1, 10, 100, undefined, false, false, 'Claymore', 'Mines', 7],
      rocket: [12, 20, 250, undefined, false, false, 'Rocket Launcher', 'Rockets', 8],
      chargepack: [1, 10, 150, undefined, false, false, 'Charge Packs', 'Charges', 9],
      railgun: [5, 15, 100, 10, false, false, 'Railgun', 'Railgun', 0],
    });
    expect(g.errors).toEqual([]);
  });
});

describe('pistol (x1, no upgrades)', () => {
  it('one bullet + muzzle flash per press, 8-tick cooldown, infinite ammo, Weapon.Pistol.Fire at volume 100', () => {
    const g = openFloorGame();
    const sounds = recordSounds(g);
    const adds = recordAdds(g);
    const p = g.players()[0];
    expect(p.mWeapon_Current.mNameID).toBe('pistol');
    g.keyDown(KEYS.P1.FIRE);
    g.tick(1);
    const bullets = ofClass(adds, 'CThing_Shot_Bullet');
    const flashes = ofClass(adds, 'CThing_Effect_MuzzleFlash');
    expect(bullets).toHaveLength(1);
    expect(flashes).toHaveLength(1);
    const b = bullets[0];
    expect(b.mDamage).toBe(26);
    expect(b.mParent).toBe(p);
    expect(b.mDelay).toBe(false);
    // the hit-scan range (literal 8 in CThing_Weapon_Pistol.Fire) along the facing direction; nothing in the way
    expect(b.mDestination.Distance2D(p.GetWeaponPosition())).toBeGreaterThan(7.4);
    expect(flashes[0].mcDrawObject).toBe((Thing.Weapon.CThing_Weapon_Pistol as any).mcMuzzleFlash);
    expect(sounds.map((s) => [s.name, s.volume, s.pan])).toEqual([['Weapon_Pistol_Fire_wav', 100, 0]]);
    // holding the key does not fire again (semi-automatic)
    g.tick(20);
    expect(ofClass(adds, 'CThing_Shot_Bullet')).toHaveLength(1);
    g.keyUp(KEYS.P1.FIRE);
    g.tick(1);
    // pressing every tick for 24 ticks: one shot per 8 ticks (a press during the cooldown stays latched)
    adds.length = 0;
    for (let i = 0; i < 24; i++) {
      g.keyDown(KEYS.P1.FIRE);
      g.tick(1);
      g.keyUp(KEYS.P1.FIRE);
    }
    expect(ofClass(adds, 'CThing_Shot_Bullet')).toHaveLength(3);
    expect(p.mWeapon_Current.mAmmo).toBe(999999);
    expect(g.errors).toEqual([]);
  });

  it('muzzle flash lives exactly one tick (processed once, drawn once); a bullet tracer two ticks', () => {
    const g = openFloorGame();
    const adds = recordAdds(g);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(1);
    g.keyUp(KEYS.P1.FIRE);
    const flash = ofClass(adds, 'CThing_Effect_MuzzleFlash')[0];
    const b = ofClass(adds, 'CThing_Shot_Bullet')[0];
    expect(flash.Process).toBe(flash.Process_Normal);
    expect(b.Process).toBe(b.Process_Init);
    g.tick(1); // first processing tick: the flash registers in the mapwho and deletes itself; the tracer starts
    expect(flash.Process).toBeUndefined();
    expect(flash.mCellID).toBeDefined();
    expect(b.mLife).toBe(1);
    g.tick(1);
    expect(flash.mCellID).toBeUndefined(); // disposed
    expect(b.mLife).toBe(0);
    expect(b.Process).toBeUndefined();
    expect(g.errors).toEqual([]);
  });
});

describe('UZI', () => {
  it('automatic: one bullet every 4 ticks while held, 100 rounds, 35 dmg, Weapon.UZI.Fire', () => {
    const g = armed(5);
    const sounds = recordSounds(g);
    const w = ready(g, 'uzi');
    const adds = recordAdds(g);
    expect([w.mNameID, w.mAmmo, w.mAuto, w.mFireRate]).toEqual(['uzi', 100, true, 4]);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(20);
    g.keyUp(KEYS.P1.FIRE);
    expect(ofClass(adds, 'CThing_Shot_Bullet')).toHaveLength(5);
    expect(ofClass(adds, 'CThing_Effect_MuzzleFlash')).toHaveLength(5);
    expect(w.mAmmo).toBe(95);
    expect(sounds.filter((s) => s.name === 'Weapon_UZI_Fire_wav')).toHaveLength(5);
    expect(ofClass(adds, 'CThing_Shot_Bullet').every((b) => b.mDamage === 35)).toBe(true);
    expect(ofClass(adds, 'CThing_Effect_MuzzleFlash').every((f) => f.mcDrawObject === (Thing.Weapon.CThing_Weapon_UZI as any).mcMuzzleFlash)).toBe(true);
    expect(g.errors).toEqual([]);
  });
});

describe('shotgun', () => {
  it('3 pellets (0, +-1.25 deg), 51 damage, range 7, 20 shells, 12-tick cooldown', () => {
    const g = armed(10);
    const sounds = recordSounds(g);
    const w = ready(g, 'shotgun');
    const adds = recordAdds(g);
    tapFire(g);
    const pellets = ofClass(adds, 'CThing_Shot_Bullet');
    expect(pellets).toHaveLength(3);
    expect(pellets.map((b) => deg(b.mAngle.mAngle)).sort((a, b) => a - b)).toEqual([-1.25, 0, 1.25]);
    expect(pellets.every((b) => b.mDamage === 51 && b.mDelay === false)).toBe(true);
    expect(w.mAmmo).toBe(19);
    expect(ofClass(adds, 'CThing_Effect_MuzzleFlash')).toHaveLength(1);
    expect(sounds.filter((s) => s.name === 'Weapon_Shotgun_Fire_wav')).toHaveLength(1);
    // cooldown 12 ticks: pressing again right away is latched and fires 12 ticks after the first shot
    adds.length = 0;
    g.keyDown(KEYS.P1.FIRE);
    g.tick(9);
    expect(ofClass(adds, 'CThing_Shot_Bullet')).toHaveLength(0);
    g.tick(2);
    g.keyUp(KEYS.P1.FIRE);
    expect(ofClass(adds, 'CThing_Shot_Bullet')).toHaveLength(3);
    expect(g.errors).toEqual([]);
  });
});

describe('placed objects (barrel, fake wall, mine, charge pack)', () => {
  for (const [weapon, cls, mult, ammo, sound] of [
    ['barrel', 'CThing_Object_Barrel', 15, 10, 'Object_Barrel_Place_wav'],
    ['fakewall', 'CThing_Object_Wall', 30, 5, 'Object_Barrel_Place_wav'],
    ['mine', 'CThing_Object_Mine', 40, 10, 'Weapon_Mine_Place_wav'],
    ['chargepack', 'CThing_Object_ChargePack', 55, 10, 'Weapon_Mine_Place_wav'],
  ] as const) {
    it(`${weapon}: one ${cls} per press at the centre of the player's own cell (no gun node in the stance), ${ammo} in stock, ${sound}`, () => {
      const g = armed(mult);
      const sounds = recordSounds(g);
      const p = placePlayer(g, 6.3, 8.7, 0);
      const w = ready(g, weapon);
      const adds = recordAdds(g);
      expect(w.mAmmo).toBe(ammo);
      tapFire(g);
      const placed = ofClass(adds, cls);
      expect(placed).toHaveLength(1);
      expect([placed[0].mPosition.mX, placed[0].mPosition.mY]).toEqual([6.5, 8.5]);
      expect(placed[0].mParent).toBe(p);
      expect(w.mAmmo).toBe(ammo - 1);
      expect(sounds.map((s) => s.name)).toEqual([sound]);
      // a second press on the same cell (player + object = 2 children) places nothing
      // (charge pack: the second press detonates instead, see the charge pack test)
      if (weapon !== 'chargepack') {
        tapFire(g);
        expect(ofClass(adds, cls)).toHaveLength(1);
        expect(w.mAmmo).toBe(ammo - 1);
      }
      expect(g.errors).toEqual([]);
    });
  }

  it('the first press right after switching uses the previous stance\'s gun position (faithful): one cell ahead', () => {
    const g = armed(15);
    placePlayer(g, 6.5, 8.5, 0);
    select(g, 'barrel');
    const adds = recordAdds(g);
    tapFire(g);
    expect(ofClass(adds, 'CThing_Object_Barrel').map((b) => b.mPosition.mX)).toEqual([7.5]);
    expect(g.errors).toEqual([]);
  });

  // a wall grown in Process_GrowRadius keeps the overshoot (0.05 steps up to >= 0.48 -> 0.5) and never gets the 0.42 of
  // Process_Normal_Init (faithful oddity); a barrel is reset to 0.42.
  it('barrel / wall under the player stay non-collidable until he leaves the cell, then grow their radius', () => {
    const g = armed(30);
    for (const [weapon, cls, radius, after] of [['barrel', 'CThing_Object_Barrel', 0.42, 'Process_Normal'], ['fakewall', 'CThing_Object_Wall', 0.5, 'Process_Normal']] as const) {
      placePlayer(g, 6.5, 8.5, 0);
      ready(g, weapon);
      const adds = recordAdds(g);
      tapFire(g);
      const b = ofClass(adds, cls)[0];
      expect(b.Process).toBe(b.Process_PlayerOnCell);
      expect(b.mFlags & Thing.CThing.mFlag_Collidable).toBe(0);
      expect(g.world().mMap.GetCell(6.5, 8.5).mCollide & 128).toBe(128); // Object flag set at once
      placePlayer(g, 3.5, 8.5, 0);
      g.tick(2);
      expect(b.mFlags & Thing.CThing.mFlag_Collidable).toBe(Thing.CThing.mFlag_Collidable);
      g.tick(12);
      expect(b.mRadius).toBeCloseTo(radius, 9);
      // the wall grows to 0.48 then wakes up (Process_Normal -> no affects -> Process_Sleep)
      // both end in Process_Normal (a wall only goes to sleep after processing affects)
      expect(b.Process?.name).toBe(after);
      b.Delete();
      g.tick(2);
    }
    expect(g.errors).toEqual([]);
  });
});

describe('charge pack', () => {
  it('press = place, next press = detonate every own pack (Object.Mine.Detonate, CMain.mFPS/10 ticks later boom)', () => {
    const g = armed(55);
    const sounds = recordSounds(g);
    // far from the map barrels (x 9.5 / 12.5): the padded square of a 2.25 explosion reaches 1.5 cells further
    placePlayer(g, 3.5, 9.5, 0);
    const w = ready(g, 'chargepack');
    const adds = recordAdds(g);
    tapFire(g);
    const pack = ofClass(adds, 'CThing_Object_ChargePack')[0];
    expect(pack).toBeDefined();
    expect(w.mDetonate).toBe(true);
    expect(w.WeaponEmpty()).toBe(false);
    placePlayer(g, 6.5, 9.5, 0);
    g.tick(1);
    tapFire(g); // detonate
    expect(w.mDetonate).toBe(false);
    expect(sounds.map((s) => s.name)).toEqual(['Weapon_Mine_Place_wav', 'Object_Mine_Detonate_wav']);
    g.tick(Math.ceil(CMain.mFPS / 10) + 2);
    expect(pack.Process).toBeUndefined();
    const ex = ofClass(adds, 'CThing_Effect_Explosion');
    expect(ex).toHaveLength(1);
    expect(ex[0].mDamage).toBe(150);
    expect(ex[0].mRange).toBe(2.25);
    expect(ex[0].mParent).toBe(g.players()[0]);
    expect(sounds.map((s) => s.name)).toContain('Effect_Explosion_wav');
    expect(g.errors).toEqual([]);
  });

  it('with no pack left and no ammo the weapon is empty; a pack still lying around keeps it usable', () => {
    const g = armed(55);
    placePlayer(g, 6.5, 8.5, 0);
    const w = ready(g, 'chargepack');
    w.mAmmo = 1;
    tapFire(g);
    expect(w.mAmmo).toBe(0);
    expect(w.WeaponEmpty()).toBe(false); // the placed pack can still be detonated
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('chargepack');
    placePlayer(g, 3.5, 8.5, 0);
    tapFire(g);
    g.tick(6);
    expect(w.WeaponEmpty()).toBe(true);
    g.tick(1);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('pistol');
    expect(g.errors).toEqual([]);
  });
});

describe('grenade', () => {
  it('thrown on RELEASE, power = hold time clamped to [0.25, 0.75] s, explodes 60 ticks later (150 dmg, R 2.25)', () => {
    const g = armed(20);
    const w = ready(g, 'grenade');
    const adds = recordAdds(g);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(10);
    expect(ofClass(adds, 'CThing_Shot_Grenade')).toHaveLength(0);
    g.keyUp(KEYS.P1.FIRE);
    g.tick(1);
    const gr = ofClass(adds, 'CThing_Shot_Grenade');
    expect(gr).toHaveLength(1);
    // 10 ticks at 25 Hz = 400 ms of (virtual) time held, +- one enterFrame
    expect(gr[0].mPower).toBeGreaterThanOrEqual(0.38);
    expect(gr[0].mPower).toBeLessThanOrEqual(0.44);
    expect(gr[0].mEffect.mDamage).toBe(150);
    expect(gr[0].mEffect.mRange).toBe(2.25);
    expect(gr[0].mEffect.mParent).toBe(g.players()[0]);
    expect(w.mAmmo).toBe(19);
    g.tick(58);
    expect(gr[0].mEffect.mcDrawObject).toBeUndefined();
    g.tick(3);
    expect(gr[0].mEffect.mcDrawObject).toBeDefined();
    // a 1-tick tap is clamped to 0.25, a 3 s hold to 0.75
    for (const [hold, power] of [[1, 0.25], [80, 0.75]] as const) {
      g.tick(12);
      adds.length = 0;
      g.keyDown(KEYS.P1.FIRE);
      g.tick(hold);
      g.keyUp(KEYS.P1.FIRE);
      g.tick(1);
      expect(ofClass(adds, 'CThing_Shot_Grenade')[0]?.mPower).toBe(power);
    }
    expect(g.errors).toEqual([]);
  });

  it('bounces: Shot.Grenade.Bounce at volume 40 (0.4 sample level), only on real bounces', () => {
    const g = armed(20);
    const sounds = recordSounds(g);
    ready(g, 'grenade');
    g.keyDown(KEYS.P1.FIRE);
    g.tick(18);
    g.keyUp(KEYS.P1.FIRE);
    g.tick(70);
    const bounces = sounds.filter((s) => s.name === 'Shot_Grenade_Bounce_wav');
    expect(bounces.length).toBeGreaterThan(0);
    expect(bounces.length).toBeLessThan(15);
    expect(new Set(bounces.map((s) => s.volume))).toEqual(new Set([40]));
    expect(g.errors).toEqual([]);
  });
});

describe('rocket', () => {
  it('Weapon.Rocket.Fire; speed 0.5 cells/tick x1.1 per tick; smoke trail; explodes on the first wall (250 dmg, R 2.75)', () => {
    const g = armed(50);
    const sounds = recordSounds(g);
    placePlayer(g, 3.5, 8.5, 0);
    const w = ready(g, 'rocket');
    const adds = recordAdds(g);
    g.keyDown(KEYS.P1.FIRE);
    g.tick(1);
    g.keyUp(KEYS.P1.FIRE);
    const r = ofClass(adds, 'CThing_Shot_Rocket')[0];
    expect(r).toBeDefined();
    expect(r.mEffect.mDamage).toBe(250);
    expect(r.mEffect.mRange).toBe(2.75);
    expect(r.mEffect.mParent).toBe(g.players()[0]);
    expect(w.mAmmo).toBe(19);
    expect(sounds.map((s) => s.name)).toEqual(['Weapon_Rocket_Fire_wav']);
    g.tick(1); // Process_Init: delta 0.5, then the first Process_Normal (x1.1)
    expect(r.mDelta.__get__mLength()).toBeCloseTo(0.55, 9);
    g.tick(1);
    expect(r.mDelta.__get__mLength()).toBeCloseTo(0.605, 9);
    g.tick(20);
    expect(r.Process).toBeUndefined();
    const ex = ofClass(adds, 'CThing_Effect_Explosion');
    expect(ex).toEqual([r.mEffect]);
    expect(ex[0].mPosition.mX).toBeGreaterThan(19);
    const smoke = ofClass(adds, 'CThing_Effect_RocketSmoke');
    expect(smoke.length).toBeGreaterThan(0);
    expect(smoke.length).toBeLessThan(15);
    expect(g.errors).toEqual([]);
  });
});

describe('railgun', () => {
  it('piercing line shot: range 10, 100 dmg, 15 slugs, 5-tick rate, Weapon.Railgun.Fire, its own muzzle flash', () => {
    const g = armed(70);
    const sounds = recordSounds(g);
    const w = ready(g, 'railgun');
    const adds = recordAdds(g);
    tapFire(g);
    const s = ofClass(adds, 'CThing_Shot_Railgun');
    expect(s).toHaveLength(1);
    expect(s[0].mDamage).toBe(100);
    expect(w.mAmmo).toBe(14);
    expect(ofClass(adds, 'CThing_Effect_MuzzleFlash')[0].mcDrawObject).toBe((Thing.Weapon.CThing_Weapon_Railgun as any).mcMuzzleFlash);
    expect(sounds.map((x) => x.name)).toEqual(['Weapon_Railgun_Fire_wav']);
    expect(g.errors).toEqual([]);
  });
});

describe('out of ammo', () => {
  it('"<name> is out of ammo!" (critical, red) and the pistol is selected; NEXT skips empty weapons', () => {
    const g = armed(10);
    const msgs = recordMessages(g);
    const w = ready(g, 'shotgun');
    w.mAmmo = 1;
    tapFire(g);
    g.tick(14);
    expect(w.mAmmo).toBe(0);
    expect(g.players()[0].mWeapon_Current.mNameID).toBe('pistol');
    expect(msgs.map((m) => [m.text, m.color])).toContainEqual(['Shotgun is out of ammo!', 0xff0000]);
    expect(msgs.map((m) => [m.text, m.color])).toContainEqual(['Pistol selected!', 0xffffff]);
    expect(g.players()[0].NextWeapon().mNameID).toBe('uzi');
    expect(g.players()[0].PrevWeapon().mNameID).toBe('uzi');
    expect(g.errors).toEqual([]);
  });
});

describe('HUD ammo text (CHud.UpdatePlayer)', () => {
  it('"Pistol" (infinite), "<short name>:<ammo>" otherwise', () => {
    const g = armed(10);
    const tf = (): string => g.world().mHud.mcPlayers[0].mcAmmo.tfAmount.text;
    g.tick(1);
    expect(tf()).toBe('Pistol');
    ready(g, 'uzi');
    expect(tf()).toBe('UZI:100');
    g.keyDown(KEYS.P1.FIRE);
    g.tick(2);
    g.keyUp(KEYS.P1.FIRE);
    g.tick(1);
    expect(tf()).toBe('UZI:99');
    ready(g, 'shotgun');
    expect(tf()).toBe('Shotgun:20');
    expect(g.errors).toEqual([]);
  });
});

describe('every weapon in every direction', () => {
  it('fires in all 8 directions without errors; muzzle flash angle = player angle; shot starts at the gun', () => {
    const g = armed(70);
    for (const name of ['pistol', 'uzi', 'shotgun', 'railgun']) {
      ready(g, name);
      for (let d = 0; d < 8; d++) {
        const p = placePlayer(g, 10.5, 8.5, d);
        g.tick(1);
        const adds = recordAdds(g);
        g.keyDown(KEYS.P1.FIRE);
        g.tick(1);
        g.keyUp(KEYS.P1.FIRE);
        g.tick(1);
        const fl = ofClass(adds, 'CThing_Effect_MuzzleFlash');
        expect(fl.length, `${name} ${d}`).toBe(1);
        expect(fl[0].mAngle.__get__mDirection()).toBe(d);
        // the flash and the shot start at the gun node of the stance (XSI_Model_GunPosition_Right)
        expect(fl[0].mPosition.Distance2D(p.mPosition)).toBeGreaterThan(0.6);
        const shots = adds.filter((t) => t._CLASSID_.startsWith('CThing_Shot'));
        expect(shots.length, `${name} ${d}`).toBeGreaterThan(0);
        expect(shots.every((s) => s.mParent === p)).toBe(true);
        g.tick(14);
        p.mWeapon_Current.mAmmo = Math.max(p.mWeapon_Current.mAmmo, 5);
        g.world().mThing_Collection.AddThing = Object.getPrototypeOf(g.world().mThing_Collection).AddThing;
      }
    }
    expect(live(g, 'CThing_Creature_Player')).toHaveLength(1);
    expect(things(g).every((t) => Number.isFinite(t.mPosition?.mX ?? 0))).toBe(true);
    expect(g.errors).toEqual([]);
  });
});
