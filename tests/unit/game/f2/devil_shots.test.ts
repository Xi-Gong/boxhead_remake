// Lane F2: devil behaviour (fireball attack, obstacle removal) and the piercing railgun / exploding rocket shots, on a
// REAL CMap (lane F1) with fake renderers.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, P, Thing, World, installFakes, makeWorld, playedSounds } from './f2Modules.ts';
import { useVirtualClock } from '../../../../src/engine/flash/clock.ts';
import { seedRandom } from '../../../../src/engine/flash/rng.ts';
import { forIn } from '../../../../src/engine/flash/as2.ts';

let world: any;
beforeAll(() => {
  installFakes();
  useVirtualClock(0);
});
beforeEach(() => {
  seedRandom(77);
  playedSounds.length = 0;
  (World.CWorld as any).mGameMode = 'Single';
  Thing.Creature.CThing_Creature.mDamageActive = true;
});

const things = (w: any): any[] => forIn(w.mThing_Collection.mThings).map((k) => w.mThing_Collection.mThings[k]);
const ofClass = (w: any, id: string): any[] => things(w).filter((t) => t._CLASSID_ == id);

describe('CThing_Creature_Devil', () => {
  it('stats; turns towards a player in range and throws a fireball that hurts him', () => {
    world = makeWorld(16, 9);
    const c = world.mThing_Collection;
    const p = c.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(3.5, 4.5), 0));
    const d = c.AddThing(new Thing.Creature.CThing_Creature_Devil(P(7.5, 4.5)));
    c.Process();
    p.mInvincible = 0;
    expect([d.mLife, d.mMaxLife, d.mSpeed, d.mMass, d.mAttackRange, d.mScore, d.mRadius]).toEqual([1000, 1000, 0.04, 5, 5, 1000, 0.42]);
    expect(d.mAffectFlags).toBeUndefined(); // set in State_EnterMap (next tick) incl. PlayerLineOfSight
    c.Process();
    const A_ = Thing.Affect.CThing_Affect;
    expect(d.mAffectFlags).toBe(A_.mAffect_Bullet | A_.mAffect_Explosion | A_.mAffect_FireBall | A_.mAffect_PlayerLineOfSight);
    let fireballs = 0;
    let minLife = p.mLife;
    for (let t = 0; t < 1500 && minLife == 200; t++) {
      c.Process();
      p.mInvincible = 0;
      fireballs = Math.max(fireballs, ofClass(world, 'CThing_Shot_FireBall').length);
      minLife = Math.min(minLife, p.mLife);
    }
    expect(fireballs).toBeGreaterThan(0);
    expect(minLife).toBe(150); // one fireball: 50 damage
    expect(p.mStateID).toBe('State_BulletHit');
  });

  it('State_RemoveObject: an object in the entry direction gets a 100000 DevilAttack (a barrel explodes)', () => {
    world = makeWorld(16, 9);
    const c = world.mThing_Collection;
    c.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(2.5, 7.5), 0));
    const b = c.AddThing(new Thing.Object.CThing_Object_Barrel(P(9.5, 4.5), A(0), undefined, 150));
    const d = c.AddThing(new Thing.Creature.CThing_Creature_Devil(P(8.5, 4.5)));
    const states: string[] = [];
    for (let t = 0; t < 5; t++) {
      c.Process();
      if (states[states.length - 1] != d.mStateID) states.push(d.mStateID);
    }
    expect(states.slice(0, 2)).toEqual(['State_EnterMap', 'State_RemoveObject']);
    expect(b.Process).toBeUndefined(); // the barrel blew up
    expect(ofClass(world, 'CThing_Effect_Explosion').length).toBeGreaterThan(0);
  });
});

describe('piercing railgun and exploding rocket', () => {
  it('a railgun shot damages every zombie on the line (Affect_Line), a bullet only the first', () => {
    world = makeWorld(20, 7);
    const c = world.mThing_Collection;
    const zs = [6.5, 8.5, 10.5].map((x) => {
      const z = c.AddThing(new Thing.Creature.CThing_Creature_Zombie(P(x, 3.5)));
      z.Process();
      z.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet);
      world.mMap.mMapwho.MoveThing(z);
      return z;
    });
    const owner = { mID: 9999 }; // must not collide with a thing id (CMap_Affect skips things with the affector mID)
    const rail = c.AddThing_Shot(new Thing.Shot.CThing_Shot_Railgun(P(2.5, 3.5), A(0), owner, 100, 10));
    rail.Process();
    expect(zs.map((z) => z.mAffectors.length)).toEqual([1, 1, 1]);
    for (const z of zs) z.mAffectors = [];
    const bullet = c.AddThing_Shot(new Thing.Shot.CThing_Shot_Bullet(P(2.5, 3.5), A(0), owner, 26, 10));
    bullet.Process();
    expect(zs.map((z) => z.mAffectors.length)).toEqual([1, 0, 0]);
    expect(bullet.mDestination.mX).toBeLessThan(6.5); // stopped at the first zombie's edge
    expect(bullet.mLife).toBe(1); // tracer lives 2 ticks
    bullet.Process();
    expect(bullet.Process).toBeUndefined();
  });

  it('a rocket accelerates (x1.1 per tick) and explodes on the first hit', () => {
    world = makeWorld(30, 7);
    const c = world.mThing_Collection;
    const owner = { mID: 9999 }; // must not collide with a thing id (CMap_Affect skips things with the affector mID)
    const r = c.AddThing_Shot(new Thing.Shot.CThing_Shot_Rocket(P(2.5, 3.5), A(0), owner, 250));
    r.Process();
    expect(r.mDelta.mX).toBeCloseTo(0.55, 12); // 0.5 * 1.1 on the first tick
    let t = 0;
    while (r.Process && t++ < 100) r.Process();
    expect(t).toBeLessThan(100);
    const boom = ofClass(world, 'CThing_Effect_Explosion');
    expect(boom.length).toBe(1);
    expect(boom[0]).toBe(r.mEffect);
    expect(boom[0].mRange).toBeCloseTo(2.75, 12);
    expect(r.mPosition.mX).toBeLessThan(29); // exploded at the far wall
  });
});
