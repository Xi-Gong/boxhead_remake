// Port of projects/boxhead4/External/CTracker.as
// Structure from generated/disasm/External.CTracker.txt top-level script @81495..@84475 (initaction of sprite 758).
// Click/play statistics of the original site. Already disabled in the shipped bytecode: the static Click() that every
// Click_* goes through is an empty function, so _Click (the LoadVars request) is never reached. LoadVars is an inert
// stub in the remake anyway (no network, deviation NO_NETWORK).
import { LoadVars, LocalConnection, _global, _root, proto, random, toAS2String, toNumber } from '../../engine/runtime.ts';
import { External, registerGameClass } from '../packages.ts';

export class CTracker {
  [key: string]: any;
  static mURL = 'http://data.seantcooper.com/boxhead_morerooms/Counters';

  static Click(cbParent?: any, cbFunction?: any, tActionType?: any, tActionCount?: any): any {
    void cbParent; void cbFunction; void tActionType; void tActionCount;
    return undefined;
  }

  _Click(cbParent: any, cbFunction: any, tActionType: any, tActionCount: any): void {
    if (_global.mAllowLocalHost == false && (new LocalConnection()).domain() == 'localhost') {
      return;
    }
    this.mReceivedData = new LoadVars();
    this.mReceivedData.cbFunction = cbFunction;
    this.mReceivedData.cbParent = cbParent;
    this.mReceivedData.mActionType = tActionType;
    this.mReceivedData.onLoad = function (this: any, success: any): void {
      let _loc3_ = ''; // [BC] generated/disasm/External.CTracker.txt @81952 (ffdec: bare `"";`)
      _loc3_ = _loc3_ + ('-----Data Received (' + this.mActionType + ')' + '\n');
      _loc3_ = _loc3_ + ('-----success = ' + success + '\n');
      _loc3_ = _loc3_ + ('-----this.mReturn = ' + this.mReturn + '\n');
      _loc3_ = _loc3_ + ('-----this.mError = ' + this.mError + '\n');
      if (_root._ASP != undefined) _root._ASP.text = _loc3_;
      this.cbParent?.[this.cbFunction]?.(success, this.mReturn, this.mError);
    };
    this.mSendData = new LoadVars();
    this.mSendData.mDomain = (new LocalConnection()).domain();
    this.mSendData.mActionType = tActionType;
    this.mSendData.mActionCount = tActionCount;
    this.mSendData.mKey = this.GenerateKey('56799998877722985679999887772298', this.mSendData.mDomain);
    this.mSendData.sendAndLoad(External.CTracker.mURL + '/Click.asp', this.mReceivedData, 'POST');
  }

  static Click_CrazyMonkeyGames(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'CrazyMonkeyGames', 1);
  }

  static Click_SeanTCooper(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'SeanTCooper', 1);
  }

  static Click_SubmitHighscore(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'SubmitHighscore', 1);
  }

  static Click_ViewHighscore(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'ViewHighscore', 1);
  }

  static Click_Play(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'Play1', 1);
  }

  static Click_Other1(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'Other1', 1);
  }

  static Click_Other2(cbParent?: any, cbFunction?: any): any {
    return External.CTracker.Click(cbParent, cbFunction, 'Other2', 1);
  }

  static Click_PlayCount(tAmount: any, cbParent?: any, cbFunction?: any): any {
    switch (tAmount) {
      default:
        return External.CTracker.Click(cbParent, cbFunction, 'Play1', 1);
      case 5:
        return External.CTracker.Click(cbParent, cbFunction, 'Play5', 1);
      case 10:
        return External.CTracker.Click(cbParent, cbFunction, 'Play10', 1);
      case 25:
        return External.CTracker.Click(cbParent, cbFunction, 'Play25', 1);
      case 50:
        return External.CTracker.Click(cbParent, cbFunction, 'Play50', 1);
      case 100:
        return External.CTracker.Click(cbParent, cbFunction, 'Play100', 1);
      case 250:
        return External.CTracker.Click(cbParent, cbFunction, 'Play250', 1);
      case 500:
        return External.CTracker.Click(cbParent, cbFunction, 'Play500', 1);
      case 1000:
        return External.CTracker.Click(cbParent, cbFunction, 'Play1000', 1);
    }
  }

  static GetDomains(cbParent: any, cbFunction: any): void {
    const _loc1_ = new External.CTracker();
    _loc1_._GetDomains(cbParent, cbFunction);
  }

  _GetDomains(cbParent: any, cbFunction: any): void {
    this.mReceivedData = new LoadVars();
    this.mReceivedData.cbFunction = cbFunction;
    this.mReceivedData.cbParent = cbParent;
    this.mReceivedData.onLoad = function (this: any, success: any): void {
      this.cbParent?.[this.cbFunction]?.(success, this.mReturn, this.mError);
    };
    this.mSendData = new LoadVars();
    this.mSendData.sendAndLoad(External.CTracker.mURL + '/GetDomains.asp', this.mReceivedData, 'POST');
  }

  static GetDomainInfo(cbParent: any, cbFunction: any, tDomain: any): void {
    const _loc1_ = new External.CTracker();
    _loc1_._GetDomainInfo(cbParent, cbFunction, tDomain);
  }

  _GetDomainInfo(cbParent: any, cbFunction: any, tDomain: any): void {
    this.mReceivedData = new LoadVars();
    this.mReceivedData.cbFunction = cbFunction;
    this.mReceivedData.cbParent = cbParent;
    this.mReceivedData.onLoad = function (this: any, success: any): void {
      this.cbParent?.[this.cbFunction]?.(this.mActionType, success, this.mReturn, this.mError);
    };
    this.mSendData = new LoadVars();
    this.mSendData.mDomain = tDomain;
    this.mSendData.sendAndLoad(External.CTracker.mURL + '/GetDomainInfo.asp', this.mReceivedData, 'POST');
  }

  GenerateKey(inKey: any, eString: any): string {
    let _loc2_ = ''; // [BC] generated/disasm/External.CTracker.txt @84084
    let _loc1_: number;
    for (_loc1_ = 0; _loc1_ < inKey.length; _loc1_++) { // [BC] generated/disasm/External.CTracker.txt @84101
      _loc2_ = _loc2_ + toAS2String(random(toNumber(inKey.substr(_loc1_, 1))) + 1);
    }
    let _loc6_ = ''; // [BC] generated/disasm/External.CTracker.txt @84198
    for (_loc1_ = 0; _loc1_ < _loc2_.length; _loc1_++) { // [BC] generated/disasm/External.CTracker.txt @84215
      const _loc3_ = (eString.charCodeAt(_loc1_ % eString.length) + toNumber(_loc2_.substr(_loc1_, 1))) % 10;
      _loc6_ = _loc6_ + toAS2String(_loc3_);
    }
    return _loc6_;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    delete this.mReceivedData;
    delete this.mSendData;
  }
}
proto(CTracker, { _CLASSID_: 'CTracker', _BASECLASSID_: 'CTracker' });

registerGameClass('External.CTracker', CTracker);
