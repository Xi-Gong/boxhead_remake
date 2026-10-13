// Port of projects/boxhead4/Thing/Effect/CThing_Effect_SmokeCloud.as
// Statement order / member layout from generated/disasm/Thing.Effect.CThing_Effect_SmokeCloud.txt (top-level script
// @326907..@327469).
import { proto } from '../../../engine/runtime.ts';
import { DrawPrimitive, Thing, registerGameClass } from '../../packages.ts';
import { CThing_Effect } from './CThing_Effect.ts';

export class CThing_Effect_SmokeCloud extends CThing_Effect {
  /** Shared draw object cache (created by the first constructor call). */
  static mcDrawObject_Cache: any;

  constructor(tPosition?: any, tAngle?: any, tParent?: any) {
    super(tPosition, tAngle, tParent);
    if (!Thing.Effect.CThing_Effect_SmokeCloud.mcDrawObject_Cache) {
      Thing.Effect.CThing_Effect_SmokeCloud.mcDrawObject_Cache = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Effect.SmokeCloud');
    }
    this.mcDrawObject = Thing.Effect.CThing_Effect_SmokeCloud.mcDrawObject_Cache.Clone();
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
    if (this.mcDrawObject.Animate(1)) {
      this.Delete();
    }
  }

  Draw(): void {
    this.mcDrawObject.Render(this.mWorld.bmCurrentDraw, this.mWorld.GetScreenPosition(this.mPosition), 1, 100);
  }
}
proto(CThing_Effect_SmokeCloud, { _CLASSID_: 'CThing_Effect_SmokeCloud' });

registerGameClass('Thing.Effect.CThing_Effect_SmokeCloud', CThing_Effect_SmokeCloud);
