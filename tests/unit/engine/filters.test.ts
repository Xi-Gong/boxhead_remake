// Filter maths on small synthetic premultiplied buffers (model documented in src/engine/flash/filters/apply.ts;
// pixel-exact agreement with Flash Player is to be confirmed by oracle probe P5).
import { describe, expect, it } from 'vitest';
import {
  BevelFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, GradientGlowFilter,
} from '../../../src/engine/flash/filters.ts';
import {
  applyColorMatrixToPixels, applyFiltersToPixels, blurAlphaPlane, deviceBlur, filterPadding, gradientLUT, type Pixels,
} from '../../../src/engine/flash/filters/apply.ts';
import { applyCxToPixels, applyCxToRGBA, cxToFixed, premultiplyInPlace, unpremultiplyInPlace } from '../../../src/engine/flash/color.ts';
import { ColorTransform } from '../../../src/engine/flash/geom.ts';

function px(w: number, h: number): Pixels { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
function set(p: Pixels, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const o = (y * p.width + x) * 4;
  p.data[o] = r; p.data[o + 1] = g; p.data[o + 2] = b; p.data[o + 3] = a;
}
function get(p: Pixels, x: number, y: number): number[] {
  const o = (y * p.width + x) * 4;
  return [p.data[o]!, p.data[o + 1]!, p.data[o + 2]!, p.data[o + 3]!];
}
function rect(p: Pixels, x0: number, y0: number, w: number, h: number, c: number[]): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(p, x, y, c[0]!, c[1]!, c[2]!, c[3]!);
}
/** Alpha row of a 1-high buffer. */
const alphaRow = (p: Pixels, y = 0): number[] => Array.from({ length: p.width }, (_, x) => get(p, x, y)[3]!);
const dot = (w: number, x: number): Pixels => { const p = px(w, 1); set(p, x, 0, 255, 255, 255, 255); return p; };

describe('BlurFilter (box blur, quality passes)', () => {
  it('blur <= 1 is a no-op', () => {
    const p = dot(9, 4);
    expect(alphaRow(applyFiltersToPixels(p, [new BlurFilter(1, 1, 3)], 1))).toEqual(alphaRow(p));
    expect(alphaRow(applyFiltersToPixels(p, [new BlurFilter(0, 0, 1)], 1))).toEqual(alphaRow(p));
  });

  it('odd integer blur = box of exactly `blur` pixels', () => {
    expect(alphaRow(applyFiltersToPixels(dot(9, 4), [new BlurFilter(3, 0, 1)], 1))).toEqual([0, 0, 0, 85, 85, 85, 0, 0, 0]);
    expect(alphaRow(applyFiltersToPixels(dot(9, 4), [new BlurFilter(5, 0, 1)], 1))).toEqual([0, 0, 51, 51, 51, 51, 51, 0, 0]);
  });

  it('even blur = centre box of blur-1 pixels plus two half-weight taps (fixed-point α = 127/255)', () => {
    // blur 2: [α, 1, α] / 2 ; blur 4: [α, 1, 1, 1, α] / 4
    expect(alphaRow(applyFiltersToPixels(dot(9, 4), [new BlurFilter(2, 0, 1)], 1))).toEqual([0, 0, 0, 63, 127, 63, 0, 0, 0]);
    expect(alphaRow(applyFiltersToPixels(dot(9, 4), [new BlurFilter(4, 0, 1)], 1))).toEqual([0, 0, 31, 63, 63, 63, 31, 0, 0]);
  });

  it('quality = number of passes (each pass floors to 8 bits)', () => {
    // [1,1,1]/3 twice: 85,85,85 -> 28,56,85,56,28
    expect(alphaRow(applyFiltersToPixels(dot(11, 5), [new BlurFilter(3, 0, 2)], 1))).toEqual([0, 0, 0, 28, 56, 85, 56, 28, 0, 0, 0]);
    // three passes reach 3 pixels each side
    const three = alphaRow(applyFiltersToPixels(dot(11, 5), [new BlurFilter(3, 0, 3)], 1));
    expect(three.findIndex((v) => v > 0)).toBe(2);
    expect(three.slice(0, 2)).toEqual([0, 0]);
  });

  it('blurs all four premultiplied channels and both axes', () => {
    const p = px(5, 5);
    set(p, 2, 2, 90, 30, 255, 255);
    const out = applyFiltersToPixels(p, [new BlurFilter(3, 3, 1)], 1);
    // 3x3 box, floored per pass: /3 then /3  (90 -> 30 -> 10, 30 -> 10 -> 3, 255 -> 85 -> 28)
    expect(get(out, 1, 1)).toEqual([10, 3, 28, 28]);
    expect(get(out, 2, 2)).toEqual([10, 3, 28, 28]);
    expect(get(out, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('uniform interior stays exact for odd and even blurs (exact fractional tap weight, P5 blurA_*)', () => {
    const p = px(21, 1);
    rect(p, 0, 0, 21, 1, [255, 255, 255, 255]);
    expect(get(applyFiltersToPixels(p, [new BlurFilter(3, 0, 1)], 1), 10, 0)[3]).toBe(255);
    expect(get(applyFiltersToPixels(p, [new BlurFilter(4, 0, 1)], 1), 10, 0)[3]).toBe(255);
    expect(get(applyFiltersToPixels(p, [new BlurFilter(4, 0, 3)], 1), 10, 0)[3]).toBe(255);
  });

  it('deviceBlur keeps the radius in logical pixels; padding = passes * ceil((blur-1)/2)', () => {
    expect(deviceBlur(4, 1)).toBe(4);
    expect(deviceBlur(4, 2)).toBe(7);
    expect(deviceBlur(1, 2)).toBe(1);
    expect(deviceBlur(300, 1)).toBe(255);
    expect(filterPadding([new BlurFilter(4, 2, 1)], 1)).toEqual({ left: 2, right: 2, top: 1, bottom: 1 });
    expect(filterPadding([new BlurFilter(4, 4, 3)], 2)).toEqual({ left: 9, right: 9, top: 9, bottom: 9 });
    expect(filterPadding([new BlurFilter(1, 1, 3)], 2)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    // a chain adds up
    expect(filterPadding([new BlurFilter(3, 3, 1), new GlowFilter(0, 1, 5, 5)], 1).left).toBe(3);
  });

  it('a 2x blur of a 2x-upscaled image matches the 1x blur extent', () => {
    // 1x: blur 3 reaches 1 px; 2x: deviceBlur 5 reaches 2 device px = 1 logical px
    const a2 = alphaRow(applyFiltersToPixels(dot(11, 5), [new BlurFilter(3, 0, 1)], 2));
    expect(a2.filter((v) => v > 0).length).toBe(5);
  });

  it('blurAlphaPlane helper', () => {
    const a = new Uint8ClampedArray(7);
    a[3] = 255;
    expect(Array.from(blurAlphaPlane(a, 7, 1, 3, 0, 1))).toEqual([0, 0, 85, 85, 85, 0, 0]);
  });
});

describe('GlowFilter', () => {
  const square = (): Pixels => { const p = px(9, 9); rect(p, 3, 3, 3, 3, [255, 0, 0, 255]); return p; };

  it('outer glow sits behind the object', () => {
    const out = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 1, 3, 3, 1, 1)], 1);
    expect(get(out, 4, 4)).toEqual([255, 0, 0, 255]); // object untouched
    expect(get(out, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(get(out, 2, 4)).toEqual([0, 0, 85, 85]); // edge: blurred alpha 85
    expect(get(out, 2, 2)).toEqual([0, 0, 28, 28]); // corner
    expect(get(out, 1, 4)).toEqual([0, 0, 0, 0]); // beyond blur reach
  });

  it('strength multiplies the blurred alpha (clamped) and alpha scales it', () => {
    const out = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 1, 3, 3, 2, 1)], 1);
    expect(get(out, 2, 4)).toEqual([0, 0, 170, 170]);
    const strong = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 0.5, 3, 3, 10, 1)], 1);
    expect(get(strong, 2, 4)).toEqual([0, 0, 127, 127]);
  });

  it('knockout: the hole is cut with the source shifted by the generateFilterRect padding (Flash quirk, P5)', () => {
    // blur 3 -> pad max(1, ceil(3/2)) = 2: the hole is the square moved by (+2, +2)
    const out = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 1, 3, 3, 1, 1, false, true)], 1);
    expect(get(out, 4, 4)).toEqual([0, 0, 255, 255]);
    expect(get(out, 6, 6)).toEqual([0, 0, 0, 0]);
    expect(get(out, 2, 4)).toEqual([0, 0, 85, 85]);
  });

  it('inner glow stays inside the object, atop it', () => {
    const out = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 1, 3, 3, 1, 1, true)], 1);
    expect(get(out, 4, 4)).toEqual([255, 0, 0, 255]); // centre: blurred alpha 255 -> no glow
    expect(get(out, 3, 4)).toEqual([170, 0, 85, 255]); // edge: blurred 170 -> glow 85
    expect(get(out, 2, 4)).toEqual([0, 0, 0, 0]); // outside untouched
    const ko = applyFiltersToPixels(square(), [new GlowFilter(0x0000ff, 1, 3, 3, 1, 1, true, true)], 1);
    expect(get(ko, 3, 4)).toEqual([0, 0, 85, 85]);
    expect(get(ko, 4, 4)).toEqual([0, 0, 0, 0]);
  });

  it('XSI outline glow GlowFilter(0, 1, 4, 4, 2, 1) gives a dark rim at 2x', () => {
    const p = px(24, 24);
    rect(p, 8, 8, 8, 8, [200, 200, 200, 255]);
    const out = applyFiltersToPixels(p, [new GlowFilter(0x000000, 1, 4, 4, 2, 1)], 2);
    expect(get(out, 10, 10)).toEqual([200, 200, 200, 255]);
    expect(get(out, 7, 12)[3]).toBeGreaterThan(200); // next to the edge: near-opaque black
    expect(get(out, 7, 12).slice(0, 3)).toEqual([0, 0, 0]);
    expect(get(out, 4, 12)[3]).toBe(0); // 4 device px away: outside the 3 px reach of blur 7
  });
});

describe('DropShadowFilter', () => {
  const dotP = (): Pixels => { const p = px(9, 9); set(p, 2, 2, 255, 255, 255, 255); return p; };

  it('offset by distance along angle (bilinear, 1/256 px, sample position quantised down)', () => {
    const out = applyFiltersToPixels(dotP(), [new DropShadowFilter(3, 0, 0x000000, 1, 0, 0)], 1);
    expect(get(out, 5, 2)).toEqual([0, 0, 0, 255]);
    expect(get(out, 2, 2)).toEqual([255, 255, 255, 255]);
    const down = applyFiltersToPixels(dotP(), [new DropShadowFilter(3, 90, 0x000000, 1, 0, 0)], 1);
    expect(get(down, 2, 5)).toEqual([0, 0, 0, 255]);
    const diag = applyFiltersToPixels(dotP(), [new DropShadowFilter(4, 45, 0x000000, 1, 0, 0)], 1);
    // 2.83 -> 725/256: the dot lands at 4.83: (5,5) gets (213/256)^2, (4,5)/(5,4) 213·43/65536
    expect(get(diag, 5, 5)).toEqual([0, 0, 0, 176]);
    expect(get(diag, 4, 5)).toEqual([0, 0, 0, 35]);
    expect(get(diag, 4, 4)).toEqual([0, 0, 0, 7]);
    const scaled = applyFiltersToPixels(dotP(), [new DropShadowFilter(2, 0, 0x000000, 1, 0, 0)], 2);
    expect(get(scaled, 6, 2)).toEqual([0, 0, 0, 255]); // distance x deviceScale
  });

  it('hideObject draws the shadow only; knockout cuts the object out of the shadow', () => {
    const p = px(9, 1);
    rect(p, 2, 0, 3, 1, [255, 255, 255, 255]);
    const hidden = applyFiltersToPixels(p, [new DropShadowFilter(1, 0, 0xff0000, 1, 0, 0, 1, 1, false, false, true)], 1);
    expect(alphaRow(hidden)).toEqual([0, 0, 0, 255, 255, 255, 0, 0, 0]);
    expect(get(hidden, 3, 0)).toEqual([255, 0, 0, 255]);
    const ko = applyFiltersToPixels(p, [new DropShadowFilter(1, 0, 0xff0000, 1, 0, 0, 1, 1, false, true)], 1);
    expect(alphaRow(ko)).toEqual([0, 0, 0, 0, 0, 255, 0, 0, 0]);
  });

  it('XSI shadow layer: DropShadowFilter(0,0,0,1,4,4,0.25,1,false,false,true) = soft 25% shadow, no object', () => {
    const p = px(16, 16);
    rect(p, 4, 4, 8, 8, [255, 255, 255, 255]);
    const out = applyFiltersToPixels(p, [new DropShadowFilter(0, 0, 0, 1, 4, 4, 0.25, 1, false, false, true)], 1);
    expect(get(out, 8, 8)).toEqual([0, 0, 0, 63]); // ~0.25 alpha black (blurred interior 254 * 0.25)
    expect(get(out, 3, 8)[3]).toBeGreaterThan(0);
    expect(get(out, 3, 8)[3]).toBeLessThan(63);
  });

  it('inner shadow appears on the side facing away from the light', () => {
    const p = px(9, 1);
    rect(p, 3, 0, 3, 1, [255, 255, 255, 255]);
    const out = applyFiltersToPixels(p, [new DropShadowFilter(1, 0, 0x000000, 1, 0, 0, 1, 1, true)], 1);
    expect(get(out, 3, 0)).toEqual([0, 0, 0, 255]); // left inner edge in shadow
    expect(get(out, 5, 0)).toEqual([255, 255, 255, 255]);
    expect(get(out, 2, 0)).toEqual([0, 0, 0, 0]);
  });

  it('padding grows towards the shadow side only', () => {
    expect(filterPadding([new DropShadowFilter(4, 45, 0, 1, 4, 4)], 1)).toEqual({ left: 2, top: 2, right: 5, bottom: 5 });
    expect(filterPadding([new DropShadowFilter(3, 180, 0, 1, 0, 0)], 1)).toEqual({ left: 3, top: 0, right: 0, bottom: 0 });
  });
});

describe('BevelFilter', () => {
  const sq = (): Pixels => { const p = px(11, 11); rect(p, 4, 4, 3, 3, [128, 128, 128, 255]); return p; };
  const hl = 0xffffff, sh = 0x000000;

  it('inner bevel: highlight on the side the angle points away from (light), shadow towards it', () => {
    // angle 0: offset (+1, 0); highlight where A(p+off) > A(p-off) => left inner edge, shadow on the right
    const out = applyFiltersToPixels(sq(), [new BevelFilter(1, 0, hl, 1, sh, 1, 0, 0, 1, 1, 'inner')], 1);
    expect(get(out, 4, 5)).toEqual([255, 255, 255, 255]);
    expect(get(out, 6, 5)).toEqual([0, 0, 0, 255]);
    expect(get(out, 5, 5)).toEqual([128, 128, 128, 255]);
    expect(get(out, 3, 5)).toEqual([0, 0, 0, 0]); // inner: nothing outside
  });

  it('default angle 45: highlight top-left, shadow bottom-right', () => {
    const out = applyFiltersToPixels(sq(), [new BevelFilter(1, 45, hl, 1, sh, 1, 0, 0, 1, 1, 'inner')], 1);
    // offset (0.707, 0.707) is sampled bilinearly: partial highlight / shadow at the corners
    expect(get(out, 4, 4)).toEqual([245, 245, 245, 255]);
    expect(get(out, 5, 4)).toEqual([219, 219, 219, 255]);
    expect(get(out, 5, 5)).toEqual([128, 128, 128, 255]);
    expect(get(out, 6, 5)).toEqual([37, 37, 37, 255]);
    expect(get(out, 6, 6)).toEqual([11, 11, 11, 255]);
  });

  it('outer and full types, knockout, strength and alphas', () => {
    const outer = applyFiltersToPixels(sq(), [new BevelFilter(1, 0, hl, 1, sh, 1, 0, 0, 1, 1, 'outer')], 1);
    expect(get(outer, 3, 5)).toEqual([255, 255, 255, 255]); // outside left: highlight behind
    expect(get(outer, 7, 5)).toEqual([0, 0, 0, 255]);
    expect(get(outer, 4, 5)).toEqual([128, 128, 128, 255]); // object on top
    const full = applyFiltersToPixels(sq(), [new BevelFilter(1, 0, hl, 1, sh, 1, 0, 0, 1, 1, 'full')], 1);
    expect(get(full, 3, 5)).toEqual([255, 255, 255, 255]);
    expect(get(full, 4, 5)).toEqual([255, 255, 255, 255]);
    const ko = applyFiltersToPixels(sq(), [new BevelFilter(1, 0, hl, 1, sh, 1, 0, 0, 1, 1, 'inner', true)], 1);
    expect(get(ko, 5, 5)).toEqual([0, 0, 0, 0]);
    expect(get(ko, 4, 5)).toEqual([255, 255, 255, 255]);
    const soft = applyFiltersToPixels(sq(), [new BevelFilter(1, 0, hl, 0.5, sh, 1, 0, 0, 1, 1, 'inner')], 1);
    // highlight alpha 0.5 (127/255) over grey 128: 255*127/255 + 128*(1-127/255)
    expect(get(soft, 4, 5)).toEqual([191, 191, 191, 255]);
  });

  it('blurred bevel uses the difference of the blurred alpha (strength scales it)', () => {
    const p = px(15, 1);
    rect(p, 5, 0, 5, 1, [100, 100, 100, 255]);
    const out = applyFiltersToPixels(p, [new BevelFilter(1, 0, hl, 1, sh, 1, 3, 0, 1, 1, 'inner')], 1);
    // left edge x=5: blurred A = [.., x4: 85, x5: 170, x6: 255, ..]; L = A(6) = 255, R = A(4) = 85 -> 170/255
    expect(get(out, 5, 0)).toEqual([203, 203, 203, 255]);
    expect(get(out, 7, 0)).toEqual([100, 100, 100, 255]);
  });

  it('padding grows on both sides by the offset', () => {
    expect(filterPadding([new BevelFilter(4, 45, hl, 1, sh, 1, 0, 0)], 1)).toEqual({ left: 3, right: 3, top: 3, bottom: 3 });
  });
});

describe('GradientGlowFilter', () => {
  it('gradient lookup table (colors / alphas / ratios)', () => {
    const lut = gradientLUT([0xffff00, 0xffffff], [0, 1], [0, 210]);
    expect(Array.from(lut.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(lut.slice(255 * 4, 256 * 4))).toEqual([1, 1, 1, 1]);
    expect(lut[105 * 4 + 3]).toBeCloseTo(0.5, 2); // alpha halfway
    expect(lut[105 * 4 + 2]! / lut[105 * 4 + 3]!).toBeCloseTo(0.5, 2); // blue halfway (un-premultiplied)
  });

  it('outer gradient glow (Symbol 673: yellow alpha 0 -> white at 210, strength 2.4)', () => {
    const p = px(9, 9);
    rect(p, 3, 3, 3, 3, [0, 0, 255, 255]);
    const f = new GradientGlowFilter(0, 0, [0xffff00, 0xffffff], [0, 1], [0, 210], 3, 3, 1, 1, 'outer');
    const out = applyFiltersToPixels(p, [f], 1);
    expect(get(out, 4, 4)).toEqual([0, 0, 255, 255]); // object on top
    const edge = get(out, 2, 4); // blurred alpha 85 -> index 85 -> alpha 85/210
    expect(edge[3]).toBe(Math.round((85 / 210) * 255));
    expect(get(out, 0, 4)).toEqual([0, 0, 0, 0]);
    const strong = applyFiltersToPixels(p, [new GradientGlowFilter(0, 0, [0xffff00, 0xffffff], [0, 1], [0, 210], 3, 3, 2.4, 1, 'outer')], 1);
    // 85/255 * 2.4 -> index 204 of the 0..210 ramp: alpha 204/210, blue 204/210 of the way from 0 to 255
    expect(get(strong, 2, 4)).toEqual([246, 246, 237, 246]); // stops interpolated with floor, premultiplied with round
  });
});

describe('ColorMatrixFilter', () => {
  it('works on un-premultiplied values; offsets in 0..255', () => {
    const p = px(3, 1);
    set(p, 0, 0, 10, 20, 30, 255);
    set(p, 1, 0, 64, 0, 0, 128); // un-premultiplied red 127.5
    const bright = new ColorMatrixFilter([1, 0, 0, 0, 204, 0, 1, 0, 0, 204, 0, 0, 1, 0, 204, 0, 0, 0, 1, 0]);
    const out = applyFiltersToPixels(p, [bright], 1);
    expect(get(out, 0, 0)).toEqual([214, 224, 234, 255]);
    expect(get(out, 1, 0)).toEqual([128, 102, 102, 128]); // (255, 204, 204) * 128/255
    expect(get(out, 2, 0)).toEqual([0, 0, 0, 0]); // transparent stays transparent without an alpha offset
  });

  it('alpha offset makes transparent pixels visible; grayscale weights', () => {
    const p = px(2, 1);
    set(p, 1, 0, 255, 0, 0, 255);
    const out = applyColorMatrixToPixels(p, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 51]);
    expect(get(out, 0, 0)).toEqual([0, 0, 0, 51]);
    const gray = applyColorMatrixToPixels(p, [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0]);
    expect(get(gray, 1, 0)).toEqual([76, 76, 76, 255]); // 0.3 * 255 = 76.5 floors (P5 cmC_*)
  });

  it('a chain applies in order', () => {
    const p = dot(9, 4);
    const out = applyFiltersToPixels(p, [new BlurFilter(3, 0, 1), new ColorMatrixFilter([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0])], 1);
    expect(alphaRow(out)).toEqual([0, 0, 0, 170, 170, 170, 0, 0, 0]);
    expect(get(out, 4, 0)).toEqual([0, 0, 0, 170]);
  });
});

describe('color helpers', () => {
  it('Flash color transform: 8.8 multipliers, integer offsets, transparent untouched', () => {
    const cx = new ColorTransform(0.5, 1, 1, 1, 10, 0, 0, 0);
    expect(applyCxToRGBA(100, 50, 25, 255, cx)).toEqual([60, 50, 25, 255]);
    expect(applyCxToRGBA(100, 50, 25, 0, new ColorTransform(1, 1, 1, 1, 0, 0, 0, 100))).toEqual([100, 50, 25, 0]);
    expect(cxToFixed(new ColorTransform(0.37)).rm).toBe(94);
    expect(applyCxToRGBA(255, 255, 255, 255, new ColorTransform(1, 1, 1, 0.37))).toEqual([255, 255, 255, 93]); // (255*94)>>8
  });

  it('applyCxToPixels on premultiplied data; premultiply round trip', () => {
    const p = px(1, 1);
    set(p, 0, 0, 128, 0, 0, 128);
    applyCxToPixels(p, new ColorTransform(1, 1, 1, 0.5));
    expect(get(p, 0, 0)).toEqual([64, 0, 0, 64]);
    const d = new Uint8ClampedArray([255, 128, 0, 128, 10, 20, 30, 0]);
    premultiplyInPlace(d);
    expect(Array.from(d)).toEqual([128, 64, 0, 128, 0, 0, 0, 0]);
    unpremultiplyInPlace(d);
    expect(Array.from(d)).toEqual([255, 128, 0, 128, 0, 0, 0, 0]);
  });
});
