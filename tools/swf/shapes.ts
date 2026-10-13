/**
 * DefineShape / DefineShape2 / DefineShape3 / DefineShape4 parsing (SHAPEWITHSTYLE) into style arrays plus a flat
 * list of shape records with ABSOLUTE integer-twip coordinates. Geometry conversion lives in shapeConvert.ts.
 *
 * The record reader is generic over the style payload so that glyph shapes (DefineFont3, no styles) and morph
 * shapes (morph.ts, own style format) reuse it.
 */
import type { ByteReader } from './ByteReader.ts';
import type { FillStyle, LineStyle, Rect } from '../../src/shared/assetSchema.ts';
import { matrixAll20, readGradient, readMatrixTwips, readRect, readRGB, readRGBA } from './records.ts';

// ---------------------------------------------------------------- records

/** Style-change record. `moveTo` is absolute (twips). Style indices are 1-based within the current layer, 0 = none. */
export interface StyleChangeRecord<S> {
  t: 'style';
  moveTo?: [number, number];
  fill0?: number;
  fill1?: number;
  line?: number;
  /** StateNewStyles payload (starts a new style layer). */
  newStyles?: S;
}

/** Edge record with absolute twip coordinates. A curve has a control point (cx, cy). */
export interface EdgeRecord {
  t: 'edge';
  x0: number; y0: number;
  x1: number; y1: number;
  cx?: number; cy?: number;
}

export type ShapeRecord<S> = StyleChangeRecord<S> | EdgeRecord;

export interface ShapeRecordStats { /** StateNewStyles records seen. */ newStyles: number }

/**
 * Read SHAPERECORDs until EndShapeRecord. `numFillBits`/`numLineBits` are the initial index widths;
 * `readNewStyles` is called for StateNewStyles and must return the payload plus the new bit widths.
 * The reader is left byte-aligned after the end record.
 */
export function readShapeRecords<S>(
  r: ByteReader,
  numFillBits: number,
  numLineBits: number,
  readNewStyles: ((r: ByteReader) => S) | null,
  start: [number, number] = [0, 0],
): ShapeRecord<S>[] {
  const out: ShapeRecord<S>[] = [];
  let x = start[0], y = start[1];
  for (;;) {
    const isEdge = r.bit();
    if (!isEdge) {
      const newStyles = r.bit(), lineStyle = r.bit(), fill1 = r.bit(), fill0 = r.bit(), moveTo = r.bit();
      if (!newStyles && !lineStyle && !fill1 && !fill0 && !moveTo) break; // EndShapeRecord
      const rec: StyleChangeRecord<S> = { t: 'style' };
      if (moveTo) {
        const n = r.ub(5);
        x = r.sb(n); y = r.sb(n);
        rec.moveTo = [x, y];
      }
      if (fill0) rec.fill0 = r.ub(numFillBits);
      if (fill1) rec.fill1 = r.ub(numFillBits);
      if (lineStyle) rec.line = r.ub(numLineBits);
      if (newStyles) {
        if (!readNewStyles) throw new Error(`StateNewStyles not allowed here (pos ${r.pos})`);
        rec.newStyles = readNewStyles(r); // byte-aligned style arrays
        numFillBits = r.ub(4);
        numLineBits = r.ub(4);
      }
      out.push(rec);
    } else if (r.bit()) { // straight edge
      const n = r.ub(4) + 2;
      let dx = 0, dy = 0;
      if (r.bit()) { dx = r.sb(n); dy = r.sb(n); } // general line
      else if (r.bit()) dy = r.sb(n); // vertical
      else dx = r.sb(n);
      out.push({ t: 'edge', x0: x, y0: y, x1: x + dx, y1: y + dy });
      x += dx; y += dy;
    } else { // curved edge
      const n = r.ub(4) + 2;
      const cdx = r.sb(n), cdy = r.sb(n), adx = r.sb(n), ady = r.sb(n);
      const cx = x + cdx, cy = y + cdy;
      out.push({ t: 'edge', x0: x, y0: y, cx, cy, x1: cx + adx, y1: cy + ady });
      x = cx + adx; y = cy + ady;
    }
  }
  r.align();
  return out;
}

// ---------------------------------------------------------------- styles

export interface StyleArrays { fills: FillStyle[]; lines: LineStyle[] }

const CAPS = ['round', 'none', 'square', 'round'] as const;
const JOINS = ['round', 'bevel', 'miter', 'round'] as const;

/** FILLSTYLE. `ver` = DefineShape version (1..4). */
export function readFillStyle(r: ByteReader, ver: number): FillStyle {
  const type = r.u8();
  const rgba = ver >= 3;
  switch (type) {
    case 0x00:
      return { t: 'solid', c: rgba ? readRGBA(r) : readRGB(r) };
    case 0x10: case 0x12: case 0x13: {
      const m = matrixAll20(readMatrixTwips(r));
      const g = readGradient(r, rgba);
      if (type === 0x13) {
        const focal = r.fixed8();
        return { t: 'focal', m, spread: g.spread, interp: g.interp, stops: g.stops, focal };
      }
      return { t: type === 0x10 ? 'linear' : 'radial', m, spread: g.spread, interp: g.interp, stops: g.stops };
    }
    case 0x40: case 0x41: case 0x42: case 0x43: {
      const bitmapId = r.u16();
      const m = matrixAll20(readMatrixTwips(r));
      return { t: 'bitmap', bitmapId, m, repeat: (type & 1) === 0, smooth: (type & 2) === 0 };
    }
    default:
      throw new Error(`Unknown fill style type 0x${type.toString(16)} at ${r.pos - 1}`);
  }
}

export function readFillStyleArray(r: ByteReader, ver: number): FillStyle[] {
  let n = r.u8();
  if (n === 0xff && ver >= 2) n = r.u16();
  const out: FillStyle[] = [];
  for (let i = 0; i < n; i++) out.push(readFillStyle(r, ver));
  return out;
}

/** LINESTYLE (v1..3) or LINESTYLE2 (v4). */
export function readLineStyle(r: ByteReader, ver: number): LineStyle {
  const w = r.u16() / 20;
  if (ver < 4) return { w, c: ver >= 3 ? readRGBA(r) : readRGB(r) };
  const startCap = CAPS[r.ub(2)];
  const joinBits = r.ub(2);
  const hasFill = r.bit();
  const noHScale = r.bit(), noVScale = r.bit(), pixelHinting = r.bit();
  r.ub(5);
  const noClose = r.bit();
  const endCap = CAPS[r.ub(2)];
  const ls: LineStyle = { w, startCap, endCap, join: JOINS[joinBits] };
  if (joinBits === 2) ls.miter = r.u16() / 256; // MiterLimitFactor FIXED8 (unsigned in practice)
  if (hasFill) ls.fill = readFillStyle(r, ver);
  else ls.c = readRGBA(r);
  if (noHScale) ls.noHScale = true;
  if (noVScale) ls.noVScale = true;
  if (pixelHinting) ls.pixelHinting = true;
  if (noClose) ls.noClose = true;
  return ls;
}

export function readLineStyleArray(r: ByteReader, ver: number): LineStyle[] {
  let n = r.u8();
  if (n === 0xff && ver >= 2) n = r.u16();
  const out: LineStyle[] = [];
  for (let i = 0; i < n; i++) out.push(readLineStyle(r, ver));
  return out;
}

export function readStyleArrays(r: ByteReader, ver: number): StyleArrays {
  const fills = readFillStyleArray(r, ver);
  const lines = readLineStyleArray(r, ver);
  return { fills, lines };
}

// ---------------------------------------------------------------- DefineShape*

export interface RawShape {
  id: number;
  ver: number;
  bounds: Rect;
  edgeBounds?: Rect;
  /** DefineShape4 flags. */
  usesFillWindingRule?: boolean;
  usesNonScalingStrokes?: boolean;
  usesScalingStrokes?: boolean;
  styles: StyleArrays;
  records: ShapeRecord<StyleArrays>[];
}

export const SHAPE_TAG_VERSION: Record<number, number> = { 2: 1, 22: 2, 32: 3, 83: 4 };

/** Parse a DefineShape* tag body. `code` = tag code (2, 22, 32, 83). */
export function parseDefineShape(r: ByteReader, code: number): RawShape {
  const ver = SHAPE_TAG_VERSION[code];
  if (!ver) throw new Error(`Not a DefineShape tag: ${code}`);
  const id = r.u16();
  const bounds = readRect(r);
  const shape: RawShape = { id, ver, bounds, styles: { fills: [], lines: [] }, records: [] };
  if (ver === 4) {
    shape.edgeBounds = readRect(r);
    const flags = r.u8();
    shape.usesFillWindingRule = !!(flags & 4);
    shape.usesNonScalingStrokes = !!(flags & 2);
    shape.usesScalingStrokes = !!(flags & 1);
  }
  shape.styles = readStyleArrays(r, ver);
  const numFillBits = r.ub(4), numLineBits = r.ub(4);
  shape.records = readShapeRecords(r, numFillBits, numLineBits, ver >= 2 ? (rr) => readStyleArrays(rr, ver) : null);
  return shape;
}
