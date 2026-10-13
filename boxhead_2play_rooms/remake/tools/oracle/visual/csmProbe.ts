/**
 * Probe T1: FlashType ("anti-alias for readability", CSMTextSettings) text rasterization in the real Flash Player.
 *                                                                                    OWNER: lane T (text)
 *
 *   node tools/oracle/visual/csmProbe.ts <experiment> [--player=8|28] [--keep]
 *   node tools/oracle/visual/csmProbe.ts list
 *
 * Builds a standalone 640x480 SWF 8 that embeds the GAME's own fonts (DefineFont3 + DefineFontAlignZones tag bytes
 * copied verbatim from ../boxhead_2play_rooms.swf) and one DefineText2 per probe case (one text record: font, size,
 * colour, glyph indices, advances) with a CSMTextSettings tag (UseFlashType / GridFit / Thickness / Sharpness), placed
 * by PlaceObject2 at an exact twip position. The projector is started background-safe (projector.ts: minimized, not
 * activated, restore position off-screen, killed by PID), its stage captured with PrintWindow at 100 %, and the
 * pixels of every case's cell are written to generated/csm/<experiment>_fp<v>.json (+ .png).
 * The experiments are listed in EXPERIMENTS below; tests/goldens/flash/csm_*.json are copies of selected outputs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { captureProjector, killProjector, launchProjector, projectorExe } from './projector.ts';
import { GENERATED, ROOT, SWF_PATH, isMain } from '../../paths.ts';
import { SwfFile, TAG } from '../../swf/SwfFile.ts';
import { BitSink, encodeTag, matrix, placeObject2, rect, sbits, wrapSwf, defineRectShape } from '../swfWrite.ts';
import { ByteSink } from '../avm1asm.ts';

export const CSM_OUT = resolve(GENERATED, 'csm');

// ---------------------------------------------------------------------------------------------- encoders

export interface CsmSpec { flashType: boolean; gridFit: number; thickness: number; sharpness: number }

/** CSMTextSettings (74): TextID UI16, UseFlashType UB[2], GridFit UB[3], Reserved UB[3], Thickness F32, Sharpness F32, Reserved UI8. */
export function csmTextSettings(textId: number, c: CsmSpec): Uint8Array {
  const s = new BitSink();
  s.bytes.u16(textId);
  s.ub(2, c.flashType ? 1 : 0).ub(3, c.gridFit).ub(3, 0);
  s.bytes.f32(c.thickness).f32(c.sharpness).u8(0);
  return encodeTag(TAG.CSMTextSettings, s.toBytes());
}

export interface TextSpec {
  id: number;
  fontId: number;
  /** font size in px (stored in twips) */
  size: number;
  /** RGBA */
  color: [number, number, number, number];
  /** glyph indices and advances (px, stored in twips) */
  glyphs: { i: number; adv: number }[];
  /** record XOffset / YOffset (px; twips) */
  x?: number;
  y?: number;
  /** TextMatrix translation (px) */
  mtx?: number;
  mty?: number;
  /** TextBounds (px, text space) */
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
}

/** DefineText2 (33) with a single text record. */
export function defineText2(t: TextSpec): Uint8Array {
  const tw = (v: number): number => Math.round(v * 20);
  const s = new BitSink();
  s.bytes.u16(t.id);
  rect(s, tw(t.bounds.xMin), tw(t.bounds.xMax), tw(t.bounds.yMin), tw(t.bounds.yMax));
  matrix(s, { tx: t.mtx ?? 0, ty: t.mty ?? 0 });
  const maxI = Math.max(1, ...t.glyphs.map((g) => g.i));
  const glyphBits = Math.ceil(Math.log2(maxI + 1)) || 1;
  const advBits = sbits(...t.glyphs.map((g) => tw(g.adv)), 0);
  s.bytes.u8(glyphBits).u8(advBits);
  // TEXTRECORD: type 1, reserved 000, HasFont, HasColor, HasYOffset, HasXOffset
  s.bytes.u8(0x80 | 0x08 | 0x04 | 0x02 | 0x01);
  s.bytes.u16(t.fontId);
  s.bytes.u8(t.color[0]).u8(t.color[1]).u8(t.color[2]).u8(t.color[3]);
  s.bytes.s16(tw(t.x ?? 0)).s16(tw(t.y ?? 0));
  s.bytes.u16(tw(t.size));
  s.bytes.u8(t.glyphs.length);
  for (const g of t.glyphs) s.ub(glyphBits, g.i).sb(advBits, tw(g.adv));
  s.align();
  s.bytes.u8(0); // EndOfRecordsFlag
  return encodeTag(TAG.DefineText2, s.toBytes(), true);
}

// ---------------------------------------------------------------------------------------------- game fonts

interface GameFont { id: number; name: string; bold: boolean; italic: boolean; glyphs: { code: number; adv: number; d: string }[]; tags: Uint8Array[] }

let gameFontsCache: Map<number, GameFont> | null = null;

/** The game's DefineFont3 / DefineFontAlignZones tags (verbatim bytes) + glyph data from public/assets/library.json. */
export function gameFonts(): Map<number, GameFont> {
  if (gameFontsCache) return gameFontsCache;
  const lib = JSON.parse(readFileSync(resolve(ROOT, 'public', 'assets', 'library.json'), 'utf8')) as { chars: Record<string, any> };
  const swf = SwfFile.fromPath(SWF_PATH);
  const out = new Map<number, GameFont>();
  for (const t of swf.tags()) {
    if (t.code !== TAG.DefineFont3 && t.code !== TAG.DefineFontAlignZones) continue;
    const id = t.body[0]! | (t.body[1]! << 8);
    let f = out.get(id);
    if (!f) {
      const c = lib.chars[id];
      f = { id, name: c.name, bold: c.bold, italic: c.italic, glyphs: c.glyphs, tags: [] };
      out.set(id, f);
    }
    f.tags.push(swf.data.slice(t.headerOffset, t.offset + t.length));
  }
  gameFontsCache = out;
  return out;
}

export function glyphIndex(fontId: number, ch: string): number {
  const f = gameFonts().get(fontId)!;
  const i = f.glyphs.findIndex((g) => g.code === ch.charCodeAt(0));
  if (i < 0) throw new Error(`font ${fontId} has no glyph ${JSON.stringify(ch)}`);
  return i;
}

// ---------------------------------------------------------------------------------------------- cases

export interface CsmCase {
  fontId: number;
  size: number;
  /** characters (each must exist in the font) */
  text: string;
  /** text origin (baseline start) on the stage, px (twip resolution) */
  x: number;
  y: number;
  color?: [number, number, number, number];
  csm?: CsmSpec | null;
  /** how the origin is expressed: 'place' = PlaceObject matrix (default), 'record' = text record offsets, 'matrix' = text matrix */
  via?: 'place' | 'record' | 'matrix';
  /** extra advance per glyph (px) */
  spacing?: number;
  /** explicit advance per glyph (px; overrides the font's advance + spacing) */
  adv?: number;
  /** capture cell (stage px) */
  cell: { x: number; y: number; w: number; h: number };
  /** free-form label */
  tag?: string;
  /** DefineText bounds (text space, px) instead of the automatic ones */
  bounds?: { xMin: number; yMin: number; xMax: number; yMax: number };
  /** place a copy of the GAME's text character (DefineText/DefineEditText tag + its CSMTextSettings, verbatim) */
  gameChar?: number;
  /** replace the game character's CSMTextSettings (null: drop it) */
  gameCsm?: CsmSpec | null;
  /** placement scale */
  scale?: number;
}

let gameTextTags: Map<number, { tag: Uint8Array; csm?: Uint8Array; fonts: number[] }> | null = null;

/** The game's DefineText / DefineText2 / DefineEditText tags (+ CSMTextSettings) by character id, verbatim. */
export function gameTexts(): Map<number, { tag: Uint8Array; csm?: Uint8Array; fonts: number[] }> {
  if (gameTextTags) return gameTextTags;
  const lib = JSON.parse(readFileSync(resolve(ROOT, 'public', 'assets', 'library.json'), 'utf8')) as { chars: Record<string, any> };
  const swf = SwfFile.fromPath(SWF_PATH);
  const out = new Map<number, { tag: Uint8Array; csm?: Uint8Array; fonts: number[] }>();
  for (const t of swf.tags()) {
    const id = t.body[0]! | (t.body[1]! << 8);
    const bytes = swf.data.slice(t.headerOffset, t.offset + t.length);
    if (t.code === TAG.DefineText || t.code === TAG.DefineText2 || t.code === TAG.DefineEditText) {
      const c = lib.chars[id];
      const fonts = c.t === 'text' ? [...new Set<number>(c.records.map((r: any) => r.fontId))] : c.fontId !== undefined ? [c.fontId] : [];
      out.set(id, { tag: bytes, fonts });
    } else if (t.code === TAG.CSMTextSettings) {
      const e = out.get(id);
      if (e) e.csm = bytes;
    }
  }
  gameTextTags = out;
  return out;
}

/** [xMin, yMin, xMax, yMax] of a glyph path (EM units). */
export function outlineBox(d: string): [number, number, number, number] {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
  if (!n.length) return [0, 0, 0, 0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]!); x1 = Math.max(x1, n[i]!); y0 = Math.min(y0, n[i + 1]!); y1 = Math.max(y1, n[i + 1]!); }
  return [x0, y0, x1, y1];
}

export const DEFAULT_CSM: CsmSpec = { flashType: true, gridFit: 2, thickness: 0, sharpness: 0 };

export function buildCsmSwf(cases: CsmCase[], bg = 0xffffff): Uint8Array {
  const fonts = gameFonts();
  const used = new Set(cases.flatMap((c) => (c.gameChar !== undefined ? gameTexts().get(c.gameChar)!.fonts : [c.fontId])));
  const tags: Uint8Array[] = [encodeTag(TAG.SetBackgroundColor, Uint8Array.of((bg >> 16) & 255, (bg >> 8) & 255, bg & 255))];
  for (const id of used) for (const t of fonts.get(id)!.tags) tags.push(t);
  const placedGame = new Set<number>();
  cases.forEach((c, n) => {
    if (c.gameChar !== undefined) {
      const g = gameTexts().get(c.gameChar)!;
      if (!placedGame.has(c.gameChar)) {
        placedGame.add(c.gameChar);
        tags.push(g.tag);
        if (c.gameCsm !== undefined) { if (c.gameCsm) tags.push(csmTextSettings(c.gameChar, c.gameCsm)); }
        else if (g.csm) tags.push(g.csm);
      }
      tags.push(placeObject2({ depth: n + 1, charId: c.gameChar, matrix: { a: c.scale ?? 1, d: c.scale ?? 1, tx: c.x, ty: c.y } }));
      return;
    }
    const id = 1000 + n;
    const f = fonts.get(c.fontId)!;
    // advances: the font's (fonts without a layout table: outline width + 8 %); bounds: glyph outlines + 3 px
    // (FlashType text is CLIPPED to the DefineText bounds)
    let pen = 0, bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
    const glyphs = [...c.text].map((ch) => {
      const i = glyphIndex(c.fontId, ch);
      const bb = outlineBox(f.glyphs[i]!.d);
      const k = c.size / 1024;
      bx0 = Math.min(bx0, pen + bb[0] * k); bx1 = Math.max(bx1, pen + bb[2] * k);
      by0 = Math.min(by0, bb[1] * k); by1 = Math.max(by1, bb[3] * k);
      const adv = f.glyphs[i]!.adv || (bb[2] + 80);
      const a = Math.round((c.adv ?? adv * k + (c.spacing ?? 0)) * 20) / 20;
      pen += a;
      return { i, adv: a };
    });
    const via = c.via ?? 'place';
    const ox = via === 'place' ? 0 : c.x, oy = via === 'place' ? 0 : c.y;
    const bounds = c.bounds ?? { xMin: Math.floor(bx0) - 3, yMin: Math.floor(by0) - 3, xMax: Math.ceil(Math.max(bx1, pen)) + 3, yMax: Math.ceil(by1) + 3 };
    tags.push(defineText2({
      id, fontId: c.fontId, size: c.size, color: c.color ?? [0, 0, 0, 255], glyphs,
      x: via === 'record' ? ox : 0, y: via === 'record' ? oy : 0,
      mtx: via === 'matrix' ? ox : 0, mty: via === 'matrix' ? oy : 0,
      bounds: via === 'place' ? bounds : { xMin: bounds.xMin + ox, xMax: bounds.xMax + ox, yMin: bounds.yMin + oy, yMax: bounds.yMax + oy },
    }));
    if (c.csm !== null) tags.push(csmTextSettings(id, c.csm ?? DEFAULT_CSM));
    tags.push(placeObject2({ depth: n + 1, charId: id, matrix: via === 'place' ? { a: c.scale ?? 1, d: c.scale ?? 1, tx: c.x, ty: c.y } : {} }));
  });
  tags.push(encodeTag(TAG.ShowFrame, new Uint8Array(0)), encodeTag(TAG.End, new Uint8Array(0)));
  const all = new ByteSink();
  for (const t of tags) all.bytes(t);
  return wrapSwf(all.toBytes(), 1, { width: 640, height: 480, frameRate: 12 });
}

// ---------------------------------------------------------------------------------------------- run

export interface CaseResult { c: CsmCase; w: number; h: number; /** RGB per pixel, row-major, of the cell */ rgb: number[] }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runCsmProbe(name: string, cases: CsmCase[], opts: { player?: string; bg?: number } = {}): Promise<CaseResult[]> {
  mkdirSync(CSM_OUT, { recursive: true });
  const pv = opts.player ?? '28';
  const swfPath = join(CSM_OUT, `${name}.swf`);
  writeFileSync(swfPath, buildCsmSwf(cases, opts.bg));
  const { pid } = launchProjector(projectorExe(pv), swfPath);
  const png = join(CSM_OUT, `${name}_fp${pv}.png`);
  try {
    await sleep(2500);
    let out = '';
    for (let a = 0; a < 3 && !out.startsWith('ok 640x480'); a++) { if (a) await sleep(1000); out = captureProjector(pid, png); }
    if (!out.startsWith('ok 640x480')) throw new Error(`capture: ${out}`);
  } finally {
    killProjector(pid);
  }
  const img = PNG.sync.read(readFileSync(png));
  const res = cases.map((c) => {
    const rgb: number[] = [];
    for (let y = c.cell.y; y < c.cell.y + c.cell.h; y++) for (let x = c.cell.x; x < c.cell.x + c.cell.w; x++) {
      const i = (y * 640 + x) * 4;
      rgb.push((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
    }
    return { c, w: c.cell.w, h: c.cell.h, rgb };
  });
  writeFileSync(join(CSM_OUT, `${name}_fp${pv}.json`), JSON.stringify(res));
  return res;
}

// ---------------------------------------------------------------------------------------------- experiments

/** Lay out cases on a grid of cells (w x h), row-major from (4, 4). */
export function grid<T>(items: T[], w: number, h: number, make: (it: T, cx: number, cy: number) => CsmCase): CsmCase[] {
  const out: CsmCase[] = [];
  const cols = Math.floor(632 / w);
  items.forEach((it, k) => {
    const cx = 4 + (k % cols) * w, cy = 4 + Math.floor(k / cols) * h;
    if (cy + h > 476) throw new Error(`grid overflow at item ${k} (${items.length} items, cell ${w}x${h})`);
    out.push(make(it, cx, cy));
  });
  return out;
}

/**
 * Shelf-pack items with their own cell sizes into 640x480 pages. `make` gets the cell's top-left corner and returns
 * the case (its cell must be the one given).
 */
export function pack<T>(items: T[], size: (it: T) => { w: number; h: number }, make: (it: T, cx: number, cy: number) => CsmCase): CsmCase[][] {
  const pages: CsmCase[][] = [[]];
  let x = 2, y = 2, rowH = 0;
  for (const it of items) {
    const { w, h } = size(it);
    if (x + w > 638) { x = 2; y += rowH + 1; rowH = 0; }
    if (y + h > 478) { pages.push([]); x = 2; y = 2; rowH = 0; }
    pages[pages.length - 1]!.push(make(it, x, y));
    x += w + 1; rowH = Math.max(rowH, h);
  }
  return pages;
}

const range = (n: number, f: (i: number) => number = (i) => i): number[] => Array.from({ length: n }, (_, i) => f(i));

/** Fonts of the game with the (font size, ...) combinations its FlashType texts use. */
export const GAME_SIZES: Record<number, number[]> = {
  23: [10, 12, 14, 20, 31], 25: [10, 12, 14, 16, 18, 24, 32, 37, 40, 61, 96], 323: [12], 324: [12], 205: [10], 370: [26, 32], 753: [10],
};
const PREF = ['l', 'H', 'o', 'I', '-', 'n', 'T', 'O', 'E', 'S', 'i', 'e', 'f'];

function glyphsOf(fontId: number, n: number): string[] {
  const f = gameFonts().get(fontId)!;
  const have = new Set(f.glyphs.map((g) => String.fromCharCode(g.code)));
  const out = PREF.filter((c) => have.has(c));
  for (const g of f.glyphs) { const c = String.fromCharCode(g.code); if (out.length >= n) break; if (c !== ' ' && !out.includes(c)) out.push(c); }
  return out.slice(0, n);
}

const cellFor = (size: number, chars = 1): { w: number; h: number } => ({ w: Math.ceil(size * 0.8 * chars) + 8, h: Math.ceil(size * 1.25) + 8 });

/** The game's FlashType static texts (DefineText + CSMTextSettings), verbatim, at integer + `frac` positions. */
function gameStaticTexts(frac: number, filter: (c: any) => boolean = () => true): CsmCase[][] {
  const lib = JSON.parse(readFileSync(resolve(ROOT, 'public', 'assets', 'library.json'), 'utf8')) as { chars: Record<string, any> };
  const items = Object.values(lib.chars).filter((c: any) => c.t === 'text' && c.csm && filter(c));
  return pack(items, (c: any) => ({ w: Math.ceil(c.bounds.xMax - c.bounds.xMin) + 4, h: Math.ceil(c.bounds.yMax - c.bounds.yMin) + 4 }), (c: any, cx, cy) => {
    const w = Math.ceil(c.bounds.xMax - c.bounds.xMin) + 4, h = Math.ceil(c.bounds.yMax - c.bounds.yMin) + 4;
    const x = Math.round(cx + 2 - c.bounds.xMin) + frac, y = Math.round(cy + 2 - c.bounds.yMin) + frac;
    return { fontId: 0, size: 0, text: '', gameChar: c.id, x, y, cell: { x: cx, y: cy, w, h }, tag: `text ${c.id} frac=${frac}` };
  });
}

/** 'Hmo-' cases in a set of variants (colour, gridFit, scale, bounds clip) on one page. */
function variantCases(variants: { tag: string; size?: number; color?: [number, number, number, number]; csm?: CsmSpec; scale?: number; fx?: number; bounds?: CsmCase['bounds'] }[]): CsmCase[][] {
  return pack(variants, (v) => { const k = (v.size ?? 14) * (v.scale ?? 1); return { w: Math.ceil(k * 2.4) + 8, h: Math.ceil(k * 1.25) + 8 }; }, (v, cx, cy) => {
    const k = (v.size ?? 14) * (v.scale ?? 1);
    const w = Math.ceil(k * 2.4) + 8, h = Math.ceil(k * 1.25) + 8;
    return { fontId: 23, size: v.size ?? 14, text: 'Hmo-', color: v.color, csm: v.csm, scale: v.scale, bounds: v.bounds, x: cx + 3 + (v.fx ?? 0), y: cy + 3 + Math.ceil(k) + (v.fx ?? 0), cell: { x: cx, y: cy, w, h }, tag: v.tag };
  });
}

/** The game's FlashType edit texts (DefineEditText + CSMTextSettings, verbatim, initial text), integer + `frac`. */
function gameEditTexts(frac: number): CsmCase[][] {
  const lib = JSON.parse(readFileSync(resolve(ROOT, 'public', 'assets', 'library.json'), 'utf8')) as { chars: Record<string, any> };
  const items = Object.values(lib.chars).filter((c: any) => c.t === 'edit' && c.csm);
  return pack(items, (c: any) => ({ w: Math.ceil(c.bounds.xMax - c.bounds.xMin) + 4, h: Math.ceil(c.bounds.yMax - c.bounds.yMin) + 4 }), (c: any, cx, cy) => {
    const w = Math.ceil(c.bounds.xMax - c.bounds.xMin) + 4, h = Math.ceil(c.bounds.yMax - c.bounds.yMin) + 4;
    const x = Math.round(cx + 2 - c.bounds.xMin) + frac, y = Math.round(cy + 2 - c.bounds.yMin) + frac;
    return { fontId: 0, size: 0, text: '', gameChar: c.id, x, y, cell: { x: cx, y: cy, w, h }, tag: `edit ${c.id} frac=${frac}` };
  });
}

export const EXPERIMENTS: Record<string, () => CsmCase[][]> = {
  /** the game's 17 FlashType edit texts with their initial text, at integer / +0.3 / +0.6 positions (run with --bg=808080) */
  gameedits: () => [...gameEditTexts(0), ...gameEditTexts(0.3), ...gameEditTexts(0.6)],
  /** which text colours use the LIGHT CSM table (run with --bg=000000) */
  lightness: () => {
    const cols: [number, number, number, number][] = [];
    for (const g of [96, 112, 128, 136, 144, 152, 160, 176, 192, 208, 224, 240, 255]) cols.push([g, g, g, 255]);
    cols.push([0, 255, 0, 255], [255, 255, 0, 255], [0, 255, 255, 255], [255, 0, 255, 255], [254, 95, 95, 255], [255, 128, 0, 255], [128, 255, 128, 255]);
    for (const a of [250, 230, 200, 160, 129, 127]) cols.push([255, 255, 255, a]);
    const v = cols.map((c) => ({ tag: `light ${c.join(',')}`, size: 14, color: c }));
    return variantCases(v);
  },
  /** white text: every game font at many sizes (LIGHT CSM table) — run with --bg=000000 */
  lightsizes: () => {
    const items: { font: number; size: number; ch: string }[] = [];
    const sizes = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 32, 40, 48, 61, 72, 96];
    for (const font of [23, 25, 205]) for (const size of sizes) for (const ch of glyphsOf(font, 4)) items.push({ font, size, ch });
    return pack(items, (it) => cellFor(it.size), (it, cx, cy) => {
      const c = cellFor(it.size);
      return { fontId: it.font, size: it.size, text: it.ch, color: [255, 255, 255, 255], x: cx + 4, y: cy + 4 + Math.ceil(it.size), cell: { x: cx, y: cy, ...c }, tag: `f${it.font} s${it.size} ${it.ch}` };
    });
  },
  /** colours on the default white background (run with --bg=ffffff) and on black (--bg=000000) */
  colors: () => {
    const cols: [number, number, number, number][] = [[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [51, 51, 51, 255], [0, 0, 0, 128], [255, 255, 255, 128], [0, 128, 255, 255], [204, 0, 0, 200]];
    const v = cols.flatMap((c) => [10, 14, 24].map((size) => ({ tag: `col ${c.join(',')} s${size}`, size, color: c })));
    return variantCases(v);
  },
  /** gridFit none / pixel / subpixel at fractional positions; placement scales 2, 0.5, 1.5; tight bounds */
  modes: () => {
    const v: Parameters<typeof variantCases>[0] = [];
    for (const gridFit of [0, 1, 2]) for (const size of [10, 14, 24]) for (const fx of [0, 0.25, 0.5, 0.75]) v.push({ tag: `grid${gridFit} s${size} fx${fx}`, size, fx, csm: { flashType: true, gridFit, thickness: 0, sharpness: 0 } });
    for (const scale of [2, 0.5, 1.5, 1.25]) for (const size of [10, 14]) for (const fx of [0, 0.5]) v.push({ tag: `scale${scale} s${size} fx${fx}`, size, scale, fx });
    for (const xMax of [8.3, 9.5, 10.75, 12]) for (const yMin of [-9.3, -8, -10.6]) v.push({ tag: `clip x${xMax} y${yMin}`, size: 14, bounds: { xMin: 1.4, yMin, xMax, yMax: 3 } });
    return variantCases(v);
  },
  /** origin snapping threshold vs font size and DefineText bounds: one 'l' (Calibri), x = y = integer + f */
  thresh: () => {
    const items: { size: number; f: number; bx: number }[] = [];
    for (const size of [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40]) for (let k = 0; k < 20; k++) items.push({ size, f: k / 20, bx: 0 });
    for (const bx of [-0.5, -1.25, -7.3]) for (let k = 0; k < 20; k++) items.push({ size: 20, f: k / 20, bx });
    return pack(items, (it) => ({ w: Math.ceil(it.size * 0.3) + 8, h: Math.ceil(it.size * 0.9) + 8 }), (it, cx, cy) => {
      const w = Math.ceil(it.size * 0.3) + 8, h = Math.ceil(it.size * 0.9) + 8;
      const bounds = it.bx ? { xMin: it.bx, yMin: -it.size + it.bx, xMax: 6, yMax: 3 } : undefined;
      return { fontId: 23, size: it.size, text: 'l', x: cx + 3 + it.f, y: cy + 3 + Math.ceil(it.size * 0.75) + it.f, bounds, cell: { x: cx, y: cy, w, h }, tag: `thr s${it.size} f${it.f} b${it.bx}` };
    });
  },
  /** origin tie-breaking: 'l' x n (Calibri 20), origin fraction 0.4..0.6, advance 6.00..6.15 (twips parity), n = 1, 2, 3, 8 */
  tie: () => {
    const items: { n: number; fx: number; adv: number; fy: number }[] = [];
    for (const n of [1, 2, 3, 8]) for (const fx of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) for (const adv of [6, 6.05, 6.1, 6.15]) items.push({ n, fx, adv, fy: 0 });
    for (const fy of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) for (const adv of [6, 6.05, 6.1, 6.15]) items.push({ n: 2, fx: 0, adv, fy });
    return pack(items, (it) => ({ w: Math.ceil(it.n * 6.2) + 6, h: 30 }), (it, cx, cy) => ({ fontId: 23, size: 20, text: 'l'.repeat(it.n), adv: it.adv, x: cx + 3 + it.fx, y: cy + 24 + it.fy, cell: { x: cx, y: cy, w: Math.ceil(it.n * 6.2) + 6, h: 30 }, tag: `tie n${it.n} fx${it.fx} fy${it.fy} adv${it.adv}` }));
  },
  /** pen positions: 8 x 'l' (Calibri 20) / 'I' (Arial Rounded Bold 20, no layout table) with advances 6 + k/20 */
  pen: () => {
    const items: { font: number; ch: string; k: number; fx: number }[] = [];
    for (const [font, ch] of [[23, 'l'], [205, 'I']] as const) for (const fx of [0, 0.3, 0.6]) for (let k = 0; k < 20; k++) items.push({ font, ch, k, fx });
    return pack(items, () => ({ w: 60, h: 30 }), (it, cx, cy) => {
      return { fontId: it.font, size: 20, text: it.ch.repeat(8), adv: 6 + it.k / 20, x: cx + 3 + it.fx, y: cy + 24, cell: { x: cx, y: cy, w: 60, h: 30 }, tag: `pen f${it.font} k${it.k} fx${it.fx}` };
    });
  },
  /** the game's 87 FlashType static texts at integer positions and at +0.3 / +0.7 px */
  gametexts: () => [...gameStaticTexts(0), ...gameStaticTexts(0.3), ...gameStaticTexts(0.7)],
  /** grid fitting in X: 'l', 'H' (Calibri), 'I', 'n' (Calibri Bold) at sizes 10..40 in 1/4 px steps, integer origin */
  xsnap: () => {
    const items: { font: number; size: number; ch: string }[] = [];
    for (const [font, ch] of [[23, 'l'], [23, 'H'], [25, 'I'], [25, 'n']] as const) for (let size = 10; size <= 40; size += 0.25) items.push({ font, size, ch });
    return pack(items, (it) => cellFor(it.size), (it, cx, cy) => {
      const c = cellFor(it.size);
      return { fontId: it.font, size: it.size, text: it.ch, x: cx + 4, y: cy + 4 + Math.ceil(it.size), cell: { x: cx, y: cy, ...c }, tag: `f${it.font} s${it.size} ${it.ch}` };
    });
  },
  /** single glyphs 'l', 'H', 'o', '-', 'n' (Calibri 10) at x and y phases 0..0.95 */
  phase10: () => {
    const items: { ch: string; fx: number; fy: number }[] = [];
    for (const ch of ['l', 'H', 'o', '-', 'n']) {
      for (const f of range(20, (i) => i / 20)) items.push({ ch, fx: f, fy: 0 });
      for (const f of range(20, (i) => i / 20)) items.push({ ch, fx: 0, fy: f });
    }
    return [grid(items, 16, 18, (it, cx, cy) => ({ fontId: 23, size: 10, text: it.ch, x: cx + 4 + it.fx, y: cy + 12 + it.fy, cell: { x: cx, y: cy, w: 16, h: 18 }, tag: `${it.ch} fx=${it.fx} fy=${it.fy}` }))];
  },
  /** every game font at many sizes: 6 single glyphs at an integer origin (CSM cutoff table vs size, zone snapping) */
  sizes: () => {
    const items: { font: number; size: number; ch: string }[] = [];
    const sizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 31, 32, 37, 40, 48, 61, 72, 96];
    for (const font of [23, 25, 323, 324, 205, 370, 753]) for (const size of sizes) for (const ch of glyphsOf(font, 6)) items.push({ font, size, ch });
    return pack(items, (it) => cellFor(it.size), (it, cx, cy) => {
      const c = cellFor(it.size);
      return { fontId: it.font, size: it.size, text: it.ch, x: cx + 4, y: cy + 4 + Math.ceil(it.size), cell: { x: cx, y: cy, ...c }, tag: `f${it.font} s${it.size} ${it.ch}` };
    });
  },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith('--')) ?? 'list';
  if (name === 'list' || !EXPERIMENTS[name]) { console.log(`experiments: ${Object.keys(EXPERIMENTS).join(' ')}`); return; }
  const player = args.find((a) => a.startsWith('--player='))?.split('=')[1] ?? '28';
  const bgArg = args.find((a) => a.startsWith('--bg='))?.split('=')[1];
  const bg = bgArg ? parseInt(bgArg, 16) : 0xffffff;
  const pages = EXPERIMENTS[name]!();
  for (let i = 0; i < pages.length; i++) {
    const id = (pages.length > 1 ? `${name}_${i}` : name) + (bgArg ? `_bg${bgArg}` : '');
    const res = await runCsmProbe(id, pages[i]!, { player, bg });
    console.log(`${id}: ${res.length} cases -> ${join(CSM_OUT, `${id}_fp${player}.json`)}`);
  }
}

if (isMain(import.meta.url)) await main();
void defineRectShape;
