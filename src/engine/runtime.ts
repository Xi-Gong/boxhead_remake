/**
 * The ONLY module the AS2 game port (src/game/**) imports from the engine.
 * It mirrors the Flash Player 8 / AS2 global environment.
 *
 *   AS2                                   TS port
 *   new flash.geom.Point(1, 2)        ->  new flash.geom.Point(1, 2)
 *   new flash.display.BitmapData(..)  ->  new flash.display.BitmapData(..)
 *   new flash.filters.GlowFilter(..)  ->  new flash.filters.GlowFilter(..)
 *   _root / _global                   ->  _root / _global
 *   getTimer() / random(n) / int(x)   ->  getTimer() / random(n) / int(x)
 *   Math.random()                     ->  mathRandom()
 *   for (k in o)                      ->  for (const k of forIn(o))
 *   Object.registerClass(l, C)        ->  registerClass(l, C)
 */
import { ColorTransform, Matrix, Point, Rectangle } from './flash/geom.ts';
import { BitmapData } from './flash/BitmapData.ts';
import {
  BevelFilter, BitmapFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter,
} from './flash/filters.ts';

export { ColorTransform, Matrix, Point, Rectangle } from './flash/geom.ts';
export { BitmapData } from './flash/BitmapData.ts';
export {
  BevelFilter, BitmapFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter,
} from './flash/filters.ts';

/** `flash.*` package namespace as used by AS2 code. */
export const flash = {
  geom: { Point, Rectangle, Matrix, ColorTransform },
  display: { BitmapData },
  filters: { BitmapFilter, BlurFilter, GlowFilter, DropShadowFilter, BevelFilter, GradientGlowFilter, ColorMatrixFilter },
};

export { Button, DisplayObject, MovieClip, TextField } from './swf/DisplayObject.ts';
export { _root, registerClass, registerFrameScript } from './swf/Player.ts';
export {
  _global, ArrayFlags, AsDict, forIn, getURL, int, numberToString, proto, sortArray, sortOn, toAS2String, toNumber, ushr,
} from './flash/as2.ts';
export { frameTime, getTimer } from './flash/clock.ts';
export { mathRandom, random } from './flash/rng.ts';
export { Key, Mouse } from './flash/input.ts';
export { Sound } from './flash/Sound.ts';
export { SharedObject } from './flash/SharedObject.ts';
export { TextFormat } from './flash/TextFormat.ts';
export { ContextMenu, ContextMenuItem, LoadVars, LocalConnection } from './flash/stubs.ts';
