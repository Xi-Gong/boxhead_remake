/**
 * Fonts and text: DefineFont3, DefineText / DefineText2, DefineEditText.
 *
 * DefineFont3 glyph coordinates are 20x finer than DefineFont/2 (EM square = 1024 * 20 units), so "EM units where
 * 1 EM = 1024" are Font3 values / 20 — the same conversion as twips -> px, which lets glyph outlines reuse the shape
 * path formatter. Glyph outlines go through the two-sided fill reconstruction (shapeConvert.ts) so that contours are
 * consistently oriented regardless of whether the glyph uses FillStyle0 or FillStyle1.
 */
import type { ByteReader } from './ByteReader.ts';
import type { EditTextDef, FontDef, FontGlyph, StaticTextDef, TextRecord } from '../../src/shared/assetSchema.ts';
import { readMatrix, readRect, readRectTwips, readRGB, readRGBA } from './records.ts';
import { readShapeRecords } from './shapes.ts';
import { chainContours, emptyStats, layerize, pathData, shapeRecsToPathRecs, type ConvertStats } from './shapeConvert.ts';

export interface FontParseInfo {
  def: FontDef;
  /** Glyph conversion statistics (unclosed contours etc.). */
  stats: ConvertStats;
  /** Fill style indices used by glyph records ("fill0"/"fill1" -> count). */
  fillUsage: { fill0: number; fill1: number };
  shiftJIS: boolean;
  ansi: boolean;
  languageCode: number;
}

/** Glyph SHAPE -> SVG path (EM units, consistently oriented closed contours). */
function glyphPath(r: ByteReader, stats: ConvertStats, usage: { fill0: number; fill1: number }): string {
  const fBits = r.ub(4), lBits = r.ub(4);
  const recs = readShapeRecords<never>(r, fBits, lBits, null);
  for (const rec of recs) {
    if (rec.t !== 'style') continue;
    if (rec.fill0) usage.fill0++;
    if (rec.fill1) usage.fill1++;
  }
  // A glyph has a single implicit fill style (index 1).
  const accs = layerize(shapeRecsToPathRecs(recs), 1, (n) => ({ fills: n, lines: 0 }), stats);
  let d = '';
  for (const acc of accs) {
    for (const segs of acc.fillSegs) {
      if (!segs.length) continue;
      const cs = chainContours(segs);
      stats.contours += cs.length;
      for (const c of cs) if (!c.closed) stats.unclosed++;
      d += pathData(cs.map((c) => c.segs), (s) => {
        const f = s[0].a, l = s[s.length - 1].a;
        return f[0] === l[4] && f[1] === l[5];
      });
    }
  }
  return d;
}

/** DefineFont3 (75). (DefineFont/DefineFont2 do not occur in this SWF and are not supported.) */
export function parseDefineFont3(r: ByteReader): FontParseInfo {
  const ver = 3;
  const id = r.u16();
  const flags = r.u8();
  const hasLayout = !!(flags & 0x80), shiftJIS = !!(flags & 0x40), smallText = !!(flags & 0x20), ansi = !!(flags & 0x10);
  const wideOffsets = !!(flags & 0x08), wideCodes = !!(flags & 0x04), italic = !!(flags & 0x02), bold = !!(flags & 0x01);
  const languageCode = r.u8();
  const nameLen = r.u8();
  const name = new TextDecoder('utf-8').decode(r.bytes(nameLen)).replace(/\0+$/, '');
  const numGlyphs = r.u16();
  const tableStart = r.pos;
  const offsets: number[] = [];
  for (let i = 0; i < numGlyphs; i++) offsets.push(wideOffsets ? r.u32() : r.u16());
  const codeTableOffset = numGlyphs > 0 || r.remaining > 0 ? (wideOffsets ? r.u32() : r.u16()) : 0;
  const stats = emptyStats();
  const fillUsage = { fill0: 0, fill1: 0 };
  const glyphs: FontGlyph[] = [];
  for (let i = 0; i < numGlyphs; i++) {
    r.pos = tableStart + offsets[i];
    glyphs.push({ code: 0, adv: 0, d: glyphPath(r, stats, fillUsage) });
  }
  if (numGlyphs > 0) r.pos = tableStart + codeTableOffset;
  for (let i = 0; i < numGlyphs; i++) glyphs[i].code = wideCodes ? r.u16() : r.u8();
  const def: FontDef = { t: 'font', id, ver, name, bold, italic, smallText, glyphs };
  const scale = 1 / 20; // Font3 units -> EM units of 1024
  if (hasLayout) {
    def.ascent = r.u16() * scale;
    def.descent = r.u16() * scale;
    def.leading = r.s16() * scale;
    for (let i = 0; i < numGlyphs; i++) glyphs[i].adv = r.s16() * scale;
    for (let i = 0; i < numGlyphs; i++) {
      const b = readRectTwips(r);
      // The Flash IDE writes an all-zero bounds table for DefineFont3; only real bounds are emitted.
      if (b.xMin || b.yMin || b.xMax || b.yMax) glyphs[i].bounds = { xMin: b.xMin * scale, yMin: b.yMin * scale, xMax: b.xMax * scale, yMax: b.yMax * scale };
    }
    const nk = r.u16();
    if (nk) {
      def.kerning = [];
      for (let i = 0; i < nk; i++) {
        const c1 = wideCodes ? r.u16() : r.u8(), c2 = wideCodes ? r.u16() : r.u8();
        def.kerning.push([c1, c2, r.s16() * scale]);
      }
    }
  }
  return { def, stats, fillUsage, shiftJIS, ansi, languageCode };
}

/** DefineText (11) / DefineText2 (33). */
export function parseDefineText(r: ByteReader, code: number): StaticTextDef {
  const ver = code === 33 ? 2 : 1;
  const id = r.u16();
  const bounds = readRect(r);
  const m = readMatrix(r);
  const glyphBits = r.u8(), advanceBits = r.u8();
  const records: TextRecord[] = [];
  // Style state carried across records (positions kept in integer twips).
  let fontId = 0, color: [number, number, number, number] = [0, 0, 0, 255], height = 0, xTw = 0, yTw = 0;
  for (;;) {
    const flags = r.u8();
    if (flags === 0) break;
    if (flags & 0x08) fontId = r.u16();
    if (flags & 0x04) color = ver === 2 ? readRGBA(r) : readRGB(r);
    if (flags & 0x01) xTw = r.s16();
    if (flags & 0x02) yTw = r.s16();
    if (flags & 0x08) height = r.u16() / 20;
    const n = r.u8();
    const startX = xTw;
    const glyphs = [];
    for (let i = 0; i < n; i++) {
      const gi = r.ub(glyphBits), adv = r.sb(advanceBits);
      glyphs.push({ i: gi, adv: adv / 20 });
      xTw += adv; // a record without XOffset continues where the previous one ended
    }
    r.align();
    records.push({ fontId, color, x: startX / 20, y: yTw / 20, height, glyphs });
  }
  return { t: 'text', id, ver, bounds, m, records };
}

/** DefineEditText (37). */
export function parseDefineEditText(r: ByteReader): EditTextDef {
  const id = r.u16();
  const bounds = readRect(r);
  const f1 = r.u8(), f2 = r.u8();
  const hasText = !!(f1 & 0x80), hasColor = !!(f1 & 0x04), hasMaxLength = !!(f1 & 0x02), hasFont = !!(f1 & 0x01);
  const hasFontClass = !!(f2 & 0x80), hasLayout = !!(f2 & 0x20);
  const def: EditTextDef = {
    t: 'edit', id, bounds, varName: '',
    wordWrap: !!(f1 & 0x40), multiline: !!(f1 & 0x20), password: !!(f1 & 0x10), readOnly: !!(f1 & 0x08),
    autoSize: !!(f2 & 0x40), noSelect: !!(f2 & 0x10), border: !!(f2 & 0x08), wasStatic: !!(f2 & 0x04),
    html: !!(f2 & 0x02), useOutlines: !!(f2 & 0x01),
  };
  if (hasFont) def.fontId = r.u16();
  if (hasFontClass) def.fontClass = r.string();
  if (hasFont || hasFontClass) def.height = r.u16() / 20;
  if (hasColor) def.color = readRGBA(r);
  if (hasMaxLength) def.maxLength = r.u16();
  if (hasLayout) {
    def.align = r.u8();
    def.leftMargin = r.u16() / 20;
    def.rightMargin = r.u16() / 20;
    def.indent = r.u16() / 20;
    def.leading = r.s16() / 20;
  }
  def.varName = r.string();
  if (hasText) def.initialText = r.string();
  return def;
}
