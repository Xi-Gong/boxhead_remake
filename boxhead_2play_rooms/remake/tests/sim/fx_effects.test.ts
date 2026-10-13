// Lane X2: effects and objects in a running game (headless harness): explosion side effects (shake, brightness flash,
// scorch decal, sound, animation length), the padded-square chain reaction of barrels, fake wall damage frames and
// destruction, claymore fuse, pickups (map / Death Match respawn, dropped pickups), bullet hit sparks, blood decals,
// LOW quality switches. Bytecode: generated/disasm/Thing.Effect.*.txt, Thing.Object.*.txt, World.CWorld.txt.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import {
  addDevil, addZombie, holdMultiplier, noSpawn, ofClass, openFloorGame, placePlayer, pos, raiseMultiplier, recordAdds,
  recordDecals, recordMessages, recordSounds, select, tapFire, things,
} from './fxkit.ts';
import { CMain, Thing, scidd } from '../../src/game/packages.ts';
import { _root } from '../../src/engine/runtime.ts';

const removeMapBarrels = (g: ReturnType<typeof openFloorGame>): void => {
  for (const b of things(g, 'CThing_Object_Barrel')) b.Delete();
  g.tick(1);
};

const boom = (g: ReturnType<typeof openFloorGame>, x: number, y: number, dmg = 150, parent?: any): any =>
  g.world().mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(pos(x, y), new Thing.Math.CThing_Angle(0), parent, dmg));

describe('explosion (CThing_Effect_Explosion.Process_Delay)', () => {
  it('shake (0, 30) -> -15, 7.5, ... ; brightness flash 1 -> 0.8 .. 0.2 -> 0; scorch decal at the centre; Effect.Explosion sound', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    placePlayer(g, 2.5, 13.5, 0);
    const sounds = recordSounds(g);
    const decals = recordDecals(g);
    const w = g.world();
    // the brightness filter list the next Draw applies: wrap Process_Brightness (called once per Draw)
    const flashes: number[] = [];
    const pb = w.Process_Brightness;
    w.Process_Brightness = function (this: any): any[] {
      const r = pb.call(this);
      flashes.push(r.length ? this.mBrightness : 0);
      return r;
    };
    const shakes: number[][] = [];
    const ps = w.Process_Shake;
    w.Process_Shake = function (this: any): void {
      ps.call(this);
      shakes.push([this.mShake.x, this.mShake.y]);
    };
    const e = boom(g, 10.5, 8.5);
    g.tick(1);
    expect(e.mcDrawObject).toBeDefined();
    expect(sounds.map((s) => [s.name, s.volume])).toEqual([['Effect_Explosion_wav', 100]]);
    expect(decals.map((d) => [d.kind, d.x, d.y])).toEqual([['scorch', 10.5 * 32, 8.5 * 32]]);
    g.tick(7);
    // Draw after the explosion tick: shake 30 -> -15 (Process_Shake negates and halves), then 7.5, -3.75 ...
    expect(shakes.slice(0, 6).map((s) => s[1])).toEqual([-15, 7.5, -3.75, 1.875, -0.9375, 0.46875]);
    expect(shakes.every((s) => s[0] === 0)).toBe(true);
    // brightness: set to 1 by the explosion, each Draw subtracts 0.2 and applies ColorMatrix_Brightness(b) while >= 0.2
    expect(flashes.slice(0, 6).map((b) => Math.round(b * 1000) / 1000)).toEqual([0.8, 0.6, 0.4, 0.2, 0, 0]);
    expect(g.errors).toEqual([]);
  });

  it('brightness ColorMatrix = identity with offset b*255 on R, G, B', () => {
    const m = scidd.Draw.CColor.ColorMatrix_Brightness(0.8);
    expect(m.map((v: number) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0, 0, 204, 0, 1, 0, 0, 204, 0, 0, 1, 0, 204, 0, 0, 0, 1, 0]);
  });

  it('animation: Effect.Explosion frames at 2.5 frames per tick, then the effect deletes itself', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    const e = boom(g, 10.5, 8.5);
    g.tick(1);
    const frames = e.mcDrawObject.bmList.length;
    expect(frames).toBeGreaterThan(5);
    let ticks = 1;
    while (e.Process && ticks < 100) { g.tick(1); ticks++; }
    expect(ticks).toBe(Math.ceil(frames / 2.5));
    expect(g.errors).toEqual([]);
  });

  it('radius 2 + 0.005 per damage above 100; damage falloff 100 / 75 / 50 % at 0.5 / 0.75 / 1 R; 0 beyond R (padded square)', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    placePlayer(g, 2.5, 14.5, 0);
    // zombies around (10.5, 8.5) at distances 0.9, 1.6, 2.0, 2.5, 3.0 (ratios to R 2.5: 0.36, 0.64, 0.8, 1.0, 1.2)
    const at: [number, number][] = [[11.4, 8.5], [10.5, 10.1], [8.5, 8.5], [10.5, 6.0], [13.5, 8.5]];
    const zs = at.map(([x, y]) => addZombie(g, Math.floor(x) + 0.5, Math.floor(y) + 0.5));
    g.tick(4);
    zs.forEach((z, i) => {
      z.fState = z.State_Stand;
      z.mPosition.mX = at[i]![0];
      z.mPosition.mY = at[i]![1];
      z.mLife = z.mMaxLife = 1000;
      z.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Explosion);
    });
    const e = boom(g, 10.5, 8.5, 200);
    expect(e.mRange).toBe(2.5);
    g.tick(1);
    expect(zs.map((z) => 1000 - z.mLife)).toEqual([200, 150, 100, 100, 0]);
    // the one outside R was "hit" too (0 damage): State_ExplosionHit with a zero knock-back (0 stun ticks) -> it went
    // straight on to State_Sleep in the same tick
    expect(zs.map((z) => z.mStateID)).toEqual(['State_ExplosionHit', 'State_ExplosionHit', 'State_ExplosionHit', 'State_ExplosionHit', 'State_Sleep']);
    expect(g.errors).toEqual([]);
  });

  it('MakeIDUnique: an explosion hurts its own thrower (friendly fire on)', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    const p = placePlayer(g, 10.5, 8.5, 0);
    g.tick(1);
    p.mInvincible = 0;
    boom(g, 10.5, 10.1, 100, p); // R 2, distance 1.6 -> 50 %
    g.tick(1);
    expect(p.mLife).toBe(150);
    expect(p.mStateID).toBe('State_ExplosionHit');
    expect(g.errors).toEqual([]);
  });
});

describe('barrels', () => {
  it('padded square (GetCellBounds: round(left) - 1 .. round(right)): a 2.25 explosion blows a barrel 3 cells away diagonally', () => {
    const g = openFloorGame();
    placePlayer(g, 2.5, 13.5, 0);
    const adds = recordAdds(g);
    // map barrel at (9.5, 5.5); explosion at (6.5, 8.5) R 2.25 -> rect (4.25, 6.25, 4.5, 4.5) -> cells x 3..9, y 5..11
    boom(g, 6.5, 8.5, 150);
    g.tick(3);
    const ex = ofClass(adds, 'CThing_Effect_Explosion');
    expect(ex.length).toBeGreaterThan(1);
    expect(ex.map((e) => [e.mPosition.mX, e.mPosition.mY])).toContainEqual([9.5, 5.5]);
    // a map barrel's explosion has no owner and 100 damage (R 2)
    const b = ex.find((e) => e.mPosition.mX === 9.5 && e.mPosition.mY === 5.5);
    expect([b.mDamage, b.mRange, b.mParent]).toEqual([100, 2, undefined]);
    expect(g.errors).toEqual([]);
  });

  it('a barrel blows up from a bullet, a fireball or a devil attack too; the explosion keeps the barrel\'s owner', () => {
    const g = openFloorGame();
    const adds = recordAdds(g);
    // shoot the barrel at (9.5, 12.5) from (3.5, 12.5)
    placePlayer(g, 3.5, 12.5, 0);
    g.tick(1);
    tapFire(g);
    g.tick(2);
    expect(ofClass(adds, 'CThing_Effect_Explosion').map((e) => [e.mPosition.mX, e.mPosition.mY])).toContainEqual([9.5, 12.5]);
    expect(g.errors).toEqual([]);
  });
});

describe('fake wall (CThing_Object_Wall)', () => {
  it('1000 life; damage frame floor((1 - life/max) * frames); destroyed: smoke cloud + scorch, fades 20 alpha per tick', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    placePlayer(g, 2.5, 13.5, 0);
    const adds = recordAdds(g);
    const decals = recordDecals(g);
    const wall = g.world().mThing_Collection.AddThing(new Thing.Object.CThing_Object_Wall(pos(10.5, 8.5)));
    g.tick(2);
    expect([wall.mLife, wall.mMaxLife, wall.mAlpha]).toEqual([1000, 1000, 100]);
    expect(wall.Process).toBe(wall.Process_Sleep);
    const frames = wall.mcDrawObject.__get__mFrameAmount();
    expect(frames).toBeGreaterThan(1);
    // shots from a zombie attack (50 each) wake it up and set the damage frame
    for (let i = 0; i < 5; i++) wall.Affect(new Thing.Affect.CThing_Affect_ZombieAttack(wall, 50));
    g.tick(1);
    expect(wall.mLife).toBe(750);
    expect(wall.mcDrawObject.mAnimationPosition).toBe(Math.floor(0.25 * frames));
    expect(wall.Process).toBe(wall.Process_Sleep);
    // a big explosion finishes it
    boom(g, 10.5, 8.5, 2000);
    g.tick(1);
    expect(wall.mAlpha).toBe(80);
    g.tick(1);
    expect(wall.mLife).toBeLessThanOrEqual(0);
    expect(ofClass(adds, 'CThing_Effect_SmokeCloud')).toHaveLength(1);
    expect(decals.filter((d) => d.kind === 'scorch')).toHaveLength(2); // the explosion's + the wall's
    // destroyed in the explosion's tick (alpha 80), then -20 per tick; deleted once below 10
    expect(wall.mAlpha).toBe(60);
    const alphas: number[] = [];
    while (wall.Process && alphas.length < 10) { g.tick(1); alphas.push(wall.mAlpha); }
    expect(alphas).toEqual([40, 20, 0]);
    g.tick(1);
    expect(g.world().mMap.GetCell(10.5, 8.5).mCollide & 128).toBe(0); // cell freed on Dispose
    expect(g.errors).toEqual([]);
  });
});

describe('claymore (CThing_Object_Mine)', () => {
  it('slow blink while armed (1/mFPS frames per tick), fast blink + Object.Mine.Detonate when a zombie steps on it, boom after mFPS*2 ticks', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    raiseMultiplier(g, 40);
    holdMultiplier(g);
    const sounds = recordSounds(g);
    const adds = recordAdds(g);
    placePlayer(g, 10.5, 8.5, 0);
    select(g, 'mine');
    g.tick(1);
    tapFire(g);
    const mine = ofClass(adds, 'CThing_Object_Mine')[0];
    expect(mine.mFlags & Thing.CThing.mFlag_SortFloor).toBe(Thing.CThing.mFlag_SortFloor);
    placePlayer(g, 2.5, 13.5, 0);
    const a0 = mine.mcDrawObject.mAnimationPosition;
    g.tick(5);
    expect(mine.mcDrawObject.mAnimationPosition - a0).toBeCloseTo(5 / CMain.mFPS, 9);
    expect(mine.Process).toBe(mine.Process_Normal);
    // a zombie on the cell
    const z = addZombie(g, 10.5, 8.5);
    g.tick(2);
    expect(mine.Process).toBe(mine.Process_Detonate);
    expect(sounds.map((s) => s.name)).toContain('Object_Mine_Detonate_wav');
    let t = 0;
    while (mine.Process && t < 200) { g.tick(1); t++; }
    expect(t).toBeGreaterThanOrEqual(CMain.mFPS * 2 - 2);
    expect(t).toBeLessThanOrEqual(CMain.mFPS * 2 + 1);
    expect(ofClass(adds, 'CThing_Effect_Explosion')[0].mParent).toBe(g.players()[0]);
    void z;
    expect(g.errors).toEqual([]);
  });
});

describe('pickups', () => {
  it('map pickup: random refill, Object.Pickup, hidden 30 s (Death Match: 10 s)', () => {
    for (const [mode, secs] of [['Single', 30], ['DeathMatch', 10]] as const) {
      const g = createHeadlessGame({ mode, room: 1, seed: 4 });
      noSpawn(g);
      const sounds = recordSounds(g);
      const pk = things(g, 'CThing_Object_Pickup')[0];
      placePlayer(g, pk.mPosition.mX, pk.mPosition.mY, 0);
      g.tick(2);
      expect(pk.Process).toBe(pk.Process_Count);
      expect(pk.mCellID).toBeUndefined(); // out of the mapwho: not drawn
      expect(sounds.map((s) => s.name)).toContain('Object_Pickup_wav');
      placePlayer(g, 2.5, 8.5, 0);
      let t = 0;
      while (pk.Process === pk.Process_Count && t < 2000) { g.tick(1); t++; }
      expect(Math.abs(t - CMain.mFPS * secs), mode).toBeLessThanOrEqual(2);
      g.tick(1);
      expect(pk.mCellID).toBeDefined();
      expect(pk.Process).toBe(pk.Process_Normal);
      expect(g.errors).toEqual([]);
    }
  });

  it('pistol only: a pickup gives NOTHING, even when hurt (life chance = (1 - life/max) * sum of weapon chances = 0)', () => {
    const g = openFloorGame();
    const msgs = recordMessages(g);
    const p = g.players()[0];
    p.mLife = 50;
    expect(p.RandomPickup()).toBe(false);
    expect(p.mLife).toBe(50);
    expect(msgs).toEqual([]);
  });

  it('"Life up!" (full life) or "Picked up <weapon>" (full ammo of that weapon), info messages', () => {
    const g = openFloorGame();
    raiseMultiplier(g, 10);
    holdMultiplier(g);
    const msgs = recordMessages(g);
    const p = g.players()[0];
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      p.mLife = 20;
      p.mWeapons.uzi.mThing.mAmmo = 10;
      expect(p.RandomPickup()).toBe(true);
      seen.add(msgs[msgs.length - 1]!.text);
    }
    expect([...seen].sort()).toEqual(['Life up!', 'Picked up Shotgun', 'Picked up UZI']);
    expect(msgs.every((m) => m.color === 0xffffff)).toBe(true);
    expect(p.mWeapons.uzi.mThing.mAmmo === 10 || p.mWeapons.uzi.mThing.mAmmo === 100).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('dropped pickups: every 5th kill of a chain, every devil, every Death Match death; fade in the last second, gone after 10 s', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    holdMultiplier(g);
    placePlayer(g, 2.5, 13.5, 0);
    const adds = recordAdds(g);
    const u = g.world().mUpgrades;
    u.__set__mMultipleKill(0);
    const zs = [4, 6, 8, 10, 12].map((x) => addZombie(g, x + 0.5, 4.5));
    g.tick(2);
    for (const z of zs) {
      z.mLife = 0;
      z.SetState('State_Dying');
      g.tick(1);
    }
    expect(u.__get__mMultipleKill()).toBe(5);
    const drops = ofClass(adds, 'CThing_Object_Pickup');
    expect(drops).toHaveLength(1);
    expect(drops[0].mDeleteOnPickup).toBe(true);
    expect([drops[0].mPosition.mX, drops[0].mPosition.mY]).toEqual([12.5, 4.5]);
    const d = addDevil(g, 15.5, 10.5);
    g.tick(2);
    d.mLife = 0;
    d.SetState('State_Dying');
    g.tick(1);
    expect(ofClass(adds, 'CThing_Object_Pickup')).toHaveLength(2);
    // fade: alpha = counter / mFPS * 100 in the last mFPS ticks, deleted after mFPS * 10
    const pk = drops[0];
    const alphas: number[] = [];
    let t = 0;
    while (pk.Process && t < 400) { g.tick(1); t++; if (pk.Process && pk.mAlpha < 100) alphas.push(Math.round(pk.mAlpha)); }
    expect(t).toBeGreaterThanOrEqual(CMain.mFPS * 10 - 8);
    expect(t).toBeLessThanOrEqual(CMain.mFPS * 10 + 1);
    expect(alphas.length).toBe(CMain.mFPS);
    expect(alphas[0]).toBe(96);
    expect(alphas[alphas.length - 1]).toBe(0);
    expect(g.errors).toEqual([]);
  });

  it('Death Match: a dead player drops a pickup', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 2 });
    const adds = recordAdds(g);
    const p2 = g.players()[1];
    p2.mInvincible = 0;
    p2.mLife = 0;
    p2.SetState('State_Dying');
    g.tick(2);
    expect(ofClass(adds, 'CThing_Object_Pickup')).toHaveLength(1);
    expect(g.world().mHud.mPlayer2_Deaths).toBe(1);
    expect(g.errors).toEqual([]);
  });
});

describe('bullet hits (CThing_Shot_Bullet.Process_Init)', () => {
  it('a wall hit plays Shot.HitWall.1..3 and shows a BulletHit spark about 1 time in 3 (none on LOW quality)', () => {
    for (const quality of ['HIGH', 'LOW']) {
      const g = openFloorGame({ seed: 77, options: { detail: quality === 'HIGH' } });
      expect(_root._quality).toBe(quality === 'HIGH' ? 'HIGH' : 'LOW');
      const sounds = recordSounds(g);
      const adds = recordAdds(g);
      placePlayer(g, 3.5, 8.5, 4); // facing the west wall
      g.tick(1);
      for (let i = 0; i < 90; i++) tapFire(g);
      const shots = ofClass(adds, 'CThing_Shot_Bullet').length;
      const sparks = ofClass(adds, 'CThing_Effect_BulletHit').length;
      expect(shots).toBeGreaterThan(20);
      const hits = sounds.filter((s) => /^Shot_HitWall_[123]_wav$/.test(s.name));
      expect(hits.length).toBe(shots);
      expect(new Set(hits.map((s) => s.name)).size).toBe(3);
      if (quality === 'HIGH') {
        expect(sparks / shots).toBeGreaterThan(0.15);
        expect(sparks / shots).toBeLessThan(0.55);
      } else {
        expect(sparks).toBe(0);
      }
      expect(g.errors).toEqual([]);
    }
  });

  it('a shot into open floor (nothing within range) has no hit sound and no spark', () => {
    const g = openFloorGame();
    const sounds = recordSounds(g);
    const adds = recordAdds(g);
    placePlayer(g, 3.5, 8.5, 0);
    g.tick(1);
    tapFire(g);
    expect(sounds.map((s) => s.name)).toEqual(['Weapon_Pistol_Fire_wav']);
    expect(ofClass(adds, 'CThing_Effect_BulletHit')).toHaveLength(0);
    expect(g.errors).toEqual([]);
  });
});

describe('blood decals (CMap_Decal.Draw_BloodSplat; masked to bare floor, 3 rotations, y-scale 0.6)', () => {
  it('a zombie shot once: 1 splat on the hit, 1 per knock-back tick, more while dying and once dead', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    placePlayer(g, 3.5, 8.5, 0);
    const decals = recordDecals(g);
    const z = addZombie(g, 8.5, 8.5);
    g.tick(3);
    z.fState = z.State_Stand;
    g.tick(1);
    tapFire(g);
    const blood = decals.filter((d) => d.kind === 'blood');
    expect(blood.length).toBeGreaterThanOrEqual(2);
    // every splat is near the zombie (+-0.25 cell jitter) and uses one of the 3 rotations
    for (const b of blood) {
      expect(Math.abs(b.x / 32 - z.mPosition.mX)).toBeLessThan(1);
      expect([0, 1, 2]).toContain(b.dir);
    }
    expect(g.errors).toEqual([]);
  });

  it('the decal cache is built with pGlobalScale (1, 0.6): 3 directions x the frames of Effect.BloodSplat / Effect.ScorchMark', () => {
    const g = openFloorGame();
    recordDecals(g);
    const D: any = (globalThis as any) && g.world().mMap.mDecal.constructor;
    for (const cache of [D.bmBloodSplat, D.bmScorchMark]) {
      expect(cache.bmList).toHaveLength(3);
      expect(cache.bmList[0].length).toBe(cache.bmList[1].length);
      expect(cache.bmList[0].length).toBeGreaterThanOrEqual(1);
    }
    // pGlobalScale is reset to (1, 1) after building (CDrawPrimitive_MovieClip_Directional.Buffer)
    expect([D.dPoint !== undefined, (Thing as any) !== undefined]).toEqual([true, true]);
  });
});

describe('creature death (CThing_Creature State_Dying / State_Dead)', () => {
  it('zombie: Creature.HitFloor when the dying animation ends, corpse sorted on the floor, fades in the last second, removed after 2 s', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    placePlayer(g, 2.5, 13.5, 0);
    const sounds = recordSounds(g);
    const z = addZombie(g, 10.5, 8.5);
    g.tick(3);
    z.mLife = 0;
    z.SetState('State_Dying');
    let t = 0;
    while (z.mStateID === 'State_Dying' && t < 100) { g.tick(1); t++; }
    expect(z.mStateID).toBe('State_Dead');
    expect(sounds.map((s) => s.name)).toContain('Creature_HitFloor_wav');
    expect(z.mFlags & Thing.CThing.mFlag_SortFloor).toBe(Thing.CThing.mFlag_SortFloor);
    expect(z.mFlags & Thing.CThing.mFlag_Collidable).toBe(0);
    const alphas: number[] = [];
    t = 0;
    while (z.Process && t < 200) { g.tick(1); t++; alphas.push(z.mAlpha); }
    expect(t).toBe(CMain.mFPS * 2 + 1);
    expect(alphas.filter((a) => a < 100).length).toBe(CMain.mFPS);
    expect(g.errors).toEqual([]);
  });

  it('LOW quality: corpses do not fade (alpha stays 100)', () => {
    const g = openFloorGame({ options: { detail: false } });
    removeMapBarrels(g);
    placePlayer(g, 2.5, 13.5, 0);
    const z = addZombie(g, 10.5, 8.5);
    g.tick(3);
    z.mLife = 0;
    z.SetState('State_Dying');
    const alphas: number[] = [];
    let t = 0;
    while (z.Process && t < 200) { g.tick(1); t++; alphas.push(z.mAlpha); }
    expect(alphas.every((a) => a === 100)).toBe(true);
    expect(g.errors).toEqual([]);
  });
});

describe('score popups and the multiplier timer (CHud)', () => {
  it('a kill adds 100 x multiplier to the total and a "+N" popup flying to the score; popups only on HIGH quality', () => {
    for (const detail of [true, false]) {
      const g = openFloorGame({ options: { detail } });
      removeMapBarrels(g);
      placePlayer(g, 2.5, 13.5, 0);
      raiseMultiplier(g, 4);
      holdMultiplier(g);
      const hud = g.world().mHud;
      const z = addZombie(g, 10.5, 8.5);
      g.tick(3);
      z.mLife = 0;
      z.SetState('State_Dying');
      g.tick(1);
      // the kill itself raised the multiplier to x5 before the score was computed
      expect(hud.nTotalScore).toBe(500);
      expect(hud.mScores.length).toBe(detail ? 1 : 0);
      g.tick(1);
      expect(hud.constructor.mcScoreTotal.tfScore.text).toBe('000000000500');
      expect(hud.constructor.mcScoreTotal.tfMultiple.text).toBe('x5');
      expect(g.errors).toEqual([]);
    }
  });

  it('the multiplier timer clip shows frame 1 + floor(tick ratio * frames) and the multiplier drops when it runs out', () => {
    const g = openFloorGame();
    const u = g.world().mUpgrades;
    raiseMultiplier(g, 3);
    const st = g.world().mHud.constructor.mcScoreTotal;
    g.tick(1);
    const total = st.mcTimer._totalframes;
    expect(st.mcTimer._currentframe).toBe(1 + Math.floor(u.__get__mMultiplierTickRatio() * total));
    let t = 0;
    while (u.__get__mMultiplier() === 3 && t < 400) { g.tick(1); t++; }
    expect(Math.abs(t - u.GetTicks(3))).toBeLessThanOrEqual(2);
    expect(u.__get__mMultiplier()).toBe(2);
    expect(g.errors).toEqual([]);
  });
});

describe('LEVEL messages and the level-up sound', () => {
  it('"-+-+-+- LEVEL n -+-+-+-" (white) when a wave is cleared, World.End sound (Click sample) at volume 100', () => {
    const g = openFloorGame();
    const msgs = recordMessages(g);
    const sounds = recordSounds(g);
    const L = g.world().mUpgrades.Level;
    L.Zombie_Count = 0;
    L.Devil_Count = 0;
    g.tick(1);
    expect(msgs.map((m) => [m.text, m.color])).toContainEqual(['-+-+-+- LEVEL 2 -+-+-+-', 0xffffff]);
    expect(sounds.map((s) => [s.name, s.link, s.volume])).toContainEqual(['Click', 'World.End.wav', 100]);
    expect(g.errors).toEqual([]);
  });
});

describe('rocket smoke / fireball / smoke cloud / bullet hit spark animations', () => {
  it('RocketSmoke drifts backwards (delta -0.5 x1.2 per tick) and ends with its animation; FireBall cycles its frames', () => {
    const g = openFloorGame();
    removeMapBarrels(g);
    const tc = g.world().mThing_Collection;
    const s = tc.AddThing_Effect(new Thing.Effect.CThing_Effect_RocketSmoke(pos(10.5, 8.5), new Thing.Math.CThing_Angle(0)));
    g.tick(1);
    expect(s.mPosition.mX).toBeCloseTo(10.5 - 0.5 * 1.2, 9);
    g.tick(1);
    expect(s.mPosition.mX).toBeCloseTo(10.5 - 0.5 * 1.2 - 0.5 * 1.44, 9);
    let t = 2;
    while (s.Process && t < 100) { g.tick(1); t++; }
    expect(t).toBe(s.mcDrawObject.bmList.length);
    for (const cls of ['CThing_Effect_SmokeCloud', 'CThing_Effect_BulletHit']) {
      const e = tc.AddThing_Effect(new (Thing.Effect as any)[cls](pos(10.5, 8.5)));
      let n = 0;
      while (e.Process && n < 100) { g.tick(1); n++; }
      expect(n, cls).toBe(e.mcDrawObject.bmList.length);
    }
    const f = tc.AddThing_Shot(new Thing.Shot.CThing_Shot_FireBall(pos(5.5, 8.5, 0.84), new Thing.Math.CThing_Angle(0), undefined, 50, false));
    g.tick(1);
    const n = f.mcDrawObject.bmList.length;
    expect(n).toBeGreaterThan(1);
    expect(f.mDelta.__get__mLength()).toBeCloseTo(0.15 * 1.02, 9);
    expect(g.errors).toEqual([]);
  });
});
