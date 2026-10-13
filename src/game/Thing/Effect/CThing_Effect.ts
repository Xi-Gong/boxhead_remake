// Port of assets/projects/boxhead4/Thing/Effect/CThing_Effect.as
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect.txt (top-level script
// @280068..@280288).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing } from '../CThing.ts';

export class CThing_Effect extends CThing {
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Effect.CThing_Effect.txt @280260
  Process_Normal(): void {
  }
}
proto(CThing_Effect, { _CLASSID_: 'CThing_Effect', _BASECLASSID_: 'CThing_Effect' });

registerGameClass('Thing.Effect.CThing_Effect', CThing_Effect);
