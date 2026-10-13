// Port of assets/projects/boxhead4/scidd/CProfiler.as
// Unused by the shipped game (_global.mDebug is never true) — ported straightforwardly, no tests (CONVENTIONS rule 11).
import { _global, forIn, getTimer, proto } from '../../engine/runtime.ts';
import { scidd, registerGameClass } from '../packages.ts';

export class CProfiler {
  declare _CLASSID_: string;
  static _Active = false;
  static obj: any;
  declare mList: any[];

  constructor() {
    if (_global.mDebug == true) {
      this.mList = new Array();
      scidd.CProfiler.obj = this;
      scidd.CProfiler.Clear();
      scidd.CProfiler._Active = true;
    }
  }

  static GetString(): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    let _loc1_: any;
    let _loc2_: any;
    let _loc3_: any = ''; // [BC] generated/disasm/scidd.CProfiler.txt @215732
    let _loc6_: any = ''; // [BC] generated/disasm/scidd.CProfiler.txt @215742
    let _loc4_: any = ''; // [BC] generated/disasm/scidd.CProfiler.txt @215752
    let _loc5_: any = 0; // [BC] generated/disasm/scidd.CProfiler.txt @215769
    for (const _loc7_ of forIn(scidd.CProfiler.obj.mList)) {
      _loc1_ = scidd.CProfiler.obj.mList[_loc7_];
      switch (_loc1_.mType) {
        case 'timer':
          _loc3_ = _loc3_ + (_loc1_.mID + ' = ' + _loc1_.mTotalTime + ' ms (' + _loc1_.mTimes.length + ') [' + _loc1_.mSlowestTime + ']' + '\n'); // [BC] generated/disasm/scidd.CProfiler.txt @215986
          _loc5_ = _loc5_ + _loc1_.mTotalTime; // [BC] generated/disasm/scidd.CProfiler.txt @216002
          break;
        case 'variable':
          _loc4_ = _loc4_ + (_loc1_.mID + ' = ' + _loc1_.mVariable + '\n'); // [BC] generated/disasm/scidd.CProfiler.txt @216044
          break;
        case 'counter':
          _loc6_ = _loc6_ + (_loc1_.mID + ' = ' + _loc1_.mCounter + '\n'); // [BC] generated/disasm/scidd.CProfiler.txt @216086
      }
    }
    _loc2_ = ''; // [BC] generated/disasm/scidd.CProfiler.txt @216106
    _loc2_ = _loc2_ + _loc3_;
    _loc2_ += '-----------------------------\n';
    _loc2_ += 'Total = ' + _loc5_ + ' ms' + '\n';
    _loc2_ += '-----------------------------\n';
    _loc2_ += _loc4_;
    _loc2_ += '-----------------------------\n';
    _loc2_ += _loc6_;
    _loc2_ += '-----------------------------\n';
    return _loc2_;
  }

  static Clear(): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    for (const _loc2_ of forIn(scidd.CProfiler.obj.mList)) {
      const _loc1_ = scidd.CProfiler.obj.mList[_loc2_];
      _loc1_.mTotalTime = 0;
      _loc1_.mTimes = new Array();
    }
  }

  static Timer_Start(tID: any): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    const _loc1_ = scidd.CProfiler.obj.Find(tID);
    _loc1_.mType = 'timer';
    _loc1_.mStartTime = getTimer(); // [BC] generated/disasm/scidd.CProfiler.txt @216519
  }

  static Timer_Stop(tID: any): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    const _loc1_ = scidd.CProfiler.obj.Find(tID);
    _loc1_.mEndTime = getTimer() - _loc1_.mStartTime; // [BC] generated/disasm/scidd.CProfiler.txt @216627
    if (_loc1_.mEndTime > _loc1_.mSlowestTime) {
      _loc1_.mSlowestCount = 0;
      _loc1_.mSlowestTime = _loc1_.mEndTime;
    }
    if (_loc1_.mSlowestCount++ > 150) {
      _loc1_.mSlowestTime = 0;
    }
    _loc1_.mTotalTime += _loc1_.mEndTime;
    _loc1_.mAverageTotalTime = _loc1_.mAverageTotalTime != 0 ? (_loc1_.mTotalTime + _loc1_.mAverageTotalTime) / 2 : _loc1_.mTotalTime;
    _loc1_.mTimes[_loc1_.mTimes.length] = _loc1_.mEndTime;
  }

  static AddCounter(tID: any, tAmount: any): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    const _loc1_ = scidd.CProfiler.obj.Find(tID);
    _loc1_.mCounter += tAmount;
    _loc1_.mType = 'counter';
  }

  static SetVariable(tID: any, tValue: any): any {
    if (!scidd.CProfiler._Active) {
      return undefined;
    }
    const _loc1_ = scidd.CProfiler.obj.Find(tID);
    _loc1_.mVariable = tValue;
    _loc1_.mType = 'variable';
  }

  Find(tID: any): any {
    for (const _loc4_ of forIn(this.mList)) {
      if (this.mList[_loc4_].mID == tID) {
        return this.mList[_loc4_];
      }
    }
    const _loc2_: any = new Object();
    _loc2_.mID = tID;
    _loc2_.mTimes = new Array();
    _loc2_.mStartTime = 0;
    _loc2_.mTotalTime = 0;
    _loc2_.mAverageTotalTime = 0;
    _loc2_.mSlowestTime = 0;
    _loc2_.mSlowestCount = 0;
    _loc2_.mVariable = undefined;
    _loc2_.mCounter = 0;
    this.mList[this.mList.length] = _loc2_;
    return _loc2_;
  }
}
proto(CProfiler, { _CLASSID_: 'scidd.CProfiler' });

registerGameClass('scidd.CProfiler', CProfiler);
