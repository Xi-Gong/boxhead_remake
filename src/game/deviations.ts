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
      'Not in the AS2 original: when CMap_Cell.mNavBudgetMode is a number N, the "resume"/"continue" time-budget check ' +
      'of Nav_Update reports "out of time" after N cells were popped in the current call instead of using ' +
      'getTimer() - nSTimer > nTimeOut (3 ms). Default (undefined) = original behaviour. Set by headless tests ' +
      '(deterministic flow fields independent of machine speed) and, since v0.1.3, by LAN sessions (see ' +
      'LAN_MULTIPLAYER): both lockstep peers must pop the same cells per tick, so a net session sets a large budget ' +
      '(full field each tick) for its duration and restores the previous value afterwards.',
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
      '#260) with text in the embedded fonts: controls of both players (the CURRENT bindings of the CONTROLS window, so a ' +
      'rebinding is reflected), pause, the three modes, the weapons in unlock order.',
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
  // ---------------------------------------------------------------------------------------------- lane X1 (UI)
  {
    id: 'LOW_QUALITY_VECTOR_AA',
    file: 'engine/swf/render/renderer.ts (no LOW path); game logic: CSaveData.mDetail -> _root._quality',
    description:
      'Right-click "Quality: LOW" (CSaveData.mDetail = false -> _root._quality "LOW" inside a room) reproduces every ' +
      'game-side effect of the original: zombie cap 40, no score pop-ups, no corpse fade, no brightness flash, no random ' +
      'bullet-hit sparks, Death Match views scaled without smoothing (tests/sim/ui_options.test.ts). Flash additionally ' +
      'rasterises VECTOR SHAPES without anti-aliasing at LOW (visible on the HUD multiplier-timer arc and on bullet / ' +
      'railgun trails; text stays smooth - reference captures room-01-low / paused-low). Canvas2D always anti-aliases ' +
      'paths, and emulating it per shape (coverage threshold through getImageData) would make LOW slower than BEST, so ' +
      'the remake keeps anti-aliased shapes at LOW.',
  },
  // ---------------------------------------------------------------------------------------------- v0.1.2 additions
  {
    id: 'WAVE_CHECKPOINT_RETRY',
    file: 'scope.ts (CUpgrades.__set__mLevel wrapper, CScreen_Debrief ctor wrapper _Retry, CMain.State_LoadWorld wrapper, CWorld.InitFinished wrapper), local/Resume.ts',
    description:
      'The original Debrief RETRY always restarts the room from scratch (score 0, pistol, difficulty base wave). The ' +
      'remake captures an in-memory checkpoint every time a wave starts (right after __set__mLevel advanced it - the ' +
      'advance condition guarantees no zombie/devil is alive then) and RETRY restores that wave-start state instead: ' +
      'wave number, score, multiplier/combo, player positions/lives/weapons+ammo and marker/placed room objects are ' +
      're-applied to the rebuilt world and the wave restarts fresh (mid-wave creatures/decals are not carried). Without ' +
      'a checkpoint (e.g. Death Match, or death before the first wave advanced) the original behaviour is untouched.',
  },
  {
    id: 'SAVE_QUIT_RESUME',
    file: 'scope.ts (CHud.Pause wrapper, CMain.State_RunWorld/State_SaveQuitMenu/State_Continue/State_Debrief wrappers, CScreen_Main.Init_Buttons wrapper), local/Resume.ts, local/localSymbols.ts (buildMenuButton)',
    description:
      'The original has no mid-run save at all. The remake adds a "SAVE & QUIT" button to the pause screen (drawn at ' +
      'runtime below QUIT; the original pause screen has a single QUIT) that stores a run snapshot in the game save ' +
      '(SharedObject BXHD_2PLAY_6 member mResumeData, written only by this button and flushed immediately) and returns ' +
      'to the main menu - not through the Debrief, so the parked score cannot be submitted and later double-counted. ' +
      'While a stored run exists the main menu grows a fifth item, CONTINUE (drawn, wired through the original ' +
      'Register_Button rollover), which rebuilds that room and re-applies the snapshot: current wave (restarting fresh ' +
      'with the remaining spawn budget), score, DM frag counts, multiplier/combo, player positions/lives/weapons+ammo, ' +
      'marker and placed room objects, RNG state and tick. Accepted losses: mid-wave creatures/shots/effects, floor ' +
      'decals, screen shake/brightness, camera smoothing, and the fuse progress of detonating claymores/charge packs. ' +
      'One slot: a new run, a death or a Death Match decision clears it.',
  },
  {
    id: 'GAMEPAD_INPUT',
    file: 'engine/platform/Gamepad.ts, engine/platform/Loop.ts (beforeTick hook), engine/platform/AudioEngine.ts (dismissAudioOverlay), game/local/Gamepad.ts, game/local/InputBadge.ts, src/main.ts',
    description:
      'The original has no gamepad support. The platform polls navigator.getGamepads() once per rAF (Loop beforeTick, ' +
      'also while the context menu freezes the loop) and the game translator feeds the EXISTING input paths: pad 0 ' +
      'drives player 1, pad 1 player 2 (player 1 in Single player), translating buttons to each CInput slot\'s CURRENT ' +
      'keycode (re-read every poll, so user rebinding is respected). Left stick (0.35 deadzone, four boolean flags) or ' +
      'the d-pad = movement (the same 8-direction keyboard semantics); RT/LT or A held = fire; RB/LB = next/previous ' +
      'weapon; Start = pause. A pushedByPad set reconciles with the physical keyboard (the pad only releases keys it ' +
      'pushed; Key._clear() self-heals on the next poll). Menus and the pause screen: pad 0\'s stick/d-pad moves a ' +
      'virtual cursor (player.mouseMove in logical coordinates - renderScale-independent), A = press/release click ' +
      'through the engine\'s own button picking, the physical mouse always wins, and a DOM arrow shows while a pad is ' +
      'active. The first pad button also dismisses the browser "Click to start" overlay (in the browser the pad cannot ' +
      'grant the audio gesture itself - Electron needs no gesture). Fixed mapping, no configuration UI. v0.1.4: the ' +
      'pad->player assignment is a swappable table (default automatic by navigator index; swapAssignment releases held ' +
      'pad keys first) and a DOM input badge (local/InputBadge.ts, bottom-left KEYBOARD/PAD 1/PAD 2 chips - presence, ' +
      'most-recent-device highlight, ->P1/->P2 assignment tags, click-a-chip-to-swap, "press any button" hint, idle ' +
      'fade; pointer-transparent except the pad chips) shows WHAT the game sees; Gamepad.id is passed through for names.',
  },
  // ---------------------------------------------------------------------------------------------- v0.1.3 additions
  {
    id: 'LAN_MULTIPLAYER',
    file: 'local/Net/* (NetSlot, NetSession, NetScope, Lobby, overlay), electron/lan.ts + lanIpc.ts, scope.ts (net guards), Thing/Weapon/CThing_Weapon_Grenade.ts (Fire wrapper), World/Map/CMap_Cell.ts (nav budget in net sessions)',
    description:
      'The original has no network play (2P is same-keyboard only). v0.1.3 adds LAN Coop / Death Match between two ' +
      'machines over deterministic LOCKSTEP (input delay 1 tick): both peers run the identical seeded simulation and ' +
      'exchange only their own player\'s 7-bit input bitmap per tick. Net games are started by a NetSession through ' +
      'the normal State_LoadWorld path with the host\'s config (difficulty / speed / devil / collision / damage / DM ' +
      'kills / quality / player-2 character) applied and restored afterwards. In a net session: both players\' input ' +
      'slots are bitmap-driven NetSlots (the remote player is immune to the local keyboard; the local player also ' +
      'runs through its bitmap so both peers compute identical latches), the grenade throw power derives from a ' +
      'virtual per-tick input clock instead of getTimer() (a Grenade.Fire wrapper shifts the timestamp), the nav BFS ' +
      'uses a deterministic cell budget (NAV_BUDGET_TEST_HOOK), pause is owned by the net wrapper (the peer freezes ' +
      'when the frame stream stops), the v0.1.2 save-quit button / debrief RETRY are hidden and the stored ' +
      'single-player run is never touched, and checkpoints (Coop: every wave start; Death Match: every 1500 ticks) ' +
      'enable reconnect/续局: a lost link freezes both sides for a 30 s auto-reconnect window (v0.1.4: the countdown ' +
      're-renders every tick so the seconds visibly count down), then the disconnecting player forfeits via ' +
      "'timeout' (both peers route to the MAIN MENU, State_NetEnd - no persistent save exists for net games, the " +
      'in-memory checkpoint survives for a mutual continuation) while a concede (pause-QUIT) keeps the Debrief/Winner ' +
      'screens. v0.1.4 rework: the lobby is a two-view room flow (create/join with auto-discovery and a validated ' +
      'manual IP that tracks the letterboxed canvas, then a room where the client readies up and the host\'s START is ' +
      'gated on it); both sides then enter a NET SETUP screen built from the ORIGINAL SubScreen_Coop/DeathMatch art ' +
      'where the HOST alone picks mode, BOTH characters (GameConfig.charP1/charP2 - cosmetic only), the level, ' +
      'difficulty and the DM frag limit, mirrored read-only to the client ({t:\'setup\'}); new messages {t:\'ready\'} / ' +
      '{t:\'setup\'}, beacons carry players:1|2, and the lockstep input delay adapts to the measured RTT (' +
      'start.inputDelay = clamp(ceil((rtt+25)/40),1,4) - virtual-LAN links no longer stall; real LANs stay at 1 tick). ' +
      'Transport: UDP beacons for discovery + manual IP (directed per-interface broadcasts), ' +
      'TCP with a 1 s heartbeat / 3.5 s dead-link watchdog in the Electron main process.',
  },
];
