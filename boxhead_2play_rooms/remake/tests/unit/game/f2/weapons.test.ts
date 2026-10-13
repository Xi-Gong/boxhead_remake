// Lane F2: weapon stats, fire-rate / ammo logic, shotgun pellet fan, grenade throw power, rocket explosion hand-off.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, FakeKey, P, Thing, installFakes, makeWorld, playedSounds } from './f2Modules.ts';
import { useVirtualClock, advanceVirtual } from '../../../../src/engine/flash/clock.ts';

const DEG = Math.PI / 180;

/** A minimal weapon owner: the Thing code reads mWorld, mAngle, GetWeaponPosition(), SelectWeapon(). */
function makeOwner(world: any): any {
  return {
    mID: 4242,
    mWorld: world,
    mPosition: P(5.5, 5.5),
    mAngle: A(0),
    selected: [] as string[],
    GetWeaponPosition() { return this.mPosition.Clone(); },
    SelectWeapon(n: string) { this.selected.push(n); },
  };
}

function makeWeapon(classID: string, world: any, owner = makeOwner(world)): any {
  const w = Thing.Weapon.CThing_Weapon.byCLASSID(classID, owner.mPosition, A(0), owner);
  return world.mThing_Collection.Register_Thing(w);
}

let world: any;
beforeAll(() => installFakes());
beforeEach(() => {
  world = makeWorld(12, 12);
  playedSounds.length = 0;
});

describe('CThing_Weapon.byCLASSID / constructors', () => {
  // [classID, mNameID, mName, mShortName, mFireRate, mAmmo, mDamage, mRange, mAuto, mOnRelease]
  const table: any[][] = [
    ['CThing_Weapon_Pistol', 'pistol', 'Pistol', 'Pistol', 8, 999999, 26, 8, false, undefined],
    ['CThing_Weapon_UZI', 'uzi', 'UZI', 'UZI', 4, 100, 35, 8, true, undefined],
    ['CThing_Weapon_Shotgun', 'shotgun', 'Shotgun', 'Shotgun', 12, 20, 51, 7, false, undefined],
    ['CThing_Weapon_Grenade', 'grenade', 'Grenades', 'Grenades', 12, 20, 150, 6, false, true],
    ['CThing_Weapon_Mine', 'mine', 'Claymore', 'Mines', 1, 10, 100, undefined, false, undefined],
    ['CThing_Weapon_Barrel', 'barrel', 'Barrels', 'Barrels', 1, 10, 150, undefined, false, undefined],
    ['CThing_Weapon_FakeWall', 'fakewall', 'Fake Walls', 'Walls', 1, 5, 100, undefined, false, undefined],
    ['CThing_Weapon_Rocket', 'rocket', 'Rocket Launcher', 'Rockets', 12, 20, 250, undefined, false, undefined],
    ['CThing_Weapon_ChargePack', 'chargepack', 'Charge Packs', 'Charges', 1, 10, 150, undefined, false, undefined],
    ['CThing_Weapon_Railgun', 'railgun', 'Railgun', 'Railgun', 5, 15, 100, 10, false, undefined],
    ['CThing_Weapon_Devastator', 'devastator', 'The Devastator', undefined, 4, 999999, 100, 8, true, undefined],
    ['CThing_Weapon_SmartBomb', 'smartbomb', 'Smart Bomb', undefined, 12, 20, 100, undefined, false, undefined],
  ];
  for (const [cls, nameID, name, short, rate, ammo, dmg, range, auto, onRelease] of table) {
    it(`${cls}: stats as in the bytecode`, () => {
      const w = makeWeapon(cls, world);
      expect(w._CLASSID_).toBe(cls);
      expect(w._BASECLASSID_).toBe('CThing_Weapon');
      expect([w.mNameID, w.mName, w.mShortName]).toEqual([nameID, name, short]);
      expect([w.mFireRate, w.mAmmo, w.mTotalAmmo, w.mDamage, w.mRange, w.mAuto, w.mOnRelease]).toEqual([rate, ammo, ammo, dmg, range, auto, onRelease]);
      expect(w.mFireRateCount).toBe(0);
      expect(world.mUpgrades.registered).toContain(w);
      // Class-body vars live on the prototype (AS2 semantics), not on the instance.
      expect(Object.prototype.hasOwnProperty.call(w, 'mNameID')).toBe(false);
      // Weapons are only registered (not processed): Process = the EMPTY Process_Normal of the bytecode.
      expect(typeof w.Process).toBe('function');
      expect(w.Process()).toBeUndefined();
    });
  }

  it('unknown class id -> undefined; base CThing_Weapon defaults', () => {
    expect(Thing.Weapon.CThing_Weapon.byCLASSID('CThing_Weapon_Nope', P(0, 0), A(0), makeOwner(world))).toBeUndefined();
    const base = new Thing.Weapon.CThing_Weapon(P(0, 0), A(0), undefined);
    expect([base.mNameID, base.mName, base.mFireRate, base.mAmmo, base.mTotalAmmo]).toEqual(['none', 'NONE', 10, 999999, 999999]);
  });

  it('ChargePack constructor calls Reset() before registration (AS2: undefined collection -> mDetonate undefined)', () => {
    const owner = makeOwner(world);
    const w = Thing.Weapon.CThing_Weapon.byCLASSID('CThing_Weapon_ChargePack', owner.mPosition, A(0), owner);
    expect(w.mDetonate).toBeUndefined();
  });
});

describe('CThing_Weapon.Update fire-rate / ammo logic', () => {
  it('pistol: semi-automatic, one shot per press, then 8 ticks of cooldown; infinite ammo', () => {
    const w = makeWeapon('CThing_Weapon_Pistol', world);
    const fired: number[] = [];
    w.Fire = function (this: any, ...args: any[]) { fired.push(tick); Thing.Weapon.CThing_Weapon.prototype.Fire.apply(this, args as any); };
    const key = new FakeKey();
    let tick = 0;
    for (tick = 0; tick < 30; tick++) {
      key.pressed = true; // pressed again every tick
      w.Update(key);
    }
    expect(fired).toEqual([0, 8, 16, 24]);
    expect(w.mAmmo).toBe(999999);
  });

  it('UZI: automatic while held (IsDown), passes mTimeDown, 4-tick rate, ammo decrements', () => {
    const w = makeWeapon('CThing_Weapon_UZI', world);
    const calls: any[] = [];
    w.Fire = function (this: any, pos: any, ang: any, t: any) { calls.push([tick, t]); this.DecrementAmmo(); };
    const key = new FakeKey();
    key.down = true;
    key.mTimeDown = 1234;
    let tick = 0;
    for (tick = 0; tick < 10; tick++) w.Update(key);
    expect(calls).toEqual([[0, 1234], [4, 1234], [8, 1234]]);
    expect(w.mAmmo).toBe(97);
    expect(w.mFire).toBe(true);
  });

  it('grenade: fires on release with mTimePressed', () => {
    const w = makeWeapon('CThing_Weapon_Grenade', world);
    const calls: any[] = [];
    w.Fire = (_p: any, _a: any, t: any) => calls.push(t);
    const key = new FakeKey();
    key.down = true;
    key.pressed = true;
    w.Update(key);
    expect(calls).toEqual([]);
    key.released = true;
    key.mTimePressed = 777;
    w.Update(key);
    expect(calls).toEqual([777]);
  });

  it('empty weapon: critical message + owner selects the pistol, no fire', () => {
    const owner = makeOwner(world);
    const w = makeWeapon('CThing_Weapon_UZI', world, owner);
    w.mAmmo = 0;
    let fired = 0;
    w.Fire = () => fired++;
    const key = new FakeKey();
    key.down = true;
    w.Update(key);
    expect(fired).toBe(0);
    expect(owner.selected).toEqual(['pistol']);
    expect(world.messages).toContainEqual(['critical', 'UZI is out of ammo!']);
  });

  it('DecrementAmmo / EmptyWeapon / WeaponEmpty / Reset', () => {
    const p = makeWeapon('CThing_Weapon_Pistol', world);
    const u = makeWeapon('CThing_Weapon_UZI', world);
    p.DecrementAmmo();
    u.DecrementAmmo();
    expect([p.mAmmo, u.mAmmo, p.mFireRateCount, u.mFireRateCount]).toEqual([999999, 99, 8, 4]);
    p.EmptyWeapon();
    u.EmptyWeapon();
    expect([p.mAmmo, u.mAmmo, p.WeaponEmpty(), u.WeaponEmpty()]).toEqual([999999, 0, false, true]);
    u.Reset();
    expect(u.mFireRateCount).toBe(0);
  });
});

describe('CThing_Weapon_Shotgun.Fire pellet fan [BC @422650..@423065]', () => {
  function fire(wide: any): any[] {
    const w = makeWeapon('CThing_Weapon_Shotgun', world);
    w.mWideShot = wide;
    const shots: any[] = [];
    world.mThing_Collection.AddThing_Shot = (s: any) => { shots.push(s); return s; };
    const a0 = 30 * DEG;
    w.Fire(P(5.5, 5.5), A(a0));
    return shots.map((s) => [Math.round((s.mAngle.mAngle - a0) / DEG * 1e6) / 1e6, s.mDelay, s.mDamage, s.mParent === w.mParent]);
  }

  it('no upgrade: 3 pellets at 0, -1.25, +1.25 degrees', () => {
    expect(fire(0)).toEqual([[0, false, 51, true], [-1.25, false, 51, true], [1.25, false, 51, true]]);
  });

  it('WideShot (mWideShot = 1): 5 pellets, step 2.5 deg, outer pair delayed (i >= 1)', () => {
    expect(fire(1)).toEqual([[0, false, 51, true], [-2.5, false, 51, true], [2.5, false, 51, true], [-5, true, 51, true], [5, true, 51, true]]);
  });

  it('WiderShot (mWideShot = 2): 5 pellets, step 3.75 deg', () => {
    expect(fire(2)).toEqual([[0, false, 51, true], [-3.75, false, 51, true], [3.75, false, 51, true], [-7.5, true, 51, true], [7.5, true, 51, true]]);
  });

  it('fire decrements ammo once, sets the cooldown, plays the sound and adds a muzzle flash', () => {
    const w = makeWeapon('CThing_Weapon_Shotgun', world);
    const effects: any[] = [];
    world.mThing_Collection.AddThing_Effect = (e: any) => { effects.push(e); return e; };
    world.mThing_Collection.AddThing_Shot = (s: any) => s;
    w.Fire(P(5.5, 5.5), A(0));
    expect([w.mAmmo, w.mFireRateCount]).toEqual([19, 12]);
    expect(effects.map((e) => e._CLASSID_)).toEqual(['CThing_Effect_MuzzleFlash']);
    expect(effects[0].mcDrawObject).toBe(Thing.Weapon.CThing_Weapon_Shotgun.mcMuzzleFlash);
    expect(playedSounds).toEqual(['Weapon_Shotgun_Fire_wav']);
  });

  it('a delayed pellet skips one tick (Process_Delay -> Process_Init)', () => {
    const b = new Thing.Shot.CThing_Shot_Bullet(P(5.5, 5.5), A(0), undefined, 51, 7, true);
    expect(b.Process).toBe(b.Process_Delay);
    b.Process();
    expect(b.Process).toBe(b.Process_Init);
    const c = new Thing.Shot.CThing_Shot_Bullet(P(5.5, 5.5), A(0), undefined, 51, 7, false);
    expect(c.Process).toBe(c.Process_Init);
  });
});

describe('CThing_Weapon_Grenade.Fire throw power [BC @429443]', () => {
  it('power = clamp((getTimer() - tTime) / 1000, 0.25, 0.75); the explosion is re-parented to the thrower', () => {
    useVirtualClock(10000);
    const owner = makeOwner(world);
    const w = makeWeapon('CThing_Weapon_Grenade', world, owner);
    w.mClusterExplode = 1;
    w.mBiggerBang = 2;
    const shots: any[] = [];
    world.mThing_Collection.AddThing_Shot = (s: any) => { shots.push(s); return s; };
    for (const held of [100, 400, 2000]) w.Fire(P(3.5, 3.5), A(0), 10000 - held);
    expect(shots.map((s) => s.mPower)).toEqual([0.25, 0.4, 0.75]);
    const g = shots[0];
    expect(g.mEffect._CLASSID_).toBe('CThing_Effect_Explosion');
    expect(g.mEffect.mParent).toBe(owner);
    expect(g.mEffect.mPosition).toBe(g.mPosition); // shared position object: explodes where the grenade lands
    expect([g.mEffect.mClusterExplode, g.mEffect.mBiggerBang, g.mEffect.mDamage]).toEqual([1, 2, 150]);
    expect(w.mAmmo).toBe(17);
    advanceVirtual(0);
  });
});

describe('CThing_Weapon_Rocket.Fire', () => {
  it('rocket carries an owner-parented explosion sharing its position; ammo via super.Fire()', () => {
    const owner = makeOwner(world);
    const w = makeWeapon('CThing_Weapon_Rocket', world, owner);
    const shots: any[] = [];
    world.mThing_Collection.AddThing_Shot = (s: any) => { shots.push(s); return s; };
    w.Fire(P(3.5, 3.5), A(0));
    expect(shots[0]._CLASSID_).toBe('CThing_Shot_Rocket');
    expect(shots[0].mEffect.mParent).toBe(owner);
    expect(shots[0].mEffect.mPosition).toBe(shots[0].mPosition);
    expect(shots[0].mEffect.mRange).toBeCloseTo(2.75, 12);
    expect(w.mAmmo).toBe(19);
    expect(playedSounds).toEqual(['Weapon_Rocket_Fire_wav']);
  });
});
