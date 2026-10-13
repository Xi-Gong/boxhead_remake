// Lane X2: helpers for the gameplay / effects / audio verification suites (tests/sim/fx_*.test.ts,
// tests/sim/weapons_*.test.ts). Everything runs through the REAL game booted by the headless harness; the helpers only
// observe (sound / message / decal recorders wrap the real methods and call through) or set up a scenario the way the
// game itself would (placing a creature = what CWorld.Spawn_Zombie does, raising the multiplier = what
// CUpgrades.SetDifficulty does).
import { CSound, Thing, World } from '../../src/game/packages.ts';
import { createHeadlessGame, KEYS, thingList, type HeadlessGame, type HeadlessGameOptions } from './harness.ts';

export interface SoundRec {
  /** Key in CSound.mSamples ("Weapon_Pistol_Fire_wav") or "amb:<key>" for CSound.mAmbience. */
  name: string;
  /** Library linkage of the sample ("Weapon.Pistol.Fire.wav"). */
  link: string;
  /** Target volume as Flash stores it (int32 of vol * mVolumeLevel). */
  volume: number;
  pan: number;
  /** World tick when it was started (undefined outside a world). */
  tick: number | undefined;
  /** false when CSound.PlaySound returned early (sound switched off). */
  played: boolean;
}

/** Records every CSound.PlaySound (the single place every sample starts, see CSound.as). */
export function recordSounds(g: HeadlessGame): SoundRec[] {
  const out: SoundRec[] = [];
  const S = CSound as any;
  const names = new Map<any, string>();
  for (const k of Object.keys(S.mSamples)) names.set(S.mSamples[k], k);
  for (const k of Object.keys(S.mAmbience)) names.set(S.mAmbience[k], 'amb:' + k);
  const snd = S.mSound;
  const orig = Object.getPrototypeOf(snd).PlaySound;
  snd.PlaySound = function (this: any, item: any, secOffset?: any, nLoop?: any): void {
    const played = !(item.mType == 'sfx' && !S.mSFXActive || item.mType == 'music' && !S.mMUSICActive);
    out.push({ name: names.get(item) ?? '?', link: item.mLinkID, volume: item.oSound.getVolume(), pan: item.oSound.getPan(), tick: g.world()?.mTick, played });
    return orig.call(this, item, secOffset, nLoop);
  };
  return out;
}

export interface MessageRec { text: string; color: number; silent: boolean; tick: number }

/** Records every CHud.AddMessage (info white, level white, upgrade green, critical red). */
export function recordMessages(g: HeadlessGame): MessageRec[] {
  const out: MessageRec[] = [];
  const hud = g.world().mHud;
  const orig = hud.AddMessage;
  hud.AddMessage = function (this: any, tText: any, tColor: any): void {
    out.push({ text: String(tText), color: tColor, silent: !!this.mSilentMessages, tick: g.world()?.mTick });
    return orig.call(this, tText, tColor);
  };
  return out;
}

export interface DecalRec { kind: 'blood' | 'scorch'; x: number; y: number; dir: number; frame: number; tick: number }

/** Records the decals stamped into the floor (CDrawPrimitive_MovieClip_Directional.QRender_Mask of the two caches). */
export function recordDecals(g: HeadlessGame): DecalRec[] {
  const out: DecalRec[] = [];
  const D = World.Map.CMap_Decal as any;
  const decal = g.world().mMap.mDecal;
  // make sure both caches exist (the first Draw_* call builds them; draw one of each far outside the visible area)
  for (const [fn, kind] of [['Draw_BloodSplat', 'blood'], ['Draw_ScorchMark', 'scorch']] as const) {
    if (!D[kind === 'blood' ? 'bmBloodSplat' : 'bmScorchMark']) decal[fn](new Thing.Math.CThing_Position(0.5, 0.5, 0));
    const cache = D[kind === 'blood' ? 'bmBloodSplat' : 'bmScorchMark'];
    if (cache.__x2rec) continue;
    const orig = cache.QRender_Mask;
    cache.QRender_Mask = function (this: any, bmDraw: any, pos: any, dir: any, mask: any): void {
      (cache.__x2out as DecalRec[]).push({ kind, x: pos.x, y: pos.y, dir, frame: Math.floor(this.mAnimationPosition), tick: g.world()?.mTick });
      return orig.call(this, bmDraw, pos, dir, mask);
    };
    cache.__x2rec = true;
  }
  (D.bmBloodSplat as any).__x2out = out;
  (D.bmScorchMark as any).__x2out = out;
  return out;
}

/** No random zombie / devil spawns (what the visual scenes' `noSpawn` does, on the world instance only). */
export function noSpawn(g: HeadlessGame): void {
  const w = g.world();
  w.Spawn_Zombie = (): boolean => false;
  w.Spawn_Devil = (): boolean => false;
}

export function pos(x: number, y: number, z = 0): any {
  return new Thing.Math.CThing_Position(x, y, z);
}

/** Puts player `index` at (x, y) facing direction `dir` (0 = east, clockwise). */
export function placePlayer(g: HeadlessGame, x: number, y: number, dir = 0, index = 0): any {
  const p = g.players().find((q) => q.mPlayerIndex === index);
  p.Move(pos(x, y));
  p.SetCollideDirection(p.mPosition, World.Map.CMap_Cell.mCollide_Player);
  p.mAngle.__set__mDirection(dir);
  return p;
}

/** A zombie at (x, y) exactly as CWorld.Spawn_Zombie creates one (counter first, then the thing). */
export function addZombie(g: HeadlessGame, x: number, y: number): any {
  const w = g.world();
  w.mUpgrades.__set__mZombieCount(w.mUpgrades.__get__mZombieCount() + 1);
  return w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Zombie(pos(x, y)));
}

export function addDevil(g: HeadlessGame, x: number, y: number): any {
  const w = g.world();
  w.mUpgrades.__set__mDevilCount(w.mUpgrades.__get__mDevilCount() + 1);
  return w.mThing_Collection.AddThing(new Thing.Creature.CThing_Creature_Devil(pos(x, y)));
}

/** Raises the multiplier one step at a time to `m` (the CUpgrades.SetDifficulty path: every upgrade on the way). */
export function raiseMultiplier(g: HeadlessGame, m: number): void {
  const u = g.world().mUpgrades;
  while (u.__get__mMultiplier() < m) u.__set__mMultiplier(u.__get__mMultiplier() + 1);
}

/** Keeps the multiplier from decaying (its timer is only a few ticks at high multipliers). */
export function holdMultiplier(g: HeadlessGame): void {
  const u = g.world().mUpgrades;
  u.mMultiplierTick = 1e9;
  u.mMultipleKillsTick = 1e9;
}

export function things(g: HeadlessGame, cls?: string): any[] {
  const list = thingList(g.world());
  return cls ? list.filter((t) => t._CLASSID_ === cls) : list;
}

/** Live (not yet deleted) things of a class: still have a Process function. */
export function live(g: HeadlessGame, cls: string): any[] {
  return things(g, cls).filter((t) => typeof t.Process === 'function');
}

/** Things created after `before` (uniqueIDs are allocated in creation order). */
export function newThings(g: HeadlessGame, before: number, cls?: string): any[] {
  return things(g, cls).filter((t) => t.mUniqueID > before);
}

export function lastID(): number {
  return (Thing.CThing as any).mAllocate_ID;
}

/** Press and release the fire key of player `index` around one world tick, then one more tick. */
export function tapFire(g: HeadlessGame, index = 0): void {
  const k = index === 0 ? KEYS.P1.FIRE : KEYS.P2.FIRE;
  g.keyDown(k);
  g.tick(1);
  g.keyUp(k);
  g.tick(1);
}

/**
 * Selects a weapon the way a released digit key / NEXT / PREV does in State_PlayerControl: FIRE.Renew() (drops a
 * stale press latch), then the player's own SelectWeapon.
 */
export function select(g: HeadlessGame, name: string, index = 0): any {
  const p = g.players().find((q) => q.mPlayerIndex === index);
  p.mControls.FIRE.Renew();
  p.SelectWeapon(name);
  return p.mWeapon_Current;
}

/** A Single game in BOXY with no random spawns, the player at (6.5, 8.5) facing east (open floor ahead). */
export function openFloorGame(opts: HeadlessGameOptions = {}): HeadlessGame {
  const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 1, ...opts });
  noSpawn(g);
  placePlayer(g, 3.5, 8.5, 0);
  g.tick(1);
  return g;
}

/** Records every thing added to the collection from now on (shots and effects may already be gone when checked). */
export function recordAdds(g: HeadlessGame): any[] {
  const out: any[] = [];
  const tc = g.world().mThing_Collection;
  const orig = tc.AddThing;
  tc.AddThing = function (this: any, t: any): any {
    out.push(t);
    return orig.call(this, t);
  };
  return out;
}

export const ofClass = (list: any[], cls: string): any[] => list.filter((t) => t._CLASSID_ === cls);

/** Angle in degrees normalised to (-180, 180], rounded to 1/100. */
export const deg = (rad: number): number => {
  let d = (rad * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return Math.round(d * 100) / 100;
};
