// Port of assets/projects/boxhead4/DrawPrimitive/CDrawPrimitive_Square.as
import { proto } from '../../engine/runtime.ts';
import { registerGameClass } from '../packages.ts';
import { CDrawPrimitive } from './CDrawPrimitive.ts';

export class CDrawPrimitive_Square extends CDrawPrimitive {
  constructor() {
    super();
  }

  static Draw(mc: any, p: any, s: any, tColor?: any, tAlpha?: any, tSolid?: any): void {
    tSolid = tSolid != undefined ? tSolid : false;
    tColor = tColor != undefined ? tColor : 65280;
    tAlpha = tAlpha != undefined ? tAlpha : 100;
    const _loc3_ = p.x;
    const _loc2_ = p.y;
    if (tSolid) {
      mc.beginFill(tColor, tAlpha);
    }
    mc.lineStyle(1, tColor != undefined ? tColor : 65280, tAlpha);
    mc.moveTo(_loc3_, _loc2_);
    mc.lineTo(_loc3_ + s, _loc2_);
    mc.lineTo(_loc3_ + s, _loc2_ + s);
    mc.lineTo(_loc3_, _loc2_ + s);
    mc.lineTo(_loc3_, _loc2_);
    if (tSolid) {
      mc.endFill();
    }
  }
}
proto(CDrawPrimitive_Square, { _CLASSID_: 'CDrawPrimitive_Square', _BASECLASSID_: 'CDrawPrimitive_Square' });

registerGameClass('DrawPrimitive.CDrawPrimitive_Square', CDrawPrimitive_Square);
