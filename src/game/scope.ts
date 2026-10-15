// Remake SCOPE (user decisions; CONVENTIONS rule 10): what the remake removes or replaces from the original, applied
// at boot WITHOUT editing the 1:1 ports (instance hook before ctor, frame-script / prototype wrappers). Each entry
// names the original character / instance and why; the matching deviation ids are in src/game/deviations.ts.
//
// How the characters were identified: generated/reports/f3/tree.cjs (frame-1 display trees of library.json),
// generated/disasm/button_<id>_1.txt + clip_sprite<id>_f1_d<depth>_1.txt (their getURL targets) and the gallery
// renders generated/reports/gallery/Screen_Main.png, Screen_SelectWorld.png, Screen_Debrief.png, LevelIcons_Single_f7.png.
import { Mouse } from '../engine/flash/input.ts';
import { Button, MovieClip, _global } from '../engine/runtime.ts';
import { getFrameScript, registerFrameScript, setInstanceHook } from '../engine/swf/Player.ts';
import { CMain, CSaveData, CSound, External, Screen, World } from './packages.ts';
import { hasTable, roomIndexOfLibLink, showHighscoreTable, submitLocalScore } from './local/Highscores.ts';
import { registerInstructionsPage } from './local/InstructionsPage.ts';
import { SCREEN_INSTRUCTIONS_LINKAGE, SCREEN_LAN_LOBBY_LINKAGE, SCREEN_LAN_SETUP_LINKAGE, buildMenuButton } from './local/localSymbols.ts';
import { armFromCheckpoint, armFromStored, capture, clearAll, clearStored, consumePending, hasStored, isArmed, isSuppressing, recordCheckpoint, writeStored } from './local/Resume.ts';
import { netActive, netSession } from './local/Net/NetSession.ts';
import { installNetScope } from './local/Net/NetScope.ts';
import { lanBridge } from './local/Net/bridge.ts';
import { registerLobbyPage } from './local/Net/Lobby.ts';
import { registerSetupPage } from './local/Net/Setup.ts';
import { installNetOverlay } from './local/Net/overlay.ts';
import { debriefNameInput, installDebriefNameInput } from './local/DebriefName.ts';
import { CThing_Object_WeaponCrate, captureCratePayload } from './local/WeaponCrate.ts';
import { armStartWave, consumeArmedWaveOn, getRunStartWave, getSelectedStartWave, recordRunStartWave, resetSelectedStartWave } from './local/StartWave.ts';
import { buildStartWaveCycler } from './local/StartWaveUi.ts';
import { desktop } from '../engine/platform/desktop.ts';

/**
 * CrazyMonkeyGames sponsor / cross-promotion links, hidden on every screen they appear on (Screen_Main,
 * Screen_SelectWorld, Screen_Debrief, Screen_Debrief_Winner, LevelIcons_Single). Instances are made invisible and
 * disabled in the instance hook (before any ctor), so they neither render nor take mouse events.
 */
export const HIDDEN_CHARS: Readonly<Record<number, string>> = {
  203: 'Screen_Main d4: YouTube "VIEW THE TRAILER" button (button_203: getURL youtube.com + Click2)',
  227: '_IconMoreGames: CrazyMonkeyGames "More Games" monkey button (button_227: getURL crazymonkeygames.com)',
  236: 'Boxhead "A Halloween Special" cross-promo button (button_236: getURL crazymonkeygames.com/Boxhead.html)',
  239: 'Boxhead "The Rooms" cross-promo button (button_239: getURL .../Boxhead-The-Rooms.html)',
  246: 'Boxhead "More Rooms" cross-promo: a sprite with an on(release) CLIP action (clip_sprite253_f1_d70: getURL .../Boxhead-More-Rooms.html); clip actions are not run by the engine',
  252: 'Boxhead "Series" cross-promo button (button_252: getURL .../Boxhead-Series.php)',
  418: 'LevelIcons_Single.mcExclusive: "EXCLUSIVE CONTENT - Click to play on CrazyMonkeyGames.com" (button_418); also hidden by the original whenever _global.mHostedOnCMG is true',
};

/**
 * Kept visible (original content) but made non-clickable (their only action was an external link).
 * 230 = `_STC` "A SEAN COOPER GAME / www.games.seantcooper.com" (button_230: getURL games.seantcooper.com);
 * 5 = the loading screen's "get Flash Player" button (original content, only its dead link is disabled).
 */
export const NON_CLICKABLE_CHARS: Readonly<Record<number, string>> = {
  5: 'root frames 1-61 (loading screen): "THIS GAME IS DRIVEN BY MACROMEDIA FLASH 8! CLICK HERE TO DOWNLOAD" button (button_5: getURL adobe.com)',
  230: '_STC "A SEAN COOPER GAME" credit button (getURL games.seantcooper.com)',
};

/** Named instances removed before the parent's ctor runs (the parent then behaves as if they did not exist). */
export const REMOVED_INSTANCES: readonly { parentChar: number; name: string; reason: string }[] = [
  {
    parentChar: 195,
    name: '_Logo_CrazyMonkeys',
    reason: 'Screen_Intro: the CrazyMonkeyGames sponsor logo (sprite 186, 116 frames, on(release) getURL). Without it '
      + 'CScreen_Intro.mSequence only holds the Sean Cooper logo.',
  },
];

/** Sean Cooper intro logo (sprite 194): kept, but its frame-1 onRelease (getURL) is removed. */
export const NON_CLICKABLE_SPRITE_SCRIPTS: readonly { spriteId: number; frame: number; reason: string }[] = [
  { spriteId: 194, frame: 1, reason: 'Logo_SeanCooper: plays as in the original, the click-through link is removed' },
];

/** The instance hook (exported for tests). */
export function scopeInstanceHook(mc: any, charId: number): void {
  if (HIDDEN_CHARS[charId] !== undefined) {
    mc._visible = false;
    mc.enabled = false;
    return;
  }
  if (NON_CLICKABLE_CHARS[charId] !== undefined) {
    mc.enabled = false;
    mc.useHandCursor = false;
    return;
  }
  for (const r of REMOVED_INSTANCES) {
    if (r.parentChar !== charId) continue;
    const child = mc[r.name];
    if (child instanceof MovieClip || child instanceof Button) {
      child._visible = false;
      if (child instanceof MovieClip) child.stop();
      delete mc[r.name];
    }
  }
}

let applied = false;

/**
 * Apply every scope rule. Call once at boot AFTER src/game/allClasses.ts is imported, the classes are registered and
 * the frame scripts are registered, and BEFORE the first Player.enterFrame().
 */
export function applyScope(): void {
  if (applied) return;
  applied = true;
  setInstanceHook(scopeInstanceHook);

  // Sean Cooper logo: keep, but not clickable.
  for (const s of NON_CLICKABLE_SPRITE_SCRIPTS) {
    const orig = getFrameScript(s.spriteId, s.frame);
    registerFrameScript(s.spriteId, s.frame, function (this: any): void {
      orig?.call(this);
      delete this.onRelease;
    });
  }

  // _global.mHostedOnCMG stays true (every room unlocked). The original's 180-day site lock already expired in 2007,
  // so root frame 1 computes true on any current date; this pins it regardless of the system clock.
  const root1 = getFrameScript(0, 1);
  registerFrameScript(0, 1, function (this: any): void {
    root1?.call(this);
    _global.mHostedOnCMG = true;
  });

  // Main menu "INSTRUCTIONS" -> local instructions screen (CMain.State_Instructions existed, empty, in the original).
  registerInstructionsPage();
  const mainProto = Screen.CScreen_Main.prototype as any;
  const initButtons = mainProto.Init_Buttons;
  mainProto.Init_Buttons = function (this: any): void {
    initButtons.call(this);
    const mc = this.mcInstructions;
    if (mc) {
      mc.onRelease = function (this: any): void {
        CSound.mSamples.Click2.PlaySound(); // the original INSTRUCTIONS handler's sound
        this.pClass.nState = 'State_Instructions';
      };
    }
  };
  (CMain.prototype as any).State_Instructions = function (this: any): void {
    this.Process_Screen(SCREEN_INSTRUCTIONS_LINKAGE);
  };

  // Debrief: SEND SCORE / View Highscores -> local top-10 tables (CMG online submission and listing removed).
  const debriefProto = Screen.CScreen_Debrief.prototype as any;
  const debriefCtor = debriefProto.ctor;
  debriefProto.ctor = function (this: any): void {
    debriefCtor.call(this);
    const mode = World.CWorld.mGameMode;
    const room = roomIndexOfLibLink(this.mObject?.mWorldLibLink);
    // v0.1.8 (DEBRIEF_NAME_IME_INPUT): transparent DOM input over mUsername as the typing / focus / IME conduit
    // (the canvas field's raw-keydown path drops IME input - zh-CN users could not type their name at all).
    installDebriefNameInput(this);
    if (this._SendScore) {
      this._SendScore.onRelease = function (this: any): void {
        CSound.mSamples.Click.PlaySound();
        const screen = this.pClass;
        if (screen.mUsername.text != '<Enter name>') {
          CSaveData._this.__set__mUsername(screen.mUsername.text);
          External.CTracker.Click_SubmitHighscore();
          const hud = screen.mObject?.mHud;
          const score = Number(hud?.nTotalScore ?? parseInt(String(screen.mScore.text), 10));
          const rank = submitLocalScore(mode, room, screen.mUsername.text, score);
          if (rank >= 0) {
            screen.DisableSubmitScore();
            if (hasTable(mode)) showHighscoreTable(screen, mode, room, rank);
          }
        } else {
          // Original-parity: no submit with the placeholder. Micro-deviation: focus the name field so the player
          // sees WHERE the missing name goes (invisible in screenshots, saves a support question).
          debriefNameInput(screen)?.focus();
        }
      };
    }
    if (this._ViewHighscores) {
      this._ViewHighscores.onRelease = function (this: any): void {
        // [BC] generated/disasm/Screen.CScreen_Debrief.txt @621585: the original handler plays no sound (tracker +
        // getURL only); the level icon's View Highscores does play Click2 (CScreen_SelectWorld, kept as is).
        if (hasTable(mode) && room >= 0) showHighscoreTable(this.pClass, mode, room);
      };
    }
  };

  // DisableSubmitScore (ineligible run / after a successful submit) greys the canvas field: the DOM conduit must
  // grey with it, or typing would still edit the field underneath.
  const disableSubmit = debriefProto.DisableSubmitScore;
  debriefProto.DisableSubmitScore = function (this: any): void {
    disableSubmit.call(this);
    const input = debriefNameInput(this);
    if (input) {
      input.disabled = true;
      input.blur();
    }
  };

  // Level select: "View Highscores" of the level icons -> local table of that room (Single / Coop only; the original
  // hides the button in Death Match).
  const selectProto = Screen.CScreen_SelectWorld.prototype as any;
  const loadHighScore = selectProto.LoadHighScore;
  selectProto.LoadHighScore = function (this: any, tLevelIndex: any): any {
    const r = loadHighScore.call(this, tLevelIndex);
    if (hasTable(this.mMode)) showHighscoreTable(this, this.mMode, Number(tLevelIndex));
    return r;
  };

  // Wave checkpoint + death RETRY (deviation WAVE_CHECKPOINT_RETRY). The wave-advance condition of
  // CUpgrades.Process guarantees no zombie/devil is alive when __set__mLevel runs, so capturing right after it is a
  // clean wave-start state. Guards: mLoaded excludes the InitLists / SetDifficulty build-time calls; the resume
  // module's own fast-forward suppresses re-capture.
  const upgradesProto = World.CUpgrades.prototype as any;
  const setMLevel = upgradesProto.__set__mLevel;
  upgradesProto.__set__mLevel = function (this: any, a: any): any {
    const r = setMLevel.call(this, a);
    if (this.mWorld?.mLoaded === true && !isSuppressing()) {
      recordCheckpoint(this.mWorld);
      netSession()?.onWaveAdvanced(this.mWorld); // LAN coop checkpoint at the same clean wave-start moment
    }
    return r;
  };
  // Debrief RETRY arms the checkpoint; without one (START WAVE death before the first advance, CONTINUE death before
  // the first advance) v0.2.0 falls back to the wave the run actually started at instead of the original difficulty
  // base - same head-start mechanism as the START WAVE selector, so score/weapons still reset (fresh-run semantics).
  // Hidden in net games (an unsynchronized single-side restart is a desync by definition; the net lobby owns rematches).
  debriefProto.ctor = (function (previous: any) {
    return function (this: any): void {
      previous.call(this);
      if (this._Retry) {
        if (netActive()) {
          this._Retry._visible = false;
          this._Retry.enabled = false;
          return;
        }
        this._Retry.onPress = function (this: any): void {
          if (!armFromCheckpoint()) armStartWave(getRunStartWave());
          this.pClass.nState = 'State_LoadWorld';
          CSound.mSamples.Click.PlaySound();
        };
      }
    };
  })(debriefProto.ctor);
  // Consume an armed snapshot once the freshly built world finished its init (no-op without one), then record the
  // settled start wave (after the difficulty head start, the armed start wave and any pending snapshot) as the
  // Debrief RETRY fallback. Re-recorded at every world build, so it never goes stale between games.
  const worldProto = World.CWorld.prototype as any;
  const initFinished = worldProto.InitFinished;
  worldProto.InitFinished = function (this: any): void {
    initFinished.call(this);
    consumePending(this);
    recordRunStartWave(this.mUpgrades.mLevelIndex);
  };
  // A new run that was not armed by CONTINUE / checkpoint-RETRY drops every stored resume (one slot). A NET game
  // never touches the stored single-player run (its own checkpoint lives in the NetSession).
  const mainProtoResume = CMain.prototype as any;
  const stateLoadWorld = mainProtoResume.State_LoadWorld;
  mainProtoResume.State_LoadWorld = function (this: any): void {
    if (!isArmed() && !netActive()) clearAll();
    stateLoadWorld.call(this);
  };

  // ---- Coop death weapon crate (deviation COOP_DEATH_WEAPON_CRATE, v0.1.9) --------------------
  // Runs after the original LogKill bookkeeping, still INSIDE the simulation tick, so both lockstep peers spawn
  // the identical crate (no RNG, no wall clock anywhere in the thing). The StaticImpassable guard mirrors
  // CWorld._CreatePickup; the payload is captured here because State_Respawn's ResetWeapons empties the ammo.
  const logKillPrev = worldProto.LogKill;
  worldProto.LogKill = function (this: any, tThing: any): void {
    logKillPrev.call(this, tThing);
    if (World.CWorld.mGameMode !== 'Coop') return;
    if (tThing?._CLASSID_ !== 'CThing_Creature_Player') return;
    const payload = captureCratePayload(tThing);
    if (!payload) return;
    const p = tThing.mPosition;
    if (this.mMap.mCells[p.mY & 16777215][p.mX & 16777215].mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) return;
    this.mThing_Collection.AddThing(new CThing_Object_WeaponCrate(p.Clone(), payload));
  };

  // ---- start wave selection (deviation START_WAVE_SELECTOR, v0.1.9) ---------------------------
  // The armed wave is applied right after the original difficulty head start, still inside CWorld.InitCleanUp
  // (mLoaded false -> the __set__mLevel checkpoint hook above stays quiet, exactly like SetDifficulty's own calls).
  // Consumed once; nothing armed (or wave 1) leaves today's behaviour bit-identical.
  const setDifficultyPrev = upgradesProto.SetDifficulty;
  upgradesProto.SetDifficulty = function (this: any, tDifficulty: any): void {
    setDifficultyPrev.call(this, tDifficulty);
    consumeArmedWaveOn(this);
  };
  // The level selection screens: reset the cycler to wave 1 on every entry (NOT persisted - "didn't touch it =
  // start from the beginning"), draw it in the empty bottom-left promo band (Single / Coop only), and arm the
  // chosen wave right before the room is loaded.
  const selectCtorPrev = selectProto.ctor;
  selectProto.ctor = function (this: any): void {
    selectCtorPrev.call(this);
    resetSelectedStartWave();
    if (this.mMode !== 'DeathMatch') {
      buildStartWaveCycler(this, 100, 364);
    }
  };
  const loadLevelPrev = selectProto.LoadLevel;
  selectProto.LoadLevel = function (this: any, tLevelIndex: any): void {
    armStartWave(getSelectedStartWave());
    loadLevelPrev.call(this, tLevelIndex);
  };

  // ---- gameplay cursor (deviation GAME_CURSOR_HIDE, v0.1.7) ------------------------------------
  // The original always shows the OS arrow, mid-game included; here it disappears while the world runs (keyboard /
  // pad only) and returns for the pause menu and every non-world screen. Mouse.hide()/show() only flip the engine
  // flag; the platform loop applies it as cursor:none over the stage on the next rendered frame.
  const cursorHidden = (hidden: boolean): void => { if (hidden) Mouse.hide(); else Mouse.show(); };
  const mainProtoCursor = CMain.prototype as any;
  const setStatePrev = mainProtoCursor.SetState;
  mainProtoCursor.SetState = function (this: any, nState: any): void {
    if (this[nState] != undefined) cursorHidden(nState === 'State_RunWorld');
    setStatePrev.call(this, nState);
  };

  // ---- SAVE & QUIT / CONTINUE (deviation SAVE_QUIT_RESUME) -----------------------------------
  // Pause screen: a second button below QUIT stores the run snapshot and returns to the main menu (NOT through the
  // Debrief: the run is not over, and its score must not become submittable twice through a later CONTINUE).
  const hudProto = World.CHud.prototype as any;
  const hudPause = hudProto.Pause;
  hudProto.Pause = function (this: any, tState: any): void {
    hudPause.call(this, tState);
    cursorHidden(tState !== true); // the pause menu needs the arrow; resuming hides it again
    if (tState !== true || !this.mcScreenPause) return;
    if (netActive()) {
      // Net pause: QUIT concedes the run (Leave + forfeit end states on both peers); no SAVE & QUIT in a net game.
      const q = this.mcScreenPause._Quit;
      if (q) {
        q.onRelease = function (this: any): void {
          lanBridge().session?.forfeit();
        };
      }
      return;
    }
    const btn = buildMenuButton(this.mcScreenPause, '_SaveQuit', 320, 452, 220, 26, 'SAVE & QUIT', 15);
    btn.pWorld = this.mWorld;
    btn.onRelease = function (this: any): void {
      CSound.mSamples.Click.PlaySound();
      writeStored(capture(this.pWorld));
      this.pWorld.mCompleteState = 'savequit';
    };
  };
  // 'savequit' outcome: the same bookkeeping the real outcomes do, then the main menu (the world is deleted once the
  // screen transition finished, exactly like State_Debrief).
  const runWorldState = mainProtoResume.State_RunWorld;
  mainProtoResume.State_RunWorld = function (this: any, flagDraw?: any): void {
    if (this.mcWorld?.mCompleteState === 'savequit') {
      CMain.mFPS = 25;
      this.mcWorld.mPause = true;
      this.SetState('State_SaveQuitMenu');
      return;
    }
    // LAN v0.1.4: a forfeit after the 30 s reconnect TIMEOUT ends at the MAIN MENU on both peers (the leave
    // message carries via:'timeout' so both route here deterministically). A concede (pause-QUIT) keeps the
    // regular Debrief/Winner screens.
    const net = netSession();
    if (this.mcWorld?.mCompleteState && (net?.endReason === 'timeout' || net?.endReason === 'peer-timeout')) {
      CMain.mFPS = 25;
      this.mcWorld.mPause = true;
      this.SetState('State_NetEnd');
      return;
    }
    runWorldState.call(this, flagDraw);
  };
  mainProtoResume.State_NetEnd = function (this: any): void {
    // Same shape as State_SaveQuitMenu: the main-menu screen, the world deleted after the transition.
    this.Process_Screen('Screen_Main');
    this.DeleteWorld();
    if (!this.mcWorld) this.SetState('State_Main');
  };
  mainProtoResume.State_SaveQuitMenu = function (this: any): void {
    this.Process_Screen('Screen_Main');
    this.DeleteWorld();
    // Once the world is gone this IS the main menu (same screen, same state name as a normal boot).
    if (!this.mcWorld) this.SetState('State_Main');
  };
  // Main menu: CONTINUE appears only while a stored run exists, styled and wired like the original items (the
  // rollover of Register_Button works on the button's _Contents child).
  const mainMenuProto = Screen.CScreen_Main.prototype as any;
  const initButtonsPrev = mainMenuProto.Init_Buttons;
  mainMenuProto.Init_Buttons = function (this: any): void {
    initButtonsPrev.call(this);
    if (hasStored()) {
      const mc = buildMenuButton(this, 'mcContinue', 320, 359.1, 260, 30, 'CONTINUE', 17);
      this.Register_Button(mc, 'State_Continue');
    }
    if (desktop?.lan) {
      const mc = buildMenuButton(this, 'mcLanGame', 320, 392.4, 260, 30, 'LAN GAME', 17);
      this.Register_Button(mc, 'State_LanLobby');
    }
  };
  mainProtoResume.State_Continue = function (this: any): void {
    const snap = armFromStored();
    if (!snap) {
      this.SetState('State_Main');
      return;
    }
    this.mWorldLibLink = snap.roomLibLink;
    this.mReturn_SelectWorld = 'State_SelectWorld_' + snap.gameMode;
    this.SetState('State_LoadWorld');
  };
  // Run over (death / DM winner): drop the stored run. The in-memory checkpoint stays for the debrief RETRY.
  // NET runs never touch the stored single-player run.
  const stateDebrief = mainProtoResume.State_Debrief;
  mainProtoResume.State_Debrief = function (this: any): void {
    if (!netActive()) clearStored();
    stateDebrief.call(this);
  };
  const stateDebriefWinner = mainProtoResume.State_Debrief_Winner;
  mainProtoResume.State_Debrief_Winner = function (this: any): void {
    if (!netActive()) clearStored();
    stateDebriefWinner.call(this);
  };

  // ---- LAN multiplayer wrappers (deviation LAN_MULTIPLAYER, v0.1.3; setup screen v0.1.4) ------
  // Net games start through NetSession.startLocalGame (never the SelectWorld screens), so the wave-checkpoint /
  // save-quit / debrief wrappers above stay quiet via netActive() and the net State_RunWorld gate owns the tick.
  registerLobbyPage();
  registerSetupPage();
  installNetOverlay();
  const mainProtoLan = CMain.prototype as any;
  mainProtoLan.State_LanLobby = function (this: any): void {
    lanBridge().markBackInLobby();
    this.Process_Screen(SCREEN_LAN_LOBBY_LINKAGE);
  };
  // The net setup screen (host picks mode / both characters / level / options; the client mirrors it read-only).
  mainProtoLan.State_LanSetup = function (this: any): void {
    this.Process_Screen(SCREEN_LAN_SETUP_LINKAGE);
  };
  installNetScope();
}
