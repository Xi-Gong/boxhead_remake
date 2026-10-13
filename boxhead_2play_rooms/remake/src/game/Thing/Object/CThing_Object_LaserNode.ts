// Port of projects/boxhead4/Thing/Object/CThing_Object_LaserNode.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Object.CThing_Object_LaserNode.txt (top-level script
// @341088..@341304).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing_Object } from './CThing_Object.ts';

export class CThing_Object_LaserNode extends CThing_Object {
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

  // ffdec showed `var Process_Normal = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Object.CThing_Object_LaserNode.txt @341286
  Process_Normal(): void {
  }
}
proto(CThing_Object_LaserNode, { _CLASSID_: 'CThing_Object_LaserNode' });

registerGameClass('Thing.Object.CThing_Object_LaserNode', CThing_Object_LaserNode);
