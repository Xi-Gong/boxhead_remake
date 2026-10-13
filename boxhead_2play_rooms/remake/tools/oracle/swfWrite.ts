/**
 * SWF writers for oracle probes.                                                     OWNER: oracle lane
 *
 * (a) `SwfBuilder`: a minimal SWF (default v8) for standalone probes — SetBackgroundColor, FileAttributes, DoAction,
 *     DoInitAction, DefineShape (rect, solid fill + optional stroke), DefineSprite, PlaceObject2, ExportAssets,
 *     ShowFrame, End.
 * (b) `reserializeWithInjections`: copy an existing SWF tag-for-tag (bytes untouched) and insert extra tags before the
 *     ShowFrame that ends chosen ROOT frames, recomputing the header length. Output FWS (uncompressed) or CWS (zlib).
 *
 * Tag/record encodings follow the SWF File Format Specification v19.
 */
import { deflateSync } from 'node:zlib';
import { ByteSink } from './avm1asm.ts';
import { SwfFile, TAG } from '../swf/SwfFile.ts';

// ---------------------------------------------------------------------------------------------- bit writer

/** MSB-first bit writer (SWF bit fields). Call `align()` before byte writes. */
export class BitSink {
  readonly bytes = new ByteSink();
  private cur = 0;
  private n = 0;
  ub(bits: number, v: number): this {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | (Math.floor(v / 2 ** i) & 1);
      if (++this.n === 8) { this.bytes.u8(this.cur); this.cur = 0; this.n = 0; }
    }
    return this;
  }
  sb(bits: number, v: number): this { return this.ub(bits, v < 0 ? 2 ** bits + v : v); }
  align(): this { if (this.n) { this.bytes.u8(this.cur << (8 - this.n)); this.cur = 0; this.n = 0; } return this; }
  toBytes(): Uint8Array { this.align(); return this.bytes.toBytes(); }
}

/** Bits needed for a signed value. */
export function sbits(...vals: number[]): number {
  let n = 1;
  for (const v of vals) {
    const a = v < 0 ? -v - 1 : v;
    let b = 1;
    while (a >= 2 ** (b - 1)) b++;
    n = Math.max(n, b);
  }
  return n;
}

/** RECT in twips. */
export function rect(s: BitSink, xMin: number, xMax: number, yMin: number, yMax: number): void {
  const nb = sbits(xMin, xMax, yMin, yMax);
  s.ub(5, nb).sb(nb, xMin).sb(nb, xMax).sb(nb, yMin).sb(nb, yMax).align();
}

export interface MatrixSpec { a?: number; b?: number; c?: number; d?: number; tx?: number; ty?: number }

/** MATRIX record; tx/ty in PIXELS (converted to twips, rounded), a..d as 16.16 fixed. */
export function matrix(s: BitSink, m: MatrixSpec = {}): void {
  const a = m.a ?? 1, b = m.b ?? 0, c = m.c ?? 0, d = m.d ?? 1;
  const fx = (v: number): number => Math.round(v * 65536);
  if (a !== 1 || d !== 1) {
    const nb = sbits(fx(a), fx(d));
    s.ub(1, 1).ub(5, nb).sb(nb, fx(a)).sb(nb, fx(d));
  } else s.ub(1, 0);
  if (b !== 0 || c !== 0) {
    const nb = sbits(fx(b), fx(c));
    s.ub(1, 1).ub(5, nb).sb(nb, fx(b)).sb(nb, fx(c));
  } else s.ub(1, 0);
  const tx = Math.round((m.tx ?? 0) * 20), ty = Math.round((m.ty ?? 0) * 20);
  const nb = tx === 0 && ty === 0 ? 0 : sbits(tx, ty);
  s.ub(5, nb);
  if (nb) s.sb(nb, tx).sb(nb, ty);
  s.align();
}

/** Encode a tag (short form when possible; `long` forces the 6-byte header). */
export function encodeTag(code: number, body: Uint8Array, long = false): Uint8Array {
  const s = new ByteSink();
  if (body.length < 0x3f && !long) s.u16((code << 6) | body.length);
  else s.u16((code << 6) | 0x3f).u32(body.length);
  return s.bytes(body).toBytes();
}

export interface SwfHeaderSpec {
  version?: number;
  /** Stage size in pixels. */
  width?: number;
  height?: number;
  frameRate?: number;
  compress?: boolean;
}

/** Wrap already-encoded top-level tags (must end with End) into a SWF file. */
export function wrapSwf(tags: Uint8Array, frameCount: number, h: SwfHeaderSpec = {}): Uint8Array {
  const version = h.version ?? 8;
  const hb = new BitSink();
  rect(hb, 0, Math.round((h.width ?? 550) * 20), 0, Math.round((h.height ?? 400) * 20));
  const headerRest = new ByteSink().bytes(hb.toBytes()).u16(Math.round((h.frameRate ?? 30) * 256)).u16(frameCount).toBytes();
  const fileLength = 8 + headerRest.length + tags.length;
  const body = new Uint8Array(headerRest.length + tags.length);
  body.set(headerRest, 0);
  body.set(tags, headerRest.length);
  const out = new ByteSink();
  if (h.compress) {
    out.u8(0x43).u8(0x57).u8(0x53).u8(version).u32(fileLength).bytes(new Uint8Array(deflateSync(body)));
  } else {
    out.u8(0x46).u8(0x57).u8(0x53).u8(version).u32(fileLength).bytes(body);
  }
  return out.toBytes();
}

// ---------------------------------------------------------------------------------------------- shapes

export interface RectShapeSpec {
  id: number;
  /** Rectangle edges in pixels (converted to twips). */
  x: number; y: number; w: number; h: number;
  /** Fill RGB (0xRRGGBB) or null for no fill. */
  fill?: number | null;
  /** Fill alpha 0..255 (uses DefineShape3 when < 255). */
  fillAlpha?: number;
  /** Stroke width in px (0/undefined = no stroke). */
  lineWidth?: number;
  lineColor?: number;
  /** Override the stored ShapeBounds (pixels) — to test whether Flash trusts the tag bounds. */
  boundsOverride?: { xMin: number; xMax: number; yMin: number; yMax: number };
}

/** DefineShape (or DefineShape3 if fillAlpha < 255) with one axis-aligned rectangle. */
export function defineRectShape(sp: RectShapeSpec): Uint8Array {
  const tw = (v: number): number => Math.round(v * 20);
  const useAlpha = (sp.fillAlpha ?? 255) < 255;
  const hasFill = sp.fill !== null && sp.fill !== undefined;
  const lw = sp.lineWidth ? tw(sp.lineWidth) : 0;
  const x0 = tw(sp.x), y0 = tw(sp.y), x1 = tw(sp.x + sp.w), y1 = tw(sp.y + sp.h);
  const half = lw / 2;
  const b = sp.boundsOverride
    ? { xMin: tw(sp.boundsOverride.xMin), xMax: tw(sp.boundsOverride.xMax), yMin: tw(sp.boundsOverride.yMin), yMax: tw(sp.boundsOverride.yMax) }
    : { xMin: x0 - half, xMax: x1 + half, yMin: y0 - half, yMax: y1 + half };
  const s = new BitSink();
  s.bytes.u16(sp.id);
  rect(s, b.xMin, b.xMax, b.yMin, b.yMax);
  const rgb = (c: number, a?: number): void => {
    s.bytes.u8((c >> 16) & 0xff).u8((c >> 8) & 0xff).u8(c & 0xff);
    if (useAlpha) s.bytes.u8(a ?? 255);
  };
  // FILLSTYLEARRAY
  s.bytes.u8(hasFill ? 1 : 0);
  if (hasFill) { s.bytes.u8(0x00); rgb(sp.fill as number, sp.fillAlpha); }
  // LINESTYLEARRAY
  s.bytes.u8(lw ? 1 : 0);
  if (lw) { s.bytes.u16(lw); rgb(sp.lineColor ?? 0, 255); }
  const nFill = hasFill ? 1 : 0, nLine = lw ? 1 : 0;
  s.ub(4, nFill).ub(4, nLine);
  // StyleChangeRecord: moveTo + styles
  s.ub(1, 0).ub(1, 0).ub(1, nLine).ub(1, nFill).ub(1, 0).ub(1, 1);
  const mb = sbits(x0, y0);
  s.ub(5, mb).sb(mb, x0).sb(mb, y0);
  if (nFill) s.ub(nFill, 1);
  if (nLine) s.ub(nLine, 1);
  const edge = (dx: number, dy: number): void => {
    const nb = Math.max(sbits(dx, dy), 2);
    s.ub(1, 1).ub(1, 1).ub(4, nb - 2);
    if (dx !== 0 && dy !== 0) s.ub(1, 1).sb(nb, dx).sb(nb, dy);
    else if (dx === 0) s.ub(1, 0).ub(1, 1).sb(nb, dy);
    else s.ub(1, 0).ub(1, 0).sb(nb, dx);
  };
  edge(x1 - x0, 0); edge(0, y1 - y0); edge(x0 - x1, 0); edge(0, y0 - y1);
  s.ub(1, 0).ub(5, 0); // EndShapeRecord
  return encodeTag(useAlpha ? TAG.DefineShape3 : TAG.DefineShape, s.toBytes());
}

/** An encoded DoAction tag (e.g. for a DefineSprite frame). */
export function doActionTag(bytecode: Uint8Array): Uint8Array { return encodeTag(TAG.DoAction, bytecode, true); }

export interface PlaceSpec {
  depth: number;
  charId?: number;
  name?: string;
  matrix?: MatrixSpec;
  move?: boolean;
}

export function placeObject2(p: PlaceSpec): Uint8Array {
  const s = new BitSink();
  let flags = 0;
  if (p.move) flags |= 0x01;
  if (p.charId !== undefined) flags |= 0x02;
  if (p.matrix) flags |= 0x04;
  if (p.name !== undefined) flags |= 0x20;
  s.bytes.u8(flags).u16(p.depth);
  if (p.charId !== undefined) s.bytes.u16(p.charId);
  if (p.matrix) matrix(s, p.matrix);
  if (p.name !== undefined) s.bytes.str(p.name);
  return encodeTag(TAG.PlaceObject2, s.toBytes());
}

// ---------------------------------------------------------------------------------------------- filters (PlaceObject3)

/** RGBA as [r, g, b, a] 0..255. */
export type Rgba = [number, number, number, number];

/** A raw SWF FILTER record (id byte + body), written exactly as the spec/Flash IDE lays it out. */
export type FilterRecord =
  | { t: 'dropShadow'; color: Rgba; blurX: number; blurY: number; angleRad: number; distance: number; strength: number; inner?: boolean; knockout?: boolean; compositeSource?: boolean; passes: number }
  | { t: 'blur'; blurX: number; blurY: number; passes: number }
  | { t: 'glow'; color: Rgba; blurX: number; blurY: number; strength: number; inner?: boolean; knockout?: boolean; compositeSource?: boolean; passes: number }
  /** `color1` is the FIRST RGBA in the record (the spec calls it ShadowColor), `color2` the second. */
  | { t: 'bevel'; color1: Rgba; color2: Rgba; blurX: number; blurY: number; angleRad: number; distance: number; strength: number; inner?: boolean; knockout?: boolean; compositeSource?: boolean; onTop?: boolean; passes: number }
  | { t: 'gradientGlow'; colors: Rgba[]; ratios: number[]; blurX: number; blurY: number; angleRad: number; distance: number; strength: number; inner?: boolean; knockout?: boolean; compositeSource?: boolean; onTop?: boolean; passes: number }
  | { t: 'colorMatrix'; m: number[] };

export function encodeFilter(f: FilterRecord): Uint8Array {
  const s = new BitSink();
  const rgba = (c: Rgba): void => { s.bytes.u8(c[0]).u8(c[1]).u8(c[2]).u8(c[3]); };
  const fixed = (v: number): void => { s.bytes.s32(Math.round(v * 65536)); };
  const fixed8 = (v: number): void => { s.bytes.s16(Math.round(v * 256)); };
  const flag = (b: boolean | undefined): void => { s.ub(1, b ? 1 : 0); };
  switch (f.t) {
    case 'dropShadow':
      s.bytes.u8(0); rgba(f.color); fixed(f.blurX); fixed(f.blurY); fixed(f.angleRad); fixed(f.distance); fixed8(f.strength);
      flag(f.inner); flag(f.knockout); flag(f.compositeSource ?? true); s.ub(5, f.passes);
      break;
    case 'blur':
      s.bytes.u8(1); fixed(f.blurX); fixed(f.blurY); s.ub(5, f.passes).ub(3, 0);
      break;
    case 'glow':
      s.bytes.u8(2); rgba(f.color); fixed(f.blurX); fixed(f.blurY); fixed8(f.strength);
      flag(f.inner); flag(f.knockout); flag(f.compositeSource ?? true); s.ub(5, f.passes);
      break;
    case 'bevel':
      s.bytes.u8(3); rgba(f.color1); rgba(f.color2); fixed(f.blurX); fixed(f.blurY); fixed(f.angleRad); fixed(f.distance); fixed8(f.strength);
      flag(f.inner); flag(f.knockout); flag(f.compositeSource ?? true); flag(f.onTop); s.ub(4, f.passes);
      break;
    case 'gradientGlow':
      s.bytes.u8(4).u8(f.colors.length);
      for (const c of f.colors) rgba(c);
      for (const r of f.ratios) s.bytes.u8(r);
      fixed(f.blurX); fixed(f.blurY); fixed(f.angleRad); fixed(f.distance); fixed8(f.strength);
      flag(f.inner); flag(f.knockout); flag(f.compositeSource ?? true); flag(f.onTop); s.ub(4, f.passes);
      break;
    case 'colorMatrix':
      s.bytes.u8(6);
      for (const v of f.m) s.bytes.f32(v);
      break;
  }
  return s.toBytes();
}

export interface Place3Spec extends PlaceSpec {
  filters?: FilterRecord[];
  /** BlendMode byte (1 normal, 2 layer, 3 multiply, ... 8 add ...). */
  blendMode?: number;
  cacheAsBitmap?: boolean;
}

/** PlaceObject3 (SWF8): PlaceObject2 fields + filter list / blend mode / bitmap caching. */
export function placeObject3(p: Place3Spec): Uint8Array {
  const s = new BitSink();
  let f1 = 0, f2 = 0;
  if (p.move) f1 |= 0x01;
  if (p.charId !== undefined) f1 |= 0x02;
  if (p.matrix) f1 |= 0x04;
  if (p.name !== undefined) f1 |= 0x20;
  if (p.filters?.length) f2 |= 0x01;
  if (p.blendMode !== undefined) f2 |= 0x02;
  if (p.cacheAsBitmap !== undefined) f2 |= 0x04;
  s.bytes.u8(f1).u8(f2).u16(p.depth);
  if (p.charId !== undefined) s.bytes.u16(p.charId);
  if (p.matrix) matrix(s, p.matrix);
  if (p.name !== undefined) s.bytes.str(p.name);
  if (p.filters?.length) {
    s.bytes.u8(p.filters.length);
    for (const f of p.filters) s.bytes.bytes(encodeFilter(f));
  }
  if (p.blendMode !== undefined) s.bytes.u8(p.blendMode);
  if (p.cacheAsBitmap !== undefined) s.bytes.u8(p.cacheAsBitmap ? 1 : 0);
  return encodeTag(TAG.PlaceObject3, s.toBytes());
}

// ---------------------------------------------------------------------------------------------- builder

export class SwfBuilder {
  private tags: Uint8Array[] = [];
  private frames = 0;
  readonly header: SwfHeaderSpec;

  constructor(header: SwfHeaderSpec = {}) {
    this.header = header;
  }

  /** FileAttributes (69). Flash 8 IDE writes it first; UseNetwork = 0x01. */
  fileAttributes(flags = 0): this { return this.tag(TAG.FileAttributes, new ByteSink().u32(flags).toBytes()); }
  backgroundColor(rgb: number): this { return this.tag(TAG.SetBackgroundColor, Uint8Array.of((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff)); }
  /** ScriptLimits (65): raise the "script is running slowly" timeout. */
  scriptLimits(maxRecursion = 1000, timeoutSeconds = 60): this { return this.tag(TAG.ScriptLimits, new ByteSink().u16(maxRecursion).u16(timeoutSeconds).toBytes()); }
  doAction(bytecode: Uint8Array): this { return this.tag(TAG.DoAction, bytecode, true); }
  doInitAction(spriteId: number, bytecode: Uint8Array): this {
    return this.tag(TAG.DoInitAction, new ByteSink().u16(spriteId).bytes(bytecode).toBytes(), true);
  }
  exportAssets(entries: { id: number; name: string }[]): this {
    const s = new ByteSink().u16(entries.length);
    for (const e of entries) s.u16(e.id).str(e.name);
    return this.tag(TAG.ExportAssets, s.toBytes());
  }
  defineRectShape(sp: RectShapeSpec): this { this.tags.push(defineRectShape(sp)); return this; }
  /** DefineSprite with the given control tags per frame (ShowFrame and End are added). */
  defineSprite(id: number, frames: Uint8Array[][]): this {
    const s = new ByteSink().u16(id).u16(frames.length);
    for (const f of frames) {
      for (const t of f) s.bytes(t);
      s.bytes(encodeTag(TAG.ShowFrame, new Uint8Array(0)));
    }
    s.bytes(encodeTag(TAG.End, new Uint8Array(0)));
    return this.tag(TAG.DefineSprite, s.toBytes(), true);
  }
  placeObject2(p: PlaceSpec): this { this.tags.push(placeObject2(p)); return this; }
  showFrame(): this { this.frames++; return this.tag(TAG.ShowFrame, new Uint8Array(0)); }
  tag(code: number, body: Uint8Array, long = false): this { this.tags.push(encodeTag(code, body, long)); return this; }

  build(): Uint8Array {
    const all = [...this.tags, encodeTag(TAG.End, new Uint8Array(0))];
    const len = all.reduce((n, t) => n + t.length, 0);
    const tags = new Uint8Array(len);
    let o = 0;
    for (const t of all) { tags.set(t, o); o += t.length; }
    return wrapSwf(tags, Math.max(this.frames, 1), this.header);
  }
}

/** Convenience: a one-frame SWF v8 running `bytecode` (DoAction) in frame 1. */
export function singleFrameSwf(bytecode: Uint8Array, opts: SwfHeaderSpec & { bg?: number } = {}): Uint8Array {
  return new SwfBuilder(opts).fileAttributes(0).backgroundColor(opts.bg ?? 0xffffff).scriptLimits(1000, 60)
    .doAction(bytecode).showFrame().build();
}

// ---------------------------------------------------------------------------------------------- re-serializer

export interface Injection {
  /** 1-based ROOT frame number; the tags are inserted just before that frame's ShowFrame. */
  frame: number;
  /** Already-encoded tags (e.g. `encodeTag(TAG.DoAction, code, true)`). */
  tags: Uint8Array[];
  /** Insert at the START of the frame (right after the previous ShowFrame) instead of before its ShowFrame. */
  atStart?: boolean;
}

/**
 * Copy `swf` (any signature) with extra tags injected at root frames. All original tag bytes are copied verbatim
 * (including obfuscation junk tags), so byte offsets inside each original tag are preserved; only tags after an
 * injection point shift as a whole.
 */
export function reserializeWithInjections(swf: SwfFile, injections: Injection[], opts: { compress?: boolean } = {}): Uint8Array {
  const out = new ByteSink();
  const header = swf.data.subarray(8, swf.tagsOffset);
  const pending = [...injections];
  let frame = 1;
  const emitFor = (where: 'start' | 'end'): void => {
    for (const inj of pending) {
      if (inj.frame !== frame) continue;
      if ((inj.atStart ? 'start' : 'end') !== where) continue;
      for (const t of inj.tags) out.bytes(t);
    }
  };
  let atFrameStart = true;
  for (const t of swf.tags()) {
    if (atFrameStart) { emitFor('start'); atFrameStart = false; }
    if (t.code === TAG.ShowFrame) { emitFor('end'); frame++; atFrameStart = true; }
    out.bytes(swf.data.subarray(t.headerOffset, t.offset + t.length));
  }
  const tags = out.toBytes();
  const used = injections.filter((i) => i.frame < frame);
  if (used.length !== injections.length) throw new Error(`injection frame out of range (root has ${frame - 1} frames)`);
  const body = new Uint8Array(header.length + tags.length);
  body.set(header, 0);
  body.set(tags, header.length);
  const fileLength = 8 + body.length;
  const res = new ByteSink();
  if (opts.compress) res.u8(0x43).u8(0x57).u8(0x53).u8(swf.header.version).u32(fileLength).bytes(new Uint8Array(deflateSync(body)));
  else res.u8(0x46).u8(0x57).u8(0x53).u8(swf.header.version).u32(fileLength).bytes(body);
  return res.toBytes();
}
