// Port of assets/projects/boxhead4/Thing/Effect/CThing_Effect_BloodPool.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_BloodPool.txt (top-level script
// @282210..@282426).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_BloodPool extends CThing_Effect {
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Effect.CThing_Effect_BloodPool.txt @282408
  Process_Normal(): void {
  }
}
proto(CThing_Effect_BloodPool, { _CLASSID_: 'CThing_Effect_BloodPool' });

registerGameClass('Thing.Effect.CThing_Effect_BloodPool', CThing_Effect_BloodPool);
