/**
 * P3b: exhaustive premultiplication tables of Flash's BitmapData (transparent bitmaps store premultiplied ARGB).
 *   rt.<a>  round trip: setPixel32(x, 0, a<<24 | c*0x010101) then getPixel32 → red channel, for c = 0..255 (2 hex
 *           digits each, 512 chars per alpha)
 *   pm.<a>  the stored premultiplied value: the same row copied with mergeAlpha onto an OPAQUE BLACK bitmap
 *           (result = premultiplied source), red channel for c = 0..255
 * a = 0..255. Use as lookup tables (exact Flash behaviour) instead of a formula.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

export const SRC = PRELUDE + `
var BD = flash.display.BitmapData; var R = flash.geom.Rectangle; var Pt = flash.geom.Point;
var D = "0123456789ABCDEF";
function h2(v) { return D.charAt((v >> 4) & 15) + D.charAt(v & 15); }
var row = new BD(256, 1, true, 0);
var blk = new BD(256, 1, false, 0xFF000000);
var a; var c; var s; var t;
for (a = 0; a < 256; a++) {
  s = ""; t = "";
  for (c = 0; c < 256; c++) row.setPixel32(c, 0, a * 16777216 + c * 65793);
  for (c = 0; c < 256; c++) s += h2((row.getPixel32(c, 0) >> 16) & 255);
  blk.fillRect(blk.rectangle, 0xFF000000);
  blk.copyPixels(row, row.rectangle, new Pt(0, 0), null, null, true);
  for (c = 0; c < 256; c++) t += h2((blk.getPixel32(c, 0) >> 16) & 255);
  P("rt." + a, s);
  P("pm." + a, t);
}
trace("PROBE:END");
`;

export const p3b: ProbeDef = {
  id: 'p3b_premul',
  title: 'Exhaustive premultiplication tables (setPixel32/getPixel32 round trip, stored premultiplied values)',
  build: () => singleFrameSwf(compileAS(SRC)),
};

/** Parse a 512-hex-char table row into 256 numbers. */
export function parseRow(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < 256; i++) out.push(parseInt(hex.substr(i * 2, 2), 16));
  return out;
}
