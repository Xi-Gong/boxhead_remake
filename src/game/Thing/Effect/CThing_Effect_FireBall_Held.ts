// Port of assets/projects/boxhead4/Thing/Effect/CThing_Effect_FireBall_Held.as (not used by the shipped game)
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_FireBall_Held.txt (top-level script
// @316090..@316682).
import { proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_FireBall_Held extends CThing_Effect {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    if (!Thing.Effect.CThing_Effect_FireBall_Held.mcDrawObject_Cache) {
      Thing.Effect.CThing_Effect_FireBall_Held.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Effect.FireBall');
    }
    this.mcDrawObject = Thing.Effect.CThing_Effect_FireBall_Held.mcDrawObject_Cache.Clone();
    this.mcDrawObject.Animate_Random();
    this.mDelta = this.mAngle.__get__mDelta().ScaleN(0.5).Invert();
    this.Process = this.Process_Init;
  }

  toString(): string {
    return this._CLASSID_;
  }

  Dispose(): void {
    super.Dispose();
  }

  Process_Init(): void {
    this.Process = this.Process_Normal;
    this.Process();
  }

  Process_Normal(): void {
    this.mcDrawObject.Animate_Cycle(1);
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Effect_FireBall_Held, { _CLASSID_: 'CThing_Effect_FireBall_Held' });

registerGameClass('Thing.Effect.CThing_Effect_FireBall_Held', CThing_Effect_FireBall_Held);
