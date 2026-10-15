// Deviation COOP_DEATH_WEAPON_CRATE (v0.1.9): a Coop player's death drops a crate with every active non-pistol
// weapon at its live ammo; any living player picks it up by walking over it (owner: exact restore incl. the held
// weapon; teammate: best of both). Coop only — Single death ends the run, Death Match keeps its original random
// pickup drop. The crate never expires.
import { describe, expect, it } from 'vitest';
import { Thing, World } from '../../src/game/packages.ts';
import { CThing_Object_WeaponCrate, applyCratePayload, captureCratePayload } from '../../src/game/local/WeaponCrate.ts';
import { RESUME_VERSION, applyToWorld, capture, clearAll } from '../../src/game/local/Resume.ts';
import { createHeadlessGame, thingList, type HeadlessGame } from './harness.ts';

const grant = (p: any, name: string, ammo: number): void => {
  p.NewWeapon(name);
  p.mWeapons[name].mThing.mAmmo = ammo;
};
const cratesOf = (w: any): any[] => thingList(w).filter((t) => t._CLASSID_ === 'CThing_Object_WeaponCrate');
/**
 * A walkable, thing-free cell at least minDist cells away from every given player (BOXY is only 22x17 with both
 * coop spawns near the middle, so keep minDist small), so only the collector ever stands on the crate's cell.
 */
function farFreeCell(g: HeadlessGame, from: any[], minDist: number): { x: number; y: number } {
  const w = g.world()!;
  const cells = w.mMap.mCells;
  const SOLID = World.Map.CMap_Cell.mCollide_StaticImpassable;
  const occupied = new Set(g.things().filter((t) => t.mPosition).map((t) => `${Math.floor(t.mPosition.mX)},${Math.floor(t.mPosition.mY)}`));
  for (let cy = 0; cy < cells.length; cy++) {
    for (let cx = 0; cx < cells[cy].length; cx++) {
      if (cells[cy][cx].mCollide & SOLID) continue;
      if (occupied.has(`${cx},${cy}`)) continue;
      if (from.every((t) => Math.abs(t.mPosition.mX - (cx + 0.5)) >= minDist || Math.abs(t.mPosition.mY - (cy + 0.5)) >= minDist)) {
        return { x: cx + 0.5, y: cy + 0.5 };
      }
    }
  }
  throw new Error('no free cell found');
}
const moveTo = (p: any, x: number, y: number): void => p.Move(new Thing.Math.CThing_Position(x, y, 0));

describe('coop death weapon crate (deviation COOP_DEATH_WEAPON_CRATE)', () => {
  it('captureCratePayload snapshots active non-pistol weapons with live ammo + the held weapon', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 21 });
    const p1 = g.players()[0]!;
    grant(p1, 'uzi', 37);
    grant(p1, 'shotgun', 3);
    p1.mWeapons.uzi.mThing.mAmmo = 37; // (already set; totalAmmo stays the fresh value)
    p1.SelectWeapon('uzi');
    const payload = captureCratePayload(p1)!;
    expect(payload.weapons.map((w: any) => [w.nameID, w.ammo])).toEqual([['uzi', 37], ['shotgun', 3]]);
    expect(payload.weapons[0].totalAmmo).toBe(p1.mWeapons.uzi.mThing.mTotalAmmo);
    expect(payload.currentWeapon).toBe('uzi');
    // Pistol (infinite ammo) and empty weapons are never restorable payload.
    expect(captureCratePayload(g.players()[1]!)).toBe(null);
    p1.mWeapons.shotgun.mThing.mAmmo = 0;
    p1.mWeapons.uzi.mThing.mAmmo = 0;
    expect(captureCratePayload(p1)).toBe(null);
  });

  it('LogKill spawns exactly one crate with the exact payload at the death cell (Coop)', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 22 });
    const w = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 37);
    grant(p1, 'shotgun', 3);
    p1.SelectWeapon('uzi');
    const deathPos = p1.mPosition.Clone();
    const p2Spawn = p2.mPosition.Clone();
    const far = farFreeCell(g, [p1, p2], 4);
    moveTo(p2, far.x, far.y);
    w.LogKill(p1);
    moveTo(p1, p2Spawn.mX, p2Spawn.mY); // the (fake-dead) player must not stand on its own crate
    const crates = cratesOf(w);
    expect(crates.length).toBe(1);
    expect(crates[0].mPayload.weapons.map((x: any) => [x.nameID, x.ammo])).toEqual([['uzi', 37], ['shotgun', 3]]);
    expect(crates[0].mPayload.currentWeapon).toBe('uzi');
    g.tick(1); // crate runs Process_Init
    expect(crates[0].mCurrentCell).toBe(w.mMap.GetCell(deathPos.mX, deathPos.mY));
    expect(crates[0].Process).toBe(crates[0].Process_Normal);
  });

  it('no crate when there is nothing to restore (pistol only)', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 23 });
    const w = g.world()!;
    w.LogKill(g.players()[0]!);
    expect(cratesOf(w).length).toBe(0);
  });

  it('Single death drops no crate', () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, seed: 24 });
    const w = g.world()!;
    const p1 = g.players()[0]!;
    grant(p1, 'uzi', 37);
    w.LogKill(p1);
    expect(cratesOf(w).length).toBe(0);
  });

  it('Death Match keeps the original random pickup drop and spawns no weapon crate', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', room: 1, seed: 25 });
    const w = g.world()!;
    const p1 = g.players()[0]!;
    grant(p1, 'uzi', 37);
    w.LogKill(p1);
    expect(cratesOf(w).length).toBe(0);
    const dropped = thingList(w).filter((t) => t._CLASSID_ === 'CThing_Object_Pickup' && t.mDeleteOnPickup);
    expect(dropped.length).toBe(1); // the original DM drop, 10 s expiry
  });

  it('respawned owner recovers exact weapons, ammo and the held weapon', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 26 });
    const w = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 37);
    grant(p1, 'shotgun', 3);
    p1.SelectWeapon('uzi');
    const far = farFreeCell(g, [p1, p2], 4);
    moveTo(p2, far.x, far.y);
    w.LogKill(p1);
    g.tick(1);
    const crate = cratesOf(w)[0]!;
    p1.ResetWeapons(); // what State_Respawn does: ammo 0, back to the pistol
    p1.SelectWeapon('pistol');
    expect(p1.mWeapon_Current.mNameID).toBe('pistol');
    moveTo(p1, crate.mPosition.mX, crate.mPosition.mY);
    crate.PickedUp();
    expect(p1.mWeapons.uzi.mThing.mAmmo).toBe(37);
    expect(p1.mWeapons.shotgun.mThing.mAmmo).toBe(3);
    expect(p1.mWeapon_Current.mNameID).toBe('uzi'); // auto-switch off the pistol
    g.tick(2);
    expect(cratesOf(w).length).toBe(0); // gone once picked up
  });

  it('teammate pickup takes the best of both (grants missing weapons, maxes ammo, no forced switch off a held gun)', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 27 });
    const w = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 80);
    grant(p1, 'shotgun', 3);
    p1.SelectWeapon('uzi');
    grant(p2, 'uzi', 90); // teammate already better on the uzi
    const far = farFreeCell(g, [p2], 8);
    moveTo(p1, far.x, far.y);
    w.LogKill(p1);
    g.tick(1);
    const crate = cratesOf(w)[0]!;
    moveTo(p2, crate.mPosition.mX, crate.mPosition.mY);
    p2.SelectWeapon('pistol');
    crate.PickedUp();
    expect(p2.mWeapons.uzi.mThing.mAmmo).toBe(90); // max(90, 80): never weakened
    expect(p2.mWeapons.shotgun.mActive).toBe(true); // granted fresh = full magazine
    expect(p2.mWeapons.shotgun.mThing.mAmmo).toBe(p2.mWeapons.shotgun.mThing.mTotalAmmo);
    expect(p2.mWeapon_Current.mNameID).toBe('uzi'); // was on the pistol -> crate's held weapon
    // A picker already holding a gun keeps it (no forced switch); a missing weapon is granted FULL.
    const p3payload = { weapons: [{ nameID: 'grenade', ammo: 2, totalAmmo: 4 }], currentWeapon: 'grenade' };
    applyCratePayload(p2, p3payload);
    expect(p2.mWeapon_Current.mNameID).toBe('uzi');
    expect(p2.mWeapons.grenade.mThing.mAmmo).toBe(p2.mWeapons.grenade.mThing.mTotalAmmo); // fresh grant = full magazine
    expect(p2.mWeapons.grenade.mThing.mAmmo).toBeGreaterThanOrEqual(2); // never below the crate's ammo
  });

  it('dead players cannot consume the crate', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 28 });
    const w = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 37);
    const far = farFreeCell(g, [p1, p2], 4);
    moveTo(p2, far.x, far.y);
    w.LogKill(p1);
    g.tick(1);
    const crate = cratesOf(w)[0]!;
    p1.mFlags = p1.mFlags | Thing.CThing.mFlag_DEAD; // dying players still set the cell collide flag
    moveTo(p1, crate.mPosition.mX, crate.mPosition.mY);
    crate.PickedUp();
    expect(cratesOf(w).length).toBe(1); // untouched
    p1.mFlags = p1.mFlags & ~Thing.CThing.mFlag_DEAD;
    crate.PickedUp();
    expect(p1.mWeapons.uzi.mThing.mAmmo).toBe(37);
  });

  it('the crate never expires', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 29, options: { infiniteLife: true } });
    const w = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 37);
    const p2Spawn = p2.mPosition.Clone();
    const far = farFreeCell(g, [p1, p2], 4);
    moveTo(p2, far.x, far.y);
    w.LogKill(p1);
    moveTo(p1, p2Spawn.mX, p2Spawn.mY); // nobody stands on the crate while it waits
    g.tick(1);
    const crate = cratesOf(w)[0]!;
    g.tick(600); // 24 s of live simulation: zombies roam, nobody walks over the crate
    expect(cratesOf(w).length).toBe(1);
    expect(crate.mAlpha).toBe(100);
    expect(crate.Process).toBe(crate.Process_Normal);
  });
});

describe('crate persistence (Resume roundtrip)', () => {
  it('is captured with its payload, recreated on applyToWorld, and still pickable afterwards', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 31 });
    const w1 = g.world()!;
    const [p1, p2] = g.players();
    grant(p1, 'uzi', 37);
    grant(p1, 'shotgun', 3);
    p1.SelectWeapon('uzi');
    const deathPos = p1.mPosition.Clone();
    const p2Spawn = p2.mPosition.Clone();
    const far = farFreeCell(g, [p1, p2], 4);
    moveTo(p2, far.x, far.y);
    w1.LogKill(p1);
    moveTo(p1, p2Spawn.mX, p2Spawn.mY);
    g.tick(1);
    const crate = cratesOf(w1)[0]!;

    const snap = capture(w1);
    expect(snap.version).toBe(RESUME_VERSION);
    const obj: any = snap.objects.find((o) => o.classID === 'CThing_Object_WeaponCrate');
    expect(obj).toBeDefined();
    expect(obj.origin).toBe('placed'); // a 'marker' origin would never be recreated (not in the room init list)
    expect(obj.crate.weapons).toEqual(crate.mPayload.weapons);
    expect(obj.crate.currentWeapon).toBe('uzi');
    expect(obj.x).toBeCloseTo(crate.mPosition.mX, 6);
    expect(obj.y).toBeCloseTo(crate.mPosition.mY, 6);

    // Rebuild the room through the real flow, then re-apply the snapshot.
    clearAll();
    g.quit();
    expect(g.waitScreen('State_Debrief', 'Screen_Debrief')).toBe(true);
    g.retry();
    expect(g.waitRunning()).toBe(true);
    const w2 = g.world()!;
    expect(w2).not.toBe(w1);
    expect(cratesOf(w2).length).toBe(0); // the fresh build knows nothing of the crate
    expect(applyToWorld(w2, snap)).toBe(true);
    const crate2 = cratesOf(w2)[0]!;
    expect(crate2.mPayload.weapons).toEqual(crate.mPayload.weapons);
    expect(crate2.mPayload.currentWeapon).toBe('uzi');
    g.tick(1); // Process_Init
    expect(crate2.mCurrentCell).toBe(w2.mMap.GetCell(deathPos.mX, deathPos.mY));
    const np1 = g.players()[0]!; // the REBUILT world's player (the old reference is disposed with w1)
    np1.ResetWeapons(); // simulate the respawn: weapons emptied, back to the pistol
    expect(np1.mWeapon_Current.mNameID).toBe('pistol');
    moveTo(np1, crate2.mPosition.mX, crate2.mPosition.mY);
    crate2.PickedUp();
    expect(np1.mWeapons.uzi.mThing.mAmmo).toBe(37);
    expect(np1.mWeapon_Current.mNameID).toBe('uzi');
  });

  it('rejects snapshots from an older format version', () => {
    const g = createHeadlessGame({ mode: 'Coop', room: 1, seed: 32 });
    const w = g.world()!;
    const snap: any = capture(w);
    snap.version = RESUME_VERSION - 1;
    expect(applyToWorld(w, snap)).toBe(false);
  });
});
