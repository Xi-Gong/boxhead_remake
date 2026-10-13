// Port of the DoAction frame scripts of the ROOT timeline (frames 1, 10, 21, 40, 50, 60, 62).
// Source of truth: generated/disasm/root_frame_<n>.txt (the FLA export projects/boxhead4/boxhead2play.fla has the
// same code). Frame labels: FLASH8 1, START_LOAD 10, LOADING 20, AS2 30, DATA 40, LOADED 50; frame 62 places the
// "Main" clip (CMain) and stops.
//
// In a frame script, unqualified names are timeline variables of the clip running it: `gotoAndStop(..)` is
// `this.gotoAndStop(..)`, `var x` / `x = ..` are `this.x`, `_LoadingBar` is `this._LoadingBar`.
import {
  ContextMenu, ContextMenuItem, MovieClip, _global, _root, forIn, getTimer, getURL, int, registerFrameScript,
} from '../../engine/runtime.ts';

type Timeline = MovieClip & Record<string, any>;

/** Root frame 1 (FLASH8): product info, context menu, global flags, site lock, then go to START_LOAD. */
export function root_frame_1(this: Timeline): void {
  _global.mProduct = new Object();
  _global.mProduct.mName = 'Boxhead: 2Play Rooms';
  _global.mProduct.mVersionName = 'Final';
  _global.mProduct.mMajorVersion = 1;
  _global.mProduct.mCompileDate = '16/05/2007 22:37';
  _global.mProduct.mMinorVersion = '00110';
  _global.mProduct.mVersionID = _global.mProduct.mVersionName + '.' + _global.mProduct.mMajorVersion + '.' + _global.mProduct.mMinorVersion;
  _global.mProduct.mVersionString = _global.mProduct.mName + ': ' + _global.mProduct.mVersionID + ' (' + _global.mProduct.mCompileDate + ')';
  // System.security.allowDomain("www.boxhead.seantcooper.com") - Flash sandbox setting, no effect in the remake.
  this.nContextMenu = new ContextMenu(function (obj: any, menuObj: any): void {
    void obj; void menuObj;
  });
  this.nContextMenu.hideBuiltInItems();
  this.nContextMenu.customItems.push(new ContextMenuItem('© Sean Cooper 2007', function (obj: any, item: any): void {
    void obj; void item;
    getURL('http://www.games.seantcooper.com', '_blank');
  }));
  _root.menu = this.nContextMenu;
  _global.mURLWindow = '_blank';
  _global.mCrazyMonkeyGames = true;
  _global.mDebug = false;
  _global.mAllowLocalHost = false;
  _global.mInfinateLife = false;
  _global.mRecordMode = false;
  _global.mCheat_OneZombie = false;
  _global.mCheatsActive = false;
  if (this.tbVersion != undefined) this.tbVersion.text = _global.mProduct.mVersionString;
  // Stage.scaleMode = "noScale" - the platform Presenter always scales the 640x480 stage (letterboxed).
  _global.mHostedOnCMG = false;
  this.startData = new Date(2007, 3, 23, 12, 0, 0, 0);
  this.timeLimit = 15552000000;
  this._HostedOnCMG = false;
  this.nDate = new Date();
  if (this.nDate.getTime() - this.startData.getTime() > this.timeLimit) {
    // The 180-day site lock expired in October 2007: on any current date every room is unlocked (scope.ts keeps it).
    _global.mHostedOnCMG = true;
  } else {
    this.validURLs = ['http://www.crazymonkeygames.com', 'http://crazymonkeygames.com'];
    _global.mHostedOnCMG = false;
    for (const prop of forIn(this.validURLs)) {
      _global.mHostedOnCMG = this._url.substring(0, this.validURLs[prop].length).toUpperCase() != this.validURLs[prop].toUpperCase() ? _global.mHostedOnCMG : true;
    }
  }
  if (_global.mRecordMode) {
    _global.mHostedOnCMG = true;
  }
  this.gotoAndStop('START_LOAD');
  this.play();
}

/** Root frame 10 (START_LOAD): start the loading screen and the >= 0.5 s minimum timer. */
export function root_frame_10(this: Timeline): void {
  this.gotoAndStop('LOADING');
  this.play();
  this.mLoadingTimeStamp = getTimer(); // [BC] generated/disasm/root_frame_10.txt @71096
}

/**
 * Root frame 21 (loop of LOADING): progress = min(bytes loaded fraction, elapsed / 0.5 s). The remake has every asset
 * loaded before the Player starts (getBytesLoaded() == getBytesTotal()), so this shows the original 0.5 s minimum.
 */
export function root_frame_21(this: Timeline): void {
  this.f1 = this.getBytesLoaded() / this.getBytesTotal();
  this.f2 = (getTimer() - this.mLoadingTimeStamp) / 500; // [BC] generated/disasm/root_frame_21.txt @79743
  if (this.f2 > 1) {
    this.f2 = 1;
  }
  this.f = this.f1 >= this.f2 ? this.f2 : this.f1;
  this._LoadingBar?.gotoAndStop(int(this.f * 100) + 1);
  if (this.f == 1) {
    this.gotoAndStop('LOADED');
    this.play();
  } else {
    this.gotoAndStop('LOADING');
    this.play();
  }
}

/** Root frame 40 (DATA): empty script. */
export function root_frame_40(this: Timeline): void {
}

/** Root frame 50 (LOADED): fade the black _Cover in at 30 steps/s after a 2 s pause, then play on to frame 62. */
export function root_frame_50(this: Timeline): void {
  const tl = this;
  this.stop();
  this.mLoadingText = 'LOADED';
  if (this._Cover != undefined) this._Cover._alpha = 0;
  this.mTimeStamp = getTimer(); // [BC] generated/disasm/root_frame_50.txt @1829141
  this.mFrameRate = 30;
  this.mCounter = this.mFrameRate * 2;
  this.onEnterFrame = function (): void {
    while (getTimer() - tl.mTimeStamp > 1000 / tl.mFrameRate) { // [BC] generated/disasm/root_frame_50.txt @1829184
      tl.mCounter = tl.mCounter - 1;
      tl.mTimeStamp = tl.mTimeStamp + 1000 / tl.mFrameRate;
      if (tl.mCounter < 0) {
        tl._Cover._alpha = tl._Cover._alpha + 2;
        if (tl._Cover._alpha >= 100) {
          delete tl.onEnterFrame;
          tl.play();
          return;
        }
      }
    }
  };
  if (this._XSIDATA != undefined) this._XSIDATA._visible = false;
}

/** Root frame 60: empty script. */
export function root_frame_60(this: Timeline): void {
}

/** Root frame 62: stop on the frame holding the Main (CMain) clip. */
export function root_frame_62(this: Timeline): void {
  this.stop();
}

/** Register every root-timeline frame script (spriteId 0 = root). Call before the first Player.enterFrame(). */
export function registerMainTimeline(): void {
  registerFrameScript(0, 1, root_frame_1);
  registerFrameScript(0, 10, root_frame_10);
  registerFrameScript(0, 21, root_frame_21);
  registerFrameScript(0, 40, root_frame_40);
  registerFrameScript(0, 50, root_frame_50);
  registerFrameScript(0, 60, root_frame_60);
  registerFrameScript(0, 62, root_frame_62);
}
