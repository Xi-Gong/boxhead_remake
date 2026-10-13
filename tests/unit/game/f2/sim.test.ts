// Lane F2: small headless simulations of Thing pipelines on a REAL CMap (lane F1) — grenade flight / bounce sound flag,
// explosion delays / cluster shells, pickups, mines, walls and a player shooting a zombie. DrawPrimitive, CMain, CSound
// are fakes (see f2Modules.ts); full-world simulations (CWorld, lane F3) come at integration.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, CMain, FakeMovieClipPrimitive, P, Thing, World, installFakes, makeWorld, playedSounds } from './f2Modules.ts';
import { useVirtualClock } from '../../../../src/engine/flash/clock.ts';
import { seedRandom } from '../../../../src/engine/flash/rng.ts';
import { forIn } from '../../../../src/engine/flash/as2.ts';

let world: any;
beforeAll(() => {
  installFakes();
  useVirtualClock(0);
});
beforeEach(() => {
  seedRandom(1234);
  playedSounds.length = 0;
  (World.CWorld as any).mGameMode = 'Single';
});

const things = (w: any): any[] => forIn(w.mThing_Collection.mThings).map((k) => w.mThing_Collection.mThings[k]);
const ofClass = (w: any, id: string): any[] => things(w).filter((t) => t._CLASSID_ == id);

describe('CThing_Shot_Grenade flight [BC @385298..@385670]', () => {
  it('bounce sound only on a floor/wall bounce with speed > 0.06 (not every airborne tick); explodes after 60 ticks', () => {
    world = makeWorld(60, 12);
    const owner = { mID: 5 };
    const g = world.mThing_Collection.AddThing_Shot(new Thing.Shot.CThing_Shot_Grenade(P(5.5, 5.5), A(0), owner, 150, 0.5));
    // Expected z dynamics in open space (no walls are reached): gravity 0.06, floor bounce |dz| (<= 0.06 -> 0), all * 0.5.
    const expected: number[] = [];
    let z = 40 / 32;
    const d = { x: 0.5, y: 0, z: 0.25 };
    for (let t = 0; t < 60; t++) {
      let flag = false;
      d.z -= 0.06;
      if (z + d.z < 0) {
        if ((d.z = Math.abs(d.z)) <= 0.06) d.z = 0;
        d.x *= 0.5; d.y *= 0.5; d.z *= 0.5;
        z = 0;
        flag = true;
      }
      if (flag && Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) > 0.06) expected.push(t);
      z += d.z;
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(expected[0]).toBeGreaterThan(5); // airborne ticks before the first bounce stay silent
    const heard: number[] = [];
    for (let t = 0; t < 60; t++) {
      const n = playedSounds.length;
      world.mThing_Collection.Process();
      if (playedSounds.slice(n).includes('Shot_Grenade_Bounce_wav')) heard.push(t);
    }
    expect(heard).toEqual(expected);
    expect(g.Process).toBeUndefined(); // deleted after 60 ticks
    const boom = ofClass(world, 'CThing_Effect_Explosion');
    expect(boom.length).toBe(1);
    expect(boom[0]).toBe(g.mEffect);
    expect(boom[0].mParent).toBe(g); // the shot's own explosion (the weapon replaces it with an owner-parented one)
  });
});

describe('CThing_Effect_Explosion Process_Init / Process_Delay [BC @301615..@302189]', () => {
  it('mClusterExplode spawns 4 cluster shells (one per quadrant); mBiggerBang N spawns ceil(1.5 N) delayed explosions', () => {
    world = makeWorld(20, 20);
    const e = world.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(P(10.5, 10.5), A(0), undefined, 150));
    e.mClusterExplode = 1;
    e.mBiggerBang = 2;
    e.Process();
    const shells = ofClass(world, 'CThing_Shot_ClusterShell');
    expect(shells.length).toBe(4);
    const quadrants = shells.map((s) => Math.floor(((s.mAngle.mAngle + Math.PI / 4) % (2 * Math.PI)) / (Math.PI / 2))).sort();
    expect(quadrants).toEqual([0, 1, 2, 3]);
    const subs = ofClass(world, 'CThing_Effect_Explosion').filter((x) => x !== e);
    expect(subs.length).toBe(3); // step = 2 PI / 3 -> angles 0, 2.09, 4.19
    for (const s of subs) expect(s.mDelay).toBeGreaterThanOrEqual(2);
    for (const s of subs) expect(s.mDelay).toBeLessThanOrEqual(5);
    expect(world.shakes).toBe(1); // the main explosion went off immediately (mDelay 0)
    expect(world.decals.filter((d: any) => d[0] == 'scorch').length).toBe(1);
    expect(playedSounds).toContain('Effect_Explosion_wav');
  });

  it('a delayed explosion waits mDelay ticks, then affects the padded square and animates out', () => {
    world = makeWorld(20, 20);
    const e = world.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(P(10.5, 10.5), A(0), undefined, 100));
    e.mDelay = 3;
    const areas: any[] = [];
    const orig = world.mMap.mAffect.AffectArea.bind(world.mMap.mAffect);
    world.mMap.mAffect.AffectArea = (r: any, a: any) => { areas.push([r.x, r.y, r.width, r.height, a._CLASSID_, a.mRange]); orig(r, a); };
    for (let t = 0; t < 3; t++) world.mThing_Collection.Process();
    expect(areas).toEqual([]);
    world.mThing_Collection.Process();
    expect(areas).toEqual([[8.5, 8.5, 4, 4, 'CThing_Affect_Explosion', 2]]);
    for (let t = 0; t < 10; t++) world.mThing_Collection.Process(); // fake animation: 10 frames at 2.5 per tick
    expect(ofClass(world, 'CThing_Effect_Explosion').length).toBe(0);
  });
});

describe('CThing_Object_Pickup', () => {
  it('picked up by a player standing on it, hidden for 30 s (10 s in DeathMatch), then back', () => {
    world = makeWorld(12, 8);
    const pk = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Pickup(P(4.2, 3.9), A(0)));
    pk.Process();
    expect([pk.mPosition.mX, pk.mPosition.mY]).toEqual([4.5, 3.5]);
    const picked: any[] = [];
    const player = { _CLASSID_: 'CThing_Creature_Player', sUniqueID: 'tP', mFlags: 0, mPosition: P(4.5, 3.5), RandomPickup() { picked.push(1); return true; } };
    world.mMap.mMapwho.AddThing(player);
    pk.mCurrentCell.mCollide |= World.Map.CMap_Cell.mCollide_Player;
    pk.Process();
    expect(picked.length).toBe(1);
    expect(playedSounds).toEqual(['Object_Pickup_wav']);
    expect(pk.mReappearCount).toBe(CMain.mFPS * 30);
    expect(pk.Process).toBe(pk.Process_Count);
    for (let t = 0; t <= CMain.mFPS * 30; t++) pk.Process();
    expect(pk.Process).toBe(pk.Process_Init);
    (World.CWorld as any).mGameMode = 'DeathMatch';
    pk.Process(); // Process_Init -> Process_Normal -> picked up again (player still on the cell)
    expect(picked.length).toBe(2);
    expect(pk.mReappearCount).toBe(CMain.mFPS * 10);
  });

  it('a dead player cannot pick up; dropped pickups (SetDeleteCounter) fade and delete themselves', () => {
    world = makeWorld(12, 8);
    const pk = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Pickup(P(4.5, 3.5), A(0)));
    pk.mDeleteOnPickup = true;
    pk.SetDeleteCounter(CMain.mFPS * 10);
    pk.Process();
    expect(pk.Process).toBe(pk.Process_DeleteCounter);
    for (let t = 0; t < CMain.mFPS * 10 - 5; t++) pk.Process();
    expect(pk.mAlpha).toBeCloseTo((5 / CMain.mFPS) * 100, 9);
    for (let t = 0; t < 10 && pk.Process; t++) pk.Process();
    expect(pk.Process).toBeUndefined();
  });
});

describe('CThing_Object_Mine', () => {
  it('a creature on the cell arms it; it explodes CMain.mFPS * 2 ticks later with the owner as parent', () => {
    world = makeWorld(12, 8);
    const owner = { mID: 7 };
    const m = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Mine(P(5.3, 4.8), A(0), owner, 100));
    m.Process();
    expect(m.mTestFlags).toBe(World.Map.CMap_Cell.mCollide_Creature);
    m.Process();
    expect(m.Process).toBe(m.Process_Normal);
    m.mCurrentCell.mCollide |= World.Map.CMap_Cell.mCollide_Creature;
    m.Process();
    expect(m.Process).toBe(m.Process_Detonate);
    expect(playedSounds).toEqual(['Object_Mine_Detonate_wav']);
    let ticks = 0;
    while (m.Process && ticks < 200) { m.Process(); ticks++; }
    expect(ticks).toBe(CMain.mFPS * 2); // counter 50 -> explodes when it drops below 0 (the arming tick already counted 1)
    const boom = ofClass(world, 'CThing_Effect_Explosion');
    expect(boom.map((b) => [b.mParent, b.mDamage])).toEqual([[owner, 100]]);
  });

  it('DeathMatch: players trigger it too, but only after the cell was empty once', () => {
    (World.CWorld as any).mGameMode = 'DeathMatch';
    world = makeWorld(12, 8);
    const m = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Mine(P(5.5, 4.5), A(0), { mID: 1 }, 100));
    const cell = world.mMap.mCells[4][5];
    cell.mCollide |= World.Map.CMap_Cell.mCollide_Player; // the layer stands on it
    m.Process();
    expect(m.Process).toBe(m.Process_WaitForCollideFlags0);
    m.Process();
    expect(m.Process).toBe(m.Process_WaitForCollideFlags0);
    cell.mCollide &= ~World.Map.CMap_Cell.mCollide_Player;
    m.Process();
    expect(m.Process).toBe(m.Process_Normal);
    cell.mCollide |= World.Map.CMap_Cell.mCollide_Player;
    m.Process();
    expect(m.Process).toBe(m.Process_Detonate);
  });
});

describe('CThing_Object_Wall (fake wall)', () => {
  it('sleeps until affected, shows damage frames, fades out at life <= 0 with a smoke cloud', () => {
    world = makeWorld(12, 8);
    const w = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Wall(P(6.5, 3.5), A(0), { mID: 3 }));
    w.Process();
    expect(w.Process).toBe(w.Process_Sleep);
    expect(w.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Object).toBe(World.Map.CMap_Cell.mCollide_Object);
    const z = { mID: 99, mPosition: P(5.5, 3.5), mAngle: A(0) };
    w.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(z, 250));
    expect(w.Process).toBe(w.Process_Normal);
    w.Process();
    expect(w.mLife).toBe(750);
    expect(w.mcDrawObject.pos).toBe(Math.floor(0.25 * 10));
    expect(w.Process).toBe(w.Process_Sleep);
    w.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(z, 750));
    w.Process();
    expect(w.mAlpha).toBe(80);
    expect(ofClass(world, 'CThing_Effect_SmokeCloud').length).toBe(1);
    for (let t = 0; t < 10 && w.Process; t++) w.Process();
    expect(w.Process).toBeUndefined();
    expect(w.mAlpha).toBe(0);
  });
});

describe('player vs zombie (real CMap navigation / collision, fake renderers)', () => {
  it('a player holding fire kills a zombie walking at him; the corpse is removed after the dead fade', () => {
    world = makeWorld(18, 7);
    const c = world.mThing_Collection;
    const p = c.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(2.5, 3.5), 0));
    const z = c.AddThing(new Thing.Creature.CThing_Creature_Zombie(P(14.5, 3.5)));
    const fire = CMain.mInput.KEY_FIRE;
    const lifeSteps: number[] = [];
    let deadAt = -1;
    let goneAt = -1;
    for (let t = 0; t < 3000 && goneAt < 0; t++) {
      fire.pressed = true;
      const life = z.mLife;
      c.Process();
      if (life != undefined && z.mLife != life) lifeSteps.push(z.mLife);
      if (deadAt < 0 && world.kills.includes(z)) deadAt = t;
      if (deadAt >= 0 && c.mThings[z.sUniqueID] == undefined) goneAt = t;
    }
    expect(lifeSteps).toEqual([74, 48, 22, -4]); // 4 pistol hits of 26
    expect(deadAt).toBeGreaterThan(0);
    expect(goneAt).toBeGreaterThan(deadAt);
    expect(z.mLife).toBeLessThanOrEqual(0);
    expect(c.mThingCounters.CThing_Creature_Zombie).toBe(0);
    expect(p.mFlags & Thing.CThing.mFlag_DEAD).toBe(0);
    expect(FakeMovieClipPrimitive.created).toContain('Pistol.MuzzleFlash');
    expect(c.mThingCounters.INVALIDPOSITION).toBe(0);
  });

  it('an unarmed standing player gets attacked once the zombie is adjacent', () => {
    world = makeWorld(12, 7);
    const c = world.mThing_Collection;
    const p = c.AddThing_Player(new Thing.Creature.CThing_Creature_Player(P(2.5, 3.5), 0));
    const z = c.AddThing(new Thing.Creature.CThing_Creature_Zombie(P(8.5, 3.5)));
    let minLife = 200;
    let attacked = false;
    for (let t = 0; t < 2000 && !attacked; t++) {
      c.Process();
      if (z.mStateID == 'State_Attack') attacked = true;
      minLife = Math.min(minLife, p.mLife);
    }
    expect(attacked).toBe(true);
    for (let t = 0; t < 200; t++) {
      c.Process();
      minLife = Math.min(minLife, p.mLife);
    }
    expect(minLife).toBeLessThan(200);
  });
});
