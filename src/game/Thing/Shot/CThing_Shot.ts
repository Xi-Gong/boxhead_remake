// Port of assets/projects/boxhead4/Thing/Shot/CThing_Shot.as
// Statement order / member layout from generated/disasm/Thing.Shot.CThing_Shot.txt (top-level script @305002..@305254).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing } from '../CThing.ts';

export class CThing_Shot extends CThing {
  // ---- AS2 dynamic instance fields used by the shot subclasses ----
  declare mDestination: any;
  declare mDelay: any;
  declare mEffect: any;
  declare mPower: any;
  declare mDamageMultiply: any;
  declare oCollide: any;

  /** `_extra` only types the 5th argument CThing_Shot_DLaser passes to super(); AS2 ignores extra arguments. */
  constructor(tPosition?: any, tAngle?: any, tParent?: any, tDamage?: any, _extra?: any) {
    super(tPosition, tAngle, tParent);
    this.mDamage = tDamage;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }
}
proto(CThing_Shot, { _CLASSID_: 'CThing_Shot', _BASECLASSID_: 'CThing_Shot' });

registerGameClass('Thing.Shot.CThing_Shot', CThing_Shot);
