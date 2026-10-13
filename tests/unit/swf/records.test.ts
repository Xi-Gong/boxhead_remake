import { describe, expect, it } from 'vitest';
import { ByteReader } from '../../../tools/swf/ByteReader.ts';
import {
  BEVEL_FIRST_COLOR_IS_HIGHLIGHT, matrixAll20, readClipActions, readCxform, readFilterList, readMatrix, readMatrixTwips, readRect, readSoundInfo,
} from '../../../tools/swf/records.ts';
import { Bits } from './helpers.ts';

const reader = (b: Bits) => new ByteReader(b.toArray());

describe('basic records', () => {
  it('RECT -> px', () => {
    const b = new Bits().u(11, 5).s(-20, 11).s(1000, 11).s(10, 11).s(-1, 11);
    expect(readRect(reader(b))).toEqual({ xMin: -1, xMax: 50, yMin: 0.5, yMax: -0.05 });
  });

  it('MATRIX: a/d = scale, b = RotateSkew0, c = RotateSkew1, translation /20 (fill matrices: all six /20)', () => {
    const b = new Bits()
      .u(1, 1).u(19, 5).s(2 * 65536, 19).s(-0.5 * 65536, 19) // scale (2.0 needs 19 signed bits)
      .u(1, 1).u(17, 5).s(0.25 * 65536, 17).s(-0.75 * 65536, 17) // rotate/skew
      .u(12, 5).s(200, 12).s(-30, 12);
    const r = reader(b);
    const m = readMatrixTwips(r);
    expect(r.remaining).toBe(0);
    expect(m).toEqual({ a: 2, d: -0.5, b: 0.25, c: -0.75, tx: 200, ty: -30 });
    expect(readMatrix(reader(b))).toEqual({ a: 2, d: -0.5, b: 0.25, c: -0.75, tx: 10, ty: -1.5 });
    expect(matrixAll20(m)).toEqual({ a: 0.1, d: -0.025, b: 0.0125, c: -0.0375, tx: 10, ty: -1.5 });
  });

  it('CXFORMWITHALPHA: multipliers /256, offsets raw; CXFORM keeps alpha identity', () => {
    const b = new Bits().u(1, 1).u(1, 1).u(10, 4).s(256, 10).s(128, 10).s(0, 10).s(64, 10).s(-255, 10).s(10, 10).s(0, 10).s(255, 10);
    expect(readCxform(reader(b), true)).toEqual({ rm: 1, gm: 0.5, bm: 0, am: 0.25, ra: -255, ga: 10, ba: 0, aa: 255 });
    const c = new Bits().u(0, 1).u(1, 1).u(11, 4).s(512, 11).s(256, 11).s(0, 11);
    expect(readCxform(reader(c), false)).toEqual({ rm: 2, gm: 1, bm: 0, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 });
  });

  it('SOUNDINFO with envelope', () => {
    const b = new Bits().byte(0b00101110).u32(1234).u16(3).byte(2).u32(0).u16(0).u16(32768).u32(44100).u16(100).u16(200);
    expect(readSoundInfo(reader(b))).toEqual({ stop: true, outPoint: 1234, loops: 3, envelope: [{ pos44: 0, left: 0, right: 32768 }, { pos44: 44100, left: 100, right: 200 }] });
  });

  it('CLIPACTIONS are located, not decoded', () => {
    const b = new Bits().u16(0).u32(0x0002_0001) // reserved, all events
      .u32(0x0002_0000).u32(3).byte(65).byte(0x07, 0x00) // KeyPress 'A' + 2 action bytes
      .u32(0x0000_0001).u32(1).byte(0x00) // Load + ActionEnd
      .u32(0);
    const recs = readClipActions(reader(b), 8);
    expect(recs).toEqual([
      { events: 0x20000, keyCode: 65, offset: 15, length: 2 },
      { events: 1, keyCode: undefined, offset: 25, length: 1 },
    ]);
  });
});

describe('FILTERLIST', () => {
  it('decodes all 8 filter types with FIXED px values, radians, FIXED8 strength and quality passes', () => {
    const b = new Bits().byte(8);
    // 0 DropShadow
    b.byte(0, 1, 2, 3, 255).fixed(4).fixed(5).fixed(Math.PI / 4).fixed(6).fixed8(1.5).u(1, 1).u(0, 1).u(0, 1).u(3, 5);
    // 1 Blur
    b.byte(1).fixed(8).fixed(2.5).u(2, 5).u(0, 3);
    // 2 Glow
    b.byte(2, 255, 255, 255, 128).fixed(2).fixed(2).fixed8(10).u(0, 1).u(1, 1).u(1, 1).u(1, 5);
    // 3 Bevel: FIRST color white, SECOND black
    b.byte(3, 255, 255, 255, 255, 0, 0, 0, 255).fixed(2).fixed(2).fixed(0.785).fixed(-2).fixed8(0.5).u(1, 1).u(0, 1).u(1, 1).u(0, 1).u(1, 4);
    // 4 GradientGlow
    b.byte(4, 2, 255, 255, 0, 0, 255, 255, 255, 255, 0, 210).fixed(16).fixed(16).fixed(5.969).fixed(0).fixed8(2.3984375).u(0, 1).u(0, 1).u(1, 1).u(0, 1).u(1, 4);
    // 5 Convolution 1x1
    b.byte(5, 1, 1).u32(new Uint32Array(new Float32Array([2]).buffer)[0]).u32(new Uint32Array(new Float32Array([0.5]).buffer)[0])
      .u32(new Uint32Array(new Float32Array([1]).buffer)[0]).byte(9, 8, 7, 6).u(0, 6).u(1, 1).u(0, 1);
    // 6 ColorMatrix (identity + 76 offsets)
    b.byte(6);
    for (const v of [1, 0, 0, 0, 76, 0, 1, 0, 0, 76, 0, 0, 1, 0, 76, 0, 0, 0, 1, 0]) b.u32(new Uint32Array(new Float32Array([v]).buffer)[0]);
    // 7 GradientBevel
    b.byte(7, 1, 1, 2, 3, 4, 128).fixed(1).fixed(1).fixed(0).fixed(1).fixed8(1).u(1, 1).u(0, 1).u(1, 1).u(1, 1).u(15, 4);
    const r = reader(b);
    const f = readFilterList(r);
    expect(r.remaining).toBe(0);
    expect(f.map((x) => x.t)).toEqual(['dropShadow', 'blur', 'glow', 'bevel', 'gradientGlow', 'convolution', 'colorMatrix', 'gradientBevel']);
    expect(f[0]).toMatchObject({ color: [1, 2, 3, 255], blurX: 4, blurY: 5, distance: 6, strength: 1.5, inner: true, knockout: false, hideObject: true, passes: 3 });
    expect((f[0] as { angle: number }).angle).toBeCloseTo(Math.PI / 4, 4);
    expect(f[1]).toEqual({ t: 'blur', blurX: 8, blurY: 2.5, passes: 2 });
    expect(f[2]).toEqual({ t: 'glow', color: [255, 255, 255, 128], blurX: 2, blurY: 2, strength: 10, inner: false, knockout: true, passes: 1 });
    expect(BEVEL_FIRST_COLOR_IS_HIGHLIGHT).toBe(true);
    expect(f[3]).toMatchObject({ t: 'bevel', highlight: [255, 255, 255, 255], shadow: [0, 0, 0, 255], distance: -2, strength: 0.5, inner: true, onTop: false, passes: 1 });
    expect(f[4]).toMatchObject({ colors: [[255, 255, 0, 0], [255, 255, 255, 255]], ratios: [0, 210], blurX: 16, strength: 2.3984375, passes: 1 });
    expect(f[5]).toEqual({ t: 'convolution', matrixX: 1, matrixY: 1, divisor: 2, bias: 0.5, m: [1], color: [9, 8, 7, 6], clamp: true, preserveAlpha: false });
    expect(f[6]).toEqual({ t: 'colorMatrix', m: [1, 0, 0, 0, 76, 0, 1, 0, 0, 76, 0, 0, 1, 0, 76, 0, 0, 0, 1, 0] });
    expect(f[7]).toMatchObject({ t: 'gradientBevel', colors: [[1, 2, 3, 4]], ratios: [128], onTop: true, passes: 15 });
  });
});
