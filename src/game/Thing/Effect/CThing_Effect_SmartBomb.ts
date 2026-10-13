// Port of assets/projects/boxhead4/Thing/Effect/CThing_Effect_SmartBomb.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_SmartBomb.txt (top-level script
// @324476..@324855).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_SmartBomb extends CThing_Effect {
  constructor(tPosition?: any, tAngle?: any, tParent?: any, tLife?: any) {
    super(tPosition, tAngle, tParent);
    this.mLife = tLife != undefined ? tLife : 10;
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.mWorld.mMap.mMapwho.MoveThing(this);
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    this.Delete();
  }

  // ffdec showed `var Draw = 0;` — the bytecode defines an EMPTY function. // [BC] generated/disasm/Thing.Effect.CThing_Effect_SmartBomb.txt @324837
  Draw(): void {
  }
}
proto(CThing_Effect_SmartBomb, { _CLASSID_: 'CThing_Effect_SmartBomb' });

registerGameClass('Thing.Effect.CThing_Effect_SmartBomb', CThing_Effect_SmartBomb);
