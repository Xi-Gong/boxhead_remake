/**
 * FlashType ("anti-alias for readability") model vs the real Flash Player (lane T).
 *
 * Goldens tests/goldens/flash/csm_*.json are pixel captures of probe SWFs (tools/oracle/visual/csmProbe.ts) run in
 * FlashPlayer28 background-safe: the game's own static texts at sub-pixel offsets, single glyphs of every game font
 * at many sizes (dark and LIGHT text colours), gridFit pixel/subpixel, placement scales, bounds clipping and text
 * colours. The model (src/engine/swf/flashType.ts) must reproduce them in DEVICE pixels; the renderer applies the
 * same math (drawFlashTypeStatic / drawFlashTypeEdit in render/renderer.ts).
 */
import { describe, expect, it } from 'vitest';
import type { CharDef, FontDef, StaticTextDef } from '../../../src/shared/assetSchema.ts';
import { compositeGlyphs, q4, roundHalfEven, snapThird, csmCutoffs, isLightText, glyphMask, glyphsBounds, staticTextClip, type FtGlyph } from '../../../src/engine/swf/flashType.ts';
import { getBuild } from '../swf/helpers.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { lib } = getBuild();
const chars = lib.chars as Record<string, CharDef>;

interface Golden { cell: { x: number; y: number; w: number; h: number }; rgb: number[]; x: number; y: number;
  gameChar?: number; f?: number; s?: number; t?: string; col?: [number, number, number, number]; gf?: number; k?: number; b?: { xMin: number; yMin: number; xMax: number; yMax: number }; adv?: number; bg?: number }

function golden(name: string): Golden[] {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', 'goldens', 'flash', `csm_${name}.json`), 'utf8'));
}

/** The static-text FlashType placement (identical to drawFlashTypeStatic, scale 1). */
function staticGlyphs(def: StaticTextDef, x: number, y: number): FtGlyph[] {
  const X0 = roundHalfEven(q4(x) + q4(def.m.tx)) + 1;
  const Y0 = roundHalfEven(q4(y) + q4(def.m.ty)) - 1;
  const out: FtGlyph[] = [];
  for (const rec of def.records) {
    const font = chars[rec.fontId] as FontDef;
    if (font?.t !== 'font') continue;
    let acc = rec.x;
    for (const g of rec.glyphs) {
      const fg = font.glyphs[g.i];
      if (fg?.d) out.push({ d: fg.d, zone: font.alignZones?.zones[g.i], key: `${font.id}:${g.i}`, sizeX: rec.height, sizeY: rec.height,
        pen: X0 + q4(acc), base: Y0 + rec.y, hint: font.alignZones?.hint ?? 1, color: rec.color });
      acc += g.adv;
    }
    void X0;
  }
  return out;
}

/** The synthetic single-glyph cases of csmProbe (one record at the placement origin). */
function synGlyphs(c: Golden): FtGlyph[] {
  const font = chars[c.f!] as FontDef;
  const X0 = roundHalfEven(q4(c.x)) + 1;
  const Y0 = roundHalfEven(q4(c.y)) - 1;
  const out: FtGlyph[] = [];
  let acc = 0;
  for (const ch of c.t!) {
    const gi = font.glyphs.findIndex((g) => g.code === ch.charCodeAt(0));
    const fg = font.glyphs[gi];
    if (fg?.d) out.push({ d: fg.d, zone: font.alignZones?.zones[gi], key: `${font.id}:${gi}`, sizeX: c.s! * (c.k ?? 1), sizeY: c.s! * (c.k ?? 1),
      pen: X0 + q4(acc * (c.k ?? 1)), base: Y0, hint: font.alignZones?.hint ?? 1, color: c.col ?? [0, 0, 0, 255] });
    acc += c.adv ?? (font.glyphs[gi]!.adv * c.s!) / 1024;
  }
  return out;
}

function render(c: Golden, glyphs: FtGlyph[], gridFit: number): number[] {
  const { w, h } = c.cell;
  const data = new Uint8ClampedArray(w * h * 4);
  const bg = c.bg ?? 0xffffff;
  for (let k = 0; k < w * h; k++) { data[k * 4] = (bg >> 16) & 255; data[k * 4 + 1] = (bg >> 8) & 255; data[k * 4 + 2] = bg & 255; data[k * 4 + 3] = 255; }
  let clip: { x0: number; y0: number; x1: number; y1: number } | undefined;
  if (c.b) {
    // [FlashType] bounds are in text space around the SNAPPED origin (csmProbe clip cases)
    const X0 = roundHalfEven(q4(c.x)) + 1, Y0 = roundHalfEven(q4(c.y)) - 1;
    clip = { x0: X0 + Math.floor(c.b.xMin), y0: Y0 + Math.floor(c.b.yMin), x1: X0 + Math.floor(c.b.xMax), y1: Y0 + Math.floor(c.b.yMax) };
  }
  compositeGlyphs(glyphs, gridFit, data, w, h, c.cell.x, c.cell.y, clip);
  const out: number[] = [];
  for (let k = 0; k < w * h; k++) out.push((data[k * 4] << 16) | (data[k * 4 + 1] << 8) | data[k * 4 + 2]);
  return out;
}

function mae(a: number[], b: number[]): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += Math.abs(((a[k]! >> 16) & 255) - ((b[k]! >> 16) & 255)) + Math.abs(((a[k]! >> 8) & 255) - ((b[k]! >> 8) & 255)) + Math.abs((a[k]! & 255) - (b[k]! & 255));
  return s / a.length / 3;
}

function score(name: string, pick: (g: Golden) => FtGlyph[] | null, gf: (g: Golden) => number): { mean: number; worst: number; worstMae: number; worstId: string } {
  let sum = 0, n = 0, worst = 0, worstId = '';
  for (const g of golden(name)) {
    const gl = pick(g);
    if (!gl) continue;
    const m = mae(render(g, gl, gf(g)), g.rgb);
    sum += m; n++;
    if (m > worst) { worst = m; worstId = g.gameChar !== undefined ? `text ${g.gameChar}` : `${g.f}/${g.s} '${g.t}'`; }
  }
  return { mean: sum / n, worst, worstMae: worst, worstId };
}

describe('FlashType model vs Flash Player 28', () => {
  it('the game\'s static texts at integer and +0.7 px positions', () => {
    const r = score('static', (g) => (g.gameChar !== undefined ? staticGlyphs(chars[g.gameChar] as StaticTextDef, g.x, g.y) : null), () => 2);
    console.log('static', r.mean.toFixed(3), r.worstId, r.worstMae.toFixed(2));
    expect(r.mean).toBeLessThan(2);
    expect(r.worstMae).toBeLessThan(16);
  });

  it('single glyphs across fonts and sizes: dark text', () => {
    const r = score('sizes_dark', (g) => (g.f !== undefined ? synGlyphs(g) : null), () => 2);
    console.log('sizes_dark', r.mean.toFixed(3), r.worstId, r.worstMae.toFixed(2));
    expect(r.mean).toBeLessThan(1.2);
  });

  it('single glyphs: light text (white on black)', () => {
    const r = score('sizes_light', (g) => (g.f !== undefined ? synGlyphs(g) : null), () => 2);
    console.log('sizes_light', r.mean.toFixed(3), r.worstId, r.worstMae.toFixed(2));
    expect(r.mean).toBeLessThan(1.2);
  });

  it('gridFit pixel / subpixel, scales, bounds clipping, colours', () => {
    const r = score('modes', (g) => (g.f !== undefined ? synGlyphs(g) : null), (g) => g.gf ?? 2);
    console.log('modes', r.mean.toFixed(3), r.worstId, r.worstMae.toFixed(2));
    expect(r.mean).toBeLessThan(1.5);
    const c = score('colors', (g) => (g.f !== undefined ? synGlyphs(g) : null), () => 2);
    console.log('colors', c.mean.toFixed(3), c.worstId, c.worstMae.toFixed(2));
    expect(c.mean).toBeLessThan(1.5);
  });

  it('model units and helpers', () => {
    expect(q4(1.126)).toBe(1.25);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(snapThird(1.18)).toBeCloseTo(1 + 1 / 3, 10);
    expect(csmCutoffs(10, 1, false)).toEqual([0.49, -0.43]);
    expect(csmCutoffs(26, 2, false)).toEqual([0.62, -0.46]);
    expect(isLightText(200, 200, 200, 255)).toBe(false);
    expect(isLightText(208, 208, 208, 255)).toBe(true);
    expect(isLightText(255, 255, 255, 200)).toBe(false); // luminance * alpha < 201
    expect(isLightText(255, 255, 255, 210)).toBe(true);
    // glyph masks are cached per (font, size, phase): same glyph twice -> one rasterization
    const font = chars[23] as FontDef;
    const gi = font.glyphs.findIndex((g) => g.code === 72); // 'H'
    const g: FtGlyph = { d: font.glyphs[gi]!.d, zone: font.alignZones!.zones[gi], key: '23:H', sizeX: 14, sizeY: 14,
      pen: 10 + 1 / 3, base: 20, hint: 1, color: [0, 0, 0, 255] };
    expect(glyphMask(g, 2)!.mask).toBe(glyphMask({ ...g }, 2)!.mask);
  });
});

describe('FlashType renderer clip frame (regression 0.1.1: centred menu text vanished)', () => {
  // drawFtCached composites glyphs ORIGIN-RELATIVE (pen/base without X0/Y0; the blit adds X0/Y0 at the end), so the
  // DefineText-bounds clip must be origin-relative too. 0.1.1 computed it absolute (X0 + b.xMin * sx): every text
  // centred or right on screen got an inverted intersection (w < 0), a null composite canvas and a SILENT skip —
  // the whole main menu lost its buttons at every scale while left-aligned options text survived.
  it('static-text clips stay in the glyph frame at k=1 and k=2: the drawFtCached intersection never inverts', () => {
    const k0 = 1; // unscaled text-unit divisor used below (records are in text units at k=1)
    const texts = Object.values(chars).filter((c) => (c as { t?: string }).t === 'text' && (c as StaticTextDef).csm?.flashType) as StaticTextDef[];
    expect(texts.length).toBeGreaterThan(20);
    let checked = 0;
    for (const def of texts) {
      // text-frame extents of the records (unscaled), to tell genuinely-overlapping bounds from authoring slop:
      // a text whose records lie wholly outside its declared bounds is clipped away by Flash too (char 81)
      let penMin = Infinity, penMax = -Infinity, recYMin = Infinity, recYMax = -Infinity;
      for (const rec of def.records) {
        let acc = rec.x;
        for (const g of rec.glyphs) { acc += g.adv; }
        penMin = Math.min(penMin, rec.x); penMax = Math.max(penMax, acc);
        recYMin = Math.min(recYMin, rec.y); recYMax = Math.max(recYMax, rec.y + rec.height);
      }
      const b = def.bounds;
      void recYMin; void recYMax; // y extents kept for future use; the 0.1.1 inversion axis is x (the huge X0)
      // char-local glyph extents (records live at tm.t + records; bounds are char-local)
      const gxMin = penMin / (k0 * def.m.a) + def.m.tx, gxMax = penMax / (k0 * def.m.a) + def.m.tx;
      const overlaps = Math.min(gxMax, b.xMax) - Math.max(gxMin, b.xMin) > 2;
      for (const k of [1, 2]) {
        const sx = k * def.m.a, sy = k * def.m.d;
        const glyphs: FtGlyph[] = []; // exactly what drawFlashTypeStatic builds
        for (const rec of def.records) {
          const font = chars[rec.fontId] as FontDef;
          if (font?.t !== 'font') continue;
          let acc = rec.x;
          for (const g of rec.glyphs) {
            const fg = font.glyphs[g.i];
            if (fg?.d) glyphs.push({ d: fg.d, zone: font.alignZones?.zones[g.i], key: `${font.id}:${g.i}`,
              sizeX: rec.height * sx, sizeY: rec.height * sy, pen: q4(acc * sx), base: Math.round(rec.y * sy),
              hint: font.alignZones?.hint ?? 1, color: [0, 0, 0, 255] });
            acc += g.adv;
          }
        }
        if (!glyphs.length) continue;
        const bb = glyphsBounds(glyphs, def.csm!.gridFit);
        expect(bb, `char ${def.id} k=${k}: glyphs must have bounds`).not.toBeNull();
        const clip = staticTextClip(def.bounds, { a: k, d: k }, def.m);
        const w = Math.min(bb!.x1, clip.x1) - Math.max(bb!.x0, clip.x0);
        const h = Math.min(bb!.y1, clip.y1) - Math.max(bb!.y0, clip.y0);
        if (overlaps) {
          checked++;
          expect(w, `char ${def.id} k=${k}: clip x must meet the glyph frame (bb=${JSON.stringify(bb)} clip=${JSON.stringify(clip)})`).toBeGreaterThan(0);
          expect(h, `char ${def.id} k=${k}: clip y must meet the glyph frame`).toBeGreaterThan(0);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});
