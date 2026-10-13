// Port of assets/projects/boxhead4/CInput.as
// Structure from generated/disasm/CInput.txt top-level script @207778..@212677 (initaction of sprite 775).
// Latched key model: every key object of mKey_List has
//   IsDown()     -> live Key.isDown of its key code (or the optional second code mKeycode_1),
//   IsPressed()  -> true once per press (consumes mPressed),
//   IsReleased() -> true once per release (consumes mReleased AND mPressed).
// UpdateKey (run from the Key listener on every key event and from CMain.Process every enterFrame) sets the latches.
import { Key, Mouse, forIn, getTimer, proto } from '../engine/runtime.ts';
import { CMain, registerGameClass } from './packages.ts';

export class CInput {
  [key: string]: any;
  static mValidKeys: any;

  constructor() {
    if (!CInput.mValidKeys) {
      this.Setup_ValidKeys();
    }
    this.ResetKeys();
    this.RegisterKey('KEY_UP', CMain.mSaveData.__get__mPlayer1_KeyMoveUp());
    this.RegisterKey('KEY_DOWN', CMain.mSaveData.__get__mPlayer1_KeyMoveDown());
    this.RegisterKey('KEY_LEFT', CMain.mSaveData.__get__mPlayer1_KeyMoveLeft());
    this.RegisterKey('KEY_RIGHT', CMain.mSaveData.__get__mPlayer1_KeyMoveRight());
    this.RegisterKey('KEY_FIRE', CMain.mSaveData.__get__mPlayer1_KeyShoot());
    this.RegisterKey('KEY_NEXT_WEAPON', CMain.mSaveData.__get__mPlayer1_KeyNextWeapon());
    this.RegisterKey('KEY_PREV_WEAPON', CMain.mSaveData.__get__mPlayer1_KeyPrevWeapon());
    this.RegisterKey('KEY_UP2', CMain.mSaveData.__get__mPlayer2_KeyMoveUp());
    this.RegisterKey('KEY_DOWN2', CMain.mSaveData.__get__mPlayer2_KeyMoveDown());
    this.RegisterKey('KEY_LEFT2', CMain.mSaveData.__get__mPlayer2_KeyMoveLeft());
    this.RegisterKey('KEY_RIGHT2', CMain.mSaveData.__get__mPlayer2_KeyMoveRight());
    this.RegisterKey('KEY_FIRE2', CMain.mSaveData.__get__mPlayer2_KeyShoot());
    this.RegisterKey('KEY_NEXT_WEAPON2', CMain.mSaveData.__get__mPlayer2_KeyNextWeapon());
    this.RegisterKey('KEY_PREV_WEAPON2', CMain.mSaveData.__get__mPlayer2_KeyPrevWeapon());
    this.RegisterKey('KEY_PAUSE', CInput.ToAscii('P'));
    this.RegisterKey('KEY_SELECT1', CInput.ToAscii('1'));
    this.RegisterKey('KEY_SELECT2', CInput.ToAscii('2'));
    this.RegisterKey('KEY_SELECT3', CInput.ToAscii('3'));
    this.RegisterKey('KEY_SELECT4', CInput.ToAscii('4'));
    this.RegisterKey('KEY_SELECT5', CInput.ToAscii('5'));
    this.RegisterKey('KEY_SELECT6', CInput.ToAscii('6'));
    this.RegisterKey('KEY_SELECT7', CInput.ToAscii('7'));
    this.RegisterKey('KEY_SELECT8', CInput.ToAscii('8'));
    this.RegisterKey('KEY_SELECT9', CInput.ToAscii('9'));
    this.RegisterKey('KEY_SELECT0', CInput.ToAscii('0'));
    const _loc3_: any = new Object();
    _loc3_.pClass = this;
    _loc3_.onKeyDown = function (this: any): void {
      this.pClass.ProcessAllKeys();
    };
    _loc3_.onKeyUp = function (this: any): void {
      this.pClass.ProcessAllKeys();
    };
    Key.addListener(_loc3_);
    const _loc2_: any = new Object();
    _loc2_.pClass = this;
    _loc2_.onMouseDown = function (this: any): void {
      this.pClass.mMouseDown = true;
    };
    _loc2_.onMouseUp = function (this: any): void {
      this.pClass.mMouseDown = false;
    };
    Mouse.addListener(_loc2_);
  }

  static ToAscii(c: any): number {
    return c.charCodeAt(0);
  }

  ResetKeys(): void {
    this.mKey_List = new Array();
    this.mKey_List_Registered = new Array();
    for (let _loc2_ = 0; _loc2_ < 256; _loc2_++) { // [BC] generated/disasm/CInput.txt @209236 (for i = 0..255)
      this.mKey_List[_loc2_] = { mKeycode: _loc2_, mPressed: false, mTimePressed: 0, mDown: false, mReleased: false, mTimeDown: 0, mTimeReleased: 0 }; // [BC] generated/disasm/CInput.txt @209326
      this.mKey_List[_loc2_].IsPressed = function (this: any): boolean {
        if (this.mPressed) {
          this.mPressed = false;
          return true;
        }
        return false;
      };
      this.mKey_List[_loc2_].IsReleased = function (this: any): boolean {
        if (this.mReleased) {
          this.mReleased = false;
          this.mPressed = false;
          return true;
        }
        return false;
      };
      this.mKey_List[_loc2_].IsDown = function (this: any): boolean {
        return Key.isDown(this.mKeycode) || Key.isDown(this.mKeycode_1);
      };
      this.mKey_List[_loc2_].IsUp = function (this: any): boolean {
        return !this.IsDown();
      };
      this.mKey_List[_loc2_].Renew = function (this: any): void {
        this.mReleased = false;
        this.mPressed = false;
        this.mDown = false;
      };
    }
  }

  RegisterKey(tKeyID: any, tKeycode: any): void {
    this[tKeyID] = this.mKey_List[tKeycode];
    this.mKey_List_Registered.push(this.mKey_List[tKeycode]);
  }

  AddAdditionKeyCode(tKey: any, tKeycode_1: any): void {
    tKey.mKeycode_1 = tKeycode_1;
  }

  Dispose(): void {
    // AS2 `super.Dispose()`: CInput has no superclass method -> calling undefined is a silent no-op.
  }

  AnyKeyPressed(): boolean {
    for (let _loc2_ = 0; _loc2_ < 256; _loc2_++) { // [BC] generated/disasm/CInput.txt @209892 (for i = 0..255)
      if (this.mKey_List[_loc2_].mPressed) { // [BC] generated/disasm/CInput.txt @209935
        return true;
      }
    }
    return false;
  }

  ProcessAllKeys(): void {
    for (const _loc2_ of forIn(this.mKey_List_Registered)) {
      this.UpdateKey(this.mKey_List_Registered[_loc2_]);
    }
  }

  UpdateKey(tKey: any): void {
    // AS2: a registered slot can be undefined (a key code outside 0..255 from a corrupt save) -> calls are no-ops.
    if (tKey?.IsDown?.()) {
      if (!tKey.mDown) {
        tKey.mDown = true;
        tKey.mTimeDown = getTimer(); // [BC] generated/disasm/CInput.txt @210134
        if (!tKey.mPressed) {
          tKey.mPressed = true;
          tKey.mTimePressed = getTimer(); // [BC] generated/disasm/CInput.txt @210168
        }
      }
    } else if (tKey?.mDown) {
      tKey.mDown = false;
      tKey.mReleased = true;
      tKey.mTimeReleased = getTimer(); // [BC] generated/disasm/CInput.txt @210216
    }
  }

  Setup_ValidKeys(): void {
    // [BC] generated/disasm/CInput.txt @210270..@210340: the first three stores target CInput.mValidKeys BEFORE the
    // array is created (it is still undefined) -> silent no-ops in AS2 (CAPS/NUM/SCROLL LOCK end up unknown keys).
    if (CInput.mValidKeys != undefined) {
      CInput.mValidKeys[20] = { mValid: false, mName: 'CAPS LOCK' };
      CInput.mValidKeys[144] = { mValid: false, mName: 'NUM LOCK ' };
      CInput.mValidKeys[145] = { mValid: false, mName: 'SCROLL LOCK ' };
    }
    CInput.mValidKeys = new Array();
    CInput.mValidKeys[38] = { mValid: true, mName: 'ARROW UP' };
    CInput.mValidKeys[40] = { mValid: true, mName: 'ARROW DOWN' };
    CInput.mValidKeys[37] = { mValid: true, mName: 'ARROW LEFT' };
    CInput.mValidKeys[39] = { mValid: true, mName: 'ARROW RIGHT' };
    CInput.mValidKeys[111] = { mValid: true, mName: "NUM PD '/'" };
    CInput.mValidKeys[106] = { mValid: true, mName: "NUM PD '*'" };
    CInput.mValidKeys[109] = { mValid: true, mName: "NUM PD '-'" };
    CInput.mValidKeys[107] = { mValid: true, mName: "NUM PD '+'" };
    CInput.mValidKeys[110] = { mValid: true, mName: "NUM PD '.'" };
    CInput.mValidKeys[96] = { mValid: true, mName: "NUM PD '0'" };
    CInput.mValidKeys[97] = { mValid: true, mName: "NUM PD '1'" };
    CInput.mValidKeys[98] = { mValid: true, mName: "NUM PD '2'" };
    CInput.mValidKeys[99] = { mValid: true, mName: "NUM PD '3'" };
    CInput.mValidKeys[100] = { mValid: true, mName: "NUM PD '4'" };
    CInput.mValidKeys[101] = { mValid: true, mName: "NUM PD '5'" };
    CInput.mValidKeys[102] = { mValid: true, mName: "NUM PD '6'" };
    CInput.mValidKeys[103] = { mValid: true, mName: "NUM PD '7'" };
    CInput.mValidKeys[104] = { mValid: true, mName: "NUM PD '8'" };
    CInput.mValidKeys[105] = { mValid: true, mName: "NUM PD '9'" };
    CInput.mValidKeys[65] = { mValid: true, mName: "'A'" };
    CInput.mValidKeys[66] = { mValid: true, mName: "'B'" };
    CInput.mValidKeys[67] = { mValid: true, mName: "'C'" };
    CInput.mValidKeys[68] = { mValid: true, mName: "'D'" };
    CInput.mValidKeys[69] = { mValid: true, mName: "'E'" };
    CInput.mValidKeys[70] = { mValid: true, mName: "'F'" };
    CInput.mValidKeys[71] = { mValid: true, mName: "'G'" };
    CInput.mValidKeys[72] = { mValid: true, mName: "'H'" };
    CInput.mValidKeys[73] = { mValid: true, mName: "'I'" };
    CInput.mValidKeys[74] = { mValid: true, mName: "'J'" };
    CInput.mValidKeys[75] = { mValid: true, mName: "'K'" };
    CInput.mValidKeys[76] = { mValid: true, mName: "'L'" };
    CInput.mValidKeys[77] = { mValid: true, mName: "'M'" };
    CInput.mValidKeys[78] = { mValid: true, mName: "'N'" };
    CInput.mValidKeys[79] = { mValid: true, mName: "'O'" };
    CInput.mValidKeys[81] = { mValid: true, mName: "'Q'" };
    CInput.mValidKeys[82] = { mValid: true, mName: "'R'" };
    CInput.mValidKeys[83] = { mValid: true, mName: "'S'" };
    CInput.mValidKeys[84] = { mValid: true, mName: "'T'" };
    CInput.mValidKeys[85] = { mValid: true, mName: "'U'" };
    CInput.mValidKeys[86] = { mValid: true, mName: "'V'" };
    CInput.mValidKeys[87] = { mValid: true, mName: "'W'" };
    CInput.mValidKeys[88] = { mValid: true, mName: "'X'" };
    CInput.mValidKeys[89] = { mValid: true, mName: "'Y'" };
    CInput.mValidKeys[90] = { mValid: true, mName: "'Z'" };
    CInput.mValidKeys[32] = { mValid: true, mName: "' '" };
    CInput.mValidKeys[188] = { mValid: true, mName: "','" };
    CInput.mValidKeys[190] = { mValid: true, mName: "'.'" };
    CInput.mValidKeys[191] = { mValid: true, mName: "'/'" };
    CInput.mValidKeys[220] = { mValid: true, mName: "''" };
    CInput.mValidKeys[189] = { mValid: true, mName: "'-'" };
    CInput.mValidKeys[187] = { mValid: true, mName: "'='" };
    CInput.mValidKeys[46] = { mValid: true, mName: "'DEL'" };
    CInput.mValidKeys[36] = { mValid: true, mName: "'HOME'" };
    CInput.mValidKeys[35] = { mValid: true, mName: "'END'" };
    CInput.mValidKeys[33] = { mValid: true, mName: "'PGUP'" };
    CInput.mValidKeys[34] = { mValid: true, mName: "'PGDN'" };
    CInput.mValidKeys[45] = { mValid: true, mName: "'INSERT'" };
    CInput.mValidKeys[0] = { mValid: false, mName: '-zero-' };
    CInput.mValidKeys[186] = { mValid: false, mName: "';'" };
    CInput.mValidKeys[192] = { mValid: false, mName: "'''" };
    CInput.mValidKeys[222] = { mValid: false, mName: "'#'" };
    CInput.mValidKeys[219] = { mValid: false, mName: "'['" };
    CInput.mValidKeys[221] = { mValid: false, mName: "']'" };
  }

  static isValidKey(keyCode: any): any {
    return CInput.mValidKeys[keyCode];
  }
}
proto(CInput, { _CLASSID_: 'CInput', _BASECLASSID_: 'CInput' });

registerGameClass('CInput', CInput);
