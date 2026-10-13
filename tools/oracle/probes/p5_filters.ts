/**
 * P5: filter pixel goldens (BitmapData.applyFilter in Flash Player 32), for comparison with the CPU implementation
 * in src/engine/flash/filters/apply.ts.
 *
 * Sources (64x64 transparent BitmapData):
 *   A  white 10x10 square at (27,27)        B  grey 0xFF808080 10x10 square at (27,27)
 *   D  single white pixel at (32,32) (impulse response = the blur kernel)
 *   C  8x8 "test card" at (28,28): row j alpha = 3+36j, columns vary RGB (for ColorMatrix / premultiplication)
 * For every case <key>: <key>.ret (applyFilter return), <key>.gen (generateFilterRect of the full 64x64 rect),
 * <key>.gen10 (generateFilterRect of the 10x10 content rect), <key>.nz (bounds of non-zero output pixels) and
 * <key>.rNN = row NN of the output inside .nz as space-separated 8-hex-digit ARGB values (getPixel32).
 *
 * Display-list filters (PlaceObject3 records on a sprite holding the grey square, drawn with BitmapData.draw of the
 * parent) are dumped under dl.* and
 * their AS-visible properties (mc.filters[0].*) under rb.* — this decides which RGBA comes first in a SWF BEVELFILTER
 * record and how CompositeSource maps to hideObject.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { SwfBuilder, placeObject3 } from '../swfWrite.ts';
import type { FilterRecord } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

const DEG = Math.PI / 180;

/** [key, source, AS expression creating the filter] */
export const FILTER_CASES: [string, string, string][] = [
  // blur impulse responses
  ...[1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 16].map((b): [string, string, string] => [`blurD_${b}_q1`, 'D', `new F.BlurFilter(${b}, ${b}, 1)`]),
  ['blurD_4_q2', 'D', 'new F.BlurFilter(4, 4, 2)'], ['blurD_4_q3', 'D', 'new F.BlurFilter(4, 4, 3)'], ['blurD_2_q3', 'D', 'new F.BlurFilter(2, 2, 3)'],
  ['blurD_4x2_q1', 'D', 'new F.BlurFilter(4, 2, 1)'], ['blurD_0.5_q1', 'D', 'new F.BlurFilter(0.5, 0.5, 1)'], ['blurD_3.75_q2', 'D', 'new F.BlurFilter(3.75, 3.75, 2)'],
  ['blurD_2.5_q2', 'D', 'new F.BlurFilter(2.5, 2.5, 2)'], ['blurD_4.514_q1', 'D', 'new F.BlurFilter(4.51397705078125, 4.51397705078125, 1)'],
  ['blurD_9.095_q1', 'D', 'new F.BlurFilter(9.0950927734375, 9.0950927734375, 1)'], ['blurD_1.625_q1', 'D', 'new F.BlurFilter(1.625, 1.625, 1)'],
  ['blurD_4_q0', 'D', 'new F.BlurFilter(4, 4, 0)'], ['blurD_4_q15', 'D', 'new F.BlurFilter(4, 4, 15)'],
  // blur of a square
  ['blurA_2_q1', 'A', 'new F.BlurFilter(2, 2, 1)'], ['blurA_4_q1', 'A', 'new F.BlurFilter(4, 4, 1)'], ['blurA_5_q1', 'A', 'new F.BlurFilter(5, 5, 1)'],
  ['blurA_4_q2', 'A', 'new F.BlurFilter(4, 4, 2)'], ['blurA_4_q3', 'A', 'new F.BlurFilter(4, 4, 3)'], ['blurA_5_q3', 'A', 'new F.BlurFilter(5, 5, 3)'],
  ['blurA_2_q3', 'A', 'new F.BlurFilter(2, 2, 3)'], ['blurA_3_q3', 'A', 'new F.BlurFilter(3, 3, 3)'], ['blurA_6_q1', 'A', 'new F.BlurFilter(6, 6, 1)'],
  ['blurB_4_q1', 'B', 'new F.BlurFilter(4, 4, 1)'], ['blurC_2_q1', 'C', 'new F.BlurFilter(2, 2, 1)'],
  // glow
  ['glowA_red_default', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1, false, false)'],
  ['glowA_red_inner', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1, true, false)'],
  ['glowA_red_knockout', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1, false, true)'],
  ['glowA_red_inner_knockout', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1, true, true)'],
  ['glowA_red_alpha0.5', 'A', 'new F.GlowFilter(0xFF0000, 0.5, 4, 4, 2, 1)'], ['glowA_red_strength1', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 1, 1)'],
  ['glowA_red_q3', 'A', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 3)'], ['glowA_red_blur6', 'A', 'new F.GlowFilter(0xFF0000, 1, 6, 6, 2, 1)'],
  ['glowA_xsi_black_4_2', 'A', 'new F.GlowFilter(0x000000, 1, 4, 4, 2, 1)'],
  ['glowB_black_2_4.7_q3', 'B', 'new F.GlowFilter(0x000000, 1, 2, 2, 4.69921875, 3)'],
  ['glowB_white_2_10_q1', 'B', 'new F.GlowFilter(0xFFFFFF, 1, 2, 2, 10, 1)'], ['glowB_black_2_10_q1', 'B', 'new F.GlowFilter(0x000000, 1, 2, 2, 10, 1)'],
  ['glowB_white_14_10_q3', 'B', 'new F.GlowFilter(0xFFFFFF, 1, 14, 14, 10, 3)'], ['glowB_white_0_0', 'B', 'new F.GlowFilter(0xFFFFFF, 1, 0, 0, 0, 1)'],
  ['glowC_red_default', 'C', 'new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1)'],
  // drop shadow
  ['dropA_default', 'A', 'new F.DropShadowFilter(4, 45, 0, 1, 4, 4, 1, 1)'],
  ['dropA_game_5_0.34', 'A', 'new F.DropShadowFilter(5, 45, 0, 1, 5, 5, 0.33984375, 1)'],
  ['dropA_game_-2_3_10', 'A', 'new F.DropShadowFilter(-2, 45, 0, 1, 3, 3, 10, 1)'],
  ['dropA_game_1_5_0.4375_q3', 'A', 'new F.DropShadowFilter(1, 45, 0, 1, 5, 5, 0.4375, 3)'],
  ['dropA_game_5_2_0.5', 'A', 'new F.DropShadowFilter(5, 45, 0, 1, 2, 2, 0.5, 1)'],
  ['dropA_dist1.5', 'A', 'new F.DropShadowFilter(1.5, 45, 0xFF0000, 1, 2, 2, 1, 1)'], ['dropA_dist0.5', 'A', 'new F.DropShadowFilter(0.5, 0, 0xFF0000, 1, 0, 0, 1, 1)'],
  ['dropA_dist0.6', 'A', 'new F.DropShadowFilter(0.6, 0, 0xFF0000, 1, 0, 0, 1, 1)'], ['dropA_dist2.5_angle0_noblur', 'A', 'new F.DropShadowFilter(2.5, 0, 0xFF0000, 1, 0, 0, 1, 1)'],
  ['dropA_angle30', 'A', 'new F.DropShadowFilter(4, 30, 0xFF0000, 1, 0, 0, 1, 1)'],
  ['dropA_inner', 'A', 'new F.DropShadowFilter(4, 45, 0xFF0000, 1, 4, 4, 1, 1, true)'],
  ['dropA_knockout', 'A', 'new F.DropShadowFilter(4, 45, 0xFF0000, 1, 4, 4, 1, 1, false, true)'],
  ['dropA_hideObject', 'A', 'new F.DropShadowFilter(4, 45, 0xFF0000, 1, 4, 4, 1, 1, false, false, true)'],
  ['dropA_strength2', 'A', 'new F.DropShadowFilter(4, 45, 0, 1, 4, 4, 2, 1)'],
  // bevel
  ['bevelB_roomfloor', 'B', 'new F.BevelFilter(1, 228, 0xFFFFFF, 1, 0x000000, 1, 2, 2, 0.296875, 3, "inner", false)'],
  ['bevelB_roomfloor_q1', 'B', 'new F.BevelFilter(1, 228, 0xFFFFFF, 1, 0x000000, 1, 2, 2, 0.296875, 1, "inner", false)'],
  ['bevelB_game_2_45_0.5', 'B', 'new F.BevelFilter(2, 45, 0xFFFFFF, 1, 0x000000, 1, 2, 2, 0.5, 1, "inner", false)'],
  ['bevelB_game_1_75_0.4375_q3', 'B', 'new F.BevelFilter(1, 75, 0xFFFFFF, 1, 0x000000, 1, 1, 1, 0.4375, 3, "inner", false)'],
  ['bevelB_game_outer_219', 'B', 'new F.BevelFilter(1, 219, 0xFFFFFF, 1, 0x000000, 1, 2, 2, 1.59765625, 3, "outer", false)'],
  ['bevelB_redHL_blueSH_45', 'B', 'new F.BevelFilter(2, 45, 0xFF0000, 1, 0x0000FF, 1, 2, 2, 1, 1, "inner", false)'],
  ['bevelB_redHL_blueSH_45_full', 'B', 'new F.BevelFilter(2, 45, 0xFF0000, 1, 0x0000FF, 1, 2, 2, 1, 1, "full", false)'],
  ['bevelB_redHL_blueSH_45_outer', 'B', 'new F.BevelFilter(2, 45, 0xFF0000, 1, 0x0000FF, 1, 2, 2, 1, 1, "outer", false)'],
  ['bevelB_redHL_blueSH_45_knockout', 'B', 'new F.BevelFilter(2, 45, 0xFF0000, 1, 0x0000FF, 1, 2, 2, 1, 1, "inner", true)'],
  ['bevelB_default', 'B', 'new F.BevelFilter()'], ['bevelB_dist1.5', 'B', 'new F.BevelFilter(1.5, 45, 0xFF0000, 1, 0x0000FF, 1, 2, 2, 1, 1)'],
  ['bevelB_dist-2', 'B', 'new F.BevelFilter(-2, 45, 0x333333, 1, 0x000000, 1, 0, 0, 1.19921875, 3, "inner", false)'],
  // gradient glow (Shot.Rocket symbol 673's _Contents filter, then generic)
  ['gglowA_rocket', 'A', 'new F.GradientGlowFilter(0, 342, [0xFFFF00, 0xFFFFFF], [0, 1], [0, 210], 16, 16, 2.3984375, 1, "outer", false)'],
  ['gglowA_3stop_outer', 'A', 'new F.GradientGlowFilter(0, 45, [0xFF0000, 0x00FF00, 0x0000FF], [0, 1, 1], [0, 128, 255], 4, 4, 1, 1, "outer", false)'],
  ['gglowA_3stop_inner', 'A', 'new F.GradientGlowFilter(0, 45, [0xFF0000, 0x00FF00, 0x0000FF], [0, 1, 1], [0, 128, 255], 4, 4, 1, 1, "inner", false)'],
  ['gglowA_3stop_full', 'A', 'new F.GradientGlowFilter(0, 45, [0xFF0000, 0x00FF00, 0x0000FF], [0, 1, 1], [0, 128, 255], 4, 4, 1, 1, "full", false)'],
  ['gglowA_dist3', 'A', 'new F.GradientGlowFilter(3, 45, [0xFF0000, 0x0000FF], [0, 1], [0, 255], 4, 4, 1, 1, "outer", false)'],
  // colour matrix
  ['cmC_identity', 'C', 'new F.ColorMatrixFilter([1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0])'],
  ['cmC_offset76', 'C', 'new F.ColorMatrixFilter([1,0,0,0,76, 0,1,0,0,76, 0,0,1,0,76, 0,0,0,1,0])'],
  ['cmC_offset204', 'C', 'new F.ColorMatrixFilter([1,0,0,0,204, 0,1,0,0,204, 0,0,1,0,204, 0,0,0,1,0])'],
  ['cmC_offset25.5', 'C', 'new F.ColorMatrixFilter([1,0,0,0,25.5, 0,1,0,0,25.5, 0,0,1,0,25.5, 0,0,0,1,0])'],
  ['cmC_half', 'C', 'new F.ColorMatrixFilter([0.5,0,0,0,0, 0,0.5,0,0,0, 0,0,0.5,0,0, 0,0,0,1,0])'],
  ['cmC_third_mix', 'C', 'new F.ColorMatrixFilter([0.3333,0.3333,0.3333,0,0, 0.3333,0.3333,0.3333,0,0, 0.3333,0.3333,0.3333,0,0, 0,0,0,1,0])'],
  ['cmC_alpha_half', 'C', 'new F.ColorMatrixFilter([1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,0.5,0])'],
  ['cmC_alpha_offset', 'C', 'new F.ColorMatrixFilter([1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,64])'],
  ['cmA_offset_on_transparent', 'A', 'new F.ColorMatrixFilter([1,0,0,0,50, 0,1,0,0,60, 0,0,1,0,70, 0,0,0,1,30])'],
];

/** Probe source for `cases`; `extras` adds the extent/in-place/normalisation/display-list sections. */
export function makeSrc(cases: [string, string, string][] = FILTER_CASES, extras = true, prelude = PRELUDE): string {
  return prelude + `
var BD = flash.display.BitmapData; var R = flash.geom.Rectangle; var Pt = flash.geom.Point; var F = flash.filters;
function rs(r) { return r.x + "," + r.y + "," + r.width + "," + r.height; }
function nz(bd) { return bd.getColorBoundsRect(0xFFFFFFFF, 0, false); }
function dump(key, bd) {
  var r = nz(bd);
  if (r.width == 0) { P(key + ".nz", "empty"); return; }
  P(key + ".nz", rs(r));
  var x; var y;
  for (y = r.y; y < r.y + r.height; y++) {
    var s = "";
    for (x = r.x; x < r.x + r.width; x++) s += (x > r.x ? " " : "") + hex8(bd.getPixel32(x, y));
    P(key + ".r" + y, s);
  }
}
var A = new BD(64, 64, true, 0); A.fillRect(new R(27, 27, 10, 10), 0xFFFFFFFF);
var B = new BD(64, 64, true, 0); B.fillRect(new R(27, 27, 10, 10), 0xFF808080);
var D = new BD(64, 64, true, 0); D.setPixel32(32, 32, 0xFFFFFFFF);
var C = new BD(64, 64, true, 0);
var i; var j;
for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) C.setPixel32(28 + i, 28 + j, (3 + 36 * j) * 16777216 + (i * 36) * 65536 + (255 - i * 36) * 256 + ((i * j * 37) & 255));
var SRCS = {A: A, B: B, C: C, D: D};
dump("src.C", C);
function run(key, sname, f) {
  var src = SRCS[sname];
  var d = new BD(64, 64, true, 0);
  var ret = d.applyFilter(src, src.rectangle, new Pt(0, 0), f);
  P(key + ".ret", ret);
  P(key + ".gen", rs(src.generateFilterRect(src.rectangle, f)));
  P(key + ".gen10", rs(src.generateFilterRect(new R(27, 27, 10, 10), f)));
  dump(key, d);
  d.dispose();
}
${cases.map(([k, s, e]) => `run(${JSON.stringify(k)}, ${JSON.stringify(s)}, ${e});`).join('\n')}
` + (extras ? EXTRAS : '') + '\ntrace("PROBE:END");\n';
}

const EXTRAS = `
// applyFilter with a sub-rectangle / destPoint (output extent)
var blur4 = new F.BlurFilter(4, 4, 1);
var e1 = new BD(64, 64, true, 0); e1.applyFilter(A, new R(27, 27, 10, 10), new Pt(27, 27), blur4); dump("extent.rect10_at27", e1);
var e2 = new BD(64, 64, true, 0); e2.applyFilter(A, new R(27, 27, 10, 10), new Pt(5, 5), blur4); dump("extent.rect10_at5", e2);
var e3 = new BD(64, 64, true, 0); e3.applyFilter(A, new R(22, 22, 20, 20), new Pt(22, 22), blur4); dump("extent.rect20_at22", e3);
var e4 = new BD(64, 64, true, 0); e4.applyFilter(A, new R(30, 30, 10, 10), new Pt(30, 30), blur4); dump("extent.rect_inside_square", e4);
var e5 = new BD(64, 64, true, 0); e5.applyFilter(A, new R(27.5, 27.5, 10, 10), new Pt(27.6, 27.6), blur4); dump("extent.fractional_rect_point", e5);
var dsh = new F.DropShadowFilter(4, 45, 0xFF0000, 1, 0, 0, 1, 1);
var e6 = new BD(64, 64, true, 0); e6.applyFilter(A, new R(27, 27, 10, 10), new Pt(27, 27), dsh); dump("extent.dropShadow_rect10", e6);
// in-place (source == destination), as CWorld (brightness ColorMatrix) and XSI (GlowFilter outline) do
var ipc = C.clone(); ipc.applyFilter(ipc, ipc.rectangle, new Pt(0, 0), new F.ColorMatrixFilter([1,0,0,0,204, 0,1,0,0,204, 0,0,1,0,204, 0,0,0,1,0])); dump("inplace.cmC_offset204", ipc);
var ipa = A.clone(); ipa.applyFilter(ipa, ipa.rectangle, new Pt(0, 0), new F.GlowFilter(0, 1, 4, 4, 2, 1)); dump("inplace.glowA_xsi", ipa);
var ipb = A.clone(); ipb.applyFilter(ipb, ipb.rectangle, new Pt(0, 0), new F.BlurFilter(4, 4, 1)); dump("inplace.blurA_4", ipb);
var opq = new BD(64, 64, false, 0xFF000000); opq.fillRect(new R(27, 27, 10, 10), 0xFFFFFFFF);
var opd = new BD(64, 64, false, 0xFF000000); opd.applyFilter(opq, opq.rectangle, new Pt(0, 0), new F.BlurFilter(4, 4, 1)); dump("opaque.blur4", opd);
var opd2 = new BD(64, 64, true, 0); opd2.applyFilter(opq, opq.rectangle, new Pt(0, 0), new F.GlowFilter(0xFF0000, 1, 4, 4, 2, 1)); P("opaque_src.glow.px", hex8(opd2.getPixel32(32, 32)) + " " + hex8(opd2.getPixel32(5, 5)));
// filter property normalisation (AS2 setters)
var nb = new F.BlurFilter(300, -5, 20); P("norm.blur", nb.blurX + "|" + nb.blurY + "|" + nb.quality);
var ng = new F.GlowFilter(0x1FF0000, 2, 4.3, 4.3, 300, 2.7); P("norm.glow", ng.color + "|" + ng.alpha + "|" + ng.blurX + "|" + ng.strength + "|" + ng.quality);
ng.strength = 0.296; P("norm.strength0.296", ng.strength); ng.alpha = 0.5; P("norm.alpha0.5", ng.alpha); ng.alpha = 0.3; P("norm.alpha0.3", ng.alpha);
var nbv = new F.BevelFilter(1, 590, 0, 1, 0, 1, 2, 2, 1, 1, "bogus"); P("norm.bevel", nbv.angle + "|" + nbv.type);
var ndd = new F.DropShadowFilter(4, -45); P("norm.dropAngle-45", ndd.angle);
// display-list filters from PlaceObject3 records
function rb(key, f) {
  var s = "";
  var props = ["highlightColor", "highlightAlpha", "shadowColor", "shadowAlpha", "color", "alpha", "angle", "distance", "strength", "blurX", "blurY", "quality", "type", "inner", "knockout", "hideObject", "colors", "alphas", "ratios", "matrix"];
  var k;
  for (k = 0; k < props.length; k++) if (f[props[k]] !== undefined) s += (s == "" ? "" : ";") + props[k] + ":" + f[props[k]];
  P("rb." + key, s);
}
var names = ["DL_BEVEL_RB", "DL_BEVEL_ROOM", "DL_GLOW_NOCOMP", "DL_DROP_NOCOMP", "DL_GGLOW", "DL_BLUR"];
var n;
for (n = 0; n < names.length; n++) {
  var mc = _root.attachMovie(names[n], "dl" + n, 10 + n);
  mc._visible = false;
  var fl = mc.inner.filters;
  P("rb." + names[n] + ".count", fl.length);
  rb(names[n], fl[0]);
  var bd = new BD(64, 64, true, 0); bd.draw(mc); dump("dl." + names[n], bd);
}
`;

export const SRC = makeSrc();

const RB: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

/** Display-list filter test sprites: grey 10x10 shape (char 1) placed at (27,27) inside sprite with PlaceObject3. */
export const DL_SPRITES: { name: string; filters: FilterRecord[] }[] = [
  { name: 'DL_BEVEL_RB', filters: [{ t: 'bevel', color1: RB, color2: BLUE, blurX: 2, blurY: 2, angleRad: 45 * DEG, distance: 2, strength: 1, inner: true, passes: 1 }] },
  { name: 'DL_BEVEL_ROOM', filters: [{ t: 'bevel', color1: [255, 255, 255, 255], color2: [0, 0, 0, 255], blurX: 2, blurY: 2, angleRad: 3.979339599609375, distance: 1, strength: 0.296875, inner: true, passes: 3 }] },
  { name: 'DL_GLOW_NOCOMP', filters: [{ t: 'glow', color: [255, 0, 0, 255], blurX: 4, blurY: 4, strength: 2, compositeSource: false, passes: 1 }] },
  { name: 'DL_DROP_NOCOMP', filters: [{ t: 'dropShadow', color: [255, 0, 0, 255], blurX: 0, blurY: 0, angleRad: 0, distance: 3, strength: 1, compositeSource: false, passes: 1 }] },
  { name: 'DL_GGLOW', filters: [{ t: 'gradientGlow', colors: [[255, 255, 0, 0], [255, 255, 255, 255]], ratios: [0, 210], blurX: 16, blurY: 16, angleRad: 5.969024658203125, distance: 0, strength: 2.3984375, passes: 1 }] },
  { name: 'DL_BLUR', filters: [{ t: 'blur', blurX: 4, blurY: 4, passes: 1 }] },
];

export const p5: ProbeDef = {
  id: 'p5_filters',
  title: 'Filter pixel goldens: Blur/Glow/DropShadow/Bevel/GradientGlow/ColorMatrix via applyFilter and PlaceObject3',
  timeoutMs: 120000,
  build: () => buildP5(SRC),
};

export function buildP5(src: string): Uint8Array {
    const b = new SwfBuilder({ width: 640, height: 480, frameRate: 30 }).fileAttributes(0).backgroundColor(0xffffff).scriptLimits(1000, 60);
    b.defineRectShape({ id: 1, x: 0, y: 0, w: 10, h: 10, fill: 0x808080 });
    // shapes are not scriptable: wrap the shape in a sprite so the filtered placement is a MovieClip (mc.inner)
    b.defineSprite(2, [[placeObject3({ depth: 1, charId: 1 })]]);
    const exports: { id: number; name: string }[] = [];
    DL_SPRITES.forEach((s, i) => {
      const id = 10 + i;
      b.defineSprite(id, [[placeObject3({ depth: 1, charId: 2, name: 'inner', matrix: { tx: 27, ty: 27 }, filters: s.filters })]]);
      exports.push({ id, name: s.name });
    });
    b.exportAssets(exports);
    b.doAction(compileAS(src)).showFrame();
    return b.build();
}
