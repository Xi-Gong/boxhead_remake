// Port of projects/boxhead4/World/CHud.as
// Structure from generated/disasm/World.CHud.txt top-level script @527824..@534295 (initaction of sprite 853).
// In-game HUD drawn into the world bitmap: floating score "+n" objects and info messages are pre-rendered MovieClips
// (Hud.Score / Hud.Message, rendered once into BitmapData objects), the total score / multiplier panel (Hud.ScoreTotal)
// or the Death Match frag panel (Hud_PlayerFrags), per-player life/ammo clips (HUD.Player) and the pause screen
// (HUD.Paused, listing every multiplier upgrade).
import { _global, _root, flash, forIn, getTimer, proto, toAS2String } from '../../engine/runtime.ts';
import { CMain, Thing, World, registerGameClass } from '../packages.ts';

export class CHud {
  [key: string]: any;
  static mcMessage: any;
  static mcScore: any;
  static mcScoreTotal: any;
  static mBackQuality: any;
  static dPoint: any;
  static dMatrix: any;
  static dColorTransform: any;
  static rm: any;

  constructor(tWorld: any) {
    this.mWorld = tWorld;
    this.mScores = new Array();
    this.mMessages = new Array();
    this.mTotalScore = this.nTotalScore = 0;
    this.mPlayers = new Object();
    if (World.CHud.mcMessage == undefined) {
      World.CHud.mcMessage = _root.attachMovie('Hud.Message', '_HUD_02', _root.getNextHighestDepth(), { _visible: false });
      World.CHud.mcScore = _root.attachMovie('Hud.Score', '_HUD_03', _root.getNextHighestDepth(), { _visible: false });
    }
    if (World.CWorld.mGameMode != 'DeathMatch') {
      World.CHud.mcScoreTotal = this.mWorld.attachMovie('Hud.ScoreTotal', '_HUD_04', this.mWorld.getNextHighestDepth(), { _visible: false });
    } else {
      this.mcPlayerFrags = this.mWorld.attachMovie('Hud_PlayerFrags', '_HUD_05', this.mWorld.getNextHighestDepth(), { _visible: false });
    }
    this.mcPlayers = new Array();
    this.mPlayer1_Deaths = this.mPlayer2_Deaths = 0;
    // AS2: outside Death Match mcPlayerFrags is undefined -> the store is a silent no-op.
    if (this.mcPlayerFrags?.mcSwitchSides != undefined) {
      this.mcPlayerFrags.mcSwitchSides.onRelease = function (): void {
        CMain.mSaveData.__set__mViewSide_DeathMatch((CMain.mSaveData.__get__mViewSide_DeathMatch() + 1) % 2);
      };
    }
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
  }

  Pause(tState: any): void {
    if (tState) {
      this.mcScreenPause = this.mWorld.attachMovie('HUD.Paused', '_PauseScreen', this.mWorld.getNextHighestDepth());
      const _loc4_ = this.mWorld.mUpgrades.__get__mMultiplierList();
      const _loc10_ = Math.ceil(_loc4_.length / 3);
      let _loc2_ = 0; // [BC] generated/disasm/World.CHud.txt @528720
      let _loc6_ = 0; // [BC] generated/disasm/World.CHud.txt @528737
      let _loc7_ = 1; // [BC] generated/disasm/World.CHud.txt @528750
      while (_loc2_ < _loc4_.length) { // [BC] generated/disasm/World.CHud.txt @528755
        const _loc5_ = this.mcScreenPause['_Upgrade_C' + _loc7_];
        // [ORACLE P1] literal keys reversed: AS2 {_x, _y} enumerates in source order (the initObject is copied by for..in)
        const _loc3_ = _loc5_.duplicateMovieClip('upgrade_' + _loc2_, this.mcScreenPause.getNextHighestDepth(), { _y: _loc5_._y + _loc6_ * 17, _x: _loc5_._x });
        _loc3_.txtUpgrade.text = _loc4_[_loc2_].mName;
        _loc3_.txtMultiple.text = _loc4_[_loc2_].mIndex;
        _loc3_.txtUpgrade.textColor = _loc4_[_loc2_].mName.substr(0, 3) != 'New' ? 16777215 : 65280;
        _loc3_._alpha = _loc4_[_loc2_].mActive != true ? 25 : 100;
        _loc6_ = _loc6_ + 1; // [BC] generated/disasm/World.CHud.txt @529073
        if (_loc6_ > _loc10_) {
          _loc7_ = _loc7_ + 1;
          _loc6_ = 0;
        }
        _loc2_ = _loc2_ + 1; // [BC] generated/disasm/World.CHud.txt @529123
      }
      this.mcScreenPause._Upgrade_C1._visible = false;
      this.mcScreenPause._Upgrade_C2._visible = false;
      this.mcScreenPause._Upgrade_C3._visible = false;
      this.mcScreenPause.cacheAsBitmap = true;
      this.mcScreenPause._Quit.pClass = this.mWorld;
      this.mcScreenPause._Quit.onRelease = function (this: any): void {
        this.pClass.mCompleteState = 'quit';
      };
    } else {
      this.mcScreenPause?.removeMovieClip();
      delete this.mcScreenPause;
    }
  }

  Process(): void {
  }

  Draw(t_bmDraw: any): void {
    this.bmDraw = t_bmDraw;
    if (_global.mRecordMode) {
      if (this.mcPlayers[0] != undefined) this.mcPlayers[0]._visible = false;
      if (this.mcPlayers[1] != undefined) this.mcPlayers[1]._visible = false;
      return;
    }
    for (const _loc7_ of forIn(this.mScores)) {
      const _loc3_ = this.mScores[_loc7_];
      _loc3_.mPosition = _loc3_.mPosition.add(_loc3_.mDelta);
      _loc3_.mDelta.x = _loc3_.mDelta.x * 1.05;
      _loc3_.mDelta.y = _loc3_.mDelta.y * 1.05;
      this.DrawBMObject(_loc3_.bmObject, _loc3_.mPosition, _loc3_.mPosition.y < 140 ? _loc3_.mPosition.y - 40 : 100);
      if (_loc3_.mPosition.y <= 0) {
        this.mScores.splice(Number(_loc7_), 1);
      }
    }
    for (const _loc7_ of forIn(this.mMessages)) {
      const _loc4_ = this.mMessages[_loc7_];
      const _loc5_ = getTimer() - _loc4_.mTimeStamp; // [BC] generated/disasm/World.CHud.txt @529840 (ffdec literal)
      if (_loc5_ >= 3000) {
        this.mMessages.splice(Number(_loc7_), 1);
        return;
      }
      if (_loc4_.mMoveCount > 0) {
        const _loc6_ = _loc4_.mMoveCount * 0.25;
        _loc4_.mPosition.y = _loc4_.mPosition.y - _loc6_;
        _loc4_.mMoveCount = _loc4_.mMoveCount - _loc6_;
      }
      this.DrawBMObject(_loc4_.bmObject, _loc4_.mPosition, _loc5_ < 2500 ? 100 : 100 - (_loc5_ - 2500) / 5);
    }
    // AS2: in Death Match mcScoreTotal can be undefined (never created) / outside it mcPlayerFrags is undefined ->
    // the stores below on undefined objects are silent no-ops.
    const _st = World.CHud.mcScoreTotal;
    if (_st != undefined) {
      _st._visible = true;
      this.mTotalScore = this.nTotalScore;
      if (_st.tfScore != undefined) _st.tfScore.text = this.PadScore(toAS2String(this.mTotalScore));
      _st.mcTimer?.gotoAndStop(1 + Math.floor(this.mWorld.mUpgrades.__get__mMultiplierTickRatio() * _st.mcTimer._totalframes));
      if (_st.tfMultiple != undefined) _st.tfMultiple.text = 'x' + toAS2String(this.mWorld.mUpgrades.__get__mMultiplier());
      _st._x = this.mWorld.mScreenSize.x / 2;
      _st._y = 0;
    } else {
      this.mTotalScore = this.nTotalScore;
    }
    const _pf = this.mcPlayerFrags;
    if (_pf != undefined) {
      _pf._visible = true;
      _pf._x = 0;
      _pf._y = 0;
      if (CMain.mSaveData.__get__mViewSide_DeathMatch() == 0) {
        _pf.mcPlayer1.tfPlayerName.text = 'Player 1';
        _pf.mcPlayer2.tfPlayerName.text = 'Player 2';
        _pf.mcPlayer1.tfFrags.text = this.PadFrags(toAS2String(this.mPlayer1_Deaths));
        _pf.mcPlayer2.tfFrags.text = this.PadFrags(toAS2String(this.mPlayer2_Deaths));
        _pf.mcPlayer1.tfFrags.text = this.PadFrags(toAS2String(this.mPlayer1_Deaths));
      } else {
        _pf.mcPlayer1.tfPlayerName.text = 'Player 2';
        _pf.mcPlayer2.tfPlayerName.text = 'Player 1';
        _pf.mcPlayer2.tfFrags.text = this.PadFrags(toAS2String(this.mPlayer1_Deaths));
        _pf.mcPlayer1.tfFrags.text = this.PadFrags(toAS2String(this.mPlayer2_Deaths));
      }
    }
  }

  PadScore(s: any): any {
    while (s.length < 12) {
      s = '0' + s;
    }
    return s;
  }

  PadFrags(s: any): any {
    while (s.length < 2) {
      s = '0' + s;
    }
    return s;
  }

  __get__mScore(): any {
    return World.CHud.mcScoreTotal?.tfScore?.text;
  }

  AddPlayer(tPlayer: any): void {
    const _loc2_ = tPlayer.mPlayerIndex;
    this.mcPlayers[_loc2_] = this.mWorld.attachMovie('HUD.Player', '_HUD_PLAYER' + _loc2_, this.mWorld.getNextHighestDepth(), { _visible: false });
    const _loc3_ = this.mcPlayers[_loc2_];
    const _loc4_ = _loc3_.mcAmmo.tfAmount.getTextFormat();
    _loc4_.letterSpacing = -2;
    _loc3_.mcAmmo.tfAmount.setTextFormat(_loc4_);
  }

  DeletePlayer(tPlayer: any): void {
    const _loc2_ = tPlayer.mPlayerIndex;
    this.mcPlayers[_loc2_]?.removeMovieClip();
  }

  UpdatePlayer(tPlayer: any, pDraw: any, tScalar?: any): void {
    void tScalar;
    const _loc2_ = this.mcPlayers[tPlayer?.mPlayerIndex];
    if (_loc2_ == undefined) return; // AS2: every store below would target undefined (silent no-ops)
    const _loc4_ = tPlayer.mWeapon_Current?.mAmmo;
    const _loc6_ = tPlayer.mWeapon_Current?.mShortName;
    const _loc5_ = tPlayer.mLife / tPlayer.mMaxLife;
    _loc2_.mcAmmo.gotoAndStop(1);
    _loc2_.mcAmmo.tfAmount.text = toAS2String(_loc6_) + (_loc4_ != Thing.Weapon.CThing_Weapon.mInfinateAmmo ? ':' + toAS2String(_loc4_) : '');
    const _loc7_ = Math.min(Math.max(1, _loc2_.mcLife._totalframes * _loc5_ + 1), _loc2_.mcLife._totalframes);
    _loc2_.mcLife.gotoAndStop(Math.floor(_loc7_));
    _loc2_._visible = tPlayer.mVisible && !(tPlayer.mFlags & Thing.CThing.mFlag_DEAD);
    _loc2_._x = pDraw.x;
    _loc2_._y = pDraw.y;
  }

  AddMessage_Info(tText: any, ..._rest: any[]): void {
    this.AddMessage(tText, 16777215);
  }

  AddMessage_Level(tText: any): void {
    this.AddMessage(tText, 16777215);
  }

  AddMessage_Upgrade(tText: any): void {
    this.AddMessage(tText, 65280);
  }

  AddMessage_Critical(tText: any): void {
    this.AddMessage(tText, 16711680);
  }

  AddMessage(tText: any, tColor: any): void {
    if (this.mSilentMessages) {
      return;
    }
    World.CHud.mcMessage.tfMessage.text = tText;
    World.CHud.mcMessage.tfMessage.textColor = tColor;
    const _loc3_ = new flash.geom.Point(this.mWorld.mScreenSize.x / 2, this.mWorld.mScreenSize.y);
    for (const _loc2_ of forIn(this.mMessages)) {
      this.mMessages[_loc2_].mMoveCount = this.mMessages[_loc2_].mMoveCount + 19;
    }
    this.mMessages.push({ mPosition: _loc3_, mMoveCount: 100, mTimeStamp: getTimer(), bmObject: World.CHud.RenderMovieClipAsBitmapObject(World.CHud.mcMessage) }); // [BC] generated/disasm/World.CHud.txt @532346 (ffdec literal)
  }

  AddScore(p: any, tScore: any): void {
    this.nTotalScore = this.nTotalScore + tScore;
    World.CHud.mcScore.tfAmount.text = '+' + toAS2String(tScore);
    const _loc3_ = new flash.geom.Point(World.CHud.mcScoreTotal?._x - p.x, World.CHud.mcScoreTotal?._y - p.y);
    _loc3_.normalize(5);
    if (_root._quality != 'LOW') {
      this.mScores.push({ mPosition: p, mDelta: _loc3_, bmObject: World.CHud.RenderMovieClipAsBitmapObject(World.CHud.mcScore) });
    }
  }

  DrawBMObject(bmObject: any, p: any, tAlpha: any): boolean {
    const _loc3_ = bmObject.mDisp;
    if (tAlpha >= 100 || _root._quality == 'LOW') {
      const _loc5_ = bmObject.sBMD;
      World.CHud.dPoint.x = p.x + _loc3_.x;
      World.CHud.dPoint.y = p.y + _loc3_.y;
      this.bmDraw.copyPixels(_loc5_, _loc5_.rectangle, World.CHud.dPoint, undefined, undefined, true);
    } else {
      World.CHud.dMatrix.tx = p.x + _loc3_.x;
      World.CHud.dMatrix.ty = p.y + _loc3_.y;
      World.CHud.dColorTransform.alphaMultiplier = tAlpha / 100;
      this.bmDraw.draw(bmObject.sBMD, World.CHud.dMatrix, World.CHud.dColorTransform);
    }
    return true;
  }

  static RenderMovieClipAsBitmapObject(mc: any, bmObject?: any): any {
    World.CHud.StartRender();
    if (bmObject == undefined) {
      const _loc1_ = mc.getBounds(mc);
      const _loc5_ = new flash.geom.Rectangle(Math.floor(_loc1_.xMin), Math.floor(_loc1_.yMin), Math.ceil(_loc1_.xMax) - Math.floor(_loc1_.xMin), Math.ceil(_loc1_.yMax) - Math.floor(_loc1_.yMin));
      const _loc6_ = new flash.display.BitmapData(Math.ceil(_loc5_.width), Math.ceil(_loc5_.height), true, 16711680);
      const _loc3_ = new flash.geom.Point(_loc5_.x, _loc5_.y);
      World.CHud.rm.tx = 0 - _loc3_.x;
      World.CHud.rm.ty = 0 - _loc3_.y;
      _loc6_.draw(mc, World.CHud.rm, undefined, 'normal', undefined, false);
      World.CHud.EndRender();
      return { sBMD: _loc6_, mDisp: _loc3_, mBounds: _loc5_ };
    }
    bmObject.sBMD.fillRect(bmObject.sBMD.rectangle, 0);
    const _loc5_ = bmObject.mBounds;
    World.CHud.rm.tx = 0 - _loc5_.x;
    World.CHud.rm.ty = 0 - _loc5_.y;
    bmObject.sBMD.draw(mc, World.CHud.rm, undefined, 'normal', undefined, false);
    World.CHud.EndRender();
    return bmObject;
  }

  static StartRender(tScale?: any): void {
    void tScale;
    World.CHud.mBackQuality = World.CHud.mBackQuality != undefined ? World.CHud.mBackQuality : _root._quality;
    _root._quality = 'BEST';
  }

  static EndRender(): void {
    _root._quality = World.CHud.mBackQuality;
    delete World.CHud.mBackQuality;
  }

  // addProperty("mScore", __get__mScore, function () {}) - getter with an EMPTY setter.
  get mScore(): any { return this.__get__mScore(); }
  set mScore(_v: any) { /* AS2 empty setter */ }
}
proto(CHud, { _CLASSID_: 'CHud', _BASECLASSID_: 'CHud', mSilentMessages: false });
CHud.dPoint = new flash.geom.Point();
CHud.dMatrix = new flash.geom.Matrix();
CHud.dColorTransform = new flash.geom.ColorTransform(1, 1, 1, 1, 0, 0, 0, 0);
CHud.rm = new flash.geom.Matrix();

registerGameClass('World.CHud', CHud);
