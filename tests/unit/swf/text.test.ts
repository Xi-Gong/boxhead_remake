import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { EditTextDef, FontDef, StaticTextDef } from '../../../src/shared/assetSchema.ts';
import { ByteReader } from '../../../tools/swf/ByteReader.ts';
import { alignZoneFloat16, parseCsmTextSettings, parseDefineFontAlignZones } from '../../../tools/swf/text.ts';
import { csmTextSettings } from '../../../tools/oracle/visual/csmProbe.ts';
import { FLA_PATH } from '../../../tools/paths.ts';
import { decodeXml, getBuild, getFla, xmlElements } from './helpers.ts';

// v0.2.0: assets/projects (the ffdec FLA export) was deleted from the repo; the FLA cross-checks below degrade to
// skips. Regeneration: assets/README.md ("Regenerating the deleted reference material").
const haveFla = existsSync(FLA_PATH);

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
  const flaFonts = haveFla ? xmlElements(getFla().text('DOMDocument.xml'), 'DOMFontItem') : [];

  it.skipIf(!haveFla)('8 fonts; glyph code sets equal the FLA embedded characters (+ chars the FLA list omits but texts use)', () => {
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

  it.skipIf(!haveFla)('decoded static texts all appear in the FLA (DOMStaticText runs)', () => {
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

describe('FlashType tags (DefineFontAlignZones, CSMTextSettings)', () => {
  const outline = (f: FontDef, ch: string) => {
    const g = f.glyphs.find((x) => x.code === ch.charCodeAt(0))!;
    const n = [...g.d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return { xMin: Math.min(...xs), yMin: Math.min(...ys), i: f.glyphs.indexOf(g) };
  };

  it('FLOAT16 zone values have no implicit leading 1 (mantissa * 2^(exp-16) EM-1024 units)', () => {
    expect(alignZoneFloat16(0)).toBe(0);
    expect(alignZoneFloat16(0x4288)).toBe(648); // Calibri cap height (outline 647..650)
    expect(alignZoneFloat16(0x3fb9)).toBe(476.5); // Calibri x-height
    expect(alignZoneFloat16(0x36b2)).toBe(86.25); // Calibri 'H' left stem (outline x 86)
    expect(alignZoneFloat16(0x8000 | 0x4288)).toBe(-648);
  });

  it('every font has one zone record per glyph; hints; values match the outlines', () => {
    const hints: Record<number, number> = {};
    for (const f of fonts) {
      expect(f.alignZones, f.name).toBeDefined();
      expect(f.alignZones!.zones).toHaveLength(f.glyphs.length);
      hints[f.id] = f.alignZones!.hint;
      f.glyphs.forEach((g, i) => {
        const z = f.alignZones!.zones[i];
        if (g.code === 32) expect(z).toBeNull();
        else expect(z?.[1], `${f.name} ${String.fromCharCode(g.code)}`).toBe(0); // y = baseline
      });
    }
    expect(hints).toEqual({ 2: 1, 23: 1, 25: 1, 205: 2, 323: 1, 324: 1, 370: 1, 753: 1 });
    const calibri = lib.chars[23] as FontDef;
    const z = (ch: string) => calibri.alignZones!.zones[outline(calibri, ch).i]!;
    expect(z('H')).toEqual([86.25, 0, 378, 648]);
    for (const ch of 'ABEHKLMNPRTXZ') expect(z(ch)[3], ch).toBe(648); // cap height
    for (const ch of 'abcdeghkmnopqrsuvwxyz') expect(z(ch)[3], ch).toBe(476.5); // x-height
    for (const ch of 'BDEFHIKLNPRbhklmnpr') expect(Math.abs(z(ch)[0] - outline(calibri, ch).xMin), ch).toBeLessThan(2.5); // stem x
    expect(Math.abs(z('-')[3] + outline(calibri, '-').yMin)).toBeLessThan(1); // top of the hyphen
  });

  it('104 CSMTextSettings: all FlashType, thickness/sharpness 0; gridFit subpixel except edit texts 24, 57, 58 (pixel)', () => {
    const withCsm = Object.values(lib.chars).filter((c) => (c.t === 'text' || c.t === 'edit') && c.csm) as (StaticTextDef | EditTextDef)[];
    expect(withCsm).toHaveLength(104);
    expect(withCsm.filter((c) => c.t === 'text')).toHaveLength(87);
    for (const c of withCsm) expect(c.csm).toMatchObject({ flashType: true, thickness: 0, sharpness: 0 });
    expect(withCsm.filter((c) => c.csm!.gridFit === 1).map((c) => c.id).sort((a, b) => a - b)).toEqual([24, 57, 58]);
    expect(withCsm.filter((c) => c.csm!.gridFit !== 1).every((c) => c.csm!.gridFit === 2)).toBe(true);
    expect((lib.chars[206] as StaticTextDef).csm).toEqual({ flashType: true, gridFit: 2, thickness: 0, sharpness: 0 });
    expect((lib.chars[503] as StaticTextDef).csm).toBeUndefined(); // "normal" anti-aliased static text
  });

  it('parses synthetic tags (probe encoder round trip)', () => {
    const tag = csmTextSettings(77, { flashType: true, gridFit: 1, thickness: -12.5, sharpness: 200 });
    const body = tag.subarray(2); // short tag header
    const r = new ByteReader(body);
    expect(parseCsmTextSettings(r)).toEqual({ textId: 77, csm: { flashType: true, gridFit: 1, thickness: -12.5, sharpness: 200 } });
    expect(r.remaining).toBe(1); // reserved UI8
    const zb = Uint8Array.of(5, 0, 0x80, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0xb2, 0x36, 0, 0, 0xc6, 0x3a, 0x88, 0x42, 3);
    const zr = parseDefineFontAlignZones(new ByteReader(zb), 2);
    expect(zr).toEqual({ fontId: 5, zones: { hint: 2, zones: [null, [86.25, 0, 177.5, 648]] } });
  });
});
