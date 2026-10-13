/**
 * P4: getBounds / _width of stroked shapes (SWF DefineShape vs drawing API), nested scaled/rotated clips, and which
 * properties BitmapData.draw(mc) ignores (own matrix, _alpha, _visible, filters, colour transform) vs applies
 * (children's).
 *
 * SWF-defined shapes (DefineShape) — sprite exports:
 *   S1: rect (0,0)-(100,50), red fill + 4px black stroke, tag ShapeBounds = correct (-2,-2)-(102,52)
 *   S2: same edges, tag ShapeBounds overridden to (-50,-50)-(200,200)  → does Flash trust the tag?
 *   S3: same rect, fill only
 *   S4: same rect, 1px stroke only
 *   NEST: S1 placed with matrix scale 2, translate (10,5)
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { SwfBuilder, placeObject2 } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

export const SRC = PRELUDE + `
var BD = flash.display.BitmapData; var CT = flash.geom.ColorTransform; var GF = flash.filters.GlowFilter;
function b4(mc, t) { var b = mc.getBounds(t); return b.xMin + "," + b.yMin + "," + b.xMax + "," + b.yMax; }
function rs(r) { return r.x + "," + r.y + "," + r.width + "," + r.height; }
function rect(mc, x, y, w, h) { mc.moveTo(x, y); mc.lineTo(x + w, y); mc.lineTo(x + w, y + h); mc.lineTo(x, y + h); mc.lineTo(x, y); }
var names = ["S1", "S2", "S3", "S4", "NEST"]; var i;
for (i = 0; i < names.length; i++) {
  var s = _root.attachMovie(names[i], "a" + names[i], 100 + i);
  P("tag:" + names[i], b4(s, s) + "|wh=" + s._width + "," + s._height);
}
P("tag:NEST_inner_in_nest", b4(_root.aNEST.inner, _root.aNEST));
_root.aS1._xscale = 50; _root.aS1._rotation = 30; P("tag:S1_scaled_rotated_in_root", b4(_root.aS1, _root) + "|wh=" + _root.aS1._width + "," + _root.aS1._height);
// drawing API
var dn = 200;
function api(label, thick, fill) {
  var d = _root.createEmptyMovieClip("api" + dn, dn++);
  if (thick != null) d.lineStyle(thick, 0, 100);
  if (fill) d.beginFill(0xFF0000, 100);
  rect(d, 0, 0, 100, 50);
  if (fill) d.endFill();
  P("api:" + label, b4(d, d) + "|wh=" + d._width + "," + d._height);
  return d;
}
api("stroke4_fill", 4, true); api("stroke4", 4, false); api("stroke1", 1, false); api("stroke0_hairline", 0, false);
api("fill_only", null, true); api("stroke3", 3, false); api("stroke5.5", 5.5, false); api("stroke255", 255, false); api("stroke300", 300, false);
var dg = _root.createEmptyMovieClip("diag", dn++); dg.lineStyle(4, 0, 100); dg.moveTo(0, 0); dg.lineTo(100, 50); P("api:diag_stroke4", b4(dg, dg));
var cv = _root.createEmptyMovieClip("curve", dn++); cv.lineStyle(0, 0, 100); cv.moveTo(0, 0); cv.curveTo(50, -50, 100, 0); P("api:curve_ctrl_above", b4(cv, cv));
var cvf = _root.createEmptyMovieClip("curvef", dn++); cvf.beginFill(0); cvf.moveTo(0, 0); cvf.curveTo(50, -50, 100, 0); cvf.lineTo(0, 0); cvf.endFill(); P("api:curve_fill", b4(cvf, cvf));
var pt = _root.createEmptyMovieClip("pt", dn++); pt.lineStyle(10, 0, 100); pt.moveTo(5, 5); pt.lineTo(5, 5); P("api:point_stroke10", b4(pt, pt));
var cap = _root.createEmptyMovieClip("cap", dn++); cap.lineStyle(10, 0, 100, false, "normal", "none", "miter", 3); cap.moveTo(0, 0); cap.lineTo(100, 0); P("api:capsNone_stroke10", b4(cap, cap));
var cap2 = _root.createEmptyMovieClip("cap2", dn++); cap2.lineStyle(10, 0, 100, false, "normal", "square", "miter", 3); cap2.moveTo(0, 0); cap2.lineTo(100, 0); P("api:capsSquare_stroke10", b4(cap2, cap2));
var mit = _root.createEmptyMovieClip("mit", dn++); mit.lineStyle(10, 0, 100, false, "normal", "none", "miter", 10); mit.moveTo(0, 0); mit.lineTo(100, 0); mit.lineTo(0, 10); P("api:miter_sharp_stroke10", b4(mit, mit));
var frc = _root.createEmptyMovieClip("frc", dn++); frc.beginFill(0); rect(frc, 0.333, 0.666, 10.01, 10.02); frc.endFill(); P("api:fractional_rect", b4(frc, frc));
var em = _root.createEmptyMovieClip("em", dn++); P("empty_clip", b4(em, em) + "|wh=" + em._width + "," + em._height);
P("empty_clip_in_root", b4(em, _root));
// nested scaled / rotated
var p = _root.createEmptyMovieClip("p", dn++); var ch = p.createEmptyMovieClip("ch", 1);
ch.beginFill(0); rect(ch, 0, 0, 10, 10); ch.endFill();
ch._xscale = 200; ch._x = 10; p._xscale = 50; p._x = 100;
P("nested:p_in_p", b4(p, p)); P("nested:p_in_root", b4(p, _root)); P("nested:ch_in_root", b4(ch, _root)); P("nested:p_in_ch", b4(p, ch)); P("nested:ch_in_ch", b4(ch, ch));
P("nested:wh", p._width + "," + p._height + "|" + ch._width + "," + ch._height);
ch._rotation = 45; P("nested:rot45:p_in_p", b4(p, p)); P("nested:rot45:p_in_root", b4(p, _root)); P("nested:rot45:ch_in_root", b4(ch, _root));
ch._rotation = 0;
var ch2 = p.createEmptyMovieClip("ch2", 2); ch2._x = 50; ch2._y = 50; P("nested:empty_sibling_ignored", b4(p, p));
p.getBounds(); P("nested:no_target_arg", b4(p) + "");
// filters do not change bounds
var fm = _root.createEmptyMovieClip("fm", dn++); fm.beginFill(0xFF0000); rect(fm, 0, 0, 20, 20); fm.endFill();
fm.filters = [new GF(0x00FF00, 1, 10, 10, 2, 1)]; P("filters:bounds_with_glow", b4(fm, fm) + "|wh=" + fm._width + "," + fm._height);
// BitmapData.draw(mc): what is ignored
var dm = _root.createEmptyMovieClip("dm", dn++);
dm.beginFill(0xFF0000); rect(dm, 5, 5, 10, 10); dm.endFill();
dm._x = 30; dm._y = 7;
function dd(label, px, py) {
  var bd = new BD(60, 60, true, 0); bd.draw(dm);
  var r = bd.getColorBoundsRect(0xFF000000, 0, false);
  P("draw:" + label, rs(r) + "|px=" + hex8(bd.getPixel32(px, py)));
  bd.dispose();
}
dd("base_x30", 10, 10);
dm._alpha = 50; dd("own_alpha50", 10, 10); dm._alpha = 100;
dm._visible = false; dd("own_invisible", 10, 10); dm._visible = true;
dm.filters = [new GF(0x00FF00, 1, 8, 8, 2, 1)]; dd("own_glow", 3, 10); dm.filters = [];
dm._xscale = 200; dm._rotation = 10; dd("own_scale_rotation", 10, 10); dm._xscale = 100; dm._rotation = 0;
var tf = new flash.geom.Transform(dm); tf.colorTransform = new CT(0, 0, 0, 1, 0, 0, 255, 0); dd("own_colorTransform", 10, 10); tf.colorTransform = new CT();
dm.blendMode = "multiply"; dd("own_blendMode_multiply", 10, 10); dm.blendMode = "normal";
dm.cacheAsBitmap = true; dd("own_cacheAsBitmap", 10, 10); dm.cacheAsBitmap = false;
var dc = dm.createEmptyMovieClip("dc", 1); dc.beginFill(0x00FF00); rect(dc, 20, 20, 4, 4); dc.endFill();
dd("child_base", 21, 21);
dc._alpha = 50; dd("child_alpha50", 21, 21); dc._alpha = 100;
dc._visible = false; dd("child_invisible", 21, 21); dc._visible = true;
dc.filters = [new GF(0x0000FF, 1, 4, 4, 2, 1)]; dd("child_glow", 19, 21); dc.filters = [];
dc._x = 5; dd("child_x5", 26, 21); dc._x = 0;
var tc = new flash.geom.Transform(dc); tc.colorTransform = new CT(0, 0, 0, 1, 0, 0, 255, 0); dd("child_colorTransform", 21, 21); tc.colorTransform = new CT();
dc.blendMode = "add"; dd("child_blendMode_add", 21, 21); dc.blendMode = "normal";
// draw of an invisible top-level clip that contains a visible child (CWorld_Init_Piece case)
var pc = _root.createEmptyMovieClip("pc", dn++); pc._visible = false; var pcc = pc.createEmptyMovieClip("c", 1); pcc.beginFill(0xFF); rect(pcc, 0, 0, 3, 3); pcc.endFill();
var bdp = new BD(10, 10, true, 0); bdp.draw(pc); P("draw:invisible_parent_visible_child", hex8(bdp.getPixel32(1, 1)));
trace("PROBE:END");
`;

export function buildP4(src: string = SRC): Uint8Array {
  const b = new SwfBuilder({ width: 640, height: 480, frameRate: 30 }).fileAttributes(0).backgroundColor(0xffffff).scriptLimits(1000, 60);
  b.defineRectShape({ id: 1, x: 0, y: 0, w: 100, h: 50, fill: 0xff0000, lineWidth: 4, lineColor: 0 });
  b.defineRectShape({ id: 2, x: 0, y: 0, w: 100, h: 50, fill: 0xff0000, lineWidth: 4, lineColor: 0, boundsOverride: { xMin: -50, xMax: 200, yMin: -50, yMax: 200 } });
  b.defineRectShape({ id: 3, x: 0, y: 0, w: 100, h: 50, fill: 0xff0000 });
  b.defineRectShape({ id: 4, x: 0, y: 0, w: 100, h: 50, fill: null, lineWidth: 1, lineColor: 0 });
  for (let i = 0; i < 4; i++) b.defineSprite(10 + i, [[placeObject2({ depth: 1, charId: 1 + i })]]);
  b.defineSprite(14, [[placeObject2({ depth: 1, charId: 10, name: 'inner', matrix: { a: 2, d: 2, tx: 10, ty: 5 } })]]);
  b.exportAssets([{ id: 10, name: 'S1' }, { id: 11, name: 'S2' }, { id: 12, name: 'S3' }, { id: 13, name: 'S4' }, { id: 14, name: 'NEST' }]);
  b.doAction(compileAS(src)).showFrame();
  return b.build();
}

export const p4: ProbeDef = {
  id: 'p4_bounds',
  title: 'getBounds/_width of stroked shapes (tag vs drawing API), nested clips, what BitmapData.draw(mc) ignores',
  build: () => buildP4(),
};
