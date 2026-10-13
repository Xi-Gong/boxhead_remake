/**
 * Intentional, recorded differences between the remake and the original AS2 game (CONVENTIONS rule 10).
 * Every entry names the ported file it affects and the reason. Append new entries at the end (lanes F1..F4).
 * Keep the format simple: { id, file, description }.
 */
export interface Deviation {
  /** Stable identifier (UPPER_SNAKE_CASE), referenced from code comments. */
  id: string;
  /** Affected file(s) under src/game (or engine) — informational. */
  file: string;
  /** What differs and why. */
  description: string;
}

export const DEVIATIONS: Deviation[] = [
  {
    id: 'DECAL_MASK_1X',
    file: 'World/CWorld.ts (bmDecalMask, created by lane F3); used by World/Map/CMap_Decal.ts, World/Init/CWorld_Init_Piece.ts, DrawPrimitive/CDrawPrimitive.ts (InvertAlpha)',
    description:
      'The decal mask BitmapData may be created with {scale: 1, alphaOnly: true} (1x logical resolution, alpha-only hint) ' +
      'instead of the render scale. Only its alpha channel is used (copyPixels alphaBitmap of blood/scorch decals and ' +
      'paletteMap in InvertAlpha). Reason: memory on the largest room (BIG ONE 2784x2784 px: ~31 MB instead of ~124 MB at 2x). ' +
      'At 1x the mask edges are exactly the original Flash (1x) mask; decals on a 2x floor are clipped at 1x granularity.',
  },
  {
    id: 'NAV_BUDGET_TEST_HOOK',
    file: 'World/Map/CMap_Cell.ts (static mNavBudgetMode / mNavBudgetCells / _NavOutOfTime)',
    description:
      'TEST-ONLY switch, not in the AS2 original and never set by game code: when CMap_Cell.mNavBudgetMode is a number N, ' +
      'the "resume"/"continue" time-budget check of Nav_Update reports "out of time" after N cells were popped in the ' +
      'current call instead of using getTimer() - nSTimer > nTimeOut (3 ms). Default (undefined) = original behaviour. ' +
      'Reason: deterministic headless tests of the flow field independent of machine speed.',
  },
  {
    id: 'XSI_PAINT_ORDER_PINNED',
    file: 'DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.ts (Render), DrawPrimitive/XSI/xsiData.ts (xsiForIn)',
    description:
      'The for..in loops of CDrawPrimitive_XSI_DI.Render over the XSI data (Models, PEdge, Shape_vList, Shadow) use ' +
      'xsiForIn() (newest-first: reverse creation order for objects, descending indices for arrays) instead of the generic ' +
      'forIn() emulation. This reproduces the original paint order established from the data (generated/reports/xsi-summary.md ' +
      '§6 + the per-model planes at depth 10000-i in the bytecode) and equals forIn() in its default reverse-insertion mode; ' +
      'it only differs if oracle probe P1 ever switches the global for..in model. Not a behaviour change by itself.',
  },
  // ---------------------------------------------------------------------------------------------- lane F3
  {
    id: 'CMAIN_FRAMETIME',
    file: 'CMain.ts (ProcessFrames, ProcessFrames_Reset)',
    description:
      'The four getTimer() reads of CMain.ProcessFrames / ProcessFrames_Reset use frameTime() (the SCHEDULED time of the ' +
      'current 50 Hz enterFrame, multiples of 20 ms) instead of the wall clock. Reason: the tick maths ' +
      '(n = floor((t - mTimeSlice) / (1000 / mFPS)), at most mFrameCap = 1 tick per enterFrame) then follow the exact Flash ' +
      'frame grid on every monitor refresh rate; with wall-clock jitter of the rAF-driven loop the 25 Hz tick would ' +
      'occasionally slip a frame. Every other getTimer() (intro logos, HUD messages, XSI render budget, ...) stays real time.',
  },
  {
    id: 'NO_NETWORK',
    file: 'External/CTracker.ts, External/CHighscore_Submit.ts, frames/ButtonActions.ts, Screen/CScreen_Debrief.ts (engine: getURL, LoadVars)',
    description:
      'Scope "no URLs / sponsor / online": getURL (global and MovieClip) is a no-op and LoadVars is an inert stub ' +
      '(sendAndLoad returns false, onLoad never fires), so the CMG highscore server, the click tracker (already disabled ' +
      'in the shipped bytecode: CTracker.Click is empty) and every external link are never contacted. The classes keep ' +
      'their original structure.',
  },
  {
    id: 'SCOPE_HIDDEN_PROMOS',
    file: 'scope.ts (HIDDEN_CHARS, NON_CLICKABLE_CHARS, instance hook)',
    description:
      'Sponsor / cross-promotion links are hidden (invisible + disabled before their ctor) on every screen: the YouTube ' +
      'trailer button (char 203), the CrazyMonkeyGames "More Games" monkey _IconMoreGames (227), the four Boxhead series ' +
      'buttons Halloween / The Rooms / More Rooms / Series (236, 239, 246 [a sprite with an on(release) clip action], 252) ' +
      'and the LevelIcons "EXCLUSIVE CONTENT" link mcExclusive (418). The author credit _STC "A SEAN COOPER GAME" (230) ' +
      'stays visible but is not clickable. The menus keep their original layout (the hidden items simply leave gaps).',
  },
  {
    id: 'SCOPE_INTRO_NO_CMG_LOGO',
    file: 'scope.ts (REMOVED_INSTANCES, NON_CLICKABLE_SPRITE_SCRIPTS)',
    description:
      'Screen_Intro: the _Logo_CrazyMonkeys instance (sprite 186) is hidden, stopped and unlinked from the screen before ' +
      'CScreen_Intro.ctor builds mSequence, so only the Sean Cooper logo plays (then State_Main as in the original). The ' +
      'Sean Cooper logo (sprite 194) keeps its animation and sounds; the onRelease link set by its frame-1 script is deleted.',
  },
  {
    id: 'HOSTED_ON_CMG_TRUE',
    file: 'frames/MainTimeline.ts (root frame 1), scope.ts',
    description:
      '_global.mHostedOnCMG is pinned to true after root frame 1 (every room unlocked, no "exclusive" lock). The original ' +
      'computes true itself on any date after Oct 2007 (180-day site lock); the pin only removes the dependency on the ' +
      'system clock.',
  },
  {
    id: 'LOCAL_INSTRUCTIONS',
    file: 'scope.ts (Screen.CScreen_Main.Init_Buttons wrapper, CMain.State_Instructions), local/InstructionsPage.ts, local/localSymbols.ts',
    description:
      'The main menu INSTRUCTIONS item linked to the CrazyMonkeyGames instructions page. It now sets nState = ' +
      '"State_Instructions" (a state that existed empty in CMain) which shows the local screen "Screen_Instructions" ' +
      'through CScreen_Collection (original cross-fade transition, "Back to menu" returns to State_Main). The screen is a ' +
      'synthetic library sprite made of original characters (menu background #198, logo #10, back tab #257 + _Icon_Back ' +
      '#260) with text in the embedded fonts: controls of both players, pause, the three modes, the weapons in unlock order.',
  },
  {
    id: 'LOCAL_HIGHSCORES',
    file: 'scope.ts (CScreen_Debrief ctor wrapper, CScreen_SelectWorld.LoadHighScore wrapper), local/Highscores.ts, local/localSymbols.ts',
    description:
      'Online highscores replaced by local top-10 tables per room x mode (Single / Coop), stored in the save ' +
      '(SharedObject BXHD_2PLAY_6, member mLocalHighscores). Debrief SEND SCORE keeps the original checks (name not ' +
      '"<Enter name>", saved as mUsername; disabled unless devils, collisions and damage are all on) and then inserts the ' +
      'HUD total score instead of attaching the CMG submit dialog; afterwards the button is disabled (as after a ' +
      'successful online submit) and the table is shown with the new entry in red. Debrief "View Highscores" and the ' +
      'LevelIcons "View Highscores" show the same table overlay (synthetic sprite of the options-window parts: mcLock ' +
      '#274, panel #317, CLOSE #305) instead of opening the CMG web page. CHighscore_Submit is kept but never attached.',
  },
  {
    id: 'XSI_DATA_FROM_JSON',
    file: 'frames/SpriteScripts.ts (sprite 755 frame 1), src/main.ts',
    description:
      'The 4.6 MB DoAction of sprite 755 (TMP2639qh3hat) is not interpreted: its result _global.mXSI_Data is rebuilt from ' +
      'public/assets/xsi.json (evaluated offline by lane B, rebuilt by lane F1 installXsiData) when that frame script runs. ' +
      'Same data and property order; no behaviour change.',
  },
  {
    id: 'UPGRADE_NUMERIC_NEWWEAPON',
    file: 'World/CUpgrades.ts (AddUpgrade)',
    description:
      'AddUpgrade calls player.NewWeapon(tValue) for every value != true (bytecode @539925), i.e. also for the numeric ' +
      'SpeedUp values of each level. In AS2 that call is a complete no-op (stores into the undefined mWeapons[1.2], ' +
      'CThing_Weapon.byCLASSID(undefined) returns undefined); in JS it throws and aborted the level-up. The port skips ' +
      'the call when the player has no such weapon (plan appendix C: "do not copy the NewWeapon-for-numbers bug"). ' +
      'No observable difference to the original.',
  },
  {
    id: 'PRELOADED_ASSETS',
    file: 'frames/MainTimeline.ts (root frame 21), src/main.ts',
    description:
      'All assets (library.json, bitmaps, decoded sounds, xsi.json) are loaded before the Player starts, so ' +
      'getBytesLoaded() == getBytesTotal() and the LOADING bar only shows the original >= 0.5 s minimum of root frame 21. ' +
      'The browser build shows its own progress text while fetching, and a "Click to start" overlay when audio needs a ' +
      'user gesture (lane D).',
  },
];
