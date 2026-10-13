// P3 / P3b: BitmapData pixel semantics (Flash Player 32). The engine's BitmapData needs a canvas (Node runs it
// headless), so pixel paths are compared through lane C's pure helpers (src/engine/flash/color.ts); the remaining
// P3 facts are asserted on the golden as executable documentation for lane C.
import { describe, expect, it } from 'vitest';
import { premul, unpremul } from '../../../src/engine/flash/color.ts';
import { golden } from './golden.ts';
import { parseRow } from '../../../tools/oracle/probes/p3b_premul.ts';

const T = () => golden('p3b_premul').results;
/** Flash's un-premultiply (fitted to all 32,639 distinct (stored value, alpha) pairs of P3b). */
const flashUnpremul = (p: number, a: number): number => (a === 0 ? 0 : Math.min(255, (p * Math.floor(65280 / a) + 127) >> 8));

describe('P3b premultiplication tables', () => {
  it('stored (premultiplied) value = round(c * a / 255) — engine color.premul matches exactly', () => {
    for (let a = 0; a < 256; a++) {
      const pm = parseRow(T()[`pm.${a}`]!);
      for (let c = 0; c < 256; c++) expect(premul(c, a), `a=${a} c=${c}`).toBe(pm[c]);
    }
  });
  it('getPixel32 un-premultiplies with min(255, (p * floor(65280 / a) + 127) >> 8)', () => {
    for (let a = 1; a < 256; a++) {
      const pm = parseRow(T()[`pm.${a}`]!), rt = parseRow(T()[`rt.${a}`]!);
      for (let c = 0; c < 256; c++) expect(flashUnpremul(pm[c]!, a), `a=${a} c=${c}`).toBe(rt[c]);
    }
    expect(parseRow(T()['rt.0']!).every((v) => v === 0)).toBe(true);
  });
  // color.unpremul uses Flash's reciprocal form (lane P); canvas writes keep the lossless unpremulRound.
  it('engine color.unpremul equals Flash\'s un-premultiply', () => {
    for (let a = 1; a < 255; a++) for (let p = 0; p <= a; p++) expect(unpremul(p, a)).toBe(flashUnpremul(p, a));
  });
});

describe('P3 BitmapData facts (Flash Player 32 == FP28 == FP8)', () => {
  const r = () => golden('p3_bitmap').results;
  it('copyPixels truncates sourceRect fields and destPoint toward zero (no sub-pixel placement)', () => {
    expect(r()['copy:dest10.9999']).toBe('10,10,5,5|tl=0:0|br=4:4');
    expect(r()['copy:dest-0.5']).toBe('0,0,5,5|tl=0:0|br=4:4');
    expect(r()['copy:dest-1.5']).toBe('0,0,4,4|tl=1:1|br=4:4');
    expect(r()['copy:src2.7']).toBe('10,10,5,5|tl=2:2|br=6:6');
    expect(r()['copy:srcW5.6']).toBe('10,10,5,5|tl=0:0|br=4:4');
    expect(r()['copy:src-0.9_w5']).toBe('10,10,5,5|tl=0:0|br=4:4');
  });
  it('fillRect / getPixel / draw clipRect truncate too', () => {
    expect(r()['fillRect:10.9,10.9,5.9,5.9']).toBe('10,10,5,5');
    expect(r()['getPixel:3.7,2.2']).toBe('3:2');
    expect(r()['getPixel:-0.5,0']).toBe('FF000040'); // pixel (0,0)
    expect(r()['draw:clipRect_5.5_4.5']).toBe('5,5,4,4');
  });
  it('draw() of a BitmapData at a fractional translation is NOT snapped: edges get quarter-pixel coverage (4x4 AA grid)', () => {
    // smoothing true/false identical; tx quantised DOWN to 1/4 px: 10.4999 -> 10.25, 10.95 -> 10.75, 10.05 -> 10
    expect(r()['drawBD:10.5:nosmooth']).toBe('10,10,5,5|00000000 7FFF0000 FFFF0000 FFFF0000 FFFF0000 7FFF0000 00000000');
    expect(r()['drawBD:10.25:nosmooth']).toBe('10,10,5,5|00000000 BFFE0000 FFFF0000 FFFF0000 FFFF0000 3FFF0000 00000000');
    expect(r()['drawBD:10.4999:nosmooth']).toBe(r()['drawBD:10.25:nosmooth']);
    expect(r()['drawBD:10.95:smooth']).toBe(r()['drawBD:10.75:nosmooth']);
    expect(r()['drawBD:10.05:nosmooth']).toBe(r()['drawBD:10:nosmooth']);
  });
  it('copyPixels compositing rules', () => {
    expect(r()['copy:semi_onto_opaque_white_default']).toBe('FFFF7F7F'); // into an opaque bitmap: always blended
    expect(r()['copy:semi_onto_green_default']).toBe('80FF0000'); // transparent target, mergeAlpha default false: replaced
    expect(r()['copy:semi_onto_green_merge_true']).toBe('FF807F00');
    expect(r()['alphaBitmap:merge_default']).toBe(r()['alphaBitmap:transparent_dest']); // alphaBitmap given: mergeAlpha defaults to true
    expect(r()['copy:in_place_overlap_right']).toBe('FF000000 FF000010 FF000000 FF000010 FF000020 FF000030 FF000040 FF000050');
  });
  it('paletteMap InvertAlpha (DrawPrimitive.InvertAlpha) on un-premultiplied source values', () => {
    expect(r()['paletteMap:invertAlpha']).toBe('FF000000 BFFE0000 7FFF0000 00000000 FEFFFFFF 010000FF');
  });
  it('setPixel / constructor fill / opaque bitmaps', () => {
    expect(r()['setPixel_on_transparent']).toBe('00000000');
    expect(r()['setPixel_on_80alpha']).toBe('80123456');
    expect(r()['opaque:setPixel32_80FF8040']).toBe('FFFF8040');
    expect(r()['ctor_fill_80FF8040']).toBe('80FF7F40');
  });
  it('size limits: 2880 px max; invalid sizes yield an object WITHOUT width/height (undefined, not -1)', () => {
    expect(r()['size_2880']).toBe('2880');
    expect(r()['size_2881']).toBe('undefined');
    expect(r()['invalid_size_0']).toBe('undefined|undefined');
    expect(r()['size_fractional']).toBe('10|3');
  });
});
