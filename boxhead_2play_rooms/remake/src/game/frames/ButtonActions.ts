// Port of the DefineButton2 condition actions (`on (release) {...}` compiled into button characters; every one of
// them is a single OverDownToOverUp = release action). Source: generated/disasm/button_<id>_1.txt.
// A button action runs in the scope of the TIMELINE that contains the button instance (button._parent), so `nState`
// is that clip's member and `_parent` is its parent.
//   5     (root frame 1, "get Flash Player")   getURL adobe                          -> no-op (getURL)
//   159   Screen_Init "continue"               nState = "State_Main"
//   203   Screen_Main YouTube trailer           getURL + Click2                       (hidden by scope.ts)
//   227   _IconMoreGames (CMG monkey)           getURL + Click2                       (hidden by scope.ts)
//   230   _STC "A SEAN COOPER GAME"             getURL + Click2                       (made non-clickable by scope.ts)
//   236 / 239 / 252   Boxhead series promos     getURL + Click2                       (hidden by scope.ts)
//   382 / 384 / 395 / 398   submit dialog       _parent.Action_Retry / _Continue / _Abort / _Continue
//   405   submit dialog "view highscores"       getURL2 CMG list                       -> no-op
//   418   LevelIcons mcExclusive                getURL CMG                             (hidden by scope.ts)
// The sprite-246 "More Rooms" promo uses CLIP actions (PlaceObject on(release)), which the engine does not run; it is
// hidden by scope.ts as well.
import { getURL } from '../../engine/runtime.ts';
import { setButtonActionHandler } from '../../engine/swf/Player.ts';
import { CSound, External } from '../packages.ts';

type ButtonAction = (timeline: any) => void;

export const BUTTON_ACTIONS: Readonly<Record<number, ButtonAction>> = {
  5: () => {
    getURL('http://www.adobe.com/shockwave/download/index.cgi?P1_Prod_Version=ShockwaveFlash', '_blank');
  },
  159: (tl) => {
    tl.nState = 'State_Main';
  },
  203: () => {
    getURL('http://www.youtube.com/watch?v=esfpPEiG44A', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  227: () => {
    getURL('http://www.crazymonkeygames.com', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  230: () => {
    getURL('http://www.games.seantcooper.com', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  236: () => {
    getURL('http://www.crazymonkeygames.com/Boxhead.html', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  239: () => {
    getURL('http://www.crazymonkeygames.com/Boxhead-The-Rooms.html', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  252: () => {
    getURL('http://www.crazymonkeygames.com/Boxhead-Series.php', '_blank');
    CSound.mSamples.Click2.PlaySound();
  },
  382: (tl) => {
    tl._parent?.Action_Retry?.();
  },
  384: (tl) => {
    tl._parent?.Action_Continue?.();
  },
  395: (tl) => {
    tl._parent?.Action_Abort?.();
  },
  398: (tl) => {
    tl._parent?.Action_Continue?.();
  },
  405: () => {
    getURL('http://scores.crazymonkeygames.com/hs/listscores.php?id=' + External.CHighscore_Submit.mGameID, '_BLANK');
  },
  418: () => {
    getURL('http://www.crazymonkeygames.com/Boxhead-2Play-Rooms.html', '_blank');
  },
};

/** Install the handler the engine calls for DefineButton2 condition actions. */
export function registerButtonActions(): void {
  setButtonActionHandler((button, charId, _actionIndex, cond) => {
    if (!(cond & 8)) return; // all actions of this movie are on(release)
    const fn = BUTTON_ACTIONS[charId];
    if (fn) fn((button as any)._parent);
  });
}
