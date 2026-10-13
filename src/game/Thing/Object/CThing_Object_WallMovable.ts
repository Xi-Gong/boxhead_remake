// Port of assets/projects/boxhead4/Thing/Object/CThing_Object_WallMovable.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_WallMovable.txt (top-level script
// @356908..@357124).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_WallMovable extends CThing_Object {
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Object.CThing_Object_WallMovable.txt @357106
  Process_Normal(): void {
  }
}
proto(CThing_Object_WallMovable, { _CLASSID_: 'CThing_Object_WallMovable' });

registerGameClass('Thing.Object.CThing_Object_WallMovable', CThing_Object_WallMovable);
