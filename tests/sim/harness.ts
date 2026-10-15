// Lane Q: headless simulation harness. Boots the REAL game (library.json + every ported class + root/sprite frame
// scripts + button actions + scope + xsi.json, exactly like src/main.ts) in Node without a browser:
//   - BitmapData.headless (pixel-less backings), virtual clock (20 ms per enterFrame), seeded RNG;
//   - the deterministic navigation budget (deviation NAV_BUDGET_TEST_HOOK: N cells per Nav_Update call);
//   - sounds registered headless (registerSoundLibrary) and completed with pumpSoundEvents() once per enterFrame.
// createHeadlessGame() plays the root timeline (loading screen, cover fade, CMain), then either jumps from the intro to
// the level selection of the mode (default, like the integration probes) or clicks through Intro/Main (fullBoot),
// sets the options in the save data (what the options window buttons do), and starts the room through the level
// icon's own onRelease (CScreen_SelectWorld.LoadLevel). step(n) runs n enterFrames (50 Hz); tick(n) runs until the
// world ticked n times (25 Hz at normal speed).
import './headless.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LibraryJson, XsiJson } from '../../src/shared/assetSchema.ts';
import { advanceVirtual, beginEnterFrame, clock, useVirtualClock } from '../../src/engine/flash/clock.ts';
import { seedRandom } from '../../src/engine/flash/rng.ts';
import { Key, Mouse } from '../../src/engine/flash/input.ts';
import { SharedObject } from '../../src/engine/flash/SharedObject.ts';
import { _global, forIn } from '../../src/engine/flash/as2.ts';
import {
  Library, Player, setScriptErrorHandler, setTimelineSoundHandler,
} from '../../src/engine/swf/Player.ts';
import { engine } from '../../src/engine/swf/state.ts';
import {
  _resetAudioForTests, playTimelineSound, pumpSoundEvents, registerSoundLibrary,
} from '../../src/engine/platform/AudioEngine.ts';
import '../../src/game/allClasses.ts';
import { LINKAGE_CLASSES, registerClasses } from '../../src/game/registerClasses.ts';
import { registerMainTimeline } from '../../src/game/frames/MainTimeline.ts';
import { registerSpriteScripts, setXsiSource } from '../../src/game/frames/SpriteScripts.ts';
import { registerButtonActions } from '../../src/game/frames/ButtonActions.ts';
import { applyScope } from '../../src/game/scope.ts';
import { installLocalSymbols } from '../../src/game/local/localSymbols.ts';
import { _resetForTests as resetResumeForTests, hasStored as resumeHasStored } from '../../src/game/local/Resume.ts';
import { _resetForTests as resetStartWaveForTests } from '../../src/game/local/StartWave.ts';
import { _resetNetForTests } from '../../src/game/local/Net/NetSession.ts';
import { _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';
import { CMain, Screen, Thing, World } from '../../src/game/packages.ts';

export type GameMode = 'Single' | 'Coop' | 'DeathMatch';

/** Flash key codes (default bindings, plan appendix B). */
export const KEYS = {
  P1: { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, FIRE: 191, NEXT: 190, PREV: 188 },
  P2: { UP: 87, DOWN: 83, LEFT: 65, RIGHT: 68, FIRE: 32, NEXT: 69, PREV: 81 },
  PAUSE: 80,
  SPACE: 32,
  /** Weapon select keys (Single only): '1'..'9', '0'. */
  DIGIT: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57],
} as const;
export type PlayerKeys = typeof KEYS.P1 | typeof KEYS.P2;

export interface GameOptions {
  /** 0 slow, 1 normal, 2 fast (save default 1). */
  gameSpeed?: 0 | 1 | 2;
  devils?: 0 | 1;
  collisions?: 0 | 1;
  damage?: 0 | 1;
  /** Death Match kills to win: index into [5, 10, 20, 50]. */
  gameAmount?: 0 | 1 | 2 | 3;
  /** Detail on (HIGH) / off (LOW quality: zombie cap 40). */
  detail?: boolean;
  p1Character?: 0 | 1 | 2 | 3;
  p2Character?: 0 | 1 | 2 | 3;
  /** The original's own cheat switch _global.mInfinateLife (players only take line-of-sight affects). */
  infiniteLife?: boolean;
}

export interface HeadlessGameOptions {
  mode?: GameMode;
  /** Room 1..18. */
  room?: number;
  difficulty?: 0 | 1 | 2 | 3;
  seed?: number;
  options?: GameOptions;
  /** Cells per Nav_Update call (deviation NAV_BUDGET_TEST_HOOK); null = original getTimer budget. Default 300. */
  navBudget?: number | null;
  /** Click through Intro -> Main -> mode button instead of jumping to the level selection. */
  fullBoot?: boolean;
  /** Throw on the first engine script error (default: collect in `errors`). */
  throwOnError?: boolean;
  /**
   * The original's debug boot: _global.mDebug = true before CMain's first tick, so State_Init jumps straight to
   * State_SelectWorld_DeathMatch (no intro, no screen yet). Death Match only.
   */
  debugBoot?: boolean;
  /**
   * Lane X1 (UI tests): stop in the menus instead of starting a room - 'Intro' right after boot, 'Main' once the main
   * menu is up (the intro played), 'Select' on the level selection of `mode` (through the main menu button when
   * fullBoot, else SetState). room / difficulty / options are then NOT written to the save.
   */
  menuOnly?: 'Intro' | 'Main' | 'Select';
  /** Lane X1: do not write difficulty / level index / options into the save (test the stored values as they are). */
  keepSave?: boolean;
}

export interface PlayerSnapshot {
  index: number;
  x: number; y: number; z: number;
  life: number;
  state: string;
  dead: boolean;
  weapon: string;
  ammo: number;
  invincible: number;
  /** Weapons active (unlocked) in the player's list, in list order. */
  weapons: string[];
}

export interface Snapshot {
  state: string | undefined;
  mode: GameMode;
  room: number;
  tick: number;
  level: number;
  multiplier: number;
  multipleKill: number;
  score: number;
  zombies: number;
  devils: number;
  zombieTotal: number;
  /** Things in the collection (live + not yet disposed). */
  things: number;
  counters: Record<string, number>;
  players: PlayerSnapshot[];
  deaths: [number, number];
  completeState: string | undefined;
  paused: boolean;
}

// -------------------------------------------------------------------------------------------------------- static boot

/** public/assets (override with BOXHEAD_ASSETS when the harness is bundled elsewhere, e.g. for CPU profiles). */
const ASSETS = process.env.BOXHEAD_ASSETS ?? fileURLToPath(new URL('../../public/assets/', import.meta.url));
let jsonCache: LibraryJson | undefined;
let xsiCache: XsiJson | undefined;
let library: Library | undefined;
let registered = false;
/** Errors of the current game (engine script errors). */
let currentErrors: string[] = [];
let throwOnError = false;
/** Total engine script errors of the current game (also those not kept in `errors`). */
let errorCount = 0;
/** Boot waits give up after this many script errors (a crashing onEnterFrame would repeat every frame). */
const BOOT_ERROR_LIMIT = 20;

function loadAssets(): void {
  if (library) return;
  jsonCache = JSON.parse(readFileSync(ASSETS + 'library.json', 'utf8')) as LibraryJson;
  xsiCache = JSON.parse(readFileSync(ASSETS + 'xsi.json', 'utf8')) as XsiJson;
  installLocalSymbols(jsonCache);
  library = new Library(jsonCache);
}

function registerOnce(): void {
  if (registered) return;
  registered = true;
  const json = jsonCache!;
  setScriptErrorHandler((err, where) => {
    errorCount++;
    // (stack strings are expensive under vitest's source maps: keep the first 50 only)
    if (currentErrors.length < 50) currentErrors.push(`${where}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    if (throwOnError) throw err;
  });
  const missing = registerClasses((json.classes as Record<string, string> | undefined) ?? LINKAGE_CLASSES);
  if (missing.length) throw new Error('unresolved linkage classes: ' + missing.join(', '));
  registerMainTimeline();
  registerSpriteScripts();
  registerButtonActions();
  applyScope();
  setTimelineSoundHandler(playTimelineSound);
  engine.warned.add('*');
}

/** Reset the process-wide state a previous game in the same process left behind. */
function resetProcessState(): void {
  Key._reset();
  Mouse._reset();
  SharedObject._reset();
  _resetAudioForTests();
  registerSoundLibrary(jsonCache!);
  for (const k of Object.keys(_global)) delete _global[k];
  setXsiSource(xsiCache);
  const C = CMain as any;
  C.mFPS = 25;
  C._this = undefined;
  C.mInput = undefined;
  // CHud keeps its message/score clips (attached to _root) in statics; a new Player has a new _root.
  (World.CHud as any).mcMessage = undefined;
  (World.CHud as any).mcScore = undefined;
  (World.CHud as any).mcScoreTotal = undefined;
  (Thing.Creature.CThing_Creature as any).mDamageActive = true;
  resetResumeForTests();
  resetStartWaveForTests();
  _resetNetForTests();
  _resetBridgeForTests();
}

// ----------------------------------------------------------------------------------------------------- game object

export interface HeadlessGame {
  readonly player: Player;
  readonly mode: GameMode;
  readonly room: number;
  /** Engine script errors (setScriptErrorHandler) + exceptions thrown out of enterFrame (first 50, with stacks). */
  readonly errors: string[];
  /** Total number of errors (errors.length is capped). */
  readonly errorCount: number;
  /** Number of enterFrames run. */
  readonly frames: number;
  main(): any;
  world(): any;
  state(): string | undefined;
  /** Run n enterFrames. */
  step(n?: number): void;
  /** Run enterFrames until the world ticked n more times (or the world is gone). Returns the ticks done. */
  tick(n?: number, maxFrames?: number): number;
  /** Run until pred() is true (checked after each enterFrame). Returns true if it became true. */
  stepUntil(pred: () => boolean, maxFrames: number, errorLimit?: number): boolean;
  keyDown(code: number): void;
  keyUp(code: number): void;
  /** Make exactly these codes (of the managed set) be down. */
  setKeys(codes: Iterable<number>, managed?: Iterable<number>): void;
  releaseAll(): void;
  isDown(code: number): boolean;
  players(): any[];
  things(): any[];
  snapshot(): Snapshot;
  /** FNV-1a hash over the full simulation state (every thing, upgrades, HUD totals). */
  hash(): string;
  /** Pause screen -> QUIT (what its _Quit button does). */
  quit(): void;
  /** Pause screen -> SAVE & QUIT (the scope-added _SaveQuit button; deviation SAVE_QUIT_RESUME). */
  saveQuit(): void;
  /** True while a stored resume run exists (SharedObject member mResumeData). */
  hasStoredResume(): boolean;
  /** Debrief screen (Screen_Debrief / Screen_Debrief_Winner) RETRY button (onPress) -> same room again. */
  retry(): void;
  /** Debrief screen EXIT button (onPress) -> level selection. */
  exit(): void;
  /** Step until the room runs (State_RunWorld with a loaded world). */
  waitRunning(maxFrames?: number): boolean;
  /**
   * Step until CMain is in `state` AND shows the screen of that state (linkage idScreen) with its transition done.
   * (Right after SetState the previous screen is still CMain.mcScreen until the new state function ran.)
   */
  waitScreen(state: string, idScreen: string, maxFrames?: number): boolean;
}

const STATE_NAMES = (m: any): string | undefined => {
  if (!m) return undefined;
  let p = Object.getPrototypeOf(m);
  while (p && p !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(p)) if (k.startsWith('State_') && m[k] === m.fState) return k;
    p = Object.getPrototypeOf(p);
  }
  return undefined;
};

export function thingList(world: any): any[] {
  const tc = world?.mThing_Collection;
  if (!tc) return [];
  return forIn(tc.mThings).map((k) => tc.mThings[k]).filter((t) => t != undefined);
}

export function playerList(world: any): any[] {
  const tc = world?.mThing_Collection;
  if (!tc) return [];
  return forIn(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).filter((t) => t != undefined)
    .sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const num = (v: unknown): string => (typeof v === 'number' ? String(v) : v === undefined ? 'u' : String(v));

export function createHeadlessGame(opts: HeadlessGameOptions = {}): HeadlessGame {
  const mode: GameMode = opts.mode ?? 'Single';
  const room = opts.room ?? 1;
  if (!(room >= 1 && room <= 18)) throw new Error('room must be 1..18');
  const seed = opts.seed ?? 1;
  loadAssets();
  registerOnce();
  resetProcessState();
  currentErrors = [];
  errorCount = 0;
  throwOnError = !!opts.throwOnError;
  const errors = currentErrors;
  useVirtualClock(0);
  seedRandom(seed);
  const C = World.Map.CMap_Cell as any;
  C.mNavBudgetMode = opts.navBudget === null ? undefined : (opts.navBudget ?? 300);

  const player = new Player(library!, { renderScale: 1 });
  const down = new Set<number>();
  let frames = 0;

  const main = (): any => (CMain as any)._this;
  const world = (): any => main()?.mcWorld;
  const state = (): string | undefined => STATE_NAMES(main());

  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      advanceVirtual(20);
      beginEnterFrame(clock.virtualNow);
      try {
        player.enterFrame();
      } catch (e) {
        errorCount++;
        if (errors.length < 50) errors.push(`enterFrame: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        if (throwOnError) throw e;
      }
      pumpSoundEvents();
      frames++;
    }
  };
  const stepUntil = (pred: () => boolean, maxFrames: number, errorLimit = Infinity): boolean => {
    const e0 = errorCount;
    for (let i = 0; i < maxFrames; i++) {
      if (pred()) return true;
      step(1);
      if (errorCount - e0 > errorLimit) return false;
    }
    return pred();
  };
  const tick = (n = 1, maxFrames = n * 8 + 8): number => {
    const w = world();
    if (!w) return 0;
    const t0 = w.mTick;
    stepUntil(() => world() !== w || w.mTick - t0 >= n, maxFrames);
    return world() === w ? w.mTick - t0 : 0;
  };
  const keyDown = (code: number): void => {
    if (down.has(code)) return;
    down.add(code);
    Key._down(code);
  };
  const keyUp = (code: number): void => {
    if (!down.has(code)) return;
    down.delete(code);
    Key._up(code);
  };
  const setKeys = (codes: Iterable<number>, managed?: Iterable<number>): void => {
    const want = new Set(codes);
    const scope = managed ? new Set(managed) : undefined;
    for (const c of [...down]) if (!want.has(c) && (!scope || scope.has(c))) keyUp(c);
    for (const c of want) keyDown(c);
  };

  const game: HeadlessGame = {
    player,
    mode,
    room,
    errors,
    get errorCount() { return errorCount; },
    get frames() { return frames; },
    main,
    world,
    state,
    step,
    tick,
    stepUntil,
    keyDown,
    keyUp,
    setKeys,
    releaseAll: () => { for (const c of [...down]) keyUp(c); },
    isDown: (code) => down.has(code),
    players: () => playerList(world()),
    things: () => thingList(world()),
    snapshot: () => snapshotOf(game),
    hash: () => hashOf(game),
    quit: () => {
      const w = world();
      if (!w) return;
      if (!w.mPaused) {
        keyDown(KEYS.PAUSE);
        stepUntil(() => !!w.mPaused, 20);
        keyUp(KEYS.PAUSE);
      }
      w.mHud.mcScreenPause?._Quit?.onRelease?.call(w.mHud.mcScreenPause._Quit);
    },
    saveQuit: () => {
      const w = world();
      if (!w) return;
      if (!w.mPaused) {
        keyDown(KEYS.PAUSE);
        stepUntil(() => !!w.mPaused, 20);
        keyUp(KEYS.PAUSE);
      }
      w.mHud.mcScreenPause?._SaveQuit?.onRelease?.call(w.mHud.mcScreenPause._SaveQuit);
    },
    hasStoredResume: () => resumeHasStored(),
    retry: () => {
      const s = main()?.mcScreen;
      if (!s?._Retry) throw new Error(`no RETRY button on ${s?._CLASSID_}`);
      s._Retry.onPress.call(s._Retry);
    },
    exit: () => {
      const s = main()?.mcScreen;
      if (!s?._Exit) throw new Error(`no EXIT button on ${s?._CLASSID_}`);
      s._Exit.onPress.call(s._Exit);
    },
    waitRunning: (maxFrames = 3000) => stepUntil(() => state() === 'State_RunWorld' && world()?.mLoaded === true, maxFrames),
    waitScreen: (st, idScreen, maxFrames = 600) => stepUntil(() => state() === st && main()?.mcScreen?.idScreen === idScreen && main().mcScreen.mNormal === true, maxFrames),
  };

  // ---- boot: root timeline -> CMain (State_Init -> State_Intro)
  if (opts.debugBoot) {
    if (mode !== 'DeathMatch') throw new Error('debugBoot starts a Death Match');
    if (!stepUntil(() => main() != undefined, 1000)) throw new Error('no CMain');
    _global.mDebug = true;
    if (!stepUntil(() => state() === 'State_SelectWorld_DeathMatch', 50, BOOT_ERROR_LIMIT)) throw new Error(`debug boot: state ${state()}, errors ${errors[0]}`);
  } else if (!stepUntil(() => state() === 'State_Intro' && main()?.mcScreen != undefined, 1000, BOOT_ERROR_LIMIT)) {
    throw new Error(`boot did not reach State_Intro (state ${state()}, errors ${errors[0]})`);
  }
  const m = main();
  const sd = m.constructor.mSaveData ?? (CMain as any).mSaveData;
  const o = opts.options ?? {};
  // options window fields (CScreen_SelectWorld.RegisterButton_Option writes CMain.mSaveData[field] = value)
  const keepSave = opts.keepSave || opts.menuOnly !== undefined;
  if (!keepSave) {
    sd.mDifficulty = opts.difficulty ?? 0;
    if (o.gameSpeed !== undefined) sd.mGameSpeed = o.gameSpeed;
    if (o.devils !== undefined) sd.mDevilsActive = o.devils;
    if (o.collisions !== undefined) sd.mCollisionsActive = o.collisions;
    if (o.damage !== undefined) sd.mDamageActive = o.damage;
    if (o.gameAmount !== undefined) sd.mGameAmount = o.gameAmount;
    if (o.detail !== undefined) sd.mDetail = o.detail;
    if (o.p1Character !== undefined) sd.mPlayer1_CharacterIndex = o.p1Character;
    if (o.p2Character !== undefined) sd.mPlayer2_CharacterIndex = o.p2Character;
    sd['mLevelIndex_' + mode] = room - 1;
  }
  if (opts.menuOnly === 'Intro') return game;

  if (opts.debugBoot) {
    // already on its way to the Death Match level selection
  } else if (opts.fullBoot || opts.menuOnly === 'Main') {
    if (!game.waitScreen('State_Main', 'Screen_Main', 3000)) throw new Error(`no State_Main (state ${state()})`);
    if (opts.menuOnly === 'Main') return game;
    const btn = { Single: 'mcSinglePlay', Coop: 'mcCoopPlay', DeathMatch: 'mcDeathPlay' }[mode];
    const b = m.mcScreen[btn];
    b.onRelease.call(b);
  } else {
    m.SetState('State_SelectWorld_' + mode);
  }
  if (!stepUntil(() => state() === 'State_SelectWorld_' + mode && m.mcScreen?._CLASSID_ === 'CScreen_SelectWorld' && m.mcScreen.mNormal === true, 600, BOOT_ERROR_LIMIT)) {
    throw new Error(`no level selection (state ${state()}, errors ${errors[0]})`);
  }
  if (opts.menuOnly === 'Select') return game;
  if (o.infiniteLife) _global.mInfinateLife = true;
  // the level icon's own button (CScreen_SelectWorld.ChangeLevel installs it): LoadLevel(CMain.mSaveData[sdField])
  const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection, keepSave ? sd['mLevelIndex_' + mode] : room - 1);
  seedRandom(seed ^ 0x5eed);
  icons._Button.onRelease.call(icons._Button);
  if (!stepUntil(() => state() === 'State_RunWorld' && world()?.mLoaded === true, 3000, BOOT_ERROR_LIMIT)) {
    throw new Error(`room ${room} did not start (state ${state()}, errors ${errors.slice(0, 3).join(' | ')})`);
  }
  return game;
}

// ------------------------------------------------------------------------------------------------- state readout

function snapshotOf(g: HeadlessGame): Snapshot {
  const w = g.world();
  const u = w?.mUpgrades;
  const counters: Record<string, number> = {};
  const tc = w?.mThing_Collection;
  if (tc) for (const k of forIn(tc.mThingCounters)) counters[k] = tc.mThingCounters[k];
  const players: PlayerSnapshot[] = g.players().map((p) => ({
    index: p.mPlayerIndex,
    x: p.mPosition.mX, y: p.mPosition.mY, z: p.mPosition.mZ,
    life: p.mLife,
    state: p.mStateID,
    dead: !!(p.mFlags & Thing.CThing.mFlag_DEAD),
    weapon: p.mWeapon_Current?.mNameID,
    ammo: p.mWeapon_Current?.mAmmo,
    invincible: p.mInvincible,
    weapons: (p.mWeaponList ?? []).filter((x: any) => x.mActive).map((x: any) => x.mNameID),
  }));
  return {
    state: g.state(),
    mode: g.mode,
    room: g.room,
    tick: w?.mTick ?? 0,
    level: u?.mLevelIndex ?? 0,
    multiplier: u?.mMultiplierIndex ?? 0,
    multipleKill: u?.mMultipleKillsIndex ?? 0,
    score: w?.mHud?.nTotalScore ?? 0,
    zombies: u?.Level?.mZombieCount ?? 0,
    devils: u?.Level?.mDevilCount ?? 0,
    zombieTotal: u?.Level?.Zombie_TotalCount ?? 0,
    things: tc ? forIn(tc.mThings).length : 0,
    counters,
    players,
    deaths: [w?.mHud?.mPlayer1_Deaths ?? 0, w?.mHud?.mPlayer2_Deaths ?? 0],
    completeState: w?.mCompleteState,
    paused: !!w?.mPaused,
  };
}

function hashOf(g: HeadlessGame): string {
  const w = g.world();
  if (!w) return fnv1a('noworld|' + g.state());
  const parts: string[] = [];
  const u = w.mUpgrades;
  parts.push(`t${w.mTick}|L${u.mLevelIndex}|M${u.mMultiplierIndex},${num(u.mMultiplierTick)}|K${u.mMultipleKillsIndex}|S${w.mHud.nTotalScore}`);
  parts.push(`Z${u.Level.mZombieCount},${u.Level.Zombie_Count},${u.Level.Zombie_TotalCount},${u.Level.mSpawnCount_Zombie}|D${u.Level.mDevilCount},${num(u.Level.Devil_Count)},${num(u.Level.mSpawnCount_Devil)}`);
  for (const t of thingList(w).sort((a, b) => a.mUniqueID - b.mUniqueID)) {
    const p = t.mPosition;
    parts.push(`${t.sUniqueID}:${t._CLASSID_}:${p ? `${num(p.mX)},${num(p.mY)},${num(p.mZ)}` : '-'}:${num(t.mAngle?.mRadians)}:${num(t.mLife)}:${num(t.mStateID)}:${t.mFlags}:${num(t.mInvincible)}`);
  }
  for (const p of playerList(w)) {
    parts.push(`P${p.mPlayerIndex}:${p.mWeapon_Current?.mNameID}:${(p.mWeaponList ?? []).map((x: any) => `${x.mActive ? 1 : 0}${num(x.mThing?.mAmmo)}`).join(',')}`);
  }
  return fnv1a(parts.join('\n'));
}

// --------------------------------------------------------------------------------------------- world invariants

export interface InvariantIssue { kind: 'nan' | 'outside' | 'entered_solid' | 'spawn_solid'; id: string; cls: string; detail: string }

const CREATURES = new Set(['CThing_Creature_Zombie', 'CThing_Creature_Devil', 'CThing_Creature_Player']);

/**
 * Per-tick world invariants (stateful: it remembers each live creature's last cell class):
 *   nan            a thing with a non-finite position;
 *   outside        a live creature outside the map;
 *   entered_solid  a live creature moved from a free cell into a Solid cell (zombies / devils may stand on the
 *                  Edge|Solid spawn cells of the map border they enter from);
 *   spawn_solid    a creature first seen (spawn / respawn) inside a Solid cell — a level-data property, reported
 *                  separately (Coop PATCHY: one Player2 marker lies inside a slab).
 */
export class InvariantChecker {
  readonly issues: InvariantIssue[] = [];
  private solid = new Map<string, boolean>();
  private world: any;

  check(world: any): InvariantIssue[] {
    const out: InvariantIssue[] = [];
    if (!world?.mThing_Collection) return out;
    if (world !== this.world) { this.world = world; this.solid.clear(); }
    const cells = world.mMap.mCells;
    const H = cells.length;
    const W = cells[0].length;
    const SOLID = World.Map.CMap_Cell.mCollide_Solid;
    const EDGE = World.Map.CMap_Cell.mCollide_EdgeOfMap;
    const DEAD = Thing.CThing.mFlag_DEAD;
    const seen = new Set<string>();
    for (const t of thingList(world)) {
      const p = t.mPosition;
      if (!p) continue;
      const base = { id: t.sUniqueID as string, cls: t._CLASSID_ as string };
      if (!Number.isFinite(p.mX) || !Number.isFinite(p.mY) || !Number.isFinite(p.mZ)) {
        out.push({ kind: 'nan', ...base, detail: `(${p.mX}, ${p.mY}, ${p.mZ}) state ${t.mStateID}` });
        continue;
      }
      if (!CREATURES.has(t._CLASSID_) || t.mFlags & DEAD) continue;
      const key = t.sUniqueID + '/' + t.mPlayerIndex;
      seen.add(key);
      const cx = Math.floor(p.mX), cy = Math.floor(p.mY);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
        out.push({ kind: 'outside', ...base, detail: `(${p.mX}, ${p.mY}) map ${W}x${H} state ${t.mStateID}` });
        continue;
      }
      const c = cells[cy][cx].mCollide;
      const inSolid = !!(c & SOLID) && !(c & EDGE && t._CLASSID_ !== 'CThing_Creature_Player');
      const before = this.solid.get(key);
      if (inSolid && before === undefined) {
        out.push({ kind: 'spawn_solid', ...base, detail: `(${p.mX.toFixed(3)}, ${p.mY.toFixed(3)}) cell ${cx},${cy} collide ${c}` });
      } else if (inSolid && before === false) {
        out.push({ kind: 'entered_solid', ...base, detail: `(${p.mX.toFixed(3)}, ${p.mY.toFixed(3)}) cell ${cx},${cy} collide ${c} state ${t.mStateID}` });
      }
      this.solid.set(key, inSolid);
    }
    // forget dead / removed creatures: a respawn counts as a new spawn
    for (const k of [...this.solid.keys()]) if (!seen.has(k)) this.solid.delete(k);
    this.issues.push(...out);
    return out;
  }
}

/** Stateless one-shot check (NaN / outside / creatures in Solid cells, spawn cells on the border excluded). */
export function checkInvariants(world: any): InvariantIssue[] {
  return new InvariantChecker().check(world).map((i) => (i.kind === 'spawn_solid' ? { ...i, kind: 'entered_solid' as const } : i));
}

/** Counts used by the memory / growth checks. */
export function thingStats(world: any): { things: number; effects: number; shots: number; corpses: number; creatures: number } {
  let effects = 0, shots = 0, corpses = 0, creatures = 0;
  const list = thingList(world);
  for (const t of list) {
    const c: string = t._CLASSID_;
    if (c.startsWith('CThing_Effect')) effects++;
    else if (c.startsWith('CThing_Shot')) shots++;
    else if (CREATURES.has(c)) { if (t.mFlags & Thing.CThing.mFlag_DEAD) corpses++; else creatures++; }
  }
  return { things: list.length, effects, shots, corpses, creatures };
}

/** The CScreen_Debrief_Winner winner index (0/1) set by CMain.State_RunWorld after a Death Match. */
export function debriefWinner(): number | undefined {
  return (Screen.CScreen_Debrief_Winner as any).mWinnerIndex;
}
