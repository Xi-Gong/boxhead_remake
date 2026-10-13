/**
 * Visual-fidelity scenes (lane V): the SAME step list drives the original game (compiled to AS1 and injected into a
 * copy of the SWF by tools/oracle/visual/buildScene.ts) and the remake (interpreted by src/dev/scenes.ts, dev builds
 * only, `?scene=<id>`). Pure data - no imports, so Node tools and the Vite app can both load it.
 *
 * Driver semantics (identical on both sides):
 *   - A driver clip is created on _root (depth 1048000) by a root frame-62 script (after the Main/CMain clip exists).
 *     Its onEnterFrame does nothing until CMain._this and CMain.mInput exist (State_Init ran).
 *   - First active frame: CMain._this.mSingleFrame = true (exactly one game tick per enterFrame on both players, so
 *     tick counts and timeline frames line up independent of real time) and the save fields of PROLOGUE are set.
 *   - Then, every frame, steps run in order: an action step runs and the next step follows in the same frame; a wait
 *     step stops the frame until its condition holds (waitFrames n blocks n frames).
 *   - After the last step the scene is FROZEN: CMain's onEnterFrame is deleted and every MovieClip under _root is
 *     stopped with its onEnterFrame deleted; then the ready signal is raised (original: SharedObject, remake:
 *     window.__vis.ready) and the stage is captured.
 */
export type SceneStep =
  /** CMain._this.SetState(state) */
  | { op: 'state'; state: string }
  /** CMain._this.mcScreen[fn](...args) */
  | { op: 'screenCall'; fn: string; args?: (number | string | boolean)[] }
  /** CMain.mSaveData[field] = value (an AS2 property: setter + flush) */
  | { op: 'save'; field: string; value: number | boolean }
  /** World.CWorld.prototype.Spawn_Zombie / Spawn_Devil return false (no random spawns -> deterministic room frames) */
  | { op: 'noSpawn' }
  /** what the pause key does: world.mPaused = true; world.mHud.Pause(true) */
  | { op: 'pause' }
  /** CMain._this.mcWorld.mCompleteState = value */
  | { op: 'complete'; value: string }
  /** wait until CMain._this.mcScreen.idScreen == id and the screen finished its transition (mNormal) */
  | { op: 'waitScreen'; id: string }
  /** wait until CMain._this.fState == CMain._this[state] */
  | { op: 'waitState'; state: string }
  /** wait until CMain._this.mcWorld.mTick >= tick */
  | { op: 'waitTick'; tick: number }
  /** block n frames */
  | { op: 'waitFrames'; n: number }
  /** Lane X1: CMain._this.<target>[fn](...args); target is a dotted member path ('mcScreen._Retry', '' = CMain itself) */
  | { op: 'call'; target: string; fn: string; args?: (number | string | boolean)[] }
  /** Lane X1: CMain._this.<target>[prop] = value */
  | { op: 'set'; target: string; prop: string; value: number | string | boolean }
  /** Lane X1: a key press seen by a Key listener: Key.getCode() returns `code`, then CMain._this.<target>.onKeyDown() */
  | { op: 'key'; target: string; code: number }
  /** Lane X1: wait until CMain._this.<target>[prop] >= value */
  | { op: 'waitAtLeast'; target: string; prop: string; value: number };

export interface SceneDef {
  id: string;
  title: string;
  steps: SceneStep[];
  /** Differences that are expected by design (scope rules, ...), shown in the report. */
  expected?: string[];
  /** Stage rectangles holding EXPECTED differences (excluded from the 'outside masks' number of compare.ts). */
  masks?: { x: number; y: number; w: number; h: number; why: string }[];
  /** Lane X1: a remake-only screen (scope replacement without an original counterpart): no reference capture. */
  remakeOnly?: boolean;
}

/** Save fields set on the first active frame (the CSaveData prototype defaults, made explicit). */
export const PROLOGUE: { field: string; value: number | boolean }[] = [
  { field: 'mDifficulty', value: 0 },
  { field: 'mGameSpeed', value: 1 },
  { field: 'mDevilsActive', value: 1 },
  { field: 'mCollisionsActive', value: 1 },
  { field: 'mDamageActive', value: 1 },
  { field: 'mGameAmount', value: 1 },
  { field: 'mLevelIndex_Single', value: 8 },
  { field: 'mLevelIndex_Coop', value: 0 },
  { field: 'mLevelIndex_DeathMatch', value: 0 },
  { field: 'mPlayer1_CharacterIndex', value: 3 },
  { field: 'mPlayer2_CharacterIndex', value: 0 },
  { field: 'mViewSide_DeathMatch', value: 1 },
];

const PROMO_MAIN = 'Screen_Main: the YouTube trailer button and the CrazyMonkeyGames / Boxhead series promo buttons are hidden by src/game/scope.ts';
const PROMO_SELECT = 'Screen_SelectWorld: the CrazyMonkeyGames "More Games" / series promo buttons are hidden by src/game/scope.ts';
const PROMO_DEBRIEF = 'Screen_Debrief: the CrazyMonkeyGames promo buttons are hidden by src/game/scope.ts';

type Mask = NonNullable<SceneDef['masks']>[number];
/** Stage rectangles of the scope-hidden promo buttons (remake getBounds() + filter padding), see src/game/scope.ts. */
const MASK_MORE_GAMES: Mask = { x: 3, y: 322, w: 195, h: 85, why: 'CMG "More Games" monkey button (char 227) hidden by scope.ts' };
const MASK_SERIES: Mask[] = [
  { x: 5, y: 411, w: 474, h: 67, why: 'Boxhead Halloween / The Rooms / More Rooms promo buttons (chars 236, 239, 246) hidden by scope.ts' },
  { x: 476, y: 404, w: 160, h: 74, why: 'Boxhead Series promo button (char 252) hidden by scope.ts' },
];
const MASK_YOUTUBE: Mask = { x: 20, y: 198, w: 142, h: 88, why: 'YouTube "VIEW THE TRAILER" button (char 203) hidden by scope.ts' };
const PROMO_MASKS: Mask[] = [MASK_MORE_GAMES, ...MASK_SERIES];
/** Options / controls windows cover most of the "More Games" button: only its part left of the window differs. */
const PROMO_MASKS_WINDOW: Mask[] = [{ ...MASK_MORE_GAMES, w: 67 }, ...MASK_SERIES];

const select = (mode: 'Single' | 'Coop' | 'DeathMatch'): SceneStep[] => [
  { op: 'state', state: `State_SelectWorld_${mode}` },
  { op: 'waitScreen', id: 'Screen_SelectWorld' },
];

const room = (mode: 'Single' | 'Coop' | 'DeathMatch', n: number, tick = 11): SceneStep[] => [
  { op: 'noSpawn' },
  ...select(mode),
  { op: 'waitFrames', n: 2 },
  { op: 'screenCall', fn: 'LoadLevel', args: [n - 1] },
  { op: 'waitState', state: 'State_RunWorld' },
  { op: 'waitTick', tick },
];

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
/** room() with extra steps right after its noSpawn (e.g. save fields the room reads). */
const roomWith = (extra: SceneStep[], mode: 'Single' | 'Coop' | 'DeathMatch', n: number): SceneStep[] => { const r = room(mode, n); return [r[0]!, ...extra, ...r.slice(1)]; };
const rel = (target: string): SceneStep => ({ op: 'call', target, fn: 'onRelease' });
const WIN_OPT = 'mcScreen.mcWindow_Options';
const WIN_CTL = 'mcScreen.mcWindow_Controls';

export const SCENES: SceneDef[] = [
  { id: 'main', title: 'Main menu', steps: [{ op: 'state', state: 'State_Main' }, { op: 'waitScreen', id: 'Screen_Main' }, { op: 'waitFrames', n: 4 }], expected: [PROMO_MAIN], masks: [MASK_YOUTUBE, ...PROMO_MASKS] },
  { id: 'select-single', title: 'Select world: Single', steps: [...select('Single'), { op: 'waitFrames', n: 4 }], expected: [PROMO_SELECT], masks: PROMO_MASKS },
  { id: 'select-coop', title: 'Select world: Coop', steps: [...select('Coop'), { op: 'waitFrames', n: 4 }], expected: [PROMO_SELECT], masks: PROMO_MASKS },
  { id: 'select-dm', title: 'Select world: Death Match', steps: [...select('DeathMatch'), { op: 'waitFrames', n: 4 }], expected: [PROMO_SELECT], masks: PROMO_MASKS },
  {
    id: 'options', title: 'Game options window (Single)',
    steps: [...select('Single'), { op: 'screenCall', fn: 'WindowOptions_Open' }, { op: 'waitFrames', n: 2 }], expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'controls', title: 'Controls window (Coop)',
    steps: [...select('Coop'), { op: 'screenCall', fn: 'WindowControls_Open' }, { op: 'waitFrames', n: 2 }], expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'controls-single', title: 'Controls window (Single: player 2 covered)',
    steps: [...select('Single'), { op: 'screenCall', fn: 'WindowControls_Open' }, { op: 'waitFrames', n: 2 }], expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'loading', title: 'Loading screen',
    steps: [...select('Single'), { op: 'waitFrames', n: 2 }, { op: 'screenCall', fn: 'LoadLevel', args: [0] }, { op: 'waitScreen', id: 'Screen_LoadingWorld' }],
  },
  ...[1, 4, 8, 12, 18].map((n): SceneDef => ({ id: `room-${pad2(n)}`, title: `Single room ${n}, tick 11 (players blink while invincible: visible on odd ticks)`, steps: room('Single', n) })),
  { id: 'coop-01', title: 'Coop room 1, tick 11', steps: room('Coop', 1) },
  { id: 'dm-01', title: 'Death Match room 1 (split screen), tick 11', steps: room('DeathMatch', 1) },
  { id: 'paused', title: 'Pause screen (upgrade list), room 1', steps: [...room('Single', 1), { op: 'pause' }, { op: 'waitFrames', n: 2 }] },
  {
    id: 'debrief', title: 'Debrief after quitting room 1',
    steps: [...room('Single', 1), { op: 'complete', value: 'quit' }, { op: 'waitScreen', id: 'Screen_Debrief' }, { op: 'waitFrames', n: 4 }],
    expected: [PROMO_DEBRIEF, 'Screen_Debrief: SEND SCORE / highscore list are the local replacements (src/game/scope.ts)'],
    masks: PROMO_MASKS,
  },  // ------------------------------------------------------------------------------- lane X1: UI / non-combat scenes
  {
    id: 'intro-logo', title: 'Intro: Sean Cooper logo held at frame 120 (of 250)',
    steps: [{ op: 'waitScreen', id: 'Screen_Intro' }, { op: 'waitAtLeast', target: 'mcScreen._Logo_SeanCooper', prop: '_currentframe', value: 100 },
      { op: 'call', target: 'mcScreen._Logo_SeanCooper', fn: 'gotoAndStop', args: [120] }],
    expected: ['Screen_Intro: the CrazyMonkeyGames logo is removed by src/game/scope.ts (it plays after this logo in the original)'],
  },
  {
    id: 'transition', title: 'Cross-fade Main -> Select world (Single), half-way through the 10-tick transition',
    steps: [{ op: 'state', state: 'State_Main' }, { op: 'waitScreen', id: 'Screen_Main' }, { op: 'waitFrames', n: 2 },
      { op: 'state', state: 'State_SelectWorld_Single' }, { op: 'waitFrames', n: 6 }],
    expected: [PROMO_MAIN, PROMO_SELECT], masks: [MASK_YOUTUBE, ...PROMO_MASKS],
  },
  {
    id: 'main-hover', title: 'Main menu: SINGLE PLAY rolled over (alpha 100 + random DropShadow/Blur every frame)',
    steps: [{ op: 'state', state: 'State_Main' }, { op: 'waitScreen', id: 'Screen_Main' }, { op: 'call', target: 'mcScreen.mcSinglePlay', fn: 'onRollOver' }, { op: 'waitFrames', n: 3 }],
    expected: [PROMO_MAIN, 'the roll-over filters are random (Math.random / random): the hovered item jitters differently'],
    masks: [MASK_YOUTUBE, ...PROMO_MASKS],
  },
  {
    id: 'select-coop-changed', title: 'Select world (Coop): room 18, player 1 SWAT, player 2 BAMBO',
    steps: [...select('Coop'), rel('mcScreen.mcSubScreen.mcLevel_Selection.bLeft'), rel('mcScreen.mcSubScreen.mcPlayer1_Character.bRight'),
      rel('mcScreen.mcSubScreen.mcPlayer2_Character.bLeft'), { op: 'waitFrames', n: 2 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS,
  },
  {
    id: 'options-set', title: 'Options window: Nightmare, Fast, collisions / devils / friendly fire off, first to 50',
    steps: [...select('Single'), { op: 'screenCall', fn: 'WindowOptions_Open' },
      ...['_Level_Nightmare', '_Speed_Fast', '_Devils_Off', '_Collide_Off', '_Damage_Off', '_Game4'].map((n) => rel(`${WIN_OPT}.${n}._Button`)),
      { op: 'waitFrames', n: 2 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'controls-presskey', title: 'Controls window (Coop) waiting for a key ("PRESS A KEY")',
    steps: [...select('Coop'), { op: 'screenCall', fn: 'WindowControls_Open' }, rel(`${WIN_CTL}.mcPlayer1.mcChangeKey_Shoot`), { op: 'waitFrames', n: 3 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'controls-invalid', title: 'Controls window: an unknown key (F2) shows "INVALID KEY!"',
    steps: [...select('Coop'), { op: 'screenCall', fn: 'WindowControls_Open' }, rel(`${WIN_CTL}.mcPlayer2.mcChangeKey_MoveUp`), { op: 'waitFrames', n: 2 },
      { op: 'key', target: `${WIN_CTL}.mKeyListener`, code: 113 }, { op: 'waitFrames', n: 1 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'controls-rebound', title: 'Controls window after rebinding: P1 shoot = K, P2 up = ARROW UP (duplicates are allowed)',
    steps: [...select('Coop'), { op: 'screenCall', fn: 'WindowControls_Open' }, rel(`${WIN_CTL}.mcPlayer1.mcChangeKey_Shoot`),
      { op: 'key', target: `${WIN_CTL}.mKeyListener`, code: 75 }, rel(`${WIN_CTL}.mcPlayer2.mcChangeKey_MoveUp`),
      { op: 'key', target: `${WIN_CTL}.mKeyListener`, code: 38 }, { op: 'waitFrames', n: 2 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS_WINDOW,
  },
  {
    id: 'debrief-name', title: 'Debrief with a typed name',
    steps: [...room('Single', 1), { op: 'complete', value: 'quit' }, { op: 'waitScreen', id: 'Screen_Debrief' },
      { op: 'set', target: 'mcScreen.mUsername', prop: 'text', value: 'ZED 42' }, { op: 'waitFrames', n: 2 }],
    expected: [PROMO_DEBRIEF], masks: PROMO_MASKS,
  },
  {
    id: 'debrief-disabled', title: 'Debrief when devils were off (SEND SCORE disabled: alpha 50)',
    steps: [...roomWith([{ op: 'save', field: 'mDevilsActive', value: 0 }], 'Single', 1), { op: 'complete', value: 'quit' }, { op: 'waitScreen', id: 'Screen_Debrief' }, { op: 'waitFrames', n: 2 }],
    expected: [PROMO_DEBRIEF], masks: PROMO_MASKS,
  },
  {
    id: 'winner-p1', title: 'Death Match result: PLAYER 1 WINS (BAMBO)',
    steps: [...room('DeathMatch', 1), { op: 'complete', value: 'player1 wins' }, { op: 'waitScreen', id: 'Screen_Debrief_Winner' }, { op: 'waitFrames', n: 2 }],
    expected: [PROMO_DEBRIEF], masks: PROMO_MASKS,
  },
  {
    id: 'winner-p2', title: 'Death Match result: PLAYER 2 WINS (SWAT)',
    steps: [...room('DeathMatch', 1), { op: 'complete', value: 'player2 wins' }, { op: 'waitScreen', id: 'Screen_Debrief_Winner' }, { op: 'waitFrames', n: 2 }],
    expected: [PROMO_DEBRIEF], masks: PROMO_MASKS,
  },
  {
    id: 'dm-01-switched', title: 'Death Match room 1 after the frags-HUD side switch (player 1 view on the left)',
    steps: [...room('DeathMatch', 1), { op: 'call', target: 'mcWorld.mHud.mcPlayerFrags.mcSwitchSides', fn: 'onRelease' }, { op: 'waitTick', tick: 13 }],
  },
  { id: 'dm-paused', title: 'Death Match pause screen', steps: [...room('DeathMatch', 1), { op: 'pause' }, { op: 'waitFrames', n: 2 }] },
  {
    id: 'room-01-low', title: 'Single room 1 with Quality LOW (mDetail off -> _root._quality LOW inside the room)',
    steps: roomWith([{ op: 'save', field: 'mDetail', value: false }], 'Single', 1),
  },
  {
    id: 'dm-01-low', title: 'Death Match room 1 with Quality LOW (split views drawn without smoothing)',
    steps: roomWith([{ op: 'save', field: 'mDetail', value: false }], 'DeathMatch', 1),
  },
  {
    id: 'paused-low', title: 'Pause screen with Quality LOW (vector shapes aliased, embedded-font text still smooth)',
    steps: [...roomWith([{ op: 'save', field: 'mDetail', value: false }], 'Single', 1), { op: 'pause' }, { op: 'waitFrames', n: 2 }],
  },
  // every level preview of LevelIcons_Single (Single selection, room n via the saved index; 9 = select-single)
  ...[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((n): SceneDef => ({
    id: `level-icon-${pad2(n)}`, title: `Select world (Single): level preview ${n}`,
    steps: [{ op: 'save', field: 'mLevelIndex_Single', value: n - 1 }, ...select('Single'), { op: 'waitFrames', n: 2 }],
    expected: [PROMO_SELECT], masks: PROMO_MASKS,
  })),
  // remake-only screens (scope replacements, no original counterpart)
  {
    id: 'instructions', title: 'Local instructions page (remake only)', remakeOnly: true,
    steps: [{ op: 'state', state: 'State_Main' }, { op: 'waitScreen', id: 'Screen_Main' }, { op: 'state', state: 'State_Instructions' }, { op: 'waitScreen', id: 'Screen_Instructions' }, { op: 'waitFrames', n: 2 }],
  },
  {
    id: 'highscores-select', title: 'Local highscore table of BIG BOXY from the level icon (remake only)', remakeOnly: true,
    steps: [...select('Single'), { op: 'screenCall', fn: 'LoadHighScore', args: [8] }, { op: 'waitFrames', n: 2 }],
  },
  {
    id: 'highscores-debrief', title: 'Local highscore table after SEND SCORE (remake only)', remakeOnly: true,
    steps: [...room('Single', 1), { op: 'complete', value: 'quit' }, { op: 'waitScreen', id: 'Screen_Debrief' },
      { op: 'set', target: 'mcScreen.mUsername', prop: 'text', value: 'ZED' }, rel('mcScreen._SendScore'), { op: 'waitFrames', n: 2 }],
  },
];

export function getScene(id: string): SceneDef | undefined {
  return SCENES.find((s) => s.id === id);
}
