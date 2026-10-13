// P5: engine CPU filters (src/engine/flash/filters/apply.ts, lane C) vs Flash Player 32 applyFilter pixels.
// Sources are rebuilt exactly as in tools/oracle/probes/p5_filters.ts (64x64, premultiplied), outputs compared in
// premultiplied space: alpha and colour channels within ±2 (the golden is un-premultiplied by getPixel32).
// `it.fails` = measured deviation (see KNOWN_FILTER_MISMATCH); flip to `it` when fixed.
import { describe, expect, it } from 'vitest';
import * as F from '../../../src/engine/flash/filters.ts';
import { applyFilterToPixels } from '../../../src/engine/flash/filters/apply.ts';
import { FILTER_CASES } from '../../../tools/oracle/probes/p5_filters.ts';
import { golden, pixelGrid } from './golden.ts';

const W = 64;
type Px = { data: Uint8ClampedArray; width: number; height: number };
const mk = (): Px => ({ data: new Uint8ClampedArray(W * W * 4), width: W, height: W });
function set(p: Px, x: number, y: number, argb: number): void {
  const a = argb >>> 24, i = (y * W + x) * 4;
  p.data[i] = Math.round(((argb >>> 16) & 255) * a / 255);
  p.data[i + 1] = Math.round(((argb >>> 8) & 255) * a / 255);
  p.data[i + 2] = Math.round((argb & 255) * a / 255);
  p.data[i + 3] = a;
}
function sources(): Record<string, Px> {
  const A = mk(), B = mk(), C = mk(), D = mk();
  for (let y = 27; y < 37; y++) for (let x = 27; x < 37; x++) { set(A, x, y, 0xffffffff); set(B, x, y, 0xff808080); }
  set(D, 32, 32, 0xffffffff);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) set(C, 28 + i, 28 + j, ((3 + 36 * j) * 16777216 + (i * 36) * 65536 + (255 - i * 36) * 256 + ((i * j * 37) & 255)) >>> 0);
  return { A, B, C, D };
}

/** Max |difference| of alpha / premultiplied colour between engine output and the Flash golden. */
function diff(key: string, out: Px): { a: number; c: number; where: string } {
  const g = pixelGrid(golden('p5_filters').results, key, W, W);
  let a = 0, c = 0, where = '';
  for (let i = 0; i < W * W; i++) {
    const ga = g[i]! >>> 24, da = Math.abs(ga - out.data[i * 4 + 3]!);
    if (da > a) { a = da; where = `(${i % W},${Math.floor(i / W)}) flash=${g[i]!.toString(16).padStart(8, '0')}`; }
    for (let k = 0; k < 3; k++) c = Math.max(c, Math.abs(Math.round(((g[i]! >>> (16 - 8 * k)) & 255) * ga / 255) - out.data[i * 4 + k]!));
  }
  return { a, c, where };
}

// Cases whose engine output still differs by more than ±2 (lane P fitted the model, see the MODEL comment in
// src/engine/flash/filters/apply.ts): an outer bevel at strength ~1.6 (±3 on 32 pixels; residual fixed-point detail of
// Flash's bevel sampling), and a ColorMatrix with offsets on FULLY TRANSPARENT pixels (Flash writes position-dependent
// colour garbage there; alpha matches). The other 39 former mismatches were fixed by lane P (HHVV pass order,
// exact fractional tap weight, 1/256 bilinear offsets, inverted-alpha inner glow, fixed-point compositing).
export const KNOWN_FILTER_MISMATCH = new Set([
  'bevelB_game_outer_219', 'cmA_offset_on_transparent',
]);

describe('P5 applyFilter pixels: engine vs Flash Player 32 (±2)', () => {
  const S = sources();
  for (const [key, src, expr] of FILTER_CASES) {
    const run = () => {
      const f = Function('F', `return ${expr}`)(F) as F.BitmapFilter;
      const d = diff(key, applyFilterToPixels(S[src]!, f, 1));
      expect(`a=${d.a} c=${d.c} ${d.where}`).toMatch(/^a=[012] c=[012] /);
    };
    if (KNOWN_FILTER_MISMATCH.has(key)) it.fails(`${key} — known residual (see KNOWN_FILTER_MISMATCH)`, run);
    else it(key, run);
  }
});

describe('P5 facts for lane C / extractor', () => {
  const r = () => golden('p5_filters').results;
  it('first RGBA of a SWF BEVELFILTER record is the HIGHLIGHT colour; CompositeSource=0 means hideObject', () => {
    expect(r()['rb.DL_BEVEL_RB']).toMatch(/^highlightColor:16711680;highlightAlpha:1;shadowColor:255;/);
    expect(r()['rb.DL_DROP_NOCOMP']).toMatch(/hideObject:true$/);
  });
  it('generateFilterRect inflates by ceil(blur * quality / 2) per side for quality 1..3', () => {
    for (const [key, b, q] of [['blurD_2_q1', 2, 1], ['blurD_2.5_q1', 2.5, 1], ['blurD_5_q1', 5, 1], ['blurD_9.095_q1', 9.0950927734375, 1], ['blurD_4_q2', 4, 2], ['blurD_3.75_q2', 3.75, 2], ['blurD_4_q3', 4, 3]] as const) {
      const pad = Math.ceil((b * q) / 2);
      expect(r()[`${key}.gen10`], key).toBe(`${27 - pad},${27 - pad},${10 + 2 * pad},${10 + 2 * pad}`);
    }
    expect(r()['blurD_4_q0.gen10']).toBe('27,27,10,10');
    expect(r()['blurD_4_q15.gen10']).toBe('13,13,38,38');
  });
  it('display-list filters (PlaceObject3, drawn with BitmapData.draw) equal applyFilter output', () => {
    const g = r();
    for (const k of Object.keys(g).filter((k) => k.startsWith('dl.DL_BLUR.r'))) expect(g[k]).toBe(g[k.replace('dl.DL_BLUR', 'blurB_4_q1')]);
  });
  it('AS2 filter setters normalise like the engine assumes', () => {
    expect(r()['norm.blur']).toBe('255|0|15');
    expect(r()['norm.glow']).toBe('16711680|1|4.3|255|2');
    expect(r()['norm.strength0.296']).toBe('0.29296875');
    expect(r()['norm.alpha0.5']).toBe('0.498039215686275');
    expect(r()['norm.bevel']).toBe('230|full');
  });
});
