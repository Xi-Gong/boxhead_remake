import { describe, expect, it } from 'vitest';
import type { FontDef, StaticTextDef } from '../../../src/shared/assetSchema.ts';
import { decodeXml, getBuild, getFla, xmlElements } from './helpers.ts';

const { lib, raw } = getBuild();
const fonts = Object.values(lib.chars).filter((c): c is FontDef => c.t === 'font');
const texts = Object.values(lib.chars).filter((c): c is StaticTextDef => c.t === 'text');

/** Flash IDE font embedding ranges (UnicodeTable.xml): 1 Uppercase, 2 Lowercase, 3 Numerals, 4 Punctuation, 5 Basic Latin. */
const RANGE: Record<string, () => number[]> = {
  1: () => [32, ...span(65, 90)],
  2: () => [32, ...span(97, 122)],
  3: () => [32, ...span(48, 57)],
  4: () => span(32, 126).filter((c) => !/[A-Za-z0-9]/.test(String.fromCharCode(c))),
  5: () => span(32, 126),
};
function span(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

function decodeText(t: StaticTextDef): string {
  return t.records.map((r) => {
    const font = lib.chars[r.fontId] as FontDef;
    return String.fromCodePoint(...r.glyphs.map((g) => font.glyphs[g.i].code));
  }).join('');
}

describe('DefineFont3', () => {
  const flaFonts = xmlElements(getFla().text('DOMDocument.xml'), 'DOMFontItem');

  it('8 fonts; glyph code sets equal the FLA embedded characters (+ chars the FLA list omits but texts use)', () => {
    expect(fonts).toHaveLength(8);
    expect(flaFonts).toHaveLength(8);
    const extras: Record<string, string> = {};
    for (const item of flaFonts) {
      const font = lib.chars[Number(item.id)] as FontDef;
      expect(font?.t, `font ${item.id}`).toBe('font');
      const expected = new Set<number>([...(item.embeddedCharacters ?? '')].map((ch) => ch.codePointAt(0)!));
      for (const r of (item.embedRanges ?? '').split('|').filter(Boolean)) RANGE[r]().forEach((c) => expected.add(c));
      const actual = new Set(font.glyphs.map((g) => g.code));
      // everything the FLA lists is embedded
      expect([...expected].filter((c) => !actual.has(c)), `font ${item.id} ${item.font}`).toEqual([]);
      // anything extra must be used by a DefineText record with this font
      const used = new Set<number>();
      for (const t of texts) for (const r of t.records) if (r.fontId === font.id) for (const g of r.glyphs) used.add(font.glyphs[g.i].code);
      const extra = [...actual].filter((c) => !expected.has(c));
      for (const c of extra) expect(used.has(c), `font ${item.id}: extra glyph '${String.fromCodePoint(c)}' unused`).toBe(true);
      if (extra.length) extras[item.id] = String.fromCodePoint(...extra);
      // style flags agree with the PostScript style suffix ("Calibri-BoldItalic"); "ArialRoundedMTBold" has none
      const style = item.font.split('-')[1];
      if (style !== undefined) {
        expect(font.bold, item.font).toBe(/Bold/.test(style));
        expect(font.italic, item.font).toBe(/Italic/.test(style));
      }
    }
    // JPEXS's FLA export drops '.' from Calibri-Italic (font 323) although 4 text glyphs use it.
    expect(extras).toEqual({ 323: '.' });
  });

  it('glyph outlines are closed, codes unique, metrics in EM-1024 units', () => {
    for (const f of raw.fonts.values()) {
      expect(f.stats.unclosed, f.def.name).toBe(0);
      expect(new Set(f.def.glyphs.map((g) => g.code)).size).toBe(f.def.glyphs.length);
      for (const g of f.def.glyphs) {
        if (g.code !== 32) expect(g.d.length, `${f.def.name} '${String.fromCodePoint(g.code)}'`).toBeGreaterThan(0);
        for (const m of g.d.matchAll(/-?\d+(\.\d+)?/g)) expect(Math.abs(Number(m[0]))).toBeLessThan(2048);
      }
    }
    const calibri = lib.chars[23] as FontDef;
    expect(calibri).toMatchObject({ name: 'Calibri', ascent: 975, descent: 275, leading: 226, bold: false, italic: false });
    const A = calibri.glyphs.find((g) => g.code === 65)!;
    expect(A.adv).toBeGreaterThan(400);
    expect(A.adv).toBeLessThan(800);
    expect(A.bounds).toBeUndefined(); // Flash wrote an all-zero bounds table
    // outline extent: y down, cap height above the baseline
    const ys = [...A.d.matchAll(/[MLQ]([^MLQZ]*)/g)].flatMap((m) => m[1].trim().split(/\s+/).map(Number).filter((_, i) => i % 2 === 1));
    expect(Math.min(...ys)).toBeLessThan(-500);
    expect(Math.max(...ys)).toBeLessThanOrEqual(20); // small overshoot below the baseline
  });
  it('glyph contours are consistently oriented: nonzero and even-odd coverage agree (schema: nonzero)', () => {
    let glyphs = 0;
    const bad: string[] = [];
    for (const f of fonts) for (const g of f.glyphs) {
      if (!g.d) continue;
      glyphs++;
      // flatten to polygons
      const polys: number[][] = [];
      let cur: number[] = [], x = 0, y = 0;
      for (const m of g.d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
        const n = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
        if (m[1] === 'M') { if (cur.length) polys.push(cur); cur = [n[0], n[1]]; [x, y] = n; }
        else if (m[1] === 'L') { cur.push(n[0], n[1]); [x, y] = n; }
        else if (m[1] === 'Q') {
          for (const t of [0.25, 0.5, 0.75, 1]) cur.push((1 - t) ** 2 * x + 2 * t * (1 - t) * n[0] + t * t * n[2], (1 - t) ** 2 * y + 2 * t * (1 - t) * n[1] + t * t * n[3]);
          [x, y] = [n[2], n[3]];
        }
      }
      if (cur.length) polys.push(cur);
      const xs = polys.flatMap((p) => p.filter((_, i) => i % 2 === 0)), ys = polys.flatMap((p) => p.filter((_, i) => i % 2 === 1));
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      for (let sy = 0.5; sy < 24; sy++) for (let sx = 0.5; sx < 24; sx++) {
        const px = x0 + ((x1 - x0) * sx) / 24 + 0.0123, py = y0 + ((y1 - y0) * sy) / 24 + 0.0171;
        let w = 0;
        for (const p of polys) for (let i = 0; i < p.length; i += 2) {
          const ax = p[i], ay = p[i + 1], bx = p[(i + 2) % p.length], by = p[(i + 3) % p.length];
          const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
          if (ay <= py) { if (by > py && side > 0) w++; } else if (by <= py && side < 0) w--;
        }
        if ((w !== 0) !== (Math.abs(w) % 2 === 1)) { bad.push(`${f.id} '${String.fromCodePoint(g.code)}'`); break; }
      }
    }
    expect(glyphs).toBeGreaterThan(380);
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('DefineText / DefineEditText', () => {
  it('125 static texts reference existing fonts and glyph indices', () => {
    expect(texts).toHaveLength(125);
    for (const t of texts) for (const r of t.records) {
      const font = lib.chars[r.fontId] as FontDef;
      expect(font?.t, `text ${t.id}`).toBe('font');
      for (const g of r.glyphs) expect(g.i).toBeLessThan(font.glyphs.length);
      expect(r.height).toBeGreaterThan(0);
    }
  });

  it('decoded static texts all appear in the FLA (DOMStaticText runs)', () => {
    const fla = getFla();
    const flaStrings = new Set<string>();
    for (const name of fla.names()) {
      if (!name.endsWith('.xml')) continue;
      for (const st of fla.text(name).match(/<DOMStaticText[\s\S]*?<\/DOMStaticText>/g) ?? []) {
        const s = [...st.matchAll(/<characters>([\s\S]*?)<\/characters>/g)].map((m) => decodeXml(m[1])).join('');
        flaStrings.add(s.replace(/\s+/g, ''));
      }
    }
    const missing = texts.map((t) => decodeText(t).replace(/\s+/g, '')).filter((s) => !flaStrings.has(s));
    expect(missing).toEqual([]);
    expect(decodeText(lib.chars[206] as StaticTextDef)).toBe('SINGLE PLAY');
  });

  it('records carry absolute positions (x continues after advances when XOffset is absent)', () => {
    const t = lib.chars[206] as StaticTextDef;
    expect(t.records).toHaveLength(1);
    expect(t.records[0]).toMatchObject({ fontId: 205, height: 10 });
    // glyph advances accumulate from the record start
    const xs = t.records[0].glyphs.reduce((acc, g) => [...acc, acc[acc.length - 1] + g.adv], [t.records[0].x]);
    expect(xs.length).toBe(12);
    expect(t.records[0].color).toEqual([51, 51, 51, 255]); // #333333 in the FLA
  });

  it('20 edit texts; the only device-font field is id 3 ("TEST THE TEXT THING")', () => {
    const edits = Object.values(lib.chars).filter((c) => c.t === 'edit');
    expect(edits).toHaveLength(20);
    for (const e of edits) if (e.t === 'edit' && e.fontId !== undefined) expect(lib.chars[e.fontId]?.t).toBe('font');
    const device = edits.filter((e) => e.t === 'edit' && !e.useOutlines);
    expect(device.map((e) => e.id)).toEqual([3]);
    expect(lib.chars[373]).toMatchObject({ t: 'edit', readOnly: false, maxLength: 10, html: true, fontId: 370, height: 26 });
  });
});
