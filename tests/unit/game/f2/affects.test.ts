// Lane F2: explosion radius / falloff, friendly-fire rules (CMap_Affect flag + mID filter -> CThing_Creature.ProcessAffects
// with mDamageActive on/off), affect processing order, knock-back length, the State_BulletHit lost `return`.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, P, Thing, World, installFakes, makeWorld } from './f2Modules.ts';
import { Rectangle } from '../../../../src/engine/flash/geom.ts';

let world: any;
beforeAll(() => installFakes());
beforeEach(() => {
  world = makeWorld(14, 10);
});
afterEach(() => {
  Thing.Creature.CThing_Creature.mDamageActive = true;
});

/** Real player created + initialised (Process_Init) in the fake world; invincibility switched off. */
function spawnPlayer(x: number, y: number, index = 0): any {
  const p = world.mThing_Collection.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(x, y), index));
  p.Process();
  p.mInvincible = 0;
  return p;
}

/**
 * Real zombie run through Process_Init, State_EnterMap (Affect_Setup happens there) and one State_CellToCell tick (the
 * first tick that registers it in the mapwho: Process_Init's Move() runs before mMapwho is assigned).
 */
function spawnZombie(x: number, y: number): any {
  const z = world.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(P(x, y)));
  z.Process();
  z.Process();
  z.Process();
  return z;
}

const cellRect = (t: any): any => new Rectangle(t.mPosition.mX - 0.4, t.mPosition.mY - 0.4, 0.8, 0.8);

describe('CThing_Effect_Explosion radius', () => {
  it('mRange = 2 + max(damage - 100, 0) * 0.005', () => {
    for (const [dmg, r] of [[50, 2], [100, 2], [150, 2.25], [250, 2.75], [1500, 9]]) {
      expect(new Thing.Effect.CThing_Effect_Explosion(P(1, 1), A(0), undefined, dmg).mRange).toBeCloseTo(r, 12);
    }
  });

  it('MakeIDUnique: an explosion does not inherit its parent mID (it can hurt the thrower); a bullet does', () => {
    const owner = { mID: 77 };
    const e = new Thing.Effect.CThing_Effect_Explosion(P(1, 1), A(0), owner, 150);
    const b = new Thing.Shot.CThing_Shot_Bullet(P(1, 1), A(0), owner, 26, 8);
    expect(e.mID).toBe(e.mUniqueID);
    expect(e.mID).not.toBe(77);
    expect(b.mID).toBe(77);
  });
});

describe('CThing_Affect_Explosion.AffectThing falloff (R = 2, damage 100)', () => {
  const at = (d: number): [number, number] => {
    const target = { mPosition: P(5 + d, 5), mLife: 1000 };
    const aff = new Thing.Affect.CThing_Affect_Explosion(undefined, { mPosition: P(5, 5) }, 100, 2);
    const ret = aff.AffectThing(target);
    return [ret, 1000 - target.mLife];
  };
  it('<= 0.5R -> 100 %, <= 0.75R -> 75 %, <= R -> 50 %, beyond -> 0 and no life change', () => {
    expect(at(0)).toEqual([100, 100]);
    expect(at(1)).toEqual([100, 100]); // exactly 0.5R is still full damage (`> 0.5` test)
    expect(at(1.01)).toEqual([75, 75]);
    expect(at(1.5)).toEqual([75, 75]);
    expect(at(1.51)).toEqual([50, 50]);
    expect(at(2)).toEqual([50, 50]);
    expect(at(2.01)).toEqual([0, 0]);
  });
  it('the other affects subtract their full damage', () => {
    const t = { mLife: 100 };
    expect(new Thing.Affect.CThing_Affect_Bullet(undefined, undefined, 26, undefined).AffectThing(t)).toBe(26);
    expect(new Thing.Affect.CThing_Affect_FireBall(undefined, undefined, 50, undefined).AffectThing(t)).toBe(50);
    expect(new Thing.Affect.CThing_Affect_ZombieAttack({}, 10).AffectThing(t)).toBe(10);
    expect(new Thing.Affect.CThing_Affect_DevilAttack(undefined, undefined, 4, undefined).AffectThing(t)).toBe(4);
    expect(t.mLife).toBe(10);
    const z = new Thing.Affect.CThing_Affect_ZombieAttack('zombie', 50);
    expect([z.mType, z.mOwner, z.mAffector, z.mDamage]).toEqual([Thing.Affect.CThing_Affect.mAffect_ZombieAttack, 'zombie', 'zombie', 50]);
  });
});

describe('friendly fire (CMap_Affect filter by flags + mID, then ProcessAffects)', () => {
  it('a bullet never affects its own shooter (same mID); it reaches another player', () => {
    const p1 = spawnPlayer(3.5, 3.5, 0);
    const p2 = spawnPlayer(6.5, 3.5, 1);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p1, 26, 8);
    const aff = new Thing.Affect.CThing_Affect_Bullet(p1, shot, 26, shot.mAngle);
    world.mMap.mAffect.AffectArea(cellRect(p1), aff);
    world.mMap.mAffect.AffectArea(cellRect(p2), aff);
    expect(p1.mAffectors.length).toBe(0);
    expect(p2.mAffectors.length).toBe(1);
  });

  it('mDamageActive off: bullets and explosions do not hurt players (but are consumed)', () => {
    Thing.Creature.CThing_Creature.mDamageActive = false;
    const p1 = spawnPlayer(3.5, 3.5, 0);
    const p2 = spawnPlayer(6.5, 3.5, 1);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p1, 26, 8);
    p2.Affect(new Thing.Affect.CThing_Affect_Bullet(p1, shot, 26, shot.mAngle));
    p2.Affect(new Thing.Affect.CThing_Affect_Explosion(p1, new Thing.Effect.CThing_Effect_Explosion(P(5.5, 3.5), A(0), p1, 150), 150, 2.25));
    p2.ProcessAffects();
    expect(p2.mLife).toBe(200);
    expect(p2.mStateID).toBe('State_PlayerControl');
    expect(p2.mAffectors.length).toBe(0);
  });

  it('mDamageActive on: a bullet hurts another player (State_BulletHit); own explosion hurts the thrower (State_ExplosionHit)', () => {
    const p1 = spawnPlayer(3.5, 3.5, 0);
    const p2 = spawnPlayer(6.5, 3.5, 1);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p1, 26, 8);
    p2.Affect(new Thing.Affect.CThing_Affect_Bullet(p1, shot, 26, shot.mAngle));
    p2.ProcessAffects();
    expect(p2.mLife).toBe(174);
    expect(p2.mStateID).toBe('State_BulletHit');
    // Own grenade: the explosion has a unique mID -> passes the CMap_Affect filter for the thrower himself.
    const boom = new Thing.Effect.CThing_Effect_Explosion(P(3.5, 3.5), A(0), p1, 150);
    world.mMap.mAffect.AffectArea(new Rectangle(3.5 - 2.25, 3.5 - 2.25, 4.5, 4.5), new Thing.Affect.CThing_Affect_Explosion(p1, boom, 150, 2.25));
    expect(p1.mAffectors.length).toBe(1);
    p1.ProcessAffects();
    expect(p1.mLife).toBe(50); // distance 0 -> full 150
    expect(p1.mStateID).toBe('State_ExplosionHit'); // [BC @462003] really executed (ffdec: dead code after `continue`)
  });

  it('fireballs and zombie attacks hurt players regardless of mDamageActive', () => {
    Thing.Creature.CThing_Creature.mDamageActive = false;
    const p = spawnPlayer(3.5, 3.5);
    const z = spawnZombie(4.5, 3.5);
    p.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(z, 50));
    p.ProcessAffects();
    expect([p.mLife, p.mStateID]).toEqual([150, 'State_ZombieHit']);
    const fb = new Thing.Shot.CThing_Shot_FireBall(P(6.5, 3.5), A(Math.PI), z, 50, false, 0.15);
    p.Affect(new Thing.Affect.CThing_Affect_FireBall(z, fb, 50, fb.mAngle));
    p.ProcessAffects();
    expect([p.mLife, p.mStateID]).toEqual([100, 'State_BulletHit']);
  });

  it('zombies are always hurt by player bullets; mInvincible discards all affects', () => {
    Thing.Creature.CThing_Creature.mDamageActive = false;
    const p = spawnPlayer(3.5, 3.5);
    const z = spawnZombie(6.5, 3.5);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p, 26, 8);
    world.mMap.mAffect.AffectArea(cellRect(z), new Thing.Affect.CThing_Affect_Bullet(p, shot, 26, shot.mAngle));
    z.ProcessAffects();
    expect([z.mLife, z.mStateID]).toEqual([74, 'State_BulletHit']);
    p.mInvincible = 5;
    p.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(z, 50));
    p.ProcessAffects();
    expect(p.mLife).toBe(200);
    expect(p.mAffectors.length).toBe(0);
  });

  it('affectors are processed in AS2 for..in order (newest first): the OLDEST affect decides the final state', () => {
    const p = spawnPlayer(3.5, 3.5);
    const z = spawnZombie(6.5, 3.5);
    const states: string[] = [];
    const orig = z.SetState;
    z.SetState = function (this: any, s: string) { states.push(s); orig.call(this, s); };
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p, 26, 8);
    z.Affect(new Thing.Affect.CThing_Affect_Bullet(p, shot, 26, shot.mAngle));
    z.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(p, 10));
    z.ProcessAffects();
    expect(states).toEqual(['State_ZombieHit', 'State_BulletHit']);
    expect(z.mLife).toBe(64);
  });
});

describe('knock-back (State_BulletHit_Init)', () => {
  it('mStateCount = number of 0.65 decay steps while |delta| >= 0.01 (0.3 -> 8)', () => {
    const z = spawnZombie(6.5, 3.5);
    const count = (len: number): number => {
      z.mDelta = P(len, 0, 0);
      z.State_BulletHit_Init();
      return z.mStateCount;
    };
    expect(count(0.3)).toBe(8);
    expect(count(0.01)).toBe(1);
    expect(count(0.0099)).toBe(0);
    let k = 0;
    for (let l = 0.325; l >= 0.01; l *= 0.65) k++;
    expect(count(0.325)).toBe(k);
  });

  it('bullet knock-back length = max(dmg/5*2/32, 0.3) / mass, explosion = min(dmg/5*2/32/mass, 0.3)', () => {
    const p = spawnPlayer(3.5, 3.5);
    const z = spawnZombie(6.5, 3.5);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p, 26, 8);
    z.Affect(new Thing.Affect.CThing_Affect_Bullet(p, shot, 26, shot.mAngle));
    z.ProcessAffects();
    expect(z.mDelta.__get__mLength()).toBeCloseTo(Math.max((26 / 5) * 2 / 32, 0.3), 12);
    expect(z.mDelta.mX).toBeGreaterThan(0); // pushed away from the shooter
    expect(z.mAngle.mAngle).toBeCloseTo(Math.PI, 12); // faces the shooter
    const boom = new Thing.Effect.CThing_Effect_Explosion(P(3.5, 3.5), A(0), undefined, 100);
    p.Affect(new Thing.Affect.CThing_Affect_Explosion(undefined, boom, 100, 2));
    p.mPosition.mX = 4.5; // 1 cell away -> full damage (100), player mass 2
    p.ProcessAffects();
    expect(p.mDelta.__get__mLength()).toBeCloseTo(Math.min((100 / 5) * 2 / 32 / 2, 0.3), 12);
  });
});

describe('State_BulletHit [BC @459541] (ffdec lost a return)', () => {
  it('a valid collision position does NOT kill the creature', () => {
    const p = spawnPlayer(3.5, 3.5);
    const z = spawnZombie(6.5, 3.5);
    const shot = new Thing.Shot.CThing_Shot_Bullet(P(3.5, 3.5), A(0), p, 26, 8);
    z.Affect(new Thing.Affect.CThing_Affect_Bullet(p, shot, 26, shot.mAngle));
    z.ProcessAffects();
    const before = world.mThing_Collection.mThingCounters.INVALIDPOSITION;
    z.fState();
    expect(z.mFlags & Thing.CThing.mFlag_DEAD).toBe(0);
    expect(z.mStateID).toBe('State_BulletHit');
    expect(world.mThing_Collection.mThingCounters.INVALIDPOSITION).toBe(before);
    // Runs out of knock-back -> sleeps 3 ticks and returns to its base state.
    for (let i = 0; i < 20 && z.mStateID == 'State_BulletHit'; i++) z.fState();
    expect(z.mStateID).toBe('State_Sleep');
    expect(z.mReturnStateID).toBe(z.mBaseStateID);
  });

  it('an invalid (NaN) collision position kills it: DEAD flag, INVALIDPOSITION++, State_Dying', () => {
    const z = spawnZombie(6.5, 3.5);
    z.Affect(new Thing.Affect.CThing_Affect_ZombieAttack({ mPosition: P(5.5, 3.5), mAngle: A(0) }, 10));
    z.ProcessAffects();
    world.mMap.mCollide.CreatureCollide = () => P(NaN, NaN);
    z.fState();
    expect(z.mFlags & Thing.CThing.mFlag_DEAD).toBe(Thing.CThing.mFlag_DEAD);
    expect(world.mThing_Collection.mThingCounters.INVALIDPOSITION).toBe(1);
    expect(z.mStateID).toBe('State_Dying');
    expect(world.kills).toContain(z);
  });
});

describe('State_EnterMap_Init direction loop [BC @456060] (d = 0, 2, 4, 6)', () => {
  it('faces the first orthogonal neighbour that is not StaticImpassable', () => {
    const C = World.Map.CMap_Cell;
    const cells = world.mMap.mCells;
    cells[5][7].mCollide |= C.mCollide_Solid; // east of (6,5)
    cells[6][6].mCollide |= C.mCollide_Ledge; // south of (6,5)
    const z = world.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(P(6.5, 5.5)));
    z.Process();
    expect(z.mStateID).toBe('State_EnterMap');
    expect(z.mAngle.mDirection).toBe(4); // west
    expect(z.mDirectionCell).toBe(cells[5][5]);
    expect(cells[5][6].mCollide & C.mCollide_Creature).toBe(C.mCollide_Creature);
  });
});

describe('Barrel chain reaction', () => {
  it('any explosion affect (even a 0-damage corner hit) blows a barrel up; the new explosion keeps the barrel owner', () => {
    const owner = { mID: 999 };
    const b = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Barrel(P(8.2, 4.7), A(0), owner, 150));
    b.Process();
    expect(b.mPosition.mX).toBe(8.5);
    expect(b.mID).toBe(b.mUniqueID); // MakeIDUnique
    const added: any[] = [];
    const orig = world.mThing_Collection.AddThing_Effect.bind(world.mThing_Collection);
    world.mThing_Collection.AddThing_Effect = (e: any) => { added.push(e); return orig(e); };
    const boom = new Thing.Effect.CThing_Effect_Explosion(P(6.5, 2.5), A(0), undefined, 100);
    world.mMap.mAffect.AffectArea(new Rectangle(6.5 - 2, 2.5 - 2, 4, 4), new Thing.Affect.CThing_Affect_Explosion(undefined, boom, 100, 2));
    expect(b.mAffectors.length).toBe(1);
    b.Process();
    expect(added.map((e) => [e._CLASSID_, e.mParent, e.mDamage])).toEqual([['CThing_Effect_Explosion', owner, 150]]);
    expect(b.Process).toBeUndefined(); // CThing.Delete(): `delete this.Process`
  });
});
