/**
 * P3: BitmapData pixel addressing — copyPixels with fractional sourceRect/destPoint, getPixel with fractional
 * coordinates, setPixel32/getPixel32 premultiplication round trips, fillRect with fractional rects, mergeAlpha /
 * alphaBitmap compositing (as used by the game's decal mask), paletteMap (DrawPrimitive.InvertAlpha), draw() with
 * fractional matrix translation (bitmap and vector sources, smoothing on/off), draw colorTransform/clipRect.
 *
 * Copy results: "x,y,w,h|tl=sx:sy|br=sx:sy" = bounds of non-transparent destination pixels and which SOURCE pixel
 * landed at the top-left / bottom-right corner (source pixel (x,y) is encoded in its red/green channels).
 * Window dumps ("win:"): rows of 8-hex-digit ARGB values separated by spaces, rows separated by '/'.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

/** [label, srcX, srcY, srcW, srcH, destX, destY] */
export const COPY_CASES: [string, number, number, number, number, number, number][] = [
  ['int', 0, 0, 5, 5, 10, 10], ['dest10.5', 0, 0, 5, 5, 10.5, 10.5], ['dest10.4999', 0, 0, 5, 5, 10.4999, 10.4999],
  ['dest10.6', 0, 0, 5, 5, 10.6, 10.6], ['dest10.9999', 0, 0, 5, 5, 10.9999, 10.9999], ['dest-0.5', 0, 0, 5, 5, -0.5, -0.5],
  ['dest-1.5', 0, 0, 5, 5, -1.5, -1.5], ['dest-0.4', 0, 0, 5, 5, -0.4, -0.4], ['src0.5', 0.5, 0.5, 5, 5, 10, 10],
  ['src2.7', 2.7, 2.7, 5, 5, 10, 10], ['srcW5.5', 0, 0, 5.5, 5.5, 10, 10], ['srcW5.4', 0, 0, 5.4, 5.4, 10, 10],
  ['srcW5.6', 0, 0, 5.6, 5.6, 10, 10], ['src-0.5', -0.5, -0.5, 5, 5, 10, 10], ['src1.5_w4.5', 1.5, 1.5, 4.5, 4.5, 10, 10],
  ['src0.5_dest10.5', 0.5, 0.5, 5, 5, 10.5, 10.5], ['src0.7_w4.6_dest10.3', 0.7, 0.7, 4.6, 4.6, 10.3, 10.3],
  ['src-2_dest10', -2, -2, 5, 5, 10, 10], ['src18_overflow', 18, 18, 5, 5, 10, 10], ['dest38_overflow', 0, 0, 5, 5, 38, 38],
  ['src2.9999_w2.0002', 2.9999, 2.9999, 2.0002, 2.0002, 10, 10], ['src-0.9_w5', -0.9, -0.9, 5, 5, 10, 10],
];

const ALPHAS = [0x00, 0x01, 0x02, 0x03, 0x10, 0x3f, 0x40, 0x7f, 0x80, 0x81, 0xc0, 0xfe, 0xff];
const COLORS = [0xff8040, 0x123456, 0xffffff, 0x010203, 0x808080, 0xfefefe];

const DRAW_TX = [10, 10.5, 10.25, 10.75, 10.025, 10.05, 10.4999, 10.5001, 10.95, -0.5, 10.0249];

export const SRC = PRELUDE + `
var BD = flash.display.BitmapData; var R = flash.geom.Rectangle; var Pt = flash.geom.Point; var M = flash.geom.Matrix;
var CT = flash.geom.ColorTransform;
function rs(r) { return r.x + "," + r.y + "," + r.width + "," + r.height; }
function nz(bd) { return bd.getColorBoundsRect(0xFF000000, 0, false); }
function srcAt(c) { return ((c >> 16) & 255) / 12 + ":" + ((c >> 8) & 255) / 12; }
function win(bd, x0, y0, w, h) {
  var s = ""; var x; var y;
  for (y = y0; y < y0 + h; y++) { if (y > y0) s += "/"; for (x = x0; x < x0 + w; x++) s += (x > x0 ? " " : "") + hex8(bd.getPixel32(x, y)); }
  return s;
}
var src = new BD(20, 20, true, 0);
var x; var y;
for (y = 0; y < 20; y++) for (x = 0; x < 20; x++) src.setPixel32(x, y, 0xFF000040 + (x * 12) * 65536 + (y * 12) * 256);
function cp(label, sx, sy, sw, sh, dx, dy) {
  var d = new BD(40, 40, true, 0);
  d.copyPixels(src, new R(sx, sy, sw, sh), new Pt(dx, dy));
  var r = nz(d);
  if (r.width == 0) { P("copy:" + label, "empty"); return; }
  P("copy:" + label, rs(r) + "|tl=" + srcAt(d.getPixel32(r.x, r.y)) + "|br=" + srcAt(d.getPixel32(r.x + r.width - 1, r.y + r.height - 1)));
  d.dispose();
}
${COPY_CASES.map((c) => `cp(${JSON.stringify(c[0])}, ${c.slice(1).join(', ')});`).join('\n')}
// getPixel with fractional / out-of-range coordinates
P("getPixel:3.7,2.2", srcAt(src.getPixel(3.7, 2.2)));
P("getPixel:3.2,2.9", srcAt(src.getPixel(3.2, 2.9)));
P("getPixel:-0.5,0", hex8(src.getPixel32(-0.5, 0)));
P("getPixel:-0.5,1", hex8(src.getPixel32(-0.5, 1)));
P("getPixel:19.9,0", srcAt(src.getPixel(19.9, 0)));
P("getPixel:20,0", hex8(src.getPixel32(20, 0)));
P("getPixel:-1,0", hex8(src.getPixel32(-1, 0)));
P("getPixel:str", srcAt(src.getPixel("3", "2")));
P("getPixel32:signed", src.getPixel32(1, 1));
P("getPixel:24bit", src.getPixel(1, 1));
// setPixel32 round trip on a transparent bitmap (premultiplied storage)
var one = new BD(1, 1, true, 0);
var ai; var ci; var al = [${ALPHAS.join(', ')}]; var co = [${COLORS.join(', ')}];
for (ai = 0; ai < al.length; ai++) {
  var row = "";
  for (ci = 0; ci < co.length; ci++) { one.setPixel32(0, 0, al[ai] * 16777216 + co[ci]); row += (ci ? " " : "") + hex8(one.getPixel32(0, 0)); }
  P("setPixel32:a" + hex8(al[ai]).substr(6, 2), row);
}
var opq = new BD(1, 1, false, 0);
opq.setPixel32(0, 0, 0x80FF8040); P("opaque:setPixel32_80FF8040", hex8(opq.getPixel32(0, 0)));
opq.setPixel32(0, 0, 0x00123456); P("opaque:setPixel32_00123456", hex8(opq.getPixel32(0, 0)));
var tr = new BD(1, 1, true, 0x80FF8040); P("ctor_fill_80FF8040", hex8(tr.getPixel32(0, 0)));
tr.setPixel(0, 0, 0x123456); P("setPixel_on_80alpha", hex8(tr.getPixel32(0, 0)));
var tr0 = new BD(1, 1, true, 0); tr0.setPixel(0, 0, 0x123456); P("setPixel_on_transparent", hex8(tr0.getPixel32(0, 0)));
var opq2 = new BD(2, 2, false, 0x80FF8040); P("opaque_ctor_fill_80FF8040", hex8(opq2.getPixel32(0, 0)));
// fillRect
function fr(label, rx, ry, rw, rh) { var d = new BD(40, 40, true, 0); d.fillRect(new R(rx, ry, rw, rh), 0xFFFF0000); var r = nz(d); P("fillRect:" + label, r.width ? rs(r) : "empty"); }
fr("10.5,10.5,5.5,5.5", 10.5, 10.5, 5.5, 5.5); fr("10.4,10.6,5.4,5.6", 10.4, 10.6, 5.4, 5.6); fr("10.9,10.9,5.9,5.9", 10.9, 10.9, 5.9, 5.9);
fr("-0.5,-0.5,3,3", -0.5, -0.5, 3, 3); fr("10,10,-3,3", 10, 10, -3, 3); fr("10,10,0.5,0.5", 10, 10, 0.5, 0.5);
var fs = new BD(1, 1, true, 0); fs.fillRect(new R(0, 0, 1, 1), 0x80FF8040); P("fillRect:semi_80FF8040", hex8(fs.getPixel32(0, 0)));
// copyPixels compositing
function px(c) { var b = new BD(1, 1, true, c); return b; }
var semi = px(0x80FF0000);
var dW = new BD(1, 1, false, 0xFFFFFFFF); dW.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0)); P("copy:semi_onto_opaque_white_default", hex8(dW.getPixel32(0, 0)));
dW = new BD(1, 1, false, 0xFFFFFFFF); dW.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0), null, null, false); P("copy:semi_onto_opaque_white_merge_false", hex8(dW.getPixel32(0, 0)));
dW = new BD(1, 1, false, 0xFFFFFFFF); dW.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0), undefined, undefined, true); P("copy:semi_onto_opaque_white_merge_true", hex8(dW.getPixel32(0, 0)));
var dG = px(0xFF00FF00); dG.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0)); P("copy:semi_onto_green_default", hex8(dG.getPixel32(0, 0)));
dG = px(0xFF00FF00); dG.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0), undefined, undefined, true); P("copy:semi_onto_green_merge_true", hex8(dG.getPixel32(0, 0)));
dG = px(0x8000FF00); dG.copyPixels(semi, new R(0, 0, 1, 1), new Pt(0, 0), undefined, undefined, true); P("copy:semi_onto_semigreen_merge_true", hex8(dG.getPixel32(0, 0)));
var q40 = px(0x40336699); dG = px(0xC0FF8000); dG.copyPixels(q40, new R(0, 0, 1, 1), new Pt(0, 0), undefined, undefined, true); P("copy:40336699_onto_C0FF8000_merge", hex8(dG.getPixel32(0, 0)));
// alphaBitmap (decal-mask style: alphaPoint == destPoint, mergeAlpha true)
var red4 = new BD(4, 4, true, 0xFFFF0000);
var mask = new BD(40, 40, true, 0); mask.fillRect(new R(10, 10, 2, 4), 0x80000000); mask.fillRect(new R(12, 10, 2, 4), 0xFF000000);
var dm = new BD(40, 40, true, 0); dm.copyPixels(red4, red4.rectangle, new Pt(10, 10), mask, new Pt(10, 10), true);
P("alphaBitmap:transparent_dest", win(dm, 9, 10, 6, 1));
var dmo = new BD(40, 40, false, 0xFFFFFFFF); dmo.copyPixels(red4, red4.rectangle, new Pt(10, 10), mask, new Pt(10, 10), true);
P("alphaBitmap:opaque_dest", win(dmo, 9, 10, 6, 1));
var dmf = new BD(40, 40, true, 0); dmf.copyPixels(red4, red4.rectangle, new Pt(10.5, 10.5), mask, new Pt(10.5, 10.5), true);
P("alphaBitmap:frac_points", win(dmf, 9, 10, 6, 1));
var dmn = new BD(40, 40, true, 0); dmn.copyPixels(red4, red4.rectangle, new Pt(10, 10), mask, new Pt(10, 10), false);
P("alphaBitmap:merge_false", win(dmn, 9, 10, 6, 1));
var dmd = new BD(40, 40, true, 0); dmd.copyPixels(red4, red4.rectangle, new Pt(10, 10), mask, new Pt(10, 10));
P("alphaBitmap:merge_default", win(dmd, 9, 10, 6, 1));
var dmoff = new BD(40, 40, true, 0); dmoff.copyPixels(red4, red4.rectangle, new Pt(10, 10), mask, new Pt(0, 0), true);
P("alphaBitmap:alphaPoint_0_0", win(dmoff, 9, 10, 6, 1));
// paletteMap: DrawPrimitive.InvertAlpha
var pm = new BD(6, 1, true, 0);
pm.setPixel32(0, 0, 0x00000000); pm.setPixel32(1, 0, 0x40FF0000); pm.setPixel32(2, 0, 0x80FF0000); pm.setPixel32(3, 0, 0xFFFF0000); pm.setPixel32(4, 0, 0x01FFFFFF); pm.setPixel32(5, 0, 0xFE336699);
P("paletteMap:before", win(pm, 0, 0, 6, 1));
var inv = new Array(); var ii; for (ii = 0; ii <= 255; ii++) inv[ii] = 255 - ii << 24;
pm.paletteMap(pm, pm.rectangle, new Pt(0, 0), null, null, null, inv);
P("paletteMap:invertAlpha", win(pm, 0, 0, 6, 1));
pm.paletteMap(pm, pm.rectangle, new Pt(0, 0), null, null, null, inv);
P("paletteMap:invertAlpha_twice", win(pm, 0, 0, 6, 1));
var pmo = new BD(2, 1, false, 0xFF336699); pmo.paletteMap(pmo, pmo.rectangle, new Pt(0, 0), null, null, null, inv); P("paletteMap:invertAlpha_opaque", win(pmo, 0, 0, 2, 1));
// draw(): bitmap source with fractional translation
var red = new BD(4, 4, false, 0xFFFF0000);
function dr(label, tx, smooth) {
  var d = new BD(40, 40, true, 0);
  d.draw(red, new M(1, 0, 0, 1, tx, tx), null, null, null, smooth);
  var r = nz(d);
  P("drawBD:" + label, (r.width ? rs(r) : "empty") + "|" + win(d, Math.floor(tx) - 1, Math.floor(tx) + 1, 7, 1));
}
var txs = [${DRAW_TX.join(', ')}];
var ti;
for (ti = 0; ti < txs.length; ti++) { dr(txs[ti] + ":nosmooth", txs[ti], false); dr(txs[ti] + ":smooth", txs[ti], true); }
var dsc = new BD(40, 40, true, 0); dsc.draw(red, new M(1.5, 0, 0, 1.5, 10, 10), null, null, null, false); P("drawBD:scale1.5", rs(nz(dsc)) + "|" + win(dsc, 9, 11, 9, 1));
var dsc2 = new BD(40, 40, true, 0); dsc2.draw(red, new M(1.5, 0, 0, 1.5, 10, 10), null, null, null, true); P("drawBD:scale1.5:smooth", rs(nz(dsc2)) + "|" + win(dsc2, 9, 11, 9, 1));
// draw(): vector source (4x4 red square drawn with the drawing API at 0,0)
var vc = _root.createEmptyMovieClip("vc", 5); vc.beginFill(0xFF0000, 100); vc.moveTo(0, 0); vc.lineTo(4, 0); vc.lineTo(4, 4); vc.lineTo(0, 4); vc.lineTo(0, 0); vc.endFill();
vc._visible = false;
function dv(label, tx) {
  var d = new BD(40, 40, true, 0);
  d.draw(vc, new M(1, 0, 0, 1, tx, tx));
  var r = nz(d);
  var fx = Math.floor(tx) - 1;
  P("drawVec:" + label, (r.width ? rs(r) : "empty") + "|" + win(d, fx, fx, 7, 7));
}
for (ti = 0; ti < txs.length; ti++) dv(txs[ti], txs[ti]);
// draw() with colorTransform and clipRect
var dct = new BD(10, 10, true, 0); dct.draw(red, new M(), new CT(1, 1, 1, 0.5, 0, 0, 0, 0)); P("draw:colorTransform_alpha0.5", hex8(dct.getPixel32(1, 1)));
var dct2 = new BD(10, 10, true, 0); dct2.draw(red, new M(), new CT(0.5, 1, 1, 1, 10, 20, 30, 0)); P("draw:colorTransform_rgb", hex8(dct2.getPixel32(1, 1)));
var big = new BD(20, 20, false, 0xFF00FF00);
var dcl = new BD(40, 40, true, 0); dcl.draw(big, new M(), null, null, new R(5.5, 5.5, 4.5, 4.5)); P("draw:clipRect_5.5_4.5", rs(nz(dcl)));
var dcl2 = new BD(40, 40, true, 0); dcl2.draw(big, new M(1, 0, 0, 1, 3, 3), null, null, new R(5, 5, 4, 4)); P("draw:clipRect_dest_coords", rs(nz(dcl2)));
// in-place copy (source == dest, overlapping)
var ip = new BD(8, 1, true, 0); for (x = 0; x < 8; x++) ip.setPixel32(x, 0, 0xFF000000 + x * 16);
ip.copyPixels(ip, new R(0, 0, 6, 1), new Pt(2, 0)); P("copy:in_place_overlap_right", win(ip, 0, 0, 8, 1));
P("rectangle", rs(src.rectangle) + "|" + src.width + "|" + src.height + "|" + src.transparent);
var bad = new BD(0, 10); P("invalid_size_0", bad.width + "|" + bad.height);
var big3 = new BD(2880, 1); P("size_2880", big3.width); var big4 = new BD(2881, 1); P("size_2881", big4.width);
var frac = new BD(10.7, 3.2); P("size_fractional", frac.width + "|" + frac.height);
trace("PROBE:END");
`;

export const p3: ProbeDef = {
  id: 'p3_bitmap',
  title: 'BitmapData addressing: copyPixels/fillRect/getPixel fractional coords, premultiplied round trips, draw() offsets',
  build: () => singleFrameSwf(compileAS(SRC)),
};
