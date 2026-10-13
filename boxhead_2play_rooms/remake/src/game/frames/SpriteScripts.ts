// Port of the DoAction frame scripts inside sprites (generated/disasm/sprite_<id>_frame_<n>.txt; also in the FLA).
//   14:1   loading-screen clip helpers (PlayIt / GetFrameIndex, never called), stop()
//   56:1, 98:1   the "_Size" marker boxes hide themselves
//   186:1 / 186:100 / 186:116   Logo_CrazyMonkeys (24 fps, link)       194:1   Logo_SeanCooper (30 fps, link)
//   221:1, 223:1   empty                  274:1, 377:1   modal click blockers (window mcLock / message backgrounds)
//   386:1, 396:1, 400:1, 407:1   Open() of the highscore-submission messages (386/407 reference CWOne: leftovers)
//   501:1   level selection: mcLevelIcons.stop()      521:1   character selection: mcCharacter.stop()
//   755:1   TMP2639qh3hat: the 4.6 MB XSI character data script -> installs _global.mXSI_Data from xsi.json
// In a frame script `this` is the clip whose timeline runs it; unqualified names are its members.
import type { XsiJson } from '../../shared/assetSchema.ts';
import { MovieClip, _global, getTimer, getURL, int, registerFrameScript } from '../../engine/runtime.ts';
import { External } from '../packages.ts';
import { installXsiData } from '../DrawPrimitive/XSI/xsiData.ts';

type Timeline = MovieClip & Record<string, any>;

let xsiSource: XsiJson | undefined;
/** main.ts hands the fetched public/assets/xsi.json over before the Player starts (sprite 755 frame 1 installs it). */
export function setXsiSource(json: XsiJson | undefined): void { xsiSource = json; }

export function sprite_14_frame_1(this: Timeline): void {
  const tl = this;
  this.PlayIt = function (): void {
    delete tl.mTimeSlice;
    tl.onEnterFrame = function (): void {
      // bytecode compares (==) the undefined timeline variable tFrameIndex: neither branch is ever taken.
      if (tl.tFrameIndex == tl.GetFrameIndex(tl._totalframes, 30)) {
        tl.gotoAndStop(tl.tFrameIndex);
      }
      if (tl.tFrameIndex == tl._totalframes) {
        tl.play();
        delete tl.onEnterFrame;
      }
    };
  };
  this.GetFrameIndex = function (tTotalFrames: any, tFrameRate: any): number {
    tl.mTimeSlice = tl.mTimeSlice != undefined ? tl.mTimeSlice : getTimer(); // [BC] generated/disasm/sprite_14_frame_1.txt @74449
    let _loc1_ = int((getTimer() - tl.mTimeSlice) / (1000 / tFrameRate)) + 1; // [BC] generated/disasm/sprite_14_frame_1.txt @74480
    if (_loc1_ > tTotalFrames) {
      _loc1_ = tTotalFrames;
    }
    return _loc1_;
  };
  this.stop();
}

export function sprite_56_frame_1(this: Timeline): void {
  this._visible = false;
}

export function sprite_98_frame_1(this: Timeline): void {
  this._visible = false;
}

export function sprite_186_frame_1(this: Timeline): void {
  this.mFrameRate = 24;
  this.stop();
  this.onRelease = function (): void {
    External.CTracker.Click_CrazyMonkeyGames();
    getURL('http://www.crazymonkeygames.com', '_blank');
  };
}

export function sprite_186_frame_100(this: Timeline): void {
}

export function sprite_186_frame_116(this: Timeline): void {
  this.mFinished = true;
  this.stop();
  this._parent?.play();
}

export function sprite_194_frame_1(this: Timeline): void {
  this.mFrameRate = 30;
  this.stop();
  this.onRelease = function (): void {
    External.CTracker.Click_SeanTCooper();
    getURL('http://www.games.seantcooper.com', '_blank');
  };
}

export function sprite_221_frame_1(this: Timeline): void {
}

export function sprite_223_frame_1(this: Timeline): void {
}

export function sprite_274_frame_1(this: Timeline): void {
  this.useHandCursor = false;
  this.onPress = function (): void {
  };
}

export function sprite_377_frame_1(this: Timeline): void {
  this.useHandCursor = false;
  this._alpha = 0;
  this.onPress = function (): void {
  };
}

/** Open() of sprites 386 / 407 (leftover from another game: CWOne is undefined -> both stores write false or nothing). */
function openBungeeThruster(tl: Timeline): void {
  const CWOne = _global.CWOne;
  if (tl._Bungee != undefined) tl._Bungee._visible = CWOne?.mSaveData?.mBungeeFirstTime == false;
  if (tl._Thruster != undefined) tl._Thruster._visible = CWOne?.mSaveData?.mThrusterFirstTime == false;
}

export function sprite_386_frame_1(this: Timeline): void {
  const tl = this;
  this.Open = function (): void {
    openBungeeThruster(tl);
  };
}

export function sprite_396_frame_1(this: Timeline): void {
  this.Open = function (): void {
  };
}

export function sprite_400_frame_1(this: Timeline): void {
  this.Open = function (): void {
  };
}

export function sprite_407_frame_1(this: Timeline): void {
  const tl = this;
  this.Open = function (): void {
    openBungeeThruster(tl);
  };
}

export function sprite_501_frame_1(this: Timeline): void {
  // Runs (queued) after CScreen_SelectWorld attached LevelIcons_Single as mcLevelIcons.
  this.mcLevelIcons?.stop();
}

export function sprite_521_frame_1(this: Timeline): void {
  this.mcCharacter?.stop();
}

/**
 * Sprite 755 (export TMP2639qh3hat) frame 1: the original evaluates a 4.6 MB literal script that ends with
 * `_global.mXSI_Data = {mItems: mItems}`. Lane B evaluated it offline into public/assets/xsi.json; lane F1's
 * installXsiData rebuilds the same AS2 objects (consumed and deleted by CMain.ProcessBGTasks).
 */
export function sprite_755_frame_1(this: Timeline): void {
  if (xsiSource) installXsiData(xsiSource);
}

/** Register every sprite frame script. Call before the first Player.enterFrame(). */
export function registerSpriteScripts(): void {
  registerFrameScript(14, 1, sprite_14_frame_1);
  registerFrameScript(56, 1, sprite_56_frame_1);
  registerFrameScript(98, 1, sprite_98_frame_1);
  registerFrameScript(186, 1, sprite_186_frame_1);
  registerFrameScript(186, 100, sprite_186_frame_100);
  registerFrameScript(186, 116, sprite_186_frame_116);
  registerFrameScript(194, 1, sprite_194_frame_1);
  registerFrameScript(221, 1, sprite_221_frame_1);
  registerFrameScript(223, 1, sprite_223_frame_1);
  registerFrameScript(274, 1, sprite_274_frame_1);
  registerFrameScript(377, 1, sprite_377_frame_1);
  registerFrameScript(386, 1, sprite_386_frame_1);
  registerFrameScript(396, 1, sprite_396_frame_1);
  registerFrameScript(400, 1, sprite_400_frame_1);
  registerFrameScript(407, 1, sprite_407_frame_1);
  registerFrameScript(501, 1, sprite_501_frame_1);
  registerFrameScript(521, 1, sprite_521_frame_1);
  registerFrameScript(755, 1, sprite_755_frame_1);
}
