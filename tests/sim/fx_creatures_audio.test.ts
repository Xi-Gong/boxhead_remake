// Lane X2: creatures and audio in a running game (headless harness): zombie melee and knock-back, devil fireballs /
// line of sight / obstacle clearing, player invincibility blink, regeneration, death and respawn, friendly fire, and
// the audio rules of CSound / CWorld.ProcessAmbience (sample volumes, zombie ambience channels, World.End, mute switch).
// Bytecode: generated/disasm/Thing.Creature.*.txt, CSound.txt, World.CWorld.txt.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import {
  addDevil, addZombie, noSpawn, ofClass, openFloorGame, placePlayer, pos, recordAdds, recordSounds, things,
} from './fxkit.ts';
import { CMain, CSound, Thing } from '../../src/game/packages.ts';

const clearBarrels = (g: ReturnType<typeof openFloorGame>): void => {
  for (const b of things(g, 'CThing_Object_Barrel')) b.Delete();
  g.tick(1);
};

describe('zombie', () => {
  it('speed 0.02 x SpeedUp (level 1: 1.1), 100 life, 100 points; Process_Init picks hit/death samples', () => {
    const g = openFloorGame();
    const z = addZombie(g, 15.5, 8.5);
    g.tick(2);
    expect([z.mLife, z.mMaxLife, z.mScore, z.mDamage]).toEqual([100, 100, 100, 50]);
    expect(z.mSpeed).toBeCloseTo(0.022, 12);
    expect(z.mSound.Damage.mLinkID).toMatch(/^Creature\.Zombie\.Ambience\.[1-4]\.wav$/);
    expect(z.mSound.Death.mLinkID).toMatch(/^Creature\.Zombie\.Ambience\.[1-4]\.wav$/);
    expect(g.errors).toEqual([]);
  });

  it('walks to the player and hits the adjacent cell at the end of its attack animation: 50 damage, Player State_ZombieHit', () => {
    const g = openFloorGame();
    clearBarrels(g);
    const p = placePlayer(g, 6.5, 8.5, 0);
    p.mInvincible = 0;
    const z = addZombie(g, 9.5, 8.5);
    let t = 0;
    while (p.mLife === 200 && t < 1000) {
      g.tick(1);
      t++;
      if (p.mInvincible) p.mInvincible = 0;
    }
    expect(p.mLife).toBeLessThan(200);
    // 50 damage minus the regeneration of the hit tick (200 / (mFPS * 30) per tick)
    expect(200 - p.mLife).toBeGreaterThan(49);
    expect(200 - p.mLife).toBeLessThanOrEqual(50);
    expect(p.mStateID).toBe('State_ZombieHit');
    expect(z.mStateID).toBe('State_Sleep');
    // knock-back: max(50 / 5 / 32 / mass 2, 0.3) = 0.3 away from the zombie
    expect(p.mDelta.__get__mLength()).toBeCloseTo(0.3 * 0.65, 6);
    expect(g.errors).toEqual([]);
  });

  it('a bullet knocks a zombie back (State_BulletHit) and plays its damage sample at volume 40 (0.4)', () => {
    const g = openFloorGame();
    clearBarrels(g);
    placePlayer(g, 3.5, 8.5, 0);
    const z = addZombie(g, 8.5, 8.5);
    g.tick(3);
    z.fState = z.State_Stand;
    const sounds = recordSounds(g);
    const x0 = z.mPosition.mX;
    g.keyDown(191);
    g.tick(1);
    g.keyUp(191);
    g.tick(1);
    expect(z.mStateID).toBe('State_BulletHit');
    expect(z.mLife).toBe(100 - 26);
    expect(z.mPosition.mX).toBeGreaterThan(x0);
    const hit = sounds.find((s) => s.link.startsWith('Creature.Zombie.Ambience.'));
    expect(hit?.volume).toBe(40);
    expect(g.errors).toEqual([]);
  });
});

describe('devil', () => {
  it('1000 life, speed 0.04, mass 5, 1000 points; facing a player within 5 cells with a clear line it throws a 50-damage fireball', () => {
    const g = openFloorGame();
    clearBarrels(g);
    const p = placePlayer(g, 6.5, 8.5, 0);
    const adds = recordAdds(g);
    const d = addDevil(g, 10.5, 8.5);
    let t = 0;
    while (!ofClass(adds, 'CThing_Shot_FireBall').length && t < 400) { g.tick(1); t++; if (p.mInvincible) p.mInvincible = 0; }
    expect([d.mMaxLife, d.mScore, d.mMass, d.mAttackRange, d.mAttackDamage]).toEqual([1000, 1000, 5, 5, 50]);
    expect(d.mSpeed).toBeCloseTo(0.04 * 1.1, 12);
    const fb = ofClass(adds, 'CThing_Shot_FireBall')[0];
    expect(fb).toBeDefined();
    expect(fb.mDamage).toBe(50);
    expect(fb.mDamageMultiply).toBe(false);
    expect(fb.mParent).toBe(d);
    // it flies at 0.15 x1.02 per tick and hits the player
    let n = 0;
    while (fb.Process && n < 100) { g.tick(1); n++; }
    expect(p.mLife).toBeLessThan(200);
    expect(p.mStateID).toBe('State_BulletHit');
    expect(g.errors).toEqual([]);
  });

  // Line of sight = Collide_Line with mAffect_PlayerLineOfSight: only solid map cells, players and devils (Affect_Setup
  // adds the flag) block it. Fake walls / barrels / zombies do NOT (faithful: a devil fires through a fake wall and the
  // fireball then hits the wall).
  it('line of sight: another devil in between blocks it, a fake wall does not', () => {
    const g = openFloorGame();
    clearBarrels(g);
    placePlayer(g, 4.5, 8.5, 0);
    const tc = g.world().mThing_Collection;
    const wall = tc.AddThing(new Thing.Object.CThing_Object_Wall(pos(6.5, 8.5)));
    const d = addDevil(g, 8.5, 8.5);
    const other = addDevil(g, 13.5, 3.5);
    g.tick(3);
    for (const x of [d, other]) x.fState = x.State_Stand;
    const decide = (): boolean => {
      d.mAngle.__set__mDirection(4);
      d.mCanAttack = true;
      d.mFireRateCount = 0;
      d.mTarget_Player = g.players()[0];
      return d.State_Attack_Decision();
    };
    expect(wall.mAffectFlags & Thing.Affect.CThing_Affect.mAffect_PlayerLineOfSight).toBe(0);
    expect(decide()).toBe(true);
    other.Move(pos(7.5, 8.5));
    other.SetRadius(0.42);
    expect(decide()).toBe(false);
    expect(g.errors).toEqual([]);
  });

  it('an object in its way (player out of range) gets a DevilAttack fireball (radius 1, 10000): a fake wall goes down at once', () => {
    const g = openFloorGame();
    clearBarrels(g);
    placePlayer(g, 1.5, 8.5, 0);
    const adds = recordAdds(g);
    const tc = g.world().mThing_Collection;
    for (const y of [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) tc.AddThing(new Thing.Object.CThing_Object_Wall(pos(8.5, y)));
    addDevil(g, 13.5, 8.5);
    let t = 0;
    const walls = ofClass(adds, 'CThing_Object_Wall');
    while (walls.every((w) => w.mLife > 0) && t < 1500) { g.tick(1); t++; const p = g.players()[0]; if (p) p.mInvincible = 5; }
    const dfb = ofClass(adds, 'CThing_Shot_FireBall');
    expect(dfb.length).toBeGreaterThan(0);
    expect(dfb[0].mDamageMultiply).toBe(true);
    expect(dfb[0].mRadius).toBe(1);
    expect(walls.filter((w) => w.mLife <= 0).length).toBeGreaterThan(0);
    expect(walls.find((w) => w.mLife <= 0)!.mLife).toBeLessThanOrEqual(1000 - 10000);
    expect(g.errors).toEqual([]);
  });
});

describe('player', () => {
  it('invincible 200 ticks after the first spawn, blinking (not drawn on odd counts); 0.16 cells per tick; life 200', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 3 });
    const p = g.players()[0];
    expect([p.mMaxLife, p.mSpeed, p.mMass]).toEqual([200, 0.16, 2]);
    const left = p.mInvincible;
    expect(left).toBeGreaterThan(150);
    const vis: boolean[] = [];
    for (let i = 0; i < 6; i++) { g.tick(1); vis.push(p.mVisible); }
    expect(vis).toEqual(vis.map((_, i) => ((p.mInvincible + (5 - i)) % 2) === 0));
    g.tick(250);
    expect(p.mInvincible).toBe(0);
    expect(p.mVisible).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('regenerates max / (mFPS * 30) per tick: 30 s from 0 to full', () => {
    const g = openFloorGame();
    const p = g.players()[0];
    p.mLife = 100;
    g.tick(CMain.mFPS * 15);
    expect(p.mLife).toBeCloseTo(200, 6);
    expect(g.errors).toEqual([]);
  });

  it('death: Creature.Player.Scream.1 at volume 70 (0.7), dead for mFPS*4 ticks with the last second fading, Single -> "player dead"', () => {
    const g = openFloorGame();
    const sounds = recordSounds(g);
    const p = g.players()[0];
    p.mInvincible = 0;
    p.mLife = 0;
    p.SetState('State_Dying');
    expect(sounds.map((s) => [s.name, s.volume])).toEqual([['Creature_Player_Scream_1_wav', 70]]);
    let t = 0;
    while (p.mStateID === 'State_Dying' && t < 100) { g.tick(1); t++; }
    expect(p.mStateID).toBe('State_Dead');
    expect(p.mStateCount).toBe(CMain.mFPS * 4);
    while (g.world()?.mCompleteState == undefined && t < 400) { g.tick(1); t++; }
    expect(g.world()?.mCompleteState ?? g.state()).toBeTruthy();
    expect(g.errors).toEqual([]);
  });

  it('Coop: a dead player respawns near the partner with 125 invincible ticks, full life, pistol only; Death Match: 25 ticks, far away', () => {
    for (const [mode, inv] of [['Coop', 125], ['DeathMatch', 25]] as const) {
      const g = createHeadlessGame({ mode, room: 9, seed: 5, difficulty: mode === 'Coop' ? 1 : 0 });
      noSpawn(g);
      const [p1, p2] = g.players();
      p2.mInvincible = 0;
      p2.mLife = 0;
      p2.SetState('State_Dying');
      let t = 0;
      while (p2.mStateID !== 'State_PlayerControl' && t < 600) { g.tick(1); t++; p1.mInvincible = 5; }
      expect(p2.mStateID, mode).toBe('State_PlayerControl');
      expect(p2.mInvincible, mode).toBe(inv - 1);
      expect(p2.mLife).toBe(200);
      expect(p2.mWeapon_Current.mNameID).toBe('pistol');
      const d = Math.hypot(p2.mPosition.mX - p1.mPosition.mX, p2.mPosition.mY - p1.mPosition.mY);
      if (mode === 'Coop') {
        expect(Math.abs(p2.mPosition.mX - p1.mPosition.mX)).toBeLessThanOrEqual(19);
        expect(Math.abs(p2.mPosition.mY - p1.mPosition.mY)).toBeLessThanOrEqual(13);
        expect(d * d).toBeGreaterThanOrEqual(4);
      } else {
        expect(d).toBeGreaterThan(5);
      }
      expect(g.errors).toEqual([]);
    }
  });

  it('friendly fire off: bullets pass through the partner, explosions do not hurt players; on: both hurt', () => {
    for (const damage of [0, 1] as const) {
      const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 6, options: { damage } });
      noSpawn(g);
      clearBarrels(g);
      const [p1, p2] = g.players();
      placePlayer(g, 4.5, 8.5, 0, 0);
      placePlayer(g, 8.5, 8.5, 4, 1);
      g.tick(1);
      p1.mInvincible = p2.mInvincible = 0;
      g.keyDown(191);
      g.tick(1);
      g.keyUp(191);
      g.tick(2);
      expect(p2.mLife < 200, `damage ${damage} bullet`).toBe(damage === 1);
      p2.mLife = 200;
      p1.mInvincible = p2.mInvincible = 0;
      g.world().mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(pos(8.5, 9.5), new Thing.Math.CThing_Angle(0), p1, 100));
      g.tick(2);
      expect(p2.mLife < 200, `damage ${damage} explosion`).toBe(damage === 1);
      expect(g.errors).toEqual([]);
    }
  });
});

describe('audio (CSound)', () => {
  it('sample table: linkage, volume level, play function (positional pan 0 / volume 100 for things)', () => {
    const g = openFloorGame();
    const S = CSound as any;
    const t = (k: string): [string, number] => [S.mSamples[k].mLinkID, S.mSamples[k].mVolumeLevel];
    expect(t('Creature_Player_Scream_1_wav')).toEqual(['Creature.Player.Scream.1.wav', 0.7]);
    expect(t('Creature_Player_Scream_2_wav')).toEqual(['Creature.Player.Scream.2.wav', 0.7]);
    expect(t('Creature_Zombie_Hit_1_wav')).toEqual(['Creature.Zombie.Ambience.1.wav', 0.4]);
    expect(t('Creature_Zombie_Hit_4_wav')).toEqual(['Creature.Zombie.Ambience.4.wav', 0.4]);
    expect(t('Creature_Zombie_Hit_wav')).toEqual(['Creature.Zombie.Hit.wav', 0.3]);
    expect(t('Shot_Grenade_Bounce_wav')).toEqual(['Shot.Grenade.Bounce.wav', 0.4]);
    expect(t('Weapon_Shotgun_Fire_wav')).toEqual(['Weapon.ShotGun.Fire.wav', 1]);
    expect(t('World_End_wav')).toEqual(['World.End.wav', 1]);
    expect(t('Click')).toEqual(['World.End.wav', 1]);
    expect(t('Click2')).toEqual(['CLICK.wav', 1]);
    expect(Object.keys(S.mAmbience)).toEqual(['Creature_Zombie_Ambience_1_wav', 'Creature_Zombie_Ambience_2_wav', 'Creature_Zombie_Ambience_3_wav', 'Creature_Zombie_Ambience_4_wav']);
    // every registered linkage resolves to an exported sound of the SWF
    for (const k of Object.keys(S.mSamples)) expect(S.mSamples[k].oSound.duration, k).toBeGreaterThan(0);
    expect(g.errors).toEqual([]);
  });

  it('a sample restarts instead of overlapping (PlaySound_Positional stops a playing instance first)', () => {
    const g = openFloorGame();
    const s = (CSound as any).mSamples.Weapon_Pistol_Fire_wav;
    s.PlaySound();
    expect(s.mPlaying).toBe(true);
    let stops = 0;
    const st = s.pClass.StopSound;
    s.pClass.StopSound = function (this: any, item: any): void { if (item === s) stops++; return st.call(this, item); };
    s.PlaySound();
    expect(stops).toBe(1);
    s.pClass.StopSound = st;
    g.tick(20);
    expect(s.mPlaying).toBe(false); // onSoundComplete
    expect(g.errors).toEqual([]);
  });

  it('zombie ambience: channels / interval by the number of zombies DRAWN (1 -> 1 ch / 150 ticks, 3..4 -> 2 / 150, 5..8 -> 3 / 60, 9+ -> 3 / 1); samples cycle 0..3 (0 does not exist: only 1..3 ever play), volume 40', () => {
    const g = openFloorGame();
    clearBarrels(g);
    placePlayer(g, 2.5, 14.5, 0);
    const sounds = recordSounds(g);
    const w = g.world();
    for (let i = 0; i < 10; i++) addZombie(g, 5.5 + i, 4.5 + (i % 3) * 2);
    g.tick(3);
    for (const z of things(g, 'CThing_Creature_Zombie')) z.fState = z.State_Stand;
    g.tick(200);
    expect([w.mZombieChannels, w.mZombieFrequency, w.mZombieVolume]).toEqual([3, 1, 100]);
    const amb = sounds.filter((s) => s.name.startsWith('amb:'));
    expect(amb.length).toBeGreaterThan(0);
    expect(new Set(amb.map((s) => s.name))).toEqual(new Set(['amb:Creature_Zombie_Ambience_1_wav', 'amb:Creature_Zombie_Ambience_2_wav', 'amb:Creature_Zombie_Ambience_3_wav']));
    expect(new Set(amb.map((s) => s.volume))).toEqual(new Set([40]));
    // never more than 3 ambience samples at once
    const playing = Object.values((CSound as any).mAmbience).filter((x: any) => x.mPlaying).length;
    expect(playing).toBeLessThanOrEqual(3);
    // no zombie drawn -> every ambience sample is stopped
    for (const z of things(g, 'CThing_Creature_Zombie')) z.Delete();
    g.tick(3);
    expect(Object.values((CSound as any).mAmbience).filter((x: any) => x.mPlaying)).toHaveLength(0);
    expect(w.mZombieFrequency).toBeUndefined();
    expect(g.errors).toEqual([]);
  });

  it('ambience advances exactly once per sim tick; an extra unticked Draw is a silent no-op (v0.1.10 net-stall gate)', () => {
    // Local Draw() is always paired 1:1 with a ticked Process() (CMain.ProcessFrames cap 1), so the mTick gate in
    // CWorld.Draw changes nothing offline. This pins that invariant: manual Draws without a tick (what a net stall /
    // net pause does) neither advance the ambience cadence nor inflate mZombie_DrawCount for the next bucket.
    const g = openFloorGame();
    clearBarrels(g);
    placePlayer(g, 2.5, 14.5, 0);
    const sounds = recordSounds(g);
    const w = g.world();
    for (let i = 0; i < 10; i++) addZombie(g, 5.5 + i, 4.5 + (i % 3) * 2);
    g.tick(3);
    for (const z of things(g, 'CThing_Creature_Zombie')) z.fState = z.State_Stand;
    g.tick(10);
    const before = sounds.length;
    const ticker = w.mAmbienceTicker;
    for (let i = 0; i < 5; i++) w.Draw(); // stalled renders: frozen world, no tick
    expect(w.mAmbienceTicker).toBe(ticker); // cadence follows the sim tick, not the render
    expect(sounds.length).toBe(before); // nothing fired over the frozen world
    expect(w.mZombie_DrawCount).toBe(0); // accumulators consumed per Draw (not 5 x 10 zombies inflated)
    g.tick(1);
    expect(w.mAmbienceTicker).toBe(ticker + 1); // the ticked Draw advances exactly one step
    expect(g.errors).toEqual([]);
  });

  it('mute switch (CSaveData.mSoundActive = false): playing sfx stop, nothing starts any more; back on: sounds again', () => {
    const g = openFloorGame();
    const sounds = recordSounds(g);
    const s = (CSound as any).mSamples.Weapon_Pistol_Fire_wav;
    s.PlaySound();
    expect(s.mPlaying).toBe(true);
    CMain.mSaveData.mSoundActive = false;
    expect(s.mPlaying).toBe(false);
    g.keyDown(191); g.tick(1); g.keyUp(191); g.tick(1);
    expect(sounds.slice(1).map((x) => [x.name, x.played])).toEqual([['Weapon_Pistol_Fire_wav', false]]);
    expect(s.mPlaying).toBe(false);
    CMain.mSaveData.mSoundActive = true;
    g.tick(10);
    g.keyDown(191); g.tick(1); g.keyUp(191); g.tick(1);
    expect(sounds[sounds.length - 1]!.played).toBe(true);
    expect(g.errors).toEqual([]);
  });
});
