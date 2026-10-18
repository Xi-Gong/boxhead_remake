// LAN_PERSONAL_GROWTH: authoritative data stays on CUpgrades (included in the rollback graph).
// Derived upgrade views are immutable caches owned by that world's upgrade table, never snapshot state.
import { forIn } from '../../../engine/runtime.ts';
import { Thing, World } from '../../packages.ts';

export const GROWTH_RULE = 'personal-growth-v1';
export const MAX_LEVEL = 125;
export const XP_PER_LEVEL = 5;
export interface PlayerGrowth { score: number; level: number; xp: number }
export interface GrowthState { version: 1; players: [PlayerGrowth, PlayerGrowth] }
export function newGrowth(level: number): GrowthState {
  const base = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return { version: 1, players: [{ score: 0, level: base, xp: 0 }, { score: 0, level: base, xp: 0 }] };
}
export function copyGrowth(state: GrowthState): GrowthState {
  return { version: 1, players: [{ ...state.players[0] }, { ...state.players[1] }] };
}
export function growthOf(world: any): GrowthState | undefined { return world?.mUpgrades?.lanGrowth; }

/** Parent chains already carry shot/weapon/placed-object owners, including dead players. */
export function playerSource(thing: any): number | undefined {
  for (let depth = 0; thing && depth < 16; depth++, thing = thing.mParent) {
    if (thing._CLASSID_ === 'CThing_Creature_Player' && (thing.mPlayerIndex === 0 || thing.mPlayerIndex === 1)) return thing.mPlayerIndex;
  }
  return undefined;
}

type UpgradeRow = Record<string, any>;
const views = new WeakMap<object, Map<number, Record<string, UpgradeRow>>>();
const contexts = new WeakMap<object, Map<number, Record<string, any>>>();
/** Reuse the original table, including its application order; no duplicate balance table. */
function atLevel(upgrades: any, level: number): Record<string, UpgradeRow> {
  let levels = views.get(upgrades);
  if (!levels) views.set(upgrades, levels = new Map());
  let result = levels.get(level);
  if (!result) {
    result = {};
    for (let n = 1; n <= level; n++) for (const key of forIn(upgrades.mMultipliers[n])) {
      const item = upgrades.mMultipliers[n][key];
      const row = result[item.mClassID] ??= {};
      row[item.mProp] = item.mValue;
      row.IDCount = 10000 + n;
    }
    levels.set(level, result);
  }
  return result;
}

export function awardKill(state: PlayerGrowth, baseScore: number, xp: number): number {
  const amount = baseScore * state.level;
  state.score += amount;
  const total = state.xp + xp;
  state.level = Math.min(MAX_LEVEL, state.level + Math.floor(total / XP_PER_LEVEL));
  state.xp = state.level === MAX_LEVEL ? 0 : total % XP_PER_LEVEL;
  return amount;
}

function findPlayer(world: any, index: number): any {
  const players = world.mThing_Collection.mPlayerThings;
  for (const key of forIn(players)) if (players[key]?.mPlayerIndex === index) return players[key];
}

/** Route the original stat application through a personal view, retaining its original-stat restoration. */
function applyPersonal(upgrades: any, thing: any, previous: any): any {
  const state = growthOf(upgrades.mWorld);
  if (!state) return previous.call(upgrades, thing);
  const index = playerSource(thing);
  const level = index === undefined ? 1 : state.players[index]!.level;
  const flags = atLevel(upgrades, level)[thing._CLASSID_];
  const original = upgrades[thing._CLASSID_];
  // Only player weapons/objects are routed here. Original stats are registered lazily before first apply.
  let cache = contexts.get(upgrades);
  if (!cache) contexts.set(upgrades, cache = new Map());
  let classes = cache.get(level);
  if (!classes) cache.set(level, classes = {});
  let view = classes[thing._CLASSID_];
  if (!view || view[thing._CLASSID_].mOriginalStats !== original?.mOriginalStats) {
    view = Object.create(upgrades);
    view[thing._CLASSID_] = { IDCount: 10000, ...flags, mOriginalStats: original?.mOriginalStats };
    classes[thing._CLASSID_] = view;
  }
  return previous.call(view, thing);
}

export function installGrowthScope(): void {
  // Capture the FIRST fatal damage, not the last affect processed after the victim was already dead.
  for (const ctor of [Thing.Affect.CThing_Affect, Thing.Affect.CThing_Affect_Bullet, Thing.Affect.CThing_Affect_Explosion,
    Thing.Affect.CThing_Affect_FireBall, Thing.Affect.CThing_Affect_ZombieAttack, Thing.Affect.CThing_Affect_DevilAttack]) {
    const proto = ctor.prototype as any;
    const affect = proto.AffectThing;
    proto.AffectThing = function (this: any, victim: any): any {
      const before = victim.mLife;
      const value = affect.call(this, victim);
      if (growthOf(victim.mWorld) && before > 0 && victim.mLife <= 0) victim.lanFatalSlot = playerSource(this.mOwner) ?? -1;
      return value;
    };
  }
  // Scene barrels have no author. Attribute their chain to the triggering affect, while placed barrels
  // retain the placing player's ownership. Preserve the original affect order and explosion construction.
  const barrel = Thing.Object.CThing_Object_Barrel.prototype as any;
  const affects = barrel.ProcessAffects;
  barrel.ProcessAffects = function (this: any): any {
    if (!growthOf(this.mWorld) || this.mParent) return affects.call(this);
    for (const key of forIn(this.mAffectors)) {
      const affect = this.mAffectors[key];
      if (![1, 4, 256, 512].includes(affect.mType)) continue;
      const slot = playerSource(affect.mOwner);
      if (slot !== undefined) this.mParent = findPlayer(this.mWorld, slot) ?? affect.mOwner;
      break;
    }
    try { return affects.call(this); } finally { this.mParent = undefined; }
  };
  const upgrades = World.CUpgrades.prototype as any;
  for (const name of ['ApplyUpgrade_Weapon', 'ApplyUpgrade_Object']) {
    const apply = upgrades[name];
    upgrades[name] = function (this: any, thing: any): any { return applyPersonal(this, thing, apply); };
  }
  const multiplier = upgrades.__set__mMultiplier;
  upgrades.__set__mMultiplier = function (this: any, value: any): any {
    return this.lanGrowth ? this.mMultiplierIndex : multiplier.call(this, value);
  };
  const world = World.CWorld.prototype as any;
  const logKill = world.LogKill;
  world.LogKill = function (this: any, victim: any): any {
    const state = growthOf(this);
    if (!state || !['CThing_Creature_Zombie', 'CThing_Creature_Devil'].includes(victim?._CLASSID_)) return logKill.call(this, victim);
    if (victim.lanKillLogged) return;
    victim.lanKillLogged = true;
    const slot = victim.lanFatalSlot;
    const personal = slot === 0 || slot === 1 ? state.players[slot] : undefined;
    const before = personal?.level;
    const amount = personal ? awardKill(personal, victim.mScore, victim._CLASSID_ === 'CThing_Creature_Devil' ? 5 : 1) : 0;
    const hud = this.mHud, add = hud.AddScore, own = Object.getOwnPropertyDescriptor(hud, 'AddScore');
    // Keep original wave counts, drop cadence, RNG and floating-score behavior in their authored order.
    hud.AddScore = function (this: any, position: any): void { if (amount) add.call(this, position, amount); };
    try { logKill.call(this, victim); }
    finally { if (own) Object.defineProperty(hud, 'AddScore', own); else delete hud.AddScore; }
    if (personal && personal.level !== before) {
      const player = findPlayer(this, slot);
      for (let n = before! + 1; n <= personal.level; n++) for (const key of forIn(this.mUpgrades.mMultipliers[n])) {
        const item = this.mUpgrades.mMultipliers[n][key];
        if (item.mClassID === 'CThing_Creature_Player' && typeof item.mValue === 'string' && player?.mWeapons?.[item.mValue]) player.NewWeapon(item.mValue);
      }
    }
  };
}
