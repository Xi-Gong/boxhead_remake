/**
 * `Object.registerClass("Linkage", Path.To.Class)` extraction.
 *
 * The calls live in (obfuscated) DoInitAction tags of the library symbols; we deobfuscate each DoInitAction's
 * top-level script with the AVM1 explorer and read the calls from the recovered statements.
 * Cross-check source: the XFL `.fla` export (`#initclip` scripts inside LIBRARY/Symbol N.xml).
 *
 * Lane A's tools/extract.ts imports `extractRegisterClasses` dynamically — keep the name and signature.
 */
import { SwfFile } from '../swf/SwfFile.ts';
import { FLA_PATH } from '../paths.ts';
import { enumerateActions } from './actionSources.ts';
import { analyzeUnit } from './unit.ts';
import { ZipReader } from './flaZip.ts';

export interface RegisterClassEntry {
  linkage: string;
  classPath: string;
  /** Sprite (library symbol) whose DoInitAction performs the call. */
  spriteId: number;
  /** Absolute offset of the DoInitAction actions. */
  offset: number;
}

/** Every registerClass call found in the SWF's DoInitActions, in tag order. */
export function extractRegisterClassEntries(swf: SwfFile): RegisterClassEntry[] {
  const out: RegisterClassEntry[] = [];
  for (const src of enumerateActions(swf)) {
    if (src.kind !== 'initaction') continue;
    const u = analyzeUnit(swf.data, { start: src.start, end: src.end, functions: false });
    for (const [linkage, classPath] of u.registerClass) {
      out.push({ linkage, classPath, spriteId: src.spriteId, offset: src.start });
    }
  }
  return out;
}

/** linkage name -> class path (e.g. "Piece.WallPost" -> "World.Init.CWorld_Init_Piece", "Main" -> "CMain"). */
export function extractRegisterClasses(swf: SwfFile): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of extractRegisterClassEntries(swf)) map[e.linkage] = e.classPath;
  return map;
}

/** Same map read from the FLA export (`Object.registerClass(...)` in symbol scripts). */
export function registerClassesFromFla(flaPath: string = FLA_PATH): Record<string, string> {
  const z = ZipReader.fromPath(flaPath);
  const map: Record<string, string> = {};
  const re = /registerClass\(\s*"([^"]+)"\s*,\s*([A-Za-z0-9_.$]+)\s*\)/g;
  for (const e of z.entries) {
    if (!e.name.endsWith('.xml')) continue;
    const text = z.readText(e);
    if (!text.includes('registerClass')) continue;
    for (const m of text.matchAll(re)) map[m[1]] = m[2];
  }
  return map;
}
