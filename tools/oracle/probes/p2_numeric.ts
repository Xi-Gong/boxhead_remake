/**
 * P2: numeric storage of MovieClip properties — _alpha (8.8 colour transform), _x/_y (twips), _xscale/_yscale,
 * _rotation normalisation, _width/_height of a drawn square.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

const list = (xs: number[]): string => `[${xs.map((x) => (Object.is(x, -0) ? '-0' : String(x))).join(', ')}]`;

export const ALPHA_VALUES = [8.8, 99.9, 50.5, 0.3, 0.39, 0.4, 0.2, 0.1, 100.5, 101, 150, 255, 256, 1000, -10, -0.5, 33.333333, 12.5, 99.6, 99.61, 0.390625, 0.39063];
export const XY_VALUES = [1.23, 1.26, -0.03, 0.025, 0.024, 0.026, 0.075, 0.125, -0.025, -0.075, 1.025, 1.075, 12.345,
  1000.01, 2.5, -2.5, 0.0125, 0.0375, 0.049999, 0.05, -0.024, -0.026, 0.975, 107374182.35, 107374182.4, 1e9, -1e9, 0.3333333, 2.675];
export const SCALE_VALUES = [33.3, 50.123456, 0.1, 100.0001, -50, 0, 1e-5, 33.33333333, 1e6, -0.001, 99.99, 0.0015259, 0.00152, 12345.678];
export const ROT_VALUES = [0, 45, 180, 190, 270, 360, 359.9, -45, -180, -190, 540, 720.5, 33.33, -0.0001, 179.99999, 1e6, 90.123456789, -720, 0.001];

export const SRC = PRELUDE + `
var m = _root.createEmptyMovieClip("m", 1);
var s = ""; var i;
for (i = 0; i <= 100; i++) { m._alpha = i; s += (i ? "," : "") + m._alpha; }
P("alpha_0_100", s);
var av = ${list(ALPHA_VALUES)};
for (i = 0; i < av.length; i++) { m._alpha = av[i]; P("alpha:" + av[i], m._alpha); }
m._alpha = 100;
var xv = ${list(XY_VALUES)};
for (i = 0; i < xv.length; i++) { m._x = xv[i]; m._y = xv[i]; P("x:" + xv[i], m._x + "|" + m._y); }
m._x = 0; m._y = 0;
m._x = 10; m._x += 0.01; m._x += 0.01; m._x += 0.01; P("x_accumulate_0.01x3", m._x);
m._x = 0; for (i = 0; i < 20; i++) m._x += 0.04; P("x_accumulate_0.04x20", m._x);
m._x = 0;
var sv = ${list(SCALE_VALUES)};
for (i = 0; i < sv.length; i++) { m._xscale = sv[i]; m._yscale = sv[i]; P("scale:" + sv[i], m._xscale + "|" + m._yscale); }
m._xscale = 100; m._yscale = 100;
var rv = ${list(ROT_VALUES)};
for (i = 0; i < rv.length; i++) { m._rotation = rv[i]; P("rotation:" + rv[i], m._rotation); }
m._rotation = 0;
// rotation + scale interplay (matrix decomposition)
m._xscale = 50; m._rotation = 30; P("rot30_xs50", m._rotation + "|" + m._xscale + "|" + m._yscale);
m._rotation = 0; m._xscale = 100;
// drawn 100x100 square: _width/_height
var q = _root.createEmptyMovieClip("q", 2);
q.beginFill(0xFF0000, 100); q.moveTo(0, 0); q.lineTo(100, 0); q.lineTo(100, 100); q.lineTo(0, 100); q.lineTo(0, 0); q.endFill();
P("square_wh", q._width + "|" + q._height);
q._width = 33.33; P("square_width33.33", q._width + "|" + q._xscale);
q._width = 0.04; P("square_width0.04", q._width + "|" + q._xscale);
q._xscale = 100; q._rotation = 45; P("square_rot45_wh", q._width + "|" + q._height);
q._rotation = 0; q._x = 0.333; q._y = 0.666; P("square_frac_pos_wh", q._width + "|" + q._height + "|" + q._x + "|" + q._y);
var b = q.getBounds(_root); P("square_frac_pos_bounds", b.xMin + "," + b.yMin + "," + b.xMax + "," + b.yMax);
// _alpha via Color / transform
m._alpha = 50; var ct = new flash.geom.Transform(m).colorTransform; P("alpha50_colorTransform", ct.alphaMultiplier + "|" + ct.alphaOffset);
m._alpha = 8.8; ct = new flash.geom.Transform(m).colorTransform; P("alpha8.8_colorTransform", ct.alphaMultiplier);
m._visible = 0; P("visible_0", m._visible); m._visible = "false"; P("visible_str_false", m._visible); m._visible = ""; P("visible_empty", m._visible);
// non-numeric assignments
m._x = 5; m._x = "abc"; P("x_nan_string", m._x); m._x = undefined; P("x_undefined", m._x); m._x = "12.5"; P("x_numeric_string", m._x);
m._alpha = "abc"; P("alpha_nan", m._alpha);
trace("PROBE:END");
`;

export const p2: ProbeDef = {
  id: 'p2_numeric',
  title: 'MovieClip numeric storage: _alpha, _x/_y, _xscale, _rotation, _width',
  build: () => singleFrameSwf(compileAS(SRC)),
};
