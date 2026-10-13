// Port of assets/projects/boxhead4/Thing/Object/CThing_Object.as
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object.txt (top-level script
// @329920..@330156).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing } from '../CThing.ts';

export class CThing_Object extends CThing {
  // ---- AS2 dynamic instance fields used by the object subclasses ----
  declare mBiggerBang: any;
  declare mClusterExplode: any;
  declare mDetonate: any;
  declare mDetonateCounter: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    this.Process = this.Process_Normal;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Object.CThing_Object.txt @330112
  Process_Normal(): void {
  }

  // ffdec showed `var Process_Sleep = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Object.CThing_Object.txt @330128
  Process_Sleep(): void {
  }
}
proto(CThing_Object, { _CLASSID_: 'CThing_Object', _BASECLASSID_: 'CThing_Object' });

registerGameClass('Thing.Object.CThing_Object', CThing_Object);
