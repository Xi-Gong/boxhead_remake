// Remake SCOPE (user decisions; CONVENTIONS rule 10): what the remake removes or replaces from the original, applied
// at boot WITHOUT editing the 1:1 ports (instance hook before ctor, frame-script / prototype wrappers). Each entry
// names the original character / instance and why; the matching deviation ids are in src/game/deviations.ts.
//
// How the characters were identified: generated/reports/f3/tree.cjs (frame-1 display trees of library.json),
// generated/disasm/button_<id>_1.txt + clip_sprite<id>_f1_d<depth>_1.txt (their getURL targets) and the gallery
// renders generated/reports/gallery/Screen_Main.png, Screen_SelectWorld.png, Screen_Debrief.png, LevelIcons_Single_f7.png.
import { Button, MovieClip, _global } from '../engine/runtime.ts';
import { getFrameScript, registerFrameScript, setInstanceHook } from '../engine/swf/Player.ts';
import { CMain, CSaveData, CSound, External, Screen, World } from './packages.ts';
import { hasTable, roomIndexOfLibLink, showHighscoreTable, submitLocalScore } from './local/Highscores.ts';
import { registerInstructionsPage } from './local/InstructionsPage.ts';
import { SCREEN_INSTRUCTIONS_LINKAGE } from './local/localSymbols.ts';

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
        }
      };
    }
    if (this._ViewHighscores) {
      this._ViewHighscores.onRelease = function (this: any): void {
        if (hasTable(mode) && room >= 0) {
          CSound.mSamples.Click2.PlaySound();
          showHighscoreTable(this.pClass, mode, room);
        }
      };
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
}
