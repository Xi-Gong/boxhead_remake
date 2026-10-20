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
    id:'ENEMY_BOSS_ART',
    file:'local/VariantArt.ts, EnemyVariants.ts',
    description:'v0.3.1 derives separate ordinary/Boss armor, bracers, crowns, bone spines and furnace '+
      'inlays. Original animations, return frames, feet and XSI_Info remain intact; old variant art is an '+
      'explicit fixture. Collections bake during loading and cache by resource identity. Charge warnings '+
      'show the actual combined hit radius and clip to the same static obstruction sweep; fire marks '+
      'retain their real one-cell radius. No hitboxes, skill timings or network fields change.',
  },
  {
    id:'PROJECTILE_ART',
    file:'local/ProjectileArt.ts; scope.ts',
    description:'v0.3.1 draws warm bullet/pellet tracers, cyan rail cores, directional rocket bodies and short '+
      'matching muzzle effects. Draw-only inversion of the authored cosmetic drift keeps hitscan lines on '+
      'the resolved muzzle/impact segment; unresolved delayed pellets are hidden and the two authored '+
      'visible frames fade without extending lifetime. Original collision, damage, emission, RNG and '+
      'snapshot fields stay unchanged. Visual identity caches use WeakMap; classic art remains a fixture.',
  },
  {
    id:'WEAPON_ART',
    file:'local/WeaponArt.ts; scope.ts',
    description:'v0.3.1 independently derives the five held gun meshes and materials at resource load time. '+
      'The original right-hand and muzzle anchors define the rigid frame. Animation IDs, original direction '+
      'lookups, return frames and XSI_Info remain unchanged; all four character styles keep their own caches. '+
      'Classic source collections remain available for fixtures and comparisons. No global rasterizer, '+
      'render-scale setting, input, damage, projectile position or collision rule is changed.',
  },
  {
    id:'TIMED_REFERENCE_GROWTH',
    file:'local/TimedGrowthRules.ts, Endless.ts, LocalGrowth.ts; local/Net/NetSession.ts',
    description:'Timed PvE derives selected-wave levels and enemy growth from map duration, the three spawn '+
      'stages, difficulty, enabled devils and an equal cooperative kill share. Boss reference experience '+
      'counts timed reinforcements without assuming a Boss kill. A bounded 100-wave prefix and closed-form '+
      'five-wave tail replace unbounded replay; only the current enemy-growth result is cached per world. '+
      'Existing saved personal levels, XP, current vitals, ammunition and the original unlock table persist.',
  },
  {
    id:'BOSS_WAVES',
    file:'local/BossWaves.ts, TimedWaves.ts, TimedWaveUi.ts, EnemyVariants.ts, Resume.ts; local/Net/bridge.ts',
    description:'v0.3.1 optional boss-waves-v1 requires timed waves and enemy variants. Every fifth wave has '+
      'one alternating Boss, one extra minute, and at most four ordinary zombie reinforcements. Half health '+
      'enables a separately warned second charge or faster three-mark casting. Nonfatal hits preserve active '+
      'skills; lethal hits resolve normally. Defeating the Boss doubles the one draft reward, while timeout '+
      'survival keeps the ordinary reward. Encounter HP and skills persist in snapshots and optional v2 saves.',
  },
  {
    id:'WAVE_DRAFT',
    file:'local/WaveDraft.ts, WaveDraftRules.ts, WaveDraftInput.ts, WaveDraftUi.ts; local/Net/Growth.ts, NetSession.ts; local/Resume.ts',
    description:'v0.3.1 optional wave-draft-v1 requires timed waves. Between waves, combat and supplies freeze '+
      'while tick inputs select one of three seeded rewards per player. All confirmations advance immediately; '+
      'the 12-second deadline uses the visible firepower default. Held battle fire cannot confirm the draft. '+
      'Choices reuse the existing seven input bits; cumulative additive bonuses and reward deduplication live '+
      'in the snapshot graph and optional v2 saves. Selected waves receive an evenly distributed baseline build '+
      'without assumed Boss bonuses or per-wave replay. Migration preserves current health, shield and ammunition.',
  },
  {
    id:'TIMED_WAVES',
    file:'local/TimedWaves.ts, TimedWaveRules.ts, Resume.ts; local/Net/protocol.ts, bridge.ts',
    description:'v0.3.1 optional timed-waves-v1 replaces finite enemy budgets with map-sized simulation timers '+
      'and continuous capped spawns. Nearby reachable entries are preferred; ground arrivals receive a warning. '+
      'Timeout disposes combat entities without kill rewards before recording the next checkpoint. '+
      'Old peers and explicit classic fixtures retain the original finite waves; v2 saves carry remaining ticks.',
  },
  {
    id:'PERSISTENT_ENCHANTMENT',
    file:'local/EnchantmentRules.ts, Enchantment.ts, Resume.ts, WeaponCrate.ts; local/Net/protocol.ts, bridge.ts; electron/lan.ts',
    description:'v0.3.0-rc2 optional persistent-enchantment-v1 requires enemy variants. Purple crates enchant '+
      'the held weapon until ammunition is exhausted, including later supplies and upgrade/rebuild grants. '+
      'The last emission remains enchanted; an emptied weapon never regains the marker from a refill. '+
      'Optional v2 weapon/crate fields and exact snapshots preserve the marker; surviving old enchanted stock '+
      'migrates without granting ammunition. Legacy enemy-variants-v1 keeps its original finite-stock semantics.',
  },
  {
    id:'ENEMY_VARIANTS',
    file:'local/EnemyVariants.ts, VariantArt.ts, VariantLoot.ts, Enchantment.ts, EnchantmentRules.ts, Supplies.ts, WeaponCrate.ts, Armor.ts, Resume.ts; local/Net/NetScope.ts, bridge.ts, protocol.ts; electron/lan.ts',
    description:'v0.3.0 enemy-variants-v1 depends on endless PvE and adds deterministic ordinal replacements '+
      'within original Zombies/Devil budgets and family identities: at most four Bone Chargers and one Ember '+
      'Priest. Charges lock direction, telegraph, stop on players/geometry and recover; priest player fireballs '+
      'become bounded ground marks with simulated warning, four player-only pulses, line-of-sight and shared '+
      'damage-cycle guards. Obstacle clearing remains original. Skill fields/zones are snapshot-owned; optional '+
      'run saves restore live variant skills, voice samples, ordinals and independently identified crates. '+
      'Charger 50% red drops merge with combo guarantees. Priests drop one crate: 30% purple enchantment, '+
      'otherwise one equal armor/ammo/medical roll. Enchantment boosts the held ammunition batch by 35%, '+
      'lets bullets hit three enemies, retains railgun piercing, strengthens blast-edge damage to 75% and '+
      'respects physical walls. Refills add ordinary rounds, authored infinite ammo stays enchanted, fake '+
      'walls cannot consume the crate, and death crates/saves retain enchanted stock. Purple ammo/tracers '+
      'and cached violet blasts are render-only. Original '+
      'art data stays immutable: derived XSI solids/materials articulate per part/direction, preserve foot '+
      'geometry, include skill poses and bake in loading. Replacement older peers cannot resume a modern run.',
  },
  {
    id:'ENDLESS_PVE',
    file:'local/Endless.ts, EndlessRules.ts, LocalGrowth.ts, Resume.ts, SurvivalRules.ts, StartWave.ts, WaveUnlock.ts; local/Net/Growth.ts, GrowthHud.ts, bridge.ts, NetSession.ts',
    description:'v0.3.0 optional endless-pve-v1 requires the existing personal growth, armor, survival, loot and '+
      'balance capabilities. Local modern PvE enables it; Death Match and explicit original fixtures retain '+
      'their previous paths. Levels above 125 keep the authored tier-125 perks and add linear health, armor, '+
      'weapon damage and finite ammunition capacity. Inherited larger capacity also gains each level delta. '+
      'Derived table caches stay bounded at 125; cumulative XP and its inverse use exact closed-form integer '+
      'arithmetic. Enemy budgets cap at 200 zombies/10 devils, with continuing health/damage based on earned '+
      'previous-wave XP. Damage transfers once through shots/placed explosives; physical hit impulses alone '+
      'cap at the original .3-cell explosion ceiling to prevent high damage jumping through map walls. '+
      'High-wave selection follows historical unlocks, endless saves restore the target directly and reject '+
      'older-rule worlds before mutation. Optional markers preserve old v2 saves and old capability meanings.',
  },
  {
    id: 'MENU_SPACING',
    file: 'local/UiStyle.ts; local/Net/Lobby.ts; scope.ts',
    description: 'v0.3.0 fits authored main-menu hit bounds to 24px rows spaced 36px apart, retaining '+
      'original art, Contents and Register_Button hover/input. LAN resume/retry and settings share a '+
      'separate action row, centering settings when no recovery exists. Primary actions and footer remain '+
      'separate. Pill text fields fit their labels instead of extending below the visible button and '+
      'inflating its hit area. Layout stays in authored content coordinates with existing Presenter transforms.',
  },
  {
    id: 'STABLE_HUD_MESSAGES',
    file: 'local/Net/HudMessages.ts, NetSession.ts, NetScope.ts; local/SupplyDrops.ts, Supplies.ts',
    description: 'v0.3.0 modern HUD messages are a bounded three-row display queue, outside rollback snapshots. '+
      'Confirmed tick/emitter/message identities play once; 160ms smooth row transitions and 3s lifetime '+
      'with a final 500ms fade use display time, freeze during pause and release glyphs on world disposal. '+
      'Pickup notices distinguish P1/P2 and backpack versus named-weapon ammunition. Legacy fixtures and '+
      'legacy netcode keep the original message path; simulation, scores and RNG are unchanged.',
  },
  {
    id: 'RELIABLE_SUPPLIES',
    file: 'local/ReliableSupplies.ts, Supplies.ts, SupplyDrops.ts, Armor.ts; local/Net/protocol.ts, bridge.ts; electron/lan.ts',
    description: 'v0.3.0 supplies synchronize derived player limits before eligibility and refill. Weapon '+
      'rewards and backpack refills preserve larger capacities inherited from cooperative weapon crates; '+
      'queries retain actual ammunition instead of accidentally refilling. One red reward roll and the '+
      'original ordered weapon pool remain. reliable-supplies-v1 requires modern loot and preserves old '+
      'peer behavior when absent.',
  },
  {
    id: 'PERSISTENT_SUPPLIES',
    file: 'local/LootRules.ts, SupplyDrops.ts, Supplies.ts, Armor.ts, Resume.ts; local/Net/bridge.ts, protocol.ts; electron/lan.ts',
    description: 'v0.2.9 modern PvE devils use one seeded roll for equal armor/ammo/medical crates. Stable '+
      'identities survive waves, v2 saves, checkpoints and rollback without expiry or count-based removal. '+
      'Only living players who benefit consume them. Medical art uses the original cached bitmap silhouette '+
      'with a bright green finish and white cross. Red boxes consume one roll: 10% each supply effect, otherwise '+
      'the original ordered/weighted owned-weapon pool without healing; full/empty rewards still consume the '+
      'box. Fixed boxes respawn after 24 simulated seconds. Every 20 simulated seconds, current-geometry BFS '+
      'selects reachable empty ground for 1/2 random boxes, capped at 3/6, with 45-second lifetimes. Timers and '+
      'identities are simulation/snapshot data. supply-crates-v2 requires survival, growth and armor-ammo-v1; '+
      'old peers keep their exact transient drops, reward pool, timers and random calls. Death Match is unchanged.',
  },
  {
    id: 'GROWING_SURVIVAL',
    file: 'local/SurvivalRules.ts, ShieldResilience.ts, Armor.ts, Supplies.ts, Resume.ts; local/Net/Growth.ts, NetSession.ts, bridge.ts, protocol.ts',
    description: 'v0.2.9 modern PvE health and armor caps are 200 + 4*(personal level-1). Living level-ups add '+
      'only the health-cap difference; shields never refill on level-up. Cooperative respawn keeps level, fills '+
      'scaled health and clears armor. Original natural regeneration formula is unchanged. Enemy hits with '+
      'positive pre-hit armor, including the breaking hit, absorb shield/health damage without changing control, '+
      'facing or hit reaction; subsequent affects recheck armor. Protected lethal hits still enter normal death. '+
      'Synchronous reaction guards remain outside snapshots; all mutable vitals remain in the original player '+
      'snapshot/checksum graph. survival-v1 is optional and requires growth plus supplies; old peers retain '+
      '100 armor, 200 health and original reactions. Existing v2 saves retain current vitals on restore.',
  },
  {
    id: 'LOCAL_PERSONAL_GROWTH',
    file: 'local/LocalGrowth.ts, Resume.ts; local/Net/GrowthHud.ts; scope.ts',
    description: 'v0.2.9 extends permanent LAN personal kill ownership, score, balanced XP and weapon upgrades '+
      'to Single/Coop. Single uses all previous-wave XP; Coop uses the equal-share start model, both retaining '+
      'the difficulty floor. Local HUD reads simulation directly, LAN HUD still reads confirmed state. '+
      'Old v2 saves restore first, then convert once using wave/difficulty/multiplier/owned-weapon level bounds, '+
      'preserving score (Coop odd remainder to P1), health, armor, inventory and ammo. Existing growth restores '+
      'directly. Initial and restored local worlds establish retry checkpoints. Death Match is unchanged; '+
      'explicit classicGrowth fixtures retain original multiplier/visual-oracle assertions.',
  },
  {
    id: 'SOFT_EXPLOSION_FLASH',
    file: 'local/ExplosionFlash.ts; scope.ts (CWorld.Process_Brightness wrapper)',
    description: 'Reduce the positive full-screen brightness wash to 8% of its authored strength: '+
      'peak RGB offset 204 becomes nominally 16.32 (floored to 16 with the CPU Float32 byte rules so '+
      'the original GPU brightness fast path remains eligible, preserving the softer pixels). '+
      'Only freshly returned display-filter offsets change; '+
      'mBrightness, original fade cadence, explosion art, shake, damage, sound, decals, RNG and '+
      'network state stay intact. Repeated blasts cannot stack a brighter wash. The shared initial '+
      'world flash is softened too; LOW quality still omits the effect entirely.',
  },
  {
    id: 'WAVE_TEXT_INPUT',
    file: 'local/WaveValidation.ts, WaveInput.ts, StartWaveUi.ts; local/Net/Setup.ts, bridge.ts; scope.ts; main.ts',
    description: 'Local Single/Coop and LAN host wave selectors accept full ASCII decimal drafts through '+
      'a native text/IME/paste conduit over the embedded canvas font. Enter, blur, start and arrows share '+
      'strict unlocked-range validation; Escape restores the last legal value. Invalid drafts open a '+
      'screen-owned modal, cancel the action and retain/select the draft without publishing it. Raw pasted '+
      'line breaks cannot be silently stripped into valid numbers. Guest values remain readonly. '+
      'Presenter transforms, visibility/unload cleanup and a numeric host-cap start guard preserve input '+
      'ownership, scale alignment and saved unlocks; re-entering still starts at wave 1.',
  },
  {
    id: 'LAN_ROOM_SETTINGS',
    file: 'local/Net/RoomSettings.ts, RoomSettingsPanel.ts, Lobby.ts, Setup.ts, bridge.ts, protocol.ts; local/FriendlyFire.ts',
    description: 'The waiting room and setup share a host-editable, guest-readonly options panel. Numeric '+
      '0/1 and boolean saved switches retain their meaning; optional lobby selections mirror changes. '+
      'A running game retains its start configuration, including on resume. New team-pass-v1 peers and '+
      'local Coop skip teammate affect masks in player-owned line queries when friendly fire is disabled, '+
      'letting bullets reach enemies behind them without changing movement collisions or enemy attacks. '+
      'Legacy LAN and Death Match retain their original hit filtering.',
  },
  {
    id: 'AUDIO_BOOT_RECOVERY',
    file: 'engine/platform/AudioEngine.ts; main.ts',
    description: 'Arm the audio watchdog before the first context construction, retain gesture retries on '+
      'failure, and proactively resume Electron audio. Resume callers share one attempt; context generations '+
      'reject old decode/resume callbacks. Closed, wedged, repeatedly failing node graphs and running clocks '+
      'stalled during expected playback rebuild automatically, preserving mute and releasing completion '+
      'latches without replaying queued effects. No gameplay or asset changes.',
  },
  {
    id: 'CONFIRMED_SCORE_FLIGHTS',
    file: 'local/Net/FloatingScores.ts, Growth.ts, GrowthHud.ts, NetScope.ts, NetSession.ts',
    description: 'Personal-growth score flights use confirmed per-kill event identities and a separate '+
      'world-owned display cache, not rollback snapshot mScores. Authored score glyphs travel for 900ms '+
      'of display time to the killer\'s actual score-field bounds, adapt to resize, freeze on pause and '+
      'release bitmaps on completion/world disposal. Simulation totals remain immediate and deterministic; '+
      'legacy LAN and LOW-detail conventions are retained.',
  },
  {
    id: 'LAN_RESPONSE_DIAGNOSTICS',
    file: 'local/Net/ResponseTrace.ts, NetSession.ts, NetScope.ts, Presentation.ts, Rollback.ts; main.ts',
    description: 'Optional bounded session diagnostics timestamp keyboard events, sampling, NetSlot application, '+
      'first display per tick, sound presentation, wait transitions and replay duration. Disabled by default; '+
      'never serialized or used by simulation, RNG, wire messages or checksums. Both roles retain the same '+
      'zero-extra-delay rollback-v2 input and local presentation path.',
  },
  {
    id:'DEVIL_SUPPLIES',
    file:'local/Armor.ts, Supplies.ts, Resume.ts; local/Net/bridge.ts, protocol.ts; electron/lan.ts',
    description:'PvE Devil kills use one seeded roll: 20% armor crate, 20% whole-backpack ammunition crate, '+
      '60% original pickup. Armor is capped at 100, absorbs actual affect damage before health and is refilled '+
      'without healing. Original health regeneration and hit reactions are unchanged. Owned active weapons '+
      '(including empty ones) refill to their personal upgraded capacities; locked weapons and the held slot '+
      'are unchanged. New crates retain original geometry/shading/expiry with blue armor or olive ammo finishes, '+
      'corner hardware and shield or cartridge badges baked once into cached bitmaps. An original '+
      'life-bar fill clone is tinted blue over the original health bar; partial armor exposes the remaining health fill. '+
      'Armor is an optional version2 player-save field and part of full rollback state; transient dropped crates '+
      'follow the original save exclusion. LAN enables this only after armor-ammo-v1 capability negotiation; '+
      'legacy peers and Death Match retain original rules. Rendering is RNG-neutral.',
  },
  {
    id: 'LAN_PERSONAL_GROWTH',
    file: 'local/Net/Growth.ts, GrowthHud.ts, NetSession.ts; local/Resume.ts',
    description: 'Capable LAN Coop peers negotiate personal-growth-v1: separate last-hit scores, permanent levels ' +
      '(zombie 1 XP, devil 5 XP, 5 XP per level, cap 125) and original weapon upgrades per player. Score uses ' +
      'pre-kill level. Current-wave retry restores its starting checkpoint, including personal growth; fresh ' +
      'selected waves use the existing difficulty/head-start curve. Optional snapshot/config fields preserve ' +
      'local version2 saves and the legacy cooperative rules when the capability is absent. Confirmed personal ' +
      'scores/levels/XP flank a centered wave HUD with confirmed remaining zombie/devil totals; a two-player pause upgrade summary uses original ' +
      'embedded fonts and display-only clips. Level feedback is bounded to 700 ms without timers.',
  },
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
      're-applied to the rebuilt world and the wave restarts fresh (mid-wave creatures/decals are not carried). v0.2.0: ' +
      'without a checkpoint (death before the first wave advanced - e.g. a START WAVE head start, or right after a ' +
      'CONTINUE) RETRY now falls back to the wave the current run actually started at (the chosen START WAVE, the ' +
      "snapshot's wave, or the difficulty base - the last is numerically identical to the original restart), reusing " +
      'the START_WAVE_SELECTOR head-start mechanism (score/weapons still reset, clamped to wave 100). Death Match ' +
      '(winner screen) and net games keep the original behaviour.',
  },
  {
    id: 'SAVE_QUIT_RESUME',
    file: 'scope.ts (CHud.Pause wrapper, CMain.State_RunWorld/State_SaveQuitMenu/State_Continue/State_Debrief wrappers, CScreen_Main.Init_Buttons wrapper), local/Resume.ts, local/UiStyle.ts',
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
      'keycode (re-read every poll, so user rebinding is respected). Left stick (v0.1.7: radial 40 %/30 % ' +
      'engage/release hysteresis, eight even 22.5-degree sectors regardless of deflection, 4-degree angular ' +
      'stickiness - see engine STICK_ENGAGE; v0.1.4 thresholded each axis independently, so the wedges changed ' +
      'shape with the deflection and releases flickered through diagonals) or ' +
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
      'v0.2.9: discovery beacons retain their socket identity across sends, reject stale room callbacks, enable ' +
      'directed UDP broadcasts after bind and contain discovery errors without terminating the TCP room. ' +
      'v0.2.8: rollback-v2 retains up to three scheduler slots actually dropped by a renderer gap only when ' +
      'received remote inputs prove a live, unpaused peer is behind; catch-up stays at two ticks per enterFrame. ' +
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
      'TCP with a 1 s heartbeat / 3.5 s dead-link watchdog in the Electron main process. v0.1.10: the zombie ' +
      'ambience scheduler follows the sim tick (CWorld.Draw gates ProcessAmbience on mAmbienceTick != mTick) - ' +
      'offline Draw is always paired 1:1 with a tick (zero audible change), but during a net stall / net pause the ' +
      'frozen world kept Drawing every flagDraw and the ambience ticker fired zombie moans over a world that did ' +
      'not move (and inflated the drawn-zombie accumulator for the first post-stall bucket); the gate keeps both ' +
      'peers\' ambience in lockstep with the simulation. v0.2.7: capable peers negotiate rollback-v2, local input ' +
      'runs on the next simulation tick with no remote-input delay, and a speed-scaled ~240ms prediction window ' +
      'is corrected from pre-input snapshots preserving property order and navigation. Simulation time is tick-based. ' +
      'Full confirmed gameplay digests and ordered confirmed sound/decal identities must agree. Local weapon audio ' +
      'plays speculatively once; permanent decals, checkpoints, unlocks and terminal routing wait for confirmation. ' +
      'Render-only interpolation/extrapolation and camera smoothing run at display refresh without changing the ' +
      'original simulation cadence. Optional authenticated redundant UDP inputs retain reliable TCP copies/control; ' +
      'short disconnects exchange input history without rebuilding the world, with checkpoint fallback for restarted ' +
      'peers. Pause coordinates a common confirmed boundary. Input starvation requests repair instead of claiming ' +
      'checksum desync; connection timers use monotonic time and stale socket callbacks cannot close a new peer. ' +
      'Legacy lockstep remains available for capability fallback and regression coverage.',
  },
  // ---------------------------------------------------------------------------------------------- v0.1.7 additions
  {
    id: 'GAME_CURSOR_HIDE',
    file: 'scope.ts (CMain.SetState wrapper, CHud.Pause wrapper)',
    description:
      'The original always shows the OS mouse arrow, mid-game included (Flash games had no reason to hide it; the ' +
      'game is keyboard-only). The remake hides it while the world runs (State_RunWorld, not paused - keyboard / ' +
      'gamepad only, so the arrow just sat uselessly over the action) and shows it again on the pause menu and every ' +
      'non-world screen (menus, loading, debrief). Implemented through the engine\'s own AS2 Mouse.hide()/show() ' +
      'plumbing, which the platform loop applies as cursor:none over the stage container each rendered frame; the ' +
      'right-click context menu element carries its own cursor:default, so it stays usable mid-game. v0.1.8: the ' +
      'GAMEPAD virtual cursor arrow now mirrors the same visibility (hidden while the world runs - before it slid ' +
      'over the gameplay with every stick move), and the Presenter re-applies the last cursor on window ' +
      'focus/blur/resize (Windows resets the native cursor on fullscreen toggles / focus loss).',
  },
  // ---------------------------------------------------------------------------------------------- v0.1.8 additions
  {
    id: 'EMBEDDED_FONT_CJK_FALLBACK',
    file: 'engine/swf/DisplayObject.ts ($env advance), engine/swf/render/renderer.ts (drawEditText, ftEditCodesCovered)',
    description:
      'The game\'s embedded SWF fonts are Latin-only, and the engine used to give codepoints missing from the font ' +
      'advance 0 and skip them in BOTH text draw paths - any non-Latin character rendered blank (and broke layout). ' +
      'Missing codes now measure and draw with the CSS device-font stack (the same path as non-embedded text), and ' +
      'a FlashType EDIT field containing any missing code drops entirely to the outline renderer (Latin-only fields ' +
      'keep the pixel-exact FlashType path). Needed so Chinese names work in the debrief name field ' +
      '(DEBRIEF_NAME_IME_INPUT) and the local highscore table.',
  },
  {
    id: 'DEBRIEF_NAME_IME_INPUT',
    file: 'game/local/DebriefName.ts (overlay), game/scope.ts (debrief ctor + DisableSubmitScore wraps), game/local/Gamepad.ts (A-press bridge), main.ts (initDebriefDom)',
    description:
      'The debrief name field is a canvas SWF input TextField whose engine path drops IME input entirely (the ' +
      'raw-keydown insert needs e.key.length===1 - zh-CN users with a Chinese IME could not type ANYTHING into it; ' +
      'typing also required click-to-focus, original-parity). A fully transparent DOM input now sits over the field ' +
      'as the typing / focus / IME conduit (the LAN IP box pattern: glued to the field rect via presenter.onResize, ' +
      'torn down on the screen\'s onUnload): the canvas keeps rendering text + blinking caret (engine.focus/caretIndex ' +
      'synced from the DOM selection), every input event syncs el.value -> mUsername.text (fires during composition ' +
      'too, so committed CJK appears live; renders through EMBEDDED_FONT_CJK_FALLBACK), and DisableSubmitScore ' +
      'disables both. The gamepad\'s A press focuses DOM text widgets natively (synthesized engine clicks cannot ' +
      'type into DOM inputs); SEND SCORE with the placeholder now focuses the name field (still no submit - the ' +
      'original behaviour - just no longer a fully silent dead end).',
  },
  // ---------------------------------------------------------------------------------------------- v0.1.9 additions
  {
    id: 'COOP_DEATH_WEAPON_CRATE',
    file: 'game/local/WeaponCrate.ts, game/scope.ts (CWorld.LogKill wrapper), game/local/Resume.ts (crate ObjectState)',
    description:
      'In the original, a respawned Coop player returns with the pistol and every previously unlocked weapon at 0 ' +
      'ammo (ResetWeapons), refilled only by random supply crates. The remake drops a crate AT THE DEATH SPOT ' +
      'holding every active non-pistol weapon with its LIVE remaining ammo (an all-empty backpack drops nothing). ' +
      'Any living player picks it up by walking over it - the respawned owner restores the pre-death inventory ' +
      'verbatim (including auto-switching off the pistol to the weapon the player died holding), a teammate takes ' +
      'the best of both (missing weapons granted with a full magazine, kept weapons max their ammo and capacity, so ' +
      'a pickup never weakens anyone). Look, walk-over, sound and removal are the original Object.Pickup ones ' +
      '(same red crate art - deliberately indistinguishable in the chaos); the crate never expires and survives ' +
      'save/resume and LAN checkpoints/reconnects (serialized like a placed object; RESUME_VERSION bump). Coop only: ' +
      'Single death ends the run (WAVE_CHECKPOINT_RETRY already restores inventory) and Death Match keeps its ' +
      'original random-pickup drop. Spawned inside the lockstep simulation on both peers - deterministic by ' +
      'construction.',
  },
  {
    id: 'START_WAVE_SELECTOR',
    file: 'game/local/StartWave.ts + StartWaveUi.ts + WaveUnlock.ts, game/scope.ts (CUpgrades.SetDifficulty / __set__mLevel wrappers, CScreen_SelectWorld ctor/LoadLevel wrappers), local/Net/{Setup,protocol,bridge,NetSession}.ts (wave + maxWave on the setup/start messages)',
    description:
      'The original always starts a run at the difficulty base wave (1/10/20/35 by difficulty). The remake adds a ' +
      'START WAVE cycler to the Single/Coop level selection (and the Coop LAN setup screen, host-authored and ' +
      'mirrored to the client). v0.2.4: the CHOICE is still not persisted (resets to 1 on every screen entry, ' +
      '"did not touch it = start from the beginning", v0.1.9 user decision) but its RANGE is capped at the ' +
      'historical highest wave ever entered, which IS persisted (local/WaveUnlock.ts, save member mMaxWaveReached, ' +
      'written only when it grows): recorded on every wave entered mid-run AND on starting at a wave - on both LAN ' +
      'peers, each writing its own save - while the LAN setup cycler is capped by the HOST\'s best (carried as ' +
      'SetupSelection.maxWave on the existing setup mirror). A fresh save is pinned at wave 1 (the campaign is ' +
      'fought up from the start); a grey BEST n copy beside each cycler shows the cap. A chosen wave N > 1 is ' +
      'applied at world build through the ORIGINAL head-start mechanism, right after CUpgrades.SetDifficulty: one ' +
      'silent __set__mLevel(N), then the multiplier stepped one index at a time up to the anchor-interpolated ' +
      'value of the difficulty pairs (wave->multiplier 1/1, 10/10, 20/30, 35/50, linear between them, last-segment ' +
      'slope beyond 35, clamped to the table maximum 125) - so the player begins with the weapons/upgrades a run ' +
      'that reached wave N would hold, full magazines. The multiplier only ever rises (a wave below the difficulty ' +
      'jump keeps the difficulty tiers); Death Match (no waves) is immune; wave 1 is bit-identical to the original. ' +
      'Applied before tick 0 on both lockstep peers (start message carries the wave) - deterministic. Highscore ' +
      'eligibility unchanged (still per room x mode; a head start was always possible via difficulty).',
  },
  {
    id: 'DYNAMIC_VIEWPORT',
    file: 'engine/platform/Presenter.ts (computeFill), engine/platform/index.ts (stage adoption), engine/swf/{Player.setStageSize,stageLayout.ts}, game/local/Viewport.ts (installed last in scope.ts, after installNetScope), electron/main.ts (no 4:3 lock), game/local/{Gamepad,Net/Lobby}.ts (stage-space cursor, content-space DOM glue), tests/e2e (viewport group)',
    description:
      'The original is a fixed 640x480 Flash stage shown letterboxed at 4:3. The remake fills ANY window shape: ' +
      'the canvas covers the window, the logical stage grows to cw/s x ch/s (s = min(cw/640, ch/480), so the stage ' +
      'is never smaller than the authored 640x480 and the limiting dimension is pixel-exact), the root stage mask ' +
      'stretches and 640x480 content (every menu) centres with pure-black side bands, while the WORLD adopts the ' +
      'live stage as its view (CWorld.mScreenSize override, bmDraw/mSplitScreen sized accordingly) and counter-' +
      'offsets the centring so the game view fills the window - more map is simply VISIBLE, never scaled differently. ' +
      'When a view dimension exceeds the map minus its two 32px insets (5 of the 18 rooms are smaller than a ' +
      'fullscreen view), the original CMath.Range camera clamp inverts; that dimension is centred on the map instead ' +
      'and the void beyond shows the stage black (non-DM bmDraw is cleared each frame in that case; DeathMatch ' +
      'already clears transparent and its split geometry self-adapts: two 480x480 views at stageW/2/480 scale). ' +
      'Pausing keeps the wide view: the pause art is shifted to the centre and wrapper-drawn bands in the art\'s own ' +
      'shape-21 colours (#993300@80% over y<65.75, black@85% below) dim the rest; screen transitions snapshot the ' +
      'full stage. Everything is render-state only (mScreenSize/camera/bmDraw are not checksummed; the ' +
      'Process_Tracking wrapper installs OUTERMOST, after the net camera-bias wrapper, and only fixes inverted ' +
      'dimensions) - LAN peers with different window sizes stay in lockstep, each seeing their own view. At a 4:3 ' +
      'window (and headless tests, which have no presenter) every write is an identity no-op: rendering is ' +
      'bit-identical to v0.2.1. The Electron window no longer locks its content to 4:3 (min 640x480 stays).',
  },
  {
    id: 'COOP_DEATH_WEAPON_CRATE_SOLID_RELOCATE',
    file: 'local/WeaponCrate.ts (crateDropPosition), local/scope.ts (LogKill wrapper)',
    description:
      'v0.2.3 amendment to COOP_DEATH_WEAPON_CRATE (v0.1.9): the wrapper used to mirror CWorld._CreatePickup\'s ' +
      'StaticImpassable guard, silently dropping NOTHING when a player died on a solid/border cell (explosion ' +
      'knock-back into a wall - the "sometimes no red box drops" report). Now crateDropPosition spirals out from ' +
      'the death cell (Chebyshev rings, row-major, max 6 cells, no RNG) and the crate spawns at the first valid ' +
      'cell instead. Deterministic, identical on both lockstep peers. The original zombie/devil _CreatePickup ' +
      'drops keep their 1:1 suppression.',
  },
  {
    id: 'SPAWN_SOLID_FILTER',
    file: 'World/CWorld.ts (Spawn_ValidateAll wrapper in local/scope.ts; mSpawnPoint_Player list)',
    description:
      'Original data defect, kept 1:1 until v0.2.3: some Player2 spawn markers lie inside Solid geometry (room 11 ' +
      'PATCHY, cell 16,9 inside the Slab_Large collision area - see tests/sim/soakSuite.ts KNOWN_SPAWN_SOLID), and ' +
      'the original player spawn scan (Spawn_ValidPosition_Close/_Far) never tests Solid, so the seed-dependent P2 ' +
      'pick can spawn/respawn the player inside a slab where CMap_Collide.PlayerCollide keeps them stuck forever. ' +
      'The scope wrapper prunes Solid-cell entries from mSpawnPoint_Player inside Spawn_ValidateAll (after all init ' +
      'markers placed, before the first spawn). Deterministic (no RNG), identical on both LAN lockstep peers; ' +
      'rooms without a bad marker are bit-identical to the original. Gated by tests/sim/spawnAudit.test.ts ' +
      '(18 rooms x Coop/DM x multiple seeds).',
  },
  {
    id: 'USER_DATA_DIR',
    file: 'electron/main.ts (userData resolution + one-time migration), engine/flash/SharedObject.ts + engine/platform/SaveStore.ts (docs), tests/unit/platform/electron-smoke.run.ts',
    description:
      'v0.2.4 (user request): ALL user game data - the SharedObject save BXHD_2PLAY_6 plus the remake settings, ' +
      'both localStorage of the app:// origin, i.e. userData/Local Storage - lives in ONE place, ' +
      '<user home>/.boxhead, whatever build was launched: the portable exe included (v0.1.x had redirected it next ' +
      'to the exe; unpackaged/dev runs used %APPDATA%/Boxhead 2Play Rooms). The first run without an existing ' +
      '.boxhead/Local Storage migrates it from the old portable dir first, else the old %APPDATA% dir (Local ' +
      'Storage only - caches/GPU/logs re-create themselves). BOXHEAD_USER_DATA (QA/playtests, the BOXHEAD_DIST_DIR ' +
      'family) points userData at an exact directory instead: isolated saves per test run, NO migration. One ' +
      'folder to manage and back up.',
  },
  {
    id:'PVE_BALANCE',
    file:'local/Balance.ts, BalanceRules.ts; local/Net/Growth.ts, GrowthHud.ts, NetSession.ts, bridge.ts, protocol.ts; electron/lan.ts',
    description:'PvE difficulty profiles tune wave-table spawn intervals, active caps and speed ceilings while '+
      'retaining original per-wave kill budgets, enemy health/damage, attack patterns, weapon upgrade thresholds '+
      'and health regeneration. Devil active caps cannot exceed their remaining wave budget. Local Single/Coop '+
      'retain original kill-multiplier growth. Capable LAN Coop peers additionally use 5 XP per level plus 5 more '+
      'per ten-level block, with the optional player curve marker saved/restored in existing v2 growth data. '+
      'Fresh wave starts use the same previous-wave, equal-kill-share model for their baseline level and loadout, '+
      'retaining the difficulty head-start floor. Scores/XP start at zero; retry preserves checkpoints. '+
      'The pve-balance-v1 capability requires personal-growth-v1 and armor-ammo-v1. Legacy peers and Death Match '+
      'retain original wave rules. A main-owned weak test fixture keeps exact original port-contract assertions '+
      'runnable alongside the new actual-spawn and balance tests; it has no player-facing switch.',
  },
];
