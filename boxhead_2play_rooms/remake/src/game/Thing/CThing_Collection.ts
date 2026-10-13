// Port of projects/boxhead4/Thing/CThing_Collection.as
// Statement order / member layout from generated/disasm/Thing.CThing_Collection.txt (top-level script @274907..@277217).
//
// mThings / mPlayerThings / mDeleteThings / mThingCounters are plain objects as in AS2 (keys "t<id>", "<_CLASSID_>",
// never integer-like); every for..in goes through forIn() (AS2 enumeration order = reverse creation order, snapshot).
import { forIn, proto } from '../../engine/runtime.ts';
import { Thing, World, registerGameClass } from '../packages.ts';

export class CThing_Collection {
  declare _CLASSID_: string;
  declare _BASECLASSID_: string;
  declare mThings: any;
  declare mPlayerThings: any;
  declare mRespawnPlayer: any;
  declare mThingCounters: any;
  /** Created by the first Process() call (undefined before, like in AS2). */
  declare mDeleteThings: any;
  declare mWorld: any;
  declare mTimeSlice_25: any;
  declare mTimeSlice_8: any;
  declare mTimeSlice_4: any;

  constructor(tWorld?: any) {
    this.mThings = new Object();
    this.mPlayerThings = new Object();
    this.mRespawnPlayer = new Object();
    this.mThingCounters = new Object();
    this.mWorld = tWorld;
    this.mTimeSlice_25 = 0;
    this.mTimeSlice_8 = 0;
    this.mTimeSlice_4 = 0;
    this.mThingCounters.INVALIDPOSITION = 0;
    Thing.CThing.Renew();
    World.Map.CMap_Cell.Nav_Reset();
  }

  toString(): string {
    return this._CLASSID_;
  }

  // ffdec showed `var Dispose = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.CThing_Collection.txt @275271
  Dispose(): void {
  }

  AddThing(tThing?: any): any {
    this.mThings[tThing.sUniqueID] = tThing;
    tThing.mThing_Collection = this;
    tThing.mWorld = this.mWorld;
    this.mThingCounters[tThing._CLASSID_] = this.mThingCounters[tThing._CLASSID_] != undefined ? this.mThingCounters[tThing._CLASSID_] + 1 : 1;
    return tThing;
  }

  AddThing_Shot(tThing?: any): any {
    return this.AddThing(tThing);
  }

  AddThing_Effect(tThing?: any): any {
    return this.AddThing(tThing);
  }

  AddThing_Player(tPlayer?: any): any {
    this.AddThing(tPlayer);
    this.mPlayerThings[tPlayer.sUniqueID] = tPlayer;
    return tPlayer;
  }

  Register_Thing(tThing?: any): any {
    tThing.mThing_Collection = this;
    tThing.mWorld = this.mWorld;
    return tThing;
  }

  DeleteThing(tThing?: any): void {
    this.mThingCounters[tThing._CLASSID_] = this.mThingCounters[tThing._CLASSID_] - 1;
    // AS2: mDeleteThings is undefined until the first Process(); setting a member of undefined is a silent no-op.
    if (this.mDeleteThings != undefined) {
      this.mDeleteThings[tThing.sUniqueID] = tThing;
    }
  }

  DeleteThing_Player(tPlayer?: any): void {
    this.DeleteThing(tPlayer);
    this.mPlayerThings[tPlayer.sUniqueID]?.Dispose();
    delete this.mPlayerThings[tPlayer.sUniqueID];
  }

  SearchThings(sProp?: any, sValue?: any, tList?: any): any[] {
    const _loc3_: any[] = new Array();
    tList = tList != undefined ? tList : this.mThings;
    for (const _loc4_ of forIn(tList)) {
      if (tList[_loc4_][sProp] == sValue) {
        _loc3_.push(tList[_loc4_]);
      }
    }
    return _loc3_;
  }

  GetThingByID(tID?: any): any {
    return this.mThings['t' + tID];
  }

  GetClosestPlayer(p?: any): any {
    if (this.mThingCounters.CThing_Creature_Player == 1) {
      for (const _loc6_ of forIn(this.mPlayerThings)) {
        return this.mPlayerThings[_loc6_];
      }
    }
    // [BC] generated/disasm/Thing.CThing_Collection.txt @276187 — running minimum (ffdec compared against the constant).
    let _loc3_ = 1.7976931348623157e308;
    let _loc4_: any = undefined;
    let _loc5_: any = undefined;
    for (const _loc6_ of forIn(this.mPlayerThings)) {
      const _loc2_ = this.mPlayerThings[_loc6_];
      if (!(_loc2_.mFlags & Thing.CThing.mFlag_DEAD)) {
        _loc4_ = p.Distance2D_SQR(_loc2_.mPosition); // [BC] generated/disasm/Thing.CThing_Collection.txt @276321
        if (_loc4_ < _loc3_) { // [BC] generated/disasm/Thing.CThing_Collection.txt @276332
          _loc3_ = _loc4_;
          _loc5_ = _loc2_;
        }
      }
    }
    if (!_loc5_) {
      for (const _loc6_ of forIn(this.mPlayerThings)) {
        return this.mPlayerThings[_loc6_];
      }
    }
    return _loc5_;
  }

  GetOtherPlayer(tPlayer?: any): any {
    for (const _loc2_ of forIn(this.mPlayerThings)) {
      if (tPlayer != this.mPlayerThings[_loc2_]) {
        return this.mPlayerThings[_loc2_];
      }
    }
    return undefined;
  }

  Process(): void {
    this.mTimeSlice_25 = (this.mTimeSlice_25 + 1) % 25;
    this.mTimeSlice_8 = (this.mTimeSlice_8 + 1) & 7;
    this.mTimeSlice_4 = (this.mTimeSlice_4 + 1) & 3;
    for (const _loc5_ of forIn(this.mDeleteThings)) {
      // AS2: an entry may be missing (deleted twice / never added) -> method call on undefined is a no-op.
      this.mThings[_loc5_]?.Dispose();
      delete this.mThings[_loc5_];
    }
    this.mDeleteThings = new Object();
    for (const _loc5_ of forIn(this.mThings)) {
      // AS2: the key snapshot may contain things deleted meanwhile; Process is deleted by CThing.Delete() (no-op call).
      this.mThings[_loc5_]?.Process?.();
    }
    World.Map.CMap_Cell.Nav_Restart();
    const _loc3_: any[] = new Array();
    const _loc4_ = this.mWorld.mMap.mCells;
    for (const _loc5_ of forIn(this.mPlayerThings)) {
      const _loc2_ = this.mPlayerThings[_loc5_].mPosition;
      _loc3_.push(_loc4_[_loc2_.mY & 16777215][_loc2_.mX & 16777215]);
    }
    World.Map.CMap_Cell.Nav_Update(_loc3_);
  }

  Draw(): void {
    for (const _loc2_ of forIn(this.mThings)) {
      // AS2: some things have no Draw() (e.g. CThing_Effect_BloodSplat) -> calling undefined is a no-op.
      this.mThings[_loc2_]?.Draw?.();
    }
  }
}
proto(CThing_Collection, { _CLASSID_: 'CThing_Collection', _BASECLASSID_: 'CThing_Collection' });

registerGameClass('Thing.CThing_Collection', CThing_Collection);
