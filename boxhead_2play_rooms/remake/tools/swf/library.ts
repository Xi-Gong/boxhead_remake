/**
 * SWF -> LibraryJson (+ bitmap/sound files + inventory data), in memory. tools/extract.ts writes the results.
 *
 * Pass 1 walks the top-level tags in order and parses every dictionary tag (shapes, morphs, sprites, bitmaps,
 * sounds, fonts, texts, buttons) plus ExportAssets / DoInitAction. Pass 2 parses the root timeline.
 */
import type {
  ActionRef, BitmapDef, CharDef, LibraryJson, MorphDef, ShapeDef, SoundDef, SpriteDef,
} from '../../src/shared/assetSchema.ts';
import { SwfFile, TAG, TAG_NAMES } from './SwfFile.ts';
import { inventory } from '../inventory.ts';
import { readRGB } from './records.ts';
import { parseDefineShape, type RawShape } from './shapes.ts';
import { convertShape, type ConvertStats, type ConvertedShape } from './shapeConvert.ts';
import { parseDefineMorphShape, type RawMorph } from './morph.ts';
import { parseDefineSprite, parseTimeline, type TimelineCtx } from './sprites.ts';
import { parseDefineEditText, parseDefineFont3, parseDefineText, type FontParseInfo } from './text.ts';
import { parseDefineButton2 } from './buttons.ts';
import { parseDefineBits, parseDefineBitsJpeg23, parseDefineBitsLossless, type DecodedBitmap } from './bitmaps.ts';
import { parseDefineSound, type DecodedSound } from './sounds.ts';
import { parseExportAssets } from './exports.ts';

export interface OutFile { path: string; bytes: Uint8Array }

export interface BuildResult {
  lib: LibraryJson;
  /** Files relative to the assets root (bitmaps/<id>.png|jpg, sounds/<id>.mp3). */
  files: OutFile[];
  /** Intermediate data for reports and tests. */
  raw: {
    shapes: Map<number, { raw: RawShape; conv: ConvertedShape }>;
    morphs: Map<number, RawMorph>;
    fonts: Map<number, FontParseInfo>;
    bitmaps: Map<number, DecodedBitmap>;
    sounds: Map<number, DecodedSound>;
    /** Number of ExportAssets tags. */
    exportTags: number;
  };
  ctx: TimelineCtx;
  inventory: ReturnType<typeof inventory>;
}

export function buildLibrary(swf: SwfFile, classes: Record<string, string> = {}): BuildResult {
  const chars: Record<string, CharDef> = {};
  const exports: Record<string, number> = {};
  const actions: ActionRef[] = [];
  const files: OutFile[] = [];
  const ctx: TimelineCtx = { swfVersion: swf.header.version, actions, warnings: [], counts: {} };
  const raw: BuildResult['raw'] = {
    shapes: new Map(), morphs: new Map(), fonts: new Map(), bitmaps: new Map(), sounds: new Map(), exportTags: 0,
  };
  let bg: [number, number, number, number] = [255, 255, 255, 255];
  let jpegTables: Uint8Array | null = null;

  const add = (def: CharDef) => {
    if (String(def.id) in chars) ctx.warnings.push(`duplicate character id ${def.id} (${def.t}); later definition wins`);
    chars[def.id] = def;
  };

  for (const tag of swf.tags()) {
    const r = swf.reader(tag);
    switch (tag.code) {
      case TAG.SetBackgroundColor: bg = readRGB(r); break;
      case TAG.DefineShape: case TAG.DefineShape2: case TAG.DefineShape3: case TAG.DefineShape4: {
        const s = parseDefineShape(r, tag.code);
        if (r.remaining) ctx.warnings.push(`shape ${s.id}: ${r.remaining} trailing bytes`);
        const conv = convertShape(s);
        raw.shapes.set(s.id, { raw: s, conv });
        const def: ShapeDef = { t: 'shape', id: s.id, ver: s.ver, bounds: s.bounds, layers: conv.layers };
        if (s.edgeBounds) def.edgeBounds = s.edgeBounds;
        add(def);
        break;
      }
      case TAG.DefineMorphShape: case TAG.DefineMorphShape2: {
        const m = parseDefineMorphShape(r, tag.code);
        raw.morphs.set(m.id, m);
        add(m.def satisfies MorphDef);
        break;
      }
      case TAG.DefineSprite: add(parseDefineSprite(swf, tag, ctx)); break;
      case TAG.JPEGTables: jpegTables = tag.length ? r.bytes(tag.length) : null; break;
      case TAG.DefineBits: case TAG.DefineBitsJPEG2: case TAG.DefineBitsJPEG3:
      case TAG.DefineBitsLossless: case TAG.DefineBitsLossless2: {
        const b = tag.code === TAG.DefineBits ? parseDefineBits(r, jpegTables)
          : tag.code === TAG.DefineBitsJPEG2 || tag.code === TAG.DefineBitsJPEG3 ? parseDefineBitsJpeg23(r, tag.code)
          : parseDefineBitsLossless(r, tag.code);
        raw.bitmaps.set(b.id, b);
        const file = `bitmaps/${b.id}.${b.format}`;
        files.push({ path: file, bytes: b.file });
        add({ t: 'bitmap', id: b.id, w: b.w, h: b.h, file, format: b.format, alpha: b.alpha } satisfies BitmapDef);
        break;
      }
      case TAG.DefineSound: {
        const s = parseDefineSound(r);
        raw.sounds.set(s.id, s);
        const file = `sounds/${s.id}.mp3`;
        files.push({ path: file, bytes: s.file });
        add({ t: 'sound', id: s.id, file, format: s.format, rate: s.rate, stereo: s.stereo, sampleCount: s.sampleCount } satisfies SoundDef);
        break;
      }
      case TAG.DefineFont3: {
        const f = parseDefineFont3(r);
        raw.fonts.set(f.def.id, f);
        add(f.def);
        break;
      }
      case TAG.DefineFont: case TAG.DefineFont2: case TAG.DefineFont4: case TAG.DefineFontInfo: case TAG.DefineFontInfo2:
        ctx.warnings.push(`unsupported font tag ${TAG_NAMES[tag.code]} (not expected in this SWF)`);
        break;
      case TAG.DefineText: case TAG.DefineText2: add(parseDefineText(r, tag.code)); break;
      case TAG.DefineEditText: add(parseDefineEditText(r)); break;
      case TAG.DefineButton2: add(parseDefineButton2(r, actions)); break;
      case TAG.DefineButton: case TAG.DefineButtonCxform: case TAG.DefineButtonSound:
        ctx.warnings.push(`unsupported button tag ${TAG_NAMES[tag.code]} (not expected in this SWF)`);
        break;
      case TAG.ExportAssets: {
        raw.exportTags++;
        for (const { id, name } of parseExportAssets(r)) {
          if (name in exports && exports[name] !== id) ctx.warnings.push(`export "${name}" redefined ${exports[name]} -> ${id}`);
          exports[name] = id;
        }
        break;
      }
      case TAG.DoInitAction: {
        const spriteId = r.u16();
        actions.push({ kind: 'init', spriteId, offset: tag.offset + 2, length: tag.length - 2 });
        break;
      }
      default: break; // control tags: root timeline pass
    }
  }

  const root: SpriteDef = parseTimeline(swf, swf.tags(), 0, swf.header.frameCount, ctx);

  // Sanity: every referenced character exists.
  const checkRef = (where: string, id: number | undefined) => {
    if (id !== undefined && !(String(id) in chars)) ctx.warnings.push(`${where}: references missing character ${id}`);
  };
  for (const c of [...Object.values(chars), root]) {
    if (c.t === 'sprite') c.frames.forEach((f, i) => f.ops.forEach((op) => op.op === 'place' && checkRef(`sprite ${c.id} frame ${i + 1}`, op.id)));
    if (c.t === 'button') c.records.forEach((rec) => checkRef(`button ${c.id}`, rec.id));
  }
  for (const [name, id] of Object.entries(exports)) checkRef(`export ${name}`, id);

  const h = swf.header;
  const lib: LibraryJson = {
    v: 1,
    swfSha256: swf.sha256,
    stage: { w: h.frameSize.xMax - h.frameSize.xMin, h: h.frameSize.yMax - h.frameSize.yMin, bg, frameRate: h.frameRate, frameCount: h.frameCount, swfVersion: h.version },
    exports,
    classes,
    chars,
    root,
    actions,
  };
  return { lib, files, raw, ctx, inventory: inventory(swf) };
}

/** Sum of conversion statistics over all shapes. */
export function totalShapeStats(raw: BuildResult['raw']): ConvertStats {
  const t: Record<string, number> = {};
  for (const { conv } of raw.shapes.values()) for (const [k, v] of Object.entries(conv.stats)) t[k] = (t[k] ?? 0) + v;
  return t as unknown as ConvertStats;
}
