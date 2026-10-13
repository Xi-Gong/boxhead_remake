// Port of assets/projects/boxhead4/DrawPrimitive/XSI/CDrawPrimitive_XSI.as
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CDrawPrimitive } from '../CDrawPrimitive.ts';

export class CDrawPrimitive_XSI extends CDrawPrimitive {
  /** Own static (AS2 statics are not inherited): rasterisation scale of XSI characters (style sheet mScale). */
  static override mGlobalScale = 0.35;
  /** Target bitmap of CDrawPrimitive_XSI_Animation._Render — assigned by the world (lane F3), never here. */
  static bmDraw: any;

  constructor() {
    super();
  }
}
proto(CDrawPrimitive_XSI, { _CLASSID_: 'CDrawPrimitive_XSI', _BASECLASSID_: 'CDrawPrimitive_XSI' });

registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI', CDrawPrimitive_XSI);
