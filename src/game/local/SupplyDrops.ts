// PERSISTENT_SUPPLIES: red-box rewards and simulation-time ground deliveries; no port edits or wall clock.
import { forIn, mathRandom, random } from '../../engine/runtime.ts';
import { CMain, CSound, Thing, World } from '../packages.ts';
import { modernLoot, supplyIdentity, SUPPLY_KINDS, type SupplyState } from './LootRules.ts';
import { applySupplyEffect, livingPicker } from './Supplies.ts';
import { reliableSupplies, syncSupplyWeapon } from './ReliableSupplies.ts';
import {combatWorld,simplifiedWorld,restoredSupply,replenishedAmmo} from './CombatRules.ts';

/** One roll partitions the reward, then the remaining 70% preserves the original weapon pool's order/weights. */
export function redBoxReward(player: any, roll: number): boolean {
  const simple=simplifiedWorld(player.mWorld);
  if (!simple&&roll < .3) {
    const kind = SUPPLY_KINDS[roll < .1 ? 0 : roll < .2 ? 1 : 2]!;
    const granted = applySupplyEffect(player,kind);
    if (granted) player.mWorld.mHud.AddMessage_Info(`P${player.mPlayerIndex+1}: ${kind==='armor'?'Armor':kind==='ammo'?(combatWorld(player.mWorld)?'Ammo':'All ammo'):'Health'} ${combatWorld(player.mWorld)?'replenished':'full'}!`);
    return granted;
  }
  const pool: { name: string; end: number }[] = [];
  let total = 0;
  for (const key of forIn(player.mWeapons)) {
    const entry = player.mWeapons[key];
    if (!entry.mActive || entry.mNameID === 'pistol') continue;
    const missing=1-entry.mThing.mAmmo/entry.mThing.mTotalAmmo;
    total += (simple?Math.max(0,missing):missing)*.75+.25;
    pool.push({ name: entry.mNameID, end: total });
  }
  const selected = (simple?roll:(roll - .3) / .7) * total;
  const reward = pool.find(item => selected < item.end);
  if (!reward) return false;
  if(combatWorld(player.mWorld)){
    const gun=player.mWeapons[reward.name].mThing;player.mWorld.mUpgrades.ApplyUpgrade_Weapon(gun);
    gun.mAmmo=replenishedAmmo(player.mWorld,gun.mAmmo,gun.mTotalAmmo,restoredSupply(gun.mTotalAmmo,player.mSupplyEfficiency??0));
    player.mWorld.mHud.AddMessage_Info(gun.mName+' ammo replenished',player.mPlayerIndex);return true;
  }
  const capacity = player.mWeapons[reward.name].mThing.mTotalAmmo;
  const weapon = player.AddWeapon(reward.name).mThing;
  if(reliableSupplies(player.mWorld)){
    syncSupplyWeapon(player,weapon,capacity);
    weapon.mAmmo=weapon.mTotalAmmo;
  }
  player.mWorld.mHud.AddMessage_Info(weapon.mName+' ammo full!', player.mPlayerIndex);
  return true;
}

/** Fresh BFS uses current solid/object geometry, independent of the original time-budgeted navigation cache. */
export function supplyGround(world: any): any[] {
  const cells = world.mMap.mCells, height = cells.length, width = cells[0].length;
  const C = World.Map.CMap_Cell, blocked = C.mCollide_StaticImpassable | C.mCollide_Object | C.mCollide_EdgeOfMap;
  const visited = new Uint8Array(width * height), queue: any[] = [];
  const add = (x: number, y: number): void => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return;
    const i = y * width + x;
    if (visited[i] || cells[y][x].mCollide & blocked) return;
    visited[i] = 1; queue.push(cells[y][x]);
  };
  for (const key of forIn(world.mThing_Collection.mPlayerThings)) {
    const player = world.mThing_Collection.mPlayerThings[key];
    if (player.mLife > 0 && !(player.mFlags & Thing.CThing.mFlag_DEAD)) add(Math.floor(player.mPosition.mX), Math.floor(player.mPosition.mY));
  }
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i].mID;
    add(x + 1,y); add(x,y + 1); add(x - 1,y); add(x,y - 1);
  }
  const occupied = new Set<number>();
  for (const thing of Object.values(world.mThing_Collection.mThings) as any[]) {
    if (!thing.Process || !(thing._CLASSID_.startsWith('CThing_Object_') || thing._CLASSID_ === 'CThing_Creature_Player')) continue;
    // Includes hidden fixed boxes and not-yet-initialized drops, so a later respawn cannot overlap a delivery.
    occupied.add(Math.floor(thing.mPosition.mY) * width + Math.floor(thing.mPosition.mX));
  }
  return queue.filter(cell => !(cell.mCollide & (C.mCollide_Player | C.mCollide_Creature)) && !occupied.has(cell.mID.y * width + cell.mID.x));
}
export function deliverRedBoxes(world: any): void {
  const cooperative = World.CWorld.mGameMode === 'Coop', cap = cooperative ? 6 : 3;
  const active = (Object.values(world.mThing_Collection.mThings) as any[]).filter(t => t.mRandomRedId && t.Process).length;
  const count = Math.min(cooperative ? 2 : 1, cap - active);
  if (count <= 0) return;
  const ground = supplyGround(world);
  for (let n = 0; n < count && ground.length; n++) {
    const cell = ground.splice(random(ground.length),1)[0];
    const crate = world.mThing_Collection.AddThing(new Thing.Object.CThing_Object_Pickup(new Thing.Math.CThing_Position(cell.mID.x + .5,cell.mID.y + .5,0)));
    crate.mRandomRedId = supplyIdentity(world, 'r');
    crate.mDeleteOnPickup = true;
    crate.SetDeleteCounter(CMain.mFPS * 45);
  }
}
export function installSupplyDrops(): void {
  const player = Thing.Creature.CThing_Creature_Player.prototype as any, reward = player.RandomPickup;
  player.RandomPickup = function(this: any): boolean {
    return modernLoot(this.mWorld) ? redBoxReward(this, mathRandom()) : reward.call(this);
  };
  const pickup = Thing.Object.CThing_Object_Pickup.prototype as any, pickedUp = pickup.PickedUp;
  pickup.PickedUp = function(this: any): void {
    if (!modernLoot(this.mWorld)) return pickedUp.call(this);
    if (this.mRedConsumed || !this.Process || this.Process === this.Process_Count) return;
    const picker = livingPicker(this.mCurrentCell);
    if (!picker) return;
    picker.RandomPickup();
    this.PlaySound(CSound.mSamples.Object_Pickup_wav);
    if (this.mDeleteOnPickup) { this.mRedConsumed = true; this.Delete(); }
    else {
      this.mWorld.mMap.mMapwho.DeleteThing(this);
      this.mReappearCount = CMain.mFPS * 24;
      this.Process = this.Process_Count;
    }
  };
  const upgrades = World.CUpgrades.prototype as any, process = upgrades.Process;
  upgrades.Process = function(this: any): any {
    if (modernLoot(this.mWorld)) {
      const state = this.supplyState as SupplyState;
      if (--state.nextDropTicks <= 0) {
        state.nextDropTicks = CMain.mFPS * 20;
        deliverRedBoxes(this.mWorld);
      }
    }
    return process.call(this);
  };
}
