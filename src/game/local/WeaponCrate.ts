// LOCAL deviation COOP_DEATH_WEAPON_CRATE (v0.1.9): a Coop player's death drops a crate holding every active
// non-pistol weapon at its LIVE remaining ammo. Any living player picks it up by walking over it, exactly like a
// normal Object.Pickup (same art, same walk-over, same sound): the respawned owner gets the pre-death inventory
// back verbatim, a teammate gets the best of both (missing weapons granted fresh, kept weapons max their ammo).
// Coop only - Single death ends the run (checkpoint RETRY restores inventory itself) and Death Match keeps its
// original random-pickup drop. The crate never expires and survives save/resume + LAN checkpoints (Resume.ts
// re-creates it like a placed object). Spawned from the scope.ts CWorld.LogKill wrapper INSIDE the simulation on
// both lockstep peers: no RNG, no timers, static draw frame - deterministic by construction.
import { proto } from '../../engine/runtime.ts';
import { CSound, DrawPrimitive, Thing, World } from '../packages.ts';
import { CThing_Object } from '../Thing/Object/CThing_Object.ts';
import {enchantedAmmo,persistentWeapon,captureEnchantment,restoreEnchantment} from './EnchantmentRules.ts';
import {combatWorld,replenishedAmmo} from './CombatRules.ts';

/** One restorable weapon (subset of Resume's WeaponState in transport form). */
export interface CrateWeapon {
  nameID: string;
  ammo: number;
  totalAmmo: number;
  enchantedAmmo?: number;
  enchanted?: true;
}

/** What the crate holds; currentWeapon = the weapon the player DIED holding (for the auto-switch on pickup). */
export interface CratePayload {
  weapons: CrateWeapon[];
  currentWeapon?: string;
}

/**
 * Snapshot a player's restorable inventory: every active non-pistol weapon with at least one round left (an
 * all-empty backpack drops nothing - there is nothing to recover). Pure read, never mutates the player.
 */
export function captureCratePayload(p: any): CratePayload | null {
  const weapons: CrateWeapon[] = [];
  for (const entry of p?.mWeaponList ?? []) {
    if (!entry?.mActive || !entry.mThing || entry.mNameID === 'pistol') continue; // pistol has infinite ammo
    if (!(entry.mThing.mAmmo > 0)) continue; // empty slots are not restorable payload
    weapons.push({ nameID: entry.mNameID, ammo: entry.mThing.mAmmo, totalAmmo: entry.mThing.mTotalAmmo,
      ...captureEnchantment(entry.mThing) });
  }
  if (!weapons.length) return null;
  const cur = p.mWeapon_Current?.mNameID;
  return { weapons, currentWeapon: weapons.some((x) => x.nameID === cur) ? cur : undefined };
}

/**
 * Merge a crate into a picker. Weapons the picker lacks are granted through the game's own NewWeapon (a fresh
 * thing, full magazine - how every grant in the game works) and then max()ed against the crate; weapons they
 * already hold take max(current, crate) on BOTH ammo and totalAmmo, so a pickup can never weaken anyone. A picker
 * standing on the pistol auto-switches to the weapon the dead player was holding (if it ended up with ammo); a
 * picker already holding a gun keeps it. This is the same restore shape Resume.applyPlayer uses.
 */
export function applyCratePayload(p: any, payload: CratePayload): void {
  for (const cw of payload.weapons) {
    const entry = p.mWeapons?.[cw.nameID];
    if (!entry) continue;
    if (!entry.mActive) p.NewWeapon(cw.nameID);
    const thing = entry.mThing;
    if (!thing) continue;
    const keptEnchantment=persistentWeapon(thing),keptStock=enchantedAmmo(thing);
    thing.mAmmo = Math.max(thing.mAmmo, cw.ammo);
    if(combatWorld(p.mWorld))thing.mAmmo=replenishedAmmo(p.mWorld,thing.mAmmo,thing.mTotalAmmo,0);
    else thing.mTotalAmmo = Math.max(thing.mTotalAmmo, cw.totalAmmo);
    if(cw.enchantedAmmo!==undefined||cw.enchanted||keptEnchantment)restoreEnchantment(thing,{
      enchantedAmmo:keptStock===-1||cw.enchantedAmmo===-1?-1:Math.min(thing.mAmmo,Math.max(keptStock,cw.enchantedAmmo??0)),
      ...((keptEnchantment||(cw.ammo>0&&cw.enchanted))?{enchanted:true as const}:{}),
    });
  }
  const cur = payload.currentWeapon;
  if (cur != undefined && p.mWeapon_Current?.mNameID === 'pistol') {
    if ((p.mWeapons?.[cur]?.mThing?.mAmmo ?? 0) > 0) p.SelectWeapon(cur);
  }
}

/**
 * v0.2.3: a death on a StaticImpassable cell (explosion knock-back into a wall / the map border, or dying
 * stuck inside geometry) used to suppress the crate silently - the "sometimes no red box drops" report.
 * Instead, spiral out from the death cell (Chebyshev rings, row-major: deterministic, no RNG) and drop at
 * the first non-impassable cell, at most 6 cells away. The constructor snaps to the found cell's centre.
 * Returns undefined only if the entire 13x13 neighbourhood is impassable (no such spot exists in any of the
 * 18 rooms) - then, as before, no crate.
 */
export function crateDropPosition(world: any, death: any): any | undefined {
  const cells = world.mMap.mCells;
  const SOLID = World.Map.CMap_Cell.mCollide_StaticImpassable;
  const cx = death.mX & 16777215, cy = death.mY & 16777215;
  if (!(cells[cy][cx].mCollide & SOLID)) return death.Clone();
  const H = cells.length, W = cells[0].length;
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (y < 0 || y >= H || x < 0 || x >= W) continue;
        if (cells[y][x].mCollide & SOLID) continue;
        return new Thing.Math.CThing_Position(x + 0.5, y + 0.5, 0);
      }
    }
  }
  return undefined;
}

export class CThing_Object_WeaponCrate extends CThing_Object {
  /** The dead player's inventory (see captureCratePayload). */
  declare mPayload: CratePayload;

  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition: any, payload: CratePayload) {
    super(tPosition.__get__mCellCentre());
    this.mPayload = payload;
    // The original red supply crate art, unchanged (user decision: identical look and pickup feel).
    if (!CThing_Object_WeaponCrate.mcDrawObject_Cache) {
      CThing_Object_WeaponCrate.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Object.Pickup');
    }
    this.mcDrawObject = CThing_Object_WeaponCrate.mcDrawObject_Cache.Clone();
    this.Process = this.Process_Init;
    this.mAlpha = 100;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.AddThing(this);
    this.mCurrentCell = this.mWorld.mMap.GetCell(this.mPosition.mX, this.mPosition.mY);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    if (this.mCurrentCell.mCollide & World.Map.CMap_Cell.mCollide_Player) {
      this.PickedUp();
    }
  }

  /** Identical to CThing_Object_Pickup.PickedUp, except the grant and the permanent removal. */
  PickedUp(): void {
    const player = this.mCurrentCell.ContainsClassID('CThing_Creature_Player');
    if (!player || player.mFlags & Thing.CThing.mFlag_DEAD) return; // dying players still set the collide flag
    applyCratePayload(player, this.mPayload);
    this.PlaySound(CSound.mSamples.Object_Pickup_wav);
    this.Delete(); // single-use; no hide / respawn cycle, never an expiry counter
  }

  Draw(): void {
    Thing.CThing.pDraw.x = this.mPosition.mX * World.Map.CMap_Cell.mSize.x - this.mWorld.mDrawPosition.x;
    Thing.CThing.pDraw.y = (this.mPosition.mY + this.mPosition.mZ * Thing.Math.CThing_Position.mPFactor) * World.Map.CMap_Cell.mSize.y - this.mWorld.mDrawPosition.y;
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, Thing.CThing.pDraw, 1, this.mAlpha);
  }
}
proto(CThing_Object_WeaponCrate, { _CLASSID_: 'CThing_Object_WeaponCrate' });
