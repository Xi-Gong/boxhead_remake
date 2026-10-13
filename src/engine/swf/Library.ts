/**
 * Library: the extracted SWF character table (library.json) + decoded bitmaps + render caches.   OWNER: lane E
 *
 * Node-friendly: `new Library(json)` works without a DOM (bitmaps absent, Path2D caches unused). In the browser,
 * `Library.load(baseUrl)` fetches library.json and every bitmap (createImageBitmap).
 *
 * Caches (all keyed by the JSON objects themselves through WeakMaps, so they live as long as the library):
 *   - parsed path commands / Path2D / flattened polylines per shape fill/stroke path;
 *   - per-morph LRU of interpolated paths keyed by ratio;
 *   - font glyph Path2D / code -> glyph index / kerning maps;
 *   - tinted copies of bitmaps per color transform (bitmap fills under a non-alpha color transform).
 */
import type {
  BitmapDef, CharDef, FontDef, LibraryJson, MorphDef, SpriteDef,
} from '../../shared/assetSchema.ts';
import { getRegisteredClass, type MovieClipClass } from './registry.ts';
import { flatten, morphCmds, parsePath, type PathCmds, type Polys } from './paths.ts';

export interface MorphFrame {
  /** per layer: fill paths / stroke paths (command arrays) */
  layers: { fills: PathCmds[]; strokes: PathCmds[]; fillP2D?: (Path2D | null)[]; strokeP2D?: (Path2D | null)[] }[];
  /** Flattened fill polylines per layer (hit testing), built lazily. */
  polys?: Polys[][];
}

const hasPath2D = (): boolean => typeof Path2D !== 'undefined';

/** Simple LRU on top of Map insertion order. */
class Lru<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k: K, v: V): void {
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }
}

export class Library {
  readonly json: LibraryJson;
  /** Decoded library bitmaps by character id (browser only). */
  readonly bitmaps = new Map<number, CanvasImageSource & { width: number; height: number }>();
  private readonly linkageByChar = new Map<number, string>();
  private readonly cmdCache = new WeakMap<object, PathCmds>();
  private readonly p2dCache = new WeakMap<object, Path2D>();
  private readonly polyCache = new WeakMap<object, Polys>();
  private readonly morphCache = new Map<number, Lru<number, MorphFrame>>();
  private readonly fontCodeMaps = new Map<number, Map<number, number>>();
  private readonly kernMaps = new Map<number, Map<number, number>>();
  private readonly glyphP2D = new Map<number, (Path2D | null)[]>();
  private readonly glyphPolys = new Map<number, (Polys | null)[]>();
  private readonly tinted = new Map<string, CanvasImageSource>();

  constructor(json: LibraryJson) {
    this.json = json;
    for (const [name, id] of Object.entries(json.exports)) if (!this.linkageByChar.has(id)) this.linkageByChar.set(id, name);
  }

  /** Browser: fetch `${baseUrl}/library.json` and all bitmaps. onProgress gets 0..1. */
  static async load(baseUrl: string, onProgress?: (f: number) => void): Promise<Library> {
    const base = baseUrl.replace(/\/$/, '');
    const report = (f: number): void => { try { onProgress?.(Math.max(0, Math.min(1, f))); } catch { /* ignore */ } };
    report(0);
    const res = await fetch(`${base}/library.json`);
    if (!res.ok) throw new Error(`Library.load: ${res.status} ${res.statusText} for ${base}/library.json`);
    const json = (await readJsonWithProgress(res, (f) => report(f * 0.6))) as LibraryJson;
    const lib = new Library(json);
    const bitmapDefs = Object.values(json.chars).filter((c): c is BitmapDef => c.t === 'bitmap');
    let done = 0;
    await Promise.all(bitmapDefs.map(async (b) => {
      try {
        const r = await fetch(`${base}/${b.file}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const blob = await r.blob();
        const img = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
        lib.bitmaps.set(b.id, img);
      } catch (e) {
        console.warn(`[swf] bitmap ${b.id} (${b.file}) failed to load:`, e);
      }
      done++;
      report(0.6 + 0.4 * (done / Math.max(1, bitmapDefs.length)));
    }));
    report(1);
    return lib;
  }

  charIdForLinkage(name: string): number | undefined { return this.json.exports[name]; }
  /** First export (linkage) name of a character, if exported. */
  linkageForChar(id: number): string | undefined { return this.linkageByChar.get(id); }
  /** Registered AS2 class for a character (via its linkage), if any. */
  classForChar(id: number): MovieClipClass | undefined {
    const l = this.linkageByChar.get(id);
    return l === undefined ? undefined : getRegisteredClass(l);
  }
  char(id: number): CharDef | undefined { return this.json.chars[String(id)]; }
  sprite(id: number): SpriteDef | undefined {
    if (id === 0) return this.json.root;
    const c = this.char(id);
    return c && c.t === 'sprite' ? c : undefined;
  }

  // ------------------------------------------------------------------ paths

  /** Parsed command array of an object holding SVG data in `d`. */
  cmds(o: { d: string }): PathCmds {
    let c = this.cmdCache.get(o);
    if (!c) { c = parsePath(o.d); this.cmdCache.set(o, c); }
    return c;
  }
  /** Path2D for an object holding SVG data in `d` (browser only). */
  path2d(o: { d: string }): Path2D {
    let p = this.p2dCache.get(o);
    if (!p) { p = new Path2D(o.d); this.p2dCache.set(o, p); }
    return p;
  }
  /** Flattened polylines (hit testing). */
  polys(o: { d: string }): Polys {
    let p = this.polyCache.get(o);
    if (!p) { p = flatten(this.cmds(o)); this.polyCache.set(o, p); }
    return p;
  }

  /** Interpolated morph geometry at `ratio` (0..65535). LRU-cached per morph. */
  morphFrame(def: MorphDef, ratio: number): MorphFrame {
    const r = Math.max(0, Math.min(65535, Math.round(ratio)));
    let lru = this.morphCache.get(def.id);
    if (!lru) { lru = new Lru(64); this.morphCache.set(def.id, lru); }
    let f = lru.get(r);
    if (!f) {
      const t = r / 65535;
      f = {
        layers: def.layers.map((l) => ({
          fills: l.fills.map((p) => morphCmds(p.cmd, p.a, p.b, t)),
          strokes: l.strokes.map((p) => morphCmds(p.cmd, p.a, p.b, t)),
        })),
      };
      lru.set(r, f);
    }
    return f;
  }

  // ------------------------------------------------------------------ fonts

  font(id: number): FontDef | undefined {
    const c = this.char(id);
    return c && c.t === 'font' ? c : undefined;
  }
  /** code point -> glyph index */
  fontCodeMap(font: FontDef): Map<number, number> {
    let m = this.fontCodeMaps.get(font.id);
    if (!m) {
      m = new Map();
      font.glyphs.forEach((g, i) => { if (!m!.has(g.code)) m!.set(g.code, i); });
      this.fontCodeMaps.set(font.id, m);
    }
    return m;
  }
  /** Kerning adjustment in EM units (1024/em) for a code pair. */
  kerning(font: FontDef, c1: number, c2: number): number {
    if (!font.kerning || font.kerning.length === 0) return 0;
    let m = this.kernMaps.get(font.id);
    if (!m) {
      m = new Map();
      for (const [a, b, adj] of font.kerning) m.set(a * 0x10000 + b, adj);
      this.kernMaps.set(font.id, m);
    }
    return m.get(c1 * 0x10000 + c2) ?? 0;
  }
  glyphPath(font: FontDef, index: number): Path2D | null {
    let arr = this.glyphP2D.get(font.id);
    if (!arr) { arr = new Array(font.glyphs.length).fill(undefined); this.glyphP2D.set(font.id, arr); }
    let p = arr[index];
    if (p === undefined) {
      const g = font.glyphs[index];
      p = g && g.d && hasPath2D() ? new Path2D(g.d) : null;
      arr[index] = p;
    }
    return p;
  }
  glyphPolygons(font: FontDef, index: number): Polys | null {
    let arr = this.glyphPolys.get(font.id);
    if (!arr) { arr = new Array(font.glyphs.length).fill(undefined); this.glyphPolys.set(font.id, arr); }
    let p = arr[index];
    if (p === undefined) {
      const g = font.glyphs[index];
      p = g && g.d ? flatten(parsePath(g.d)) : null;
      arr[index] = p;
    }
    return p;
  }
  /**
   * Find an embedded font by name and style. Exact style match first (Flash requires it for embedded fonts), then
   * any style of that name (lenient fallback), else undefined.
   */
  findFont(name: string | undefined, bold: boolean, italic: boolean): FontDef | undefined {
    if (!name) return undefined;
    let any: FontDef | undefined;
    let anyWithLayout: FontDef | undefined;
    for (const c of Object.values(this.json.chars)) {
      if (c.t !== 'font' || c.name !== name) continue;
      // fonts without glyph advances (static-text-only subsets) are useless for dynamic text
      const usable = c.ascent !== undefined;
      if (c.bold === bold && c.italic === italic && usable) return c;
      if (usable && !anyWithLayout) anyWithLayout = c;
      if (!any) any = c;
    }
    return anyWithLayout ?? any;
  }

  // ------------------------------------------------------------------ bitmaps

  bitmap(id: number): (CanvasImageSource & { width: number; height: number }) | undefined { return this.bitmaps.get(id); }

  /** A tinted copy of a library bitmap (color transform applied per pixel). Cached by key. */
  tintedBitmap(id: number, key: string, apply: (data: Uint8ClampedArray) => void): CanvasImageSource | undefined {
    const k = `${id}|${key}`;
    const hit = this.tinted.get(k);
    if (hit) return hit;
    const img = this.bitmaps.get(id);
    if (!img || typeof OffscreenCanvas === 'undefined') return img;
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return img;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    apply(data.data);
    ctx.putImageData(data, 0, 0);
    if (this.tinted.size > 256) this.tinted.clear();
    this.tinted.set(k, c);
    return c;
  }
}

async function readJsonWithProgress(res: Response, onProgress: (f: number) => void): Promise<unknown> {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    const j = await res.json();
    onProgress(1);
    return j;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got / total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}
