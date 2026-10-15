/**
 * SWF -> assets extractor (lane A).
 *
 *   node tools/extract.ts [--if-stale] [--swf <path>] [--out <assetsDir>] [--reports <dir>] [--force]
 *
 * Outputs (never deletes files it did not produce, e.g. lane B's xsi.json):
 *   <assetsDir>/library.json, bitmaps/<id>.png|jpg, sounds/<id>.mp3, manifest.json
 *   <reports>/inventory.json, actions.json, rooms/roomNN.json
 * --if-stale skips everything when <assetsDir>/manifest.json has the same swfSha256, EXTRACTOR_VERSION and extractor
 * source hash — checked BEFORE the SWF is read, so a standard build never touches the SWF (the extracted assets ship
 * in the repo; with the SWF absent the manifest's recorded sha is trusted). --force accepts an SWF whose sha256
 * differs from tools/paths.ts SWF_SHA256.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { ButtonDef, CharDef, EditTextDef, LibraryJson } from '../src/shared/assetSchema.ts';
import { ASSETS_OUT, GENERATED, ROOT, SWF_PATH, SWF_SHA256, isMain } from './paths.ts';
import { SwfFile } from './swf/SwfFile.ts';
import { buildLibrary, totalShapeStats, type BuildResult } from './swf/library.ts';
import { BEVEL_FIRST_COLOR_IS_HIGHLIGHT } from './swf/records.ts';
import { extractRooms, writeRoomReports, type RoomReport } from './rooms/extractRooms.ts';
import { extractXsi } from './xsi/extractXsi.ts';

/** Bump when the output format/semantics change without a source change being detectable. */
export const EXTRACTOR_VERSION = 2; // 2: FontDef.alignZones, StaticTextDef/EditTextDef.csm (FlashType)

export interface Manifest {
  swfSha256: string;
  extractorVersion: number;
  sourceHash: string;
  files: string[];
  counts: Record<string, number>;
}

/** Hash of the extractor sources (+ lane B's registerClass helpers and the schema) for --if-stale. */
export function extractorSourceHash(): string {
  const h = createHash('sha256');
  const roots = ['tools/swf', 'tools/rooms', 'tools/avm1', 'tools/xsi', 'tools/extract.ts', 'tools/paths.ts', 'tools/inventory.ts', 'src/shared/assetSchema.ts'];
  const files: string[] = [];
  const visit = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) visit(join(p, f));
    else if (p.endsWith('.ts')) files.push(p);
  };
  for (const r of roots) visit(join(ROOT, r));
  for (const f of files) h.update(relative(ROOT, f).replace(/\\/g, '/')).update(readFileSync(f));
  return h.digest('hex').slice(0, 16);
}

/** Plain sha256 of a file's bytes — identical to SwfFile.sha256 (used by the --if-stale fast path). */
function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Lane B's registerClass extraction, if present. */
async function loadClasses(swf: SwfFile): Promise<{ classes: Record<string, string>; note: string }> {
  try {
    const spec = './avm1/registerClass.ts'; // lane B module; may not exist yet (non-literal: no static resolution)
    const mod = await import(spec) as { extractRegisterClasses?: (s: SwfFile) => Record<string, string> };
    if (typeof mod.extractRegisterClasses !== 'function') return { classes: {}, note: 'tools/avm1/registerClass.ts has no extractRegisterClasses()' };
    const classes = mod.extractRegisterClasses(swf);
    return { classes, note: `${Object.keys(classes).length} registerClass entries` };
  } catch (e) {
    return { classes: {}, note: `registerClass unavailable (${(e as Error).message.split('\n')[0]})` };
  }
}

function writeFile(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

// ---------------------------------------------------------------- reports

const isEdit = (c: CharDef): c is EditTextDef => c.t === 'edit';
const isButton = (c: CharDef): c is ButtonDef => c.t === 'button';

export function inventoryReport(res: BuildResult, rooms: RoomReport[], classesNote: string) {
  const { lib, raw, ctx } = res;
  const chars = Object.values(lib.chars);
  const byType: Record<string, number> = {};
  for (const c of chars) byType[c.t] = (byType[c.t] ?? 0) + 1;
  const names: Record<number, string[]> = {};
  for (const [n, id] of Object.entries(lib.exports)) (names[id] ??= []).push(n);
  const shapeVersions: Record<string, number> = {};
  for (const { raw: s } of raw.shapes.values()) shapeVersions[`DefineShape${s.ver === 1 ? '' : s.ver}`] = (shapeVersions[`DefineShape${s.ver === 1 ? '' : s.ver}`] ?? 0) + 1;
  const sprites = chars.filter((c) => c.t === 'sprite');
  const actionsByKind: Record<string, number> = {};
  for (const a of lib.actions) {
    const k = a.kind === 'frame' ? (a.spriteId === 0 ? 'frame:root' : 'frame:sprite') : a.kind;
    actionsByKind[k] = (actionsByKind[k] ?? 0) + 1;
  }
  // Bevel colour evidence: how often the FIRST colour in the record is white / the second black.
  const bevels: Record<string, number> = {};
  for (const s of [lib.root, ...sprites]) {
    if (s.t !== 'sprite') continue;
    for (const f of s.frames) for (const op of f.ops) if (op.op === 'place') for (const flt of op.filters ?? []) {
      if (flt.t !== 'bevel') continue;
      const first = BEVEL_FIRST_COLOR_IS_HIGHLIGHT ? flt.highlight : flt.shadow;
      const second = BEVEL_FIRST_COLOR_IS_HIGHLIGHT ? flt.shadow : flt.highlight;
      const k = `first=${first.join(',')} second=${second.join(',')}`;
      bevels[k] = (bevels[k] ?? 0) + 1;
    }
  }
  return {
    swf: { sha256: lib.swfSha256, header: res.inventory.header },
    tags: { top: res.inventory.top, inSprites: res.inventory.inner, note: 'tag253/tag255 = obfuscator junk (ignored)' },
    chars: byType,
    shapeVersions,
    exports: { names: Object.keys(lib.exports).length, tags: raw.exportTags },
    classes: { count: Object.keys(lib.classes).length, note: classesNote },
    shapes: { stats: totalShapeStats(raw), withUnclosed: [...raw.shapes.values()].filter((s) => s.conv.stats.unclosed).map((s) => s.raw.id) },
    morphs: [...raw.morphs.values()].map((m) => ({ id: m.id, ver: m.ver, ...m.stats })),
    sprites: { count: sprites.length, totalFrames: sprites.reduce((n, s) => n + (s.t === 'sprite' ? s.frameCount : 0), 0) },
    root: { frames: lib.root.frameCount, labels: lib.root.labels },
    timelineCounts: ctx.counts,
    actions: actionsByKind,
    bitmaps: [...raw.bitmaps.values()].map((b) => ({ id: b.id, w: b.w, h: b.h, format: b.format, alpha: b.alpha, bytes: b.file.length, source: b.source, notes: b.notes, exports: names[b.id] })),
    sounds: [...raw.sounds.values()].map((s) => ({ id: s.id, rate: s.rate, stereo: s.stereo, is16Bit: s.is16Bit, sampleCount: s.sampleCount, seekSamples: s.seekSamples, bytes: s.file.length, exports: names[s.id] })),
    fonts: [...raw.fonts.values()].map((f) => ({
      id: f.def.id, name: f.def.name, bold: f.def.bold, italic: f.def.italic, smallText: f.def.smallText, glyphs: f.def.glyphs.length,
      hasLayout: f.def.ascent !== undefined, kerning: f.def.kerning?.length ?? 0, glyphFillUsage: f.fillUsage, unclosed: f.stats.unclosed,
      codes: String.fromCodePoint(...f.def.glyphs.map((g) => g.code)),
    })),
    texts: { static: chars.filter((c) => c.t === 'text' && c.ver === 1).length, static2: chars.filter((c) => c.t === 'text' && c.ver === 2).length },
    editTexts: chars.filter(isEdit).map((c) => ({ id: c.id, fontId: c.fontId, height: c.height, useOutlines: c.useOutlines, html: c.html, readOnly: c.readOnly, initialText: c.initialText })),
    deviceFontEditTexts: chars.filter(isEdit).filter((c) => !c.useOutlines).map((c) => c.id),
    buttons: chars.filter(isButton).map((c) => ({ id: c.id, records: c.records.length, actions: c.actions?.length ?? 0, exports: names[c.id] })),
    bevelColorEvidence: bevels,
    rooms: rooms.map((r) => ({ room: r.room, linkage: r.linkage, cells: r.size.cells, counts: r.counts })),
    warnings: ctx.warnings,
  };
}

export function actionsReport(lib: LibraryJson) {
  const names: Record<number, string[]> = {};
  for (const [n, id] of Object.entries(lib.exports)) (names[id] ??= []).push(n);
  return lib.actions.map((a, index) => ({ index, ...a, exports: a.spriteId ? names[a.spriteId] : undefined }));
}

// ---------------------------------------------------------------- main

export async function runExtract(argv: string[]): Promise<number> {
  const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const swfPath = resolve(arg('--swf') ?? SWF_PATH);
  const outDir = resolve(arg('--out') ?? ASSETS_OUT);
  const reportsDir = resolve(arg('--reports') ?? join(GENERATED, 'reports'));
  const ifStale = argv.includes('--if-stale');
  const force = argv.includes('--force');
  const t0 = Date.now();

  // --if-stale fast path (v0.2.0): a valid manifest skips BEFORE the SWF is read or hashed, so a standard build
  // never touches the SWF (the extracted assets ship in the repo). With the SWF present its sha is still verified
  // (catches a corrupted/swapped file); an absent SWF trusts the manifest's recorded sha.
  const sourceHash = extractorSourceHash();
  const manifestPath = join(outDir, 'manifest.json');
  if (ifStale && existsSync(manifestPath) && existsSync(join(outDir, 'library.json'))) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
      if (m.extractorVersion === EXTRACTOR_VERSION && m.sourceHash === sourceHash) {
        const sha = existsSync(swfPath) ? sha256File(swfPath) : m.swfSha256;
        if (sha === m.swfSha256) {
          console.log(`extract: up to date (${relative(ROOT, outDir) || outDir}), skipping${existsSync(swfPath) ? '' : ' (SWF absent - trusted committed manifest)'}`);
          return 0;
        }
      }
    } catch { /* rebuild */ }
  }
  if (!existsSync(swfPath)) {
    console.error(`extract: ${swfPath} not found. The extracted assets ship in the repo (${relative(ROOT, outDir) || outDir}); ` +
      `a rebuild needs the original SWF (assets/boxhead_2play_rooms.swf) - see assets/README.md.`);
    return 1;
  }
  const swf = SwfFile.fromPath(swfPath);
  if (swf.sha256 !== SWF_SHA256) {
    const msg = `SWF sha256 ${swf.sha256} != expected ${SWF_SHA256} (${swfPath})`;
    if (!force) { console.error(`extract: ${msg}; use --force to continue anyway`); return 1; }
    console.warn(`extract: WARNING ${msg}`);
  }

  const { classes, note: classesNote } = await loadClasses(swf);
  if (!Object.keys(classes).length) console.warn(`extract: WARNING classes = {} — ${classesNote}`);
  const res = buildLibrary(swf, classes);
  const { lib, files } = res;

  // assets
  const libJson = JSON.stringify(lib);
  writeFile(join(outDir, 'library.json'), libJson);
  for (const f of files) writeFile(join(outDir, f.path), f.bytes);
  const counts: Record<string, number> = {};
  for (const c of Object.values(lib.chars)) counts[c.t] = (counts[c.t] ?? 0) + 1;
  counts.exports = Object.keys(lib.exports).length;
  counts.classes = Object.keys(lib.classes).length;
  counts.actions = lib.actions.length;
  // XSI character data (lane B2): sprite 755's DoAction evaluated to xsi.json
  const xsiStats = extractXsi(swf, outDir);
  counts.xsiItems = xsiStats.items;
  const manifest: Manifest = {
    swfSha256: swf.sha256, extractorVersion: EXTRACTOR_VERSION, sourceHash,
    files: ['library.json', 'xsi.json', ...files.map((f) => f.path)], counts,
  };
  writeFile(manifestPath, JSON.stringify(manifest, null, 1));

  // reports
  const rooms = extractRooms(lib);
  writeRoomReports(rooms, join(reportsDir, 'rooms'));
  writeFile(join(reportsDir, 'inventory.json'), JSON.stringify(inventoryReport(res, rooms, classesNote), null, 1));
  writeFile(join(reportsDir, 'actions.json'), JSON.stringify(actionsReport(lib), null, 1));

  // summary
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const fileBytes = files.reduce((n, f) => n + f.bytes.length, 0);
  console.log(`extract: ${swfPath}`);
  console.log(`  chars    ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  root     ${lib.root.frameCount} frames, labels ${Object.keys(lib.root.labels).join(' ')}`);
  console.log(`  output   library.json ${kb(libJson.length)}, ${files.length} media files ${kb(fileBytes)} -> ${outDir}`);
  console.log(`  reports  inventory.json, actions.json, ${rooms.length} rooms -> ${reportsDir}`);
  console.log(`  classes  ${classesNote}`);
  if (res.ctx.warnings.length) console.log(`  warnings ${res.ctx.warnings.length}:\n    ${res.ctx.warnings.join('\n    ')}`);
  console.log(`  done in ${Date.now() - t0} ms`);
  return 0;
}

if (isMain(import.meta.url)) {
  runExtract(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
}
