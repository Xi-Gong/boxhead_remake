// Port of assets/projects/boxhead4/DrawPrimitive/CDrawPrimitive_Line.as
import { proto } from '../../engine/runtime.ts';
import { registerGameClass } from '../packages.ts';
import { CDrawPrimitive } from './CDrawPrimitive.ts';

export class CDrawPrimitive_Line extends CDrawPrimitive {
  constructor() {
    super();
  }

  static Draw(mc: any, p1: any, p2: any, tThickness: any, tColor: any, tAlpha: any): void {
    const _loc5_ = p1.x;
    const _loc3_ = p1.y;
    const _loc4_ = p2.x;
    const _loc1_ = p2.y;
    mc.lineStyle(tThickness, tColor, tAlpha);
    mc.moveTo(_loc5_, _loc3_);
    mc.lineTo(_loc4_, _loc1_);
  }
}
proto(CDrawPrimitive_Line, { _CLASSID_: 'CDrawPrimitive_Line', _BASECLASSID_: 'CDrawPrimitive_Line' });

registerGameClass('DrawPrimitive.CDrawPrimitive_Line', CDrawPrimitive_Line);
