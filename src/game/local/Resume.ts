// LOCAL run snapshot (deviations SAVE_QUIT_RESUME + WAVE_CHECKPOINT_RETRY): the original has no mid-run save and
// its Debrief RETRY always restarts the room from scratch. This module captures a run's PROGRESS state and re-applies
// it to a freshly built world, so the current wave restarts with the score / weapons / multiplier / object damage
// the run had at capture time. Deliberately NOT serialized (documented accepted losses): mid-wave creatures, shots
// and effects (the wave restarts fresh), floor decals (clean floor), screen shake / brightness, the camera smoothing
// position (re-converges within a few frames) and the intra-tick mAffectors queue, and the fuse progress of a detonating claymore / charge pack (restored armed).
//
// Two capture points share this format:
//   - checkpoint: captured inside the CUpgrades.__set__mLevel wrapper right after a wave advanced (the field is then
//     empty of zombies/devils by the advance condition) -> an in-memory wave-start state for Debrief RETRY;
//   - save & quit: captured from the pause screen at any moment -> stored in the game save (SharedObject member
//     mResumeData, the local/Highscores.ts pattern: never written eagerly, immediate flush through SaveData()).
//
// The restore re-uses the game's own transitions wherever possible: waves are replayed through __set__mLevel (the
// same call natural advance makes, so upgrade tables / spawn counters end up identical), the multiplier is climbed
// one step at a time through __set__mMultiplier (the same steps LogKills makes, so tier upgrades activate at every
// crossed index), players are teleported with Move() (the State_Respawn path) and weapon ammo is overwritten after
// the weapon things exist again.
import { forIn } from '../../engine/runtime.ts';
import { getRandomState, setRandomState } from '../../engine/flash/rng.ts';
import { CMain, CSaveData, Thing, World } from '../packages.ts';
import { CThing_Object_WeaponCrate, type CrateWeapon } from './WeaponCrate.ts';
import { copyGrowth, type GrowthState } from './Net/Growth.ts';
import { armorValue, armorMaximum, suppliesEnabled, CThing_Object_SupplyCrate, type SupplyKind } from './Supplies.ts';
import { initializeLocalGrowth, localGrowthEnabled } from './LocalGrowth.ts';
import { SURVIVAL_RULE, survivalEnabled, settleVitals } from './SurvivalRules.ts';
import { LOOT_RULE, modernLoot, type SupplyState } from './LootRules.ts';
import { ENDLESS_RULE } from './EndlessRules.ts';
import { endlessWorld } from './Endless.ts';
import { timedWave, copyTimedWave, type TimedWaveState } from './TimedWaves.ts';
import { waveDraft } from './WaveDraft.ts';
import { copyWaveDraft, newWaveDraft, type WaveDraftState } from './WaveDraftRules.ts';
import {VARIANTS_RULE,captureVariants,restoreVariants,variantsWorld,type VariantSave} from './EnemyVariants.ts';
import {ENCHANTMENT_RULE,persistentEnchantment,captureEnchantment,restoreEnchantment} from './EnchantmentRules.ts';

// v2: the Coop death weapon crate (COOP_DEATH_WEAPON_CRATE) is serialized as a placed object carrying its payload
// (weapons + ammo + the dead player's held weapon). A v1 stored run no longer matches and is discarded on read.
export const RESUME_VERSION = 2;
export const SAVE_MEMBER = 'mResumeData';

export interface WeaponState {
  active: boolean;
  /** Undefined while the weapon was never picked up (no mThing). */
  ammo?: number;
  totalAmmo?: number;
  draftCapacityBonus?: number;
  enchantedAmmo?: number;
  enchanted?: true;
}

export interface PlayerState {
  index: number;
  x: number; y: number; z: number;
  angle: number;
  life: number; maxLife: number;
  /** Optional v2 extension; absent old saves restore with no armor. */
  armor?: number;
  invincible: number; alpha: number; flags: number;
  stateID: string; returnStateID?: string; baseStateID?: string; stateCount: number;
  weapons: Record<string, WeaponState>;
  currentWeapon?: string;
}

/**
 * Room objects. origin "marker" = built from the room's init list every time (matched by position on the fresh
 * build, overwritten or deleted); origin "placed" = created during the run by a weapon (barrel / fake wall / claymore
 * / charge pack: re-created at their position, credited to the saved owner). Pickups dropped by kills
 * (mDeleteOnPickup) are excluded.
 */
export interface ObjectState {
  classID: 'CThing_Object_Barrel' | 'CThing_Object_Wall' | 'CThing_Object_Mine' | 'CThing_Object_ChargePack' | 'CThing_Object_Pickup' | 'CThing_Object_WeaponCrate' | 'CThing_Object_SupplyCrate';
  x: number; y: number; angle: number;
  origin: 'marker' | 'placed';
  /** Placed: playerIndex of the owner (kill credit when they explode later). */
  owner?: number;
  /** Placed barrel / mine / charge pack damage. */
  damage?: number;
  enchanted?: boolean;
  /** Walls only (marker + placed). */
  life?: number;
  /** Marker pickups only: taken and counting down to reappear. */
  hidden?: boolean;
  reappearCount?: number;
  /** Weapon crate only: the dead player's restorable inventory. */
  crate?: { weapons: CrateWeapon[]; currentWeapon?: string };
  /** Permanent supply identity is independent of the rebuilt world's thing allocation IDs. */
  supply?: { kind: SupplyKind; id: string };
  randomRed?: { id: string; remainingTicks: number; alpha: number };
}

export interface RunSnapshot {
  waveDraft?: WaveDraftState;
  timedWave?: TimedWaveState;
  enchantment?: typeof ENCHANTMENT_RULE;
  variants?: VariantSave;
  endless?: typeof ENDLESS_RULE;
  survival?: typeof SURVIVAL_RULE;
  loot?: { rule: typeof LOOT_RULE; state: SupplyState };
  /** Optional v2 extension shared by local and LAN permanent progression. */
  growth?: GrowthState;
  version: number;
  gameMode: string;
  roomLibLink: string;
  /** CUpgrades.mLevelIndex (Death Match never advances waves; kept for uniformity). */
  wave: number;
  /**
   * Live pacing counters of the current wave (CUpgrades.Level): the spawn countdowns and the still-to-spawn budgets
   * at capture time, so a mid-wave save & quit resumes the wave where it stood (the already-spawned creatures are
   * gone; the remainder spawns again). playerCount = alive players (a mid-death player is already decremented).
   */
  waveCounters: {
    spawnZombie: number; spawnDevil: number;
    zombieCount: number; zombieTotal: number;
    devilCount: number; devilTotal: number;
    playerCount: number;
  };
  score: number;
  /** Death Match frag counts. */
  deaths?: [number, number];
  multiplierIndex: number; multiplierTick: number; multiplierTickTotal: number;
  multipleKillsIndex: number; multipleKillsTick: number; multipleKillsTickTotal: number;
  players: PlayerState[];
  objects: ObjectState[];
  rngState: number;
  /** CWorld.mTick at capture (never read by game logic, but keeps tick-phased behaviour identical). */
  tick: number;
}

const OBJECT_CLASSES = new Set([
  'CThing_Object_Barrel', 'CThing_Object_Wall', 'CThing_Object_Pickup', 'CThing_Object_Mine', 'CThing_Object_ChargePack',
  'CThing_Object_WeaponCrate',
  'CThing_Object_SupplyCrate',
]);
const EPS = 1e-6;

// ----------------------------------------------------------------------------------------------------- module state

/** The wave-start checkpoint of the CURRENT run (memory only, never persisted). */
let checkpoint: RunSnapshot | null = null;
/** The snapshot armed by CONTINUE / RETRY-with-checkpoint; consumed by the CWorld.InitFinished wrapper. */
let pending: RunSnapshot | null = null;
/** True while applyToWorld replays waves/multiplier steps, so the __set__mLevel capture hook stays quiet. */
let suppress = false;

export function isSuppressing(): boolean { return suppress; }
export function hasCheckpoint(): boolean { return checkpoint != null; }
export function isArmed(): boolean { return pending != null; }

/**
 * Called by the __set__mLevel scope wrapper right after a wave advanced (the advance condition guarantees the field
 * is then empty of zombies/devils, so this is a clean wave-start state). The caller guards mLoaded + suppression.
 */
export function recordCheckpoint(world: any): void {
  checkpoint = capture(world);
}

export function armFromCheckpoint(): boolean {
  if (!checkpoint) return false;
  pending = checkpoint;
  return true;
}

/** LAN sessions arm their own net checkpoint through the same pending/consumePending path (v0.1.3). */
export function armSnapshot(snap: RunSnapshot): void {
  pending = snap;
}

/**
 * Arm the CONTINUE path from the stored save (State_Continue). Returns the snapshot (and sets the static game mode
 * from it) or null when nothing readable is stored. The current run's in-memory checkpoint is dropped: it belongs
 * to a different run and must not leak into the continued one.
 */
export function armFromStored(): RunSnapshot | null {
  const snap = readStored();
  if (!snap) return null;
  pending = snap;
  checkpoint = null;
  World.CWorld.mGameMode = snap.gameMode;
  return snap;
}

// ---------------------------------------------------------------------------------------------------------------------------------- capture

function capturePlayer(p: any): PlayerState {
  const weapons: Record<string, WeaponState> = {};
  for (const k of forIn(p.mWeapons)) {
    const w = p.mWeapons[k];
    weapons[k] = {
      active: !!w.mActive,
      ammo: w.mThing != undefined ? w.mThing.mAmmo : undefined,
      totalAmmo: w.mThing != undefined ? w.mThing.mTotalAmmo : undefined,
      ...(w.mThing?.mDraftCapacityBonus!==undefined?{draftCapacityBonus:w.mThing.mDraftCapacityBonus}:{}),
      ...captureEnchantment(w.mThing),
    };
  }
  return {
    index: p.mPlayerIndex,
    x: p.mPosition.mX, y: p.mPosition.mY, z: p.mPosition.mZ,
    angle: p.mAngle.mAngle,
    life: p.mLife, maxLife: p.mMaxLife,
    ...(p.mArmor!==undefined?{armor:armorValue(p.mArmor,armorMaximum(p))}:{}),
    invincible: p.mInvincible ?? 0, alpha: p.mAlpha, flags: p.mFlags,
    stateID: p.mStateID, returnStateID: p.mReturnStateID, baseStateID: p.mBaseStateID, stateCount: p.mStateCount ?? 0,
    weapons,
    currentWeapon: p.mWeapon_Current?.mNameID,
  };
}

function captureObject(t: any): ObjectState {
  // The weapon crate is run-created (never in a room's init list) but ownerless - force 'placed' anyway, or the
  // apply pass would match it against the fresh build's markers, find nothing, and silently drop the inventory.
  const placed = t.mParent != undefined || t._CLASSID_ === 'CThing_Object_WeaponCrate' || !!t.mSupplyId || !!t.mRandomRedId;
  const o: ObjectState = {
    classID: t._CLASSID_,
    x: t.mPosition.mX, y: t.mPosition.mY,
    angle: t.mAngle.mAngle,
    origin: placed ? 'placed' : 'marker',
  };
  if (placed && t.mParent != undefined) {
    if (t.mParent?.mPlayerIndex != undefined) o.owner = t.mParent.mPlayerIndex;
    if (t.mDamage != undefined) o.damage = t.mDamage;
  }
  if (t._CLASSID_ === 'CThing_Object_Wall') o.life = t.mLife;
  if (t._CLASSID_ === 'CThing_Object_Pickup' && t.Process === t.Process_Count) {
    o.hidden = true;
    o.reappearCount = t.mReappearCount;
  }
  if (t._CLASSID_ === 'CThing_Object_WeaponCrate') {
    o.crate = { weapons: t.mPayload.weapons, currentWeapon: t.mPayload.currentWeapon };
  }
  if (t.mSupplyId) o.supply = { kind: t.mSupplyKind, id: t.mSupplyId };
  if(t.mEnchanted)o.enchanted=true;
  if (t.mRandomRedId) o.randomRed = { id: t.mRandomRedId, remainingTicks: t.mDeleteCounter, alpha: t.mAlpha };
  return o;
}

function restorableObject(t: any): boolean {
  if (!t || !OBJECT_CLASSES.has(t._CLASSID_)) return false;
  if (t._CLASSID_ === 'CThing_Object_SupplyCrate') return !!t.mSupplyId && !!t.Process && !t.mSupplyConsumed;
  if (t.mRandomRedId) return !!t.Process && !t.mRedConsumed;
  return !t.mDeleteOnPickup;
}

/** Pure read of a live (running or paused) world. */
export function capture(world: any): RunSnapshot {
  const u = world.mUpgrades;
  const tc = world.mThing_Collection;
  const players: PlayerState[] = forIn(tc.mPlayerThings)
    .map((k) => tc.mPlayerThings[k])
    .filter((p: any) => p != undefined)
    .sort((a: any, b: any) => a.mPlayerIndex - b.mPlayerIndex)
    .map(capturePlayer);
  const objects: ObjectState[] = forIn(tc.mThings)
    .map((k) => tc.mThings[k])
    .filter(restorableObject)
    .map(captureObject);
  return {
    ...(u.lanGrowth ? { growth: copyGrowth(u.lanGrowth) } : {}),
    ...(endlessWorld(world)?{endless:ENDLESS_RULE}:{}),
    ...(timedWave(world)?{timedWave:copyTimedWave(world)}:{}),
    ...(waveDraft(world)?{waveDraft:copyWaveDraft(waveDraft(world))}:{}),
    ...(variantsWorld(world)?{variants:captureVariants(world)}:{}),
    ...(persistentEnchantment(world)?{enchantment:ENCHANTMENT_RULE}:{}),
    ...(survivalEnabled(world) ? { survival: SURVIVAL_RULE } : {}),
    ...(modernLoot(world) ? { loot: { rule: LOOT_RULE, state: { ...u.supplyState } } } : {}),
    version: RESUME_VERSION,
    gameMode: World.CWorld.mGameMode,
    roomLibLink: world.mWorldLibLink,
    wave: u.mLevelIndex,
    waveCounters: {
      spawnZombie: u.Level.mSpawnCount_Zombie ?? 0,
      spawnDevil: u.Level.mSpawnCount_Devil ?? 0,
      zombieCount: u.Level.Zombie_Count ?? 0,
      zombieTotal: u.Level.Zombie_TotalCount ?? 0,
      devilCount: u.Level.Devil_Count ?? 0,
      devilTotal: u.Level.Devil_TotalCount ?? 0,
      playerCount: u.__get__mPlayerCount(),
    },
    score: world.mHud.nTotalScore,
    deaths: World.CWorld.mGameMode === 'DeathMatch'
      ? [world.mHud.mPlayer1_Deaths ?? 0, world.mHud.mPlayer2_Deaths ?? 0]
      : undefined,
    multiplierIndex: u.mMultiplierIndex, multiplierTick: u.mMultiplierTick, multiplierTickTotal: u.mMultiplierTickTotal,
    multipleKillsIndex: u.mMultipleKillsIndex, multipleKillsTick: u.mMultipleKillsTick, multipleKillsTickTotal: u.mMultipleKillsTickTotal,
    players,
    objects,
    rngState: getRandomState(),
    tick: world.mTick ?? 0,
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ apply

function findPlayer(world: any, index: number): any {
  const tc = world.mThing_Collection;
  for (const k of forIn(tc.mPlayerThings)) {
    if (tc.mPlayerThings[k]?.mPlayerIndex === index) return tc.mPlayerThings[k];
  }
  return undefined;
}

function applyPlayer(world: any, s: PlayerState): void {
  const p = findPlayer(world, s.index);
  if (!p) return;
  // Teleport exactly like State_Respawn does (Move keeps the mapwho cell in sync).
  p.Move(new Thing.Math.CThing_Position(s.x, s.y, s.z));
  p.mAngle.__set__mAngle(s.angle);
  p.mLife = s.life;
  p.mMaxLife = s.maxLife;
  if(suppliesEnabled(world)){if(s.armor!==undefined)p.mArmor=armorValue(s.armor,armorMaximum(p));else delete p.mArmor;}
  p.mInvincible = s.invincible;
  p.mAlpha = s.alpha;
  p.mFlags = s.flags;
  // State machine: assign verbatim and rebind fState (no SetState -> no _Init side effects).
  p.mReturnStateID = s.returnStateID;
  p.mStateID = s.stateID;
  p.mBaseStateID = s.baseStateID;
  p.mStateCount = s.stateCount;
  if (typeof (p as any)[s.stateID] === 'function') p.fState = (p as any)[s.stateID];
  delete p.mCurrentAnim; // force the animation re-sync in State_PlayerControl
  // Weapons: the upgrade replay above re-created the weapon things; overwrite the run's ammo, then select.
  for (const name of Object.keys(s.weapons)) {
    const ws = s.weapons[name]!;
    const entry = p.mWeapons?.[name];
    if (!entry) continue;
    if (ws.active && !entry.mActive) p.NewWeapon(name);
    if ((world.mUpgrades.lanGrowth || localGrowthEnabled()) && !ws.active) {
      entry.mActive = false;
      if (ws.ammo === undefined) entry.mThing = undefined;
    }
    // Apply personal stats before restoring ammo; the first Update must not refill a restored magazine.
    if (world.mUpgrades.lanGrowth && entry.mThing) world.mUpgrades.ApplyUpgrade_Weapon(entry.mThing);
    if (ws.ammo != undefined && entry.mThing != undefined) entry.mThing.mAmmo = ws.ammo;
    if (ws.totalAmmo != undefined && entry.mThing != undefined) entry.mThing.mTotalAmmo = ws.totalAmmo;
    if(waveDraft(world)&&entry.mThing)entry.mThing.mDraftCapacityBonus=ws.draftCapacityBonus??0;
    if(entry.mThing)restoreEnchantment(entry.mThing,ws);
  }
  if (s.currentWeapon != undefined) {
    p.SelectWeapon(s.currentWeapon);
    if (p.mWeapon_Current?.mNameID !== s.currentWeapon) {
      // Only reachable when the saved weapon is empty (impossible through play); guarantee the state anyway.
      const w = p.mWeapons?.[s.currentWeapon]?.mThing;
      if (w) { p.mWeapon_Current = w; w.Reset(); }
    }
  }
}

/** Re-create a run-placed object (weapon barrel / fake wall / claymore / charge pack) on the fresh build. */
function recreatePlaced(world: any, s: ObjectState): void {
  const pos = new Thing.Math.CThing_Position(s.x, s.y, 0);
  const angle = new Thing.Math.CThing_Angle(s.angle);
  const owner = s.owner != undefined ? findPlayer(world, s.owner) : undefined;
  let t: any;
  switch (s.classID) {
    case 'CThing_Object_Barrel':
      t = new Thing.Object.CThing_Object_Barrel(pos, angle, owner, s.damage); break;
    case 'CThing_Object_Wall':
      t = new Thing.Object.CThing_Object_Wall(pos, angle, owner); break;
    case 'CThing_Object_Mine':
      t = new Thing.Object.CThing_Object_Mine(pos, angle, owner, s.damage); break;
    case 'CThing_Object_ChargePack':
      t = new Thing.Object.CThing_Object_ChargePack(pos, angle, owner, s.damage); break;
    case 'CThing_Object_WeaponCrate':
      t = new CThing_Object_WeaponCrate(pos, { weapons: s.crate?.weapons ?? [], currentWeapon: s.crate?.currentWeapon }); break;
    case 'CThing_Object_SupplyCrate':
      if (!modernLoot(world) || !s.supply) return;
      t = new CThing_Object_SupplyCrate(pos, s.supply.kind, s.supply.id); break;
    case 'CThing_Object_Pickup':
      if (!modernLoot(world) || !s.randomRed) return;
      t = new Thing.Object.CThing_Object_Pickup(pos);
      t.mRandomRedId = s.randomRed.id; t.mDeleteOnPickup = true;
      t.SetDeleteCounter(s.randomRed.remainingTicks); t.mAlpha = s.randomRed.alpha; break;
    default:
      return;
  }
  world.mThing_Collection.AddThing(t);
  if(s.enchanted&&variantsWorld(world))t.mEnchanted=true;
  if (s.supply || s.randomRed) {
    // Reattach without processing a pickup during restore, and without spending a remaining lifetime tick.
    world.mMap.mMapwho.AddThing(t);
    t.mCurrentCell = world.mMap.GetCell(s.x,s.y);
    t.Process = s.randomRed ? t.Process_DeleteCounter : t.Process_Normal;
  }
  if (s.classID === 'CThing_Object_Wall' && s.life != undefined) {
    t.mLife = s.life;
    t.mcDrawObject.GotoToFrame(Math.floor((1 - t.mLife / t.mMaxLife) * t.mcDrawObject.__get__mFrameAmount()));
  }
}

function applyObjects(world: any, snap: RunSnapshot): void {
  const tc = world.mThing_Collection;
  const fresh = forIn(tc.mThings)
    .map((k) => tc.mThings[k])
    .filter(restorableObject);
  const savedMarkers = snap.objects.filter((o) => o.origin === 'marker');
  for (const t of fresh) {
    if (t.mSupplyId || t.mRandomRedId) { t.Delete(); continue; }
    const s = savedMarkers.find((o) => o.classID === t._CLASSID_ && Math.abs(o.x - t.mPosition.mX) < EPS && Math.abs(o.y - t.mPosition.mY) < EPS);
    if (!s) {
      // Absent from the snapshot = destroyed before capture (destroyed things are removed from mThings).
      t.Delete();
      continue;
    }
    if (t._CLASSID_ === 'CThing_Object_Wall' && s.life != undefined) {
      if (s.life <= 0) { t.Delete(); continue; } // was mid-fade-out at capture
      t.mLife = s.life;
      // Same frame the damage path sets (CThing_Object_Wall.ProcessAffects).
      t.mcDrawObject.GotoToFrame(Math.floor((1 - t.mLife / t.mMaxLife) * t.mcDrawObject.__get__mFrameAmount()));
    } else if (t._CLASSID_ === 'CThing_Object_Pickup' && s.hidden) {
      // Mirror PickedUp's hide transition (mapwho removal + respawn timer + counter process).
      world.mMap.mMapwho.DeleteThing(t);
      t.mReappearCount = s.reappearCount ?? 0;
      t.Process = t.Process_Count;
    }
  }
  for (const s of snap.objects) {
    if (s.origin === 'placed' && !s.supply && !s.randomRed) recreatePlaced(world, s);
  }
  // Capture uses Flash's reverse insertion order. Rebuild new supplies in creation order so stacked
  // pickups keep the same processing priority across repeated saves; legacy placed-object order stays intact.
  for (const s of [...snap.objects].reverse()) {
    if (s.origin === 'placed' && (s.supply || s.randomRed)) recreatePlaced(world, s);
  }
}

/**
 * Apply a snapshot to a freshly built world (call after CWorld.InitFinished: SetDifficulty ran, players and marker
 * objects are fully initialized). Returns false (and changes nothing) on version / room / mode mismatch.
 */
export function applyToWorld(world: any, snap: RunSnapshot): boolean {
  if (snap?.version !== RESUME_VERSION) return false;
  if (snap.roomLibLink !== world.mWorldLibLink || snap.gameMode !== World.CWorld.mGameMode) return false;
  if (!Number.isSafeInteger(snap.wave) || snap.wave < 1) return false;
  // Never reinterpret an endless checkpoint using an older negotiated simulation.
  if ((snap.endless === ENDLESS_RULE || snap.growth?.players.some(p => p.endless)) && !endlessWorld(world)) return false;
  if(snap.variants?.rule===VARIANTS_RULE&&!variantsWorld(world))return false;
  if(snap.enchantment===ENCHANTMENT_RULE&&!persistentEnchantment(world))return false;
  if(snap.timedWave&&!timedWave(world))return false;
  if(snap.waveDraft&&!waveDraft(world))return false;
  if(snap.timedWave?.phase==='draft'&&!snap.waveDraft?.round)return false;
  const u = world.mUpgrades;
  const hud = world.mHud;
  if (snap.growth) u.lanGrowth = copyGrowth(snap.growth);
  else delete u.lanGrowth; // Old saves must replay their original multiplier before one-time conversion.
  if (modernLoot(world)) u.supplyState = snap.loot?.rule === LOOT_RULE ? { ...snap.loot.state } : { nextDropTicks: CMain.mFPS * 20, nextId: 1 };
  hud.mSilentMessages = true;
  suppress = true;
  try {
    // Waves: replay __set__mLevel one step at a time (identical to the natural Process advance), which re-applies
    // every crossed wave's upgrade table entries and resets the live spawn counters.
    if(endlessWorld(world))u.__set__mLevel(snap.wave);
    else while (u.mLevelIndex < snap.wave) u.__set__mLevel(u.mLevelIndex + 1);
    if(waveDraft(world))u.waveDraft=copyWaveDraft(snap.waveDraft)??newWaveDraft(snap.wave);
    // Multiplier: climb step by step so tier upgrades activate at every crossed index (the LogKills path); a single
    // call would only activate the tiers of the final index. Decay below the built value is a plain set.
    if (snap.growth) u.mMultiplierIndex = snap.multiplierIndex;
    else {
      while (u.mMultiplierIndex < snap.multiplierIndex) u.__set__mMultiplier(u.mMultiplierIndex + 1);
      if (u.mMultiplierIndex > snap.multiplierIndex) u.__set__mMultiplier(snap.multiplierIndex);
    }
    u.mMultiplierTick = snap.multiplierTick;
    u.mMultiplierTickTotal = snap.multiplierTickTotal;
    // Multiple kills: pure counters (the multiple-kills table is never populated in the original).
    u.mMultipleKillsIndex = snap.multipleKillsIndex;
    u.mMultipleKillsTick = snap.multipleKillsTick;
    u.mMultipleKillsTickTotal = snap.multipleKillsTickTotal;
    // Wave pacing: overwrite the table-fresh counters with the captured ones (mid-wave save & quit resumes the
    // remaining budget; the boundary checkpoint wrote table-fresh values anyway). Live creature counts start at 0:
    // no creatures are restored.
    const c = snap.waveCounters;
    u.Level.mSpawnCount_Zombie = c.spawnZombie;
    u.Level.mSpawnCount_Devil = c.spawnDevil;
    if(!timedWave(world)){
      u.Level.Zombie_Count = c.zombieCount;
      u.Level.Zombie_TotalCount = c.zombieTotal;
      u.Level.Devil_Count = c.devilCount;
      u.Level.Devil_TotalCount = c.devilTotal;
    }else{
      u.Level.Zombie_TotalCount=0;u.Level.Devil_TotalCount=0;
    }
    u.Level.mZombieCount = 0;
    u.Level.mDevilCount = 0;
    u.Level.mPlayerCount = c.playerCount;
    if(snap.timedWave)u.timedWave={...snap.timedWave,warnings:snap.timedWave.warnings.map(w=>({...w}))};
    for (const s of snap.players) applyPlayer(world, s);
    restoreVariants(world,snap.variants);
    applyObjects(world, snap);
    hud.nTotalScore = snap.score;
    if (snap.deaths) {
      hud.mPlayer1_Deaths = snap.deaths[0];
      hud.mPlayer2_Deaths = snap.deaths[1];
    }
    initializeLocalGrowth(world, true);
    if(waveDraft(world)){
      for(const p of Object.values(world.mThing_Collection.mPlayerThings) as any[])for(const entry of p.mWeaponList??[]){
        if(!entry.mActive||!entry.mThing)continue;
        const ammo=entry.mThing.mAmmo;u.ApplyUpgrade_Weapon(entry.mThing);entry.mThing.mAmmo=ammo;
      }
    }
    settleVitals(world, true);
    setRandomState(snap.rngState);
    world.mTick = snap.tick;
  } finally {
    suppress = false;
    hud.mSilentMessages = false;
  }
  if (snap.gameMode !== 'DeathMatch') {
    hud.AddMessage_Level('-+-+-+- LEVEL ' + u.mLevelIndex + ' -+-+-+-');
  }
  return true;
}

/** Consume the armed snapshot (CWorld.InitFinished wrapper). The pending flag clears whether or not it applied. */
export function consumePending(world: any): boolean {
  if (!pending) return false;
  const snap = pending;
  pending = null;
  return applyToWorld(world, snap);
}

// ------------------------------------------------------------------------------------------------------------------------------------ storage

function validStored(v: any): RunSnapshot | null {
  if (!v || typeof v !== 'object' || v.version !== RESUME_VERSION || !Array.isArray(v.players) || !Array.isArray(v.objects)
    || typeof v.roomLibLink !== 'string' || typeof v.wave !== 'number') {
    return null;
  }
  return v as RunSnapshot;
}

export function readStored(): RunSnapshot | null {
  const data = CSaveData.mSharedObject?.data;
  if (!data) return null;
  const snap = validStored(data[SAVE_MEMBER]);
  if (!snap) {
    if (data[SAVE_MEMBER] != undefined) console.warn('[resume] discarding unreadable ' + SAVE_MEMBER);
    delete data[SAVE_MEMBER];
  }
  return snap;
}

export function hasStored(): boolean { return readStored() != null; }

export function writeStored(snap: RunSnapshot): void {
  const save = CSaveData._this;
  if (!save || !CSaveData.mSharedObject) return;
  CSaveData.mSharedObject.data[SAVE_MEMBER] = snap;
  save.SaveData();
}

export function clearStored(): void {
  const data = CSaveData.mSharedObject?.data;
  if (!data || data[SAVE_MEMBER] == undefined) return;
  delete data[SAVE_MEMBER];
  CSaveData._this?.SaveData();
}

/** New run without CONTINUE / run over: drop everything (stored save + in-memory checkpoint and pending). */
export function clearAll(): void {
  clearStored();
  checkpoint = null;
  pending = null;
}

export function _resetForTests(): void {
  checkpoint = null;
  pending = null;
  suppress = false;
}
