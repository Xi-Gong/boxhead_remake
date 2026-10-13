/**
 * DefineMorphShape / DefineMorphShape2 -> MorphDef.
 *
 * Start and end edge lists are paired in order (the end shape only repeats moveTo's, its edges correspond 1:1 to the
 * start edges). A straight/curve mismatch converts the straight edge into a quadratic with its midpoint as control.
 * Edges carry absolute coordinates, so end-shape moveTo's are already folded into the end geometry.
 * The paired segments then go through exactly the same layering + contour chaining as static shapes
 * (shapeConvert.ts): chaining matches START coordinates and the END geometry follows the same permutation/reversal.
 */
import type { ByteReader } from './ByteReader.ts';
import type { FillStyle, LineStyle, MorphDef, MorphLayer } from '../../src/shared/assetSchema.ts';
import { matrixAll20, readMatrixTwips, readRect, readRGBA } from './records.ts';
import { readShapeRecords, type EdgeRecord, type ShapeRecord } from './shapes.ts';
import { chainContours, emptyStats, layerize, type ConvertStats, type Geom, type PathRec, type Seg } from './shapeConvert.ts';

type FillPair = [FillStyle, FillStyle];
type LinePair = [LineStyle, LineStyle];
interface MorphStyles { fills: FillPair[]; lines: LinePair[] }

const SPREAD = ['pad', 'reflect', 'repeat', 'pad'] as const;
const INTERP = ['rgb', 'linear', 'rgb', 'rgb'] as const;
const CAPS = ['round', 'none', 'square', 'round'] as const;
const JOINS = ['round', 'bevel', 'miter', 'round'] as const;

function readMorphFillStyle(r: ByteReader): FillPair {
  const type = r.u8();
  switch (type) {
    case 0x00:
      return [{ t: 'solid', c: readRGBA(r) }, { t: 'solid', c: readRGBA(r) }];
    case 0x10: case 0x12: case 0x13: {
      const m0 = matrixAll20(readMatrixTwips(r));
      const m1 = matrixAll20(readMatrixTwips(r));
      // MORPHGRADIENT: count byte (upper bits carry spread/interpolation like GRADIENT), then start/end records.
      const flags = r.u8();
      const spread = SPREAD[flags >> 6], interp = INTERP[(flags >> 4) & 3];
      const n = flags & 15;
      const s0 = [], s1 = [];
      for (let i = 0; i < n; i++) {
        s0.push({ r: r.u8(), c: readRGBA(r) });
        s1.push({ r: r.u8(), c: readRGBA(r) });
      }
      const t = type === 0x10 ? 'linear' : type === 0x12 ? 'radial' : 'focal';
      const a: FillStyle = { t, m: m0, spread, interp, stops: s0 };
      const b: FillStyle = { t, m: m1, spread, interp, stops: s1 };
      if (type === 0x13) { a.focal = r.fixed8(); b.focal = r.fixed8(); }
      return [a, b];
    }
    case 0x40: case 0x41: case 0x42: case 0x43: {
      const bitmapId = r.u16();
      const m0 = matrixAll20(readMatrixTwips(r));
      const m1 = matrixAll20(readMatrixTwips(r));
      const repeat = (type & 1) === 0, smooth = (type & 2) === 0;
      return [{ t: 'bitmap', bitmapId, m: m0, repeat, smooth }, { t: 'bitmap', bitmapId, m: m1, repeat, smooth }];
    }
    default:
      throw new Error(`Unknown morph fill style 0x${type.toString(16)} at ${r.pos - 1}`);
  }
}

function readMorphLineStyle(r: ByteReader, v2: boolean): LinePair {
  const w0 = r.u16() / 20, w1 = r.u16() / 20;
  if (!v2) return [{ w: w0, c: readRGBA(r) }, { w: w1, c: readRGBA(r) }];
  const startCap = CAPS[r.ub(2)];
  const joinBits = r.ub(2);
  const hasFill = r.bit(), noHScale = r.bit(), noVScale = r.bit(), pixelHinting = r.bit();
  r.ub(5);
  const noClose = r.bit();
  const endCap = CAPS[r.ub(2)];
  const base: LineStyle = { w: 0, startCap, endCap, join: JOINS[joinBits] };
  if (joinBits === 2) base.miter = r.u16() / 256;
  if (noHScale) base.noHScale = true;
  if (noVScale) base.noVScale = true;
  if (pixelHinting) base.pixelHinting = true;
  if (noClose) base.noClose = true;
  const a: LineStyle = { ...base, w: w0 }, b: LineStyle = { ...base, w: w1 };
  if (hasFill) [a.fill, b.fill] = readMorphFillStyle(r);
  else { a.c = readRGBA(r); b.c = readRGBA(r); }
  return [a, b];
}

function readCount(r: ByteReader): number {
  const n = r.u8();
  return n === 0xff ? r.u16() : n;
}

export interface RawMorph {
  id: number;
  ver: number;
  def: MorphDef;
  /** Raw start / end shape records (absolute twips), for verification. */
  startRecords: ShapeRecord<never>[];
  endRecords: ShapeRecord<never>[];
  styles: { fills: FillPair[]; lines: LinePair[] };
  stats: ConvertStats & { startEdges: number; endEdges: number; converted: number };
}

const toGeom = (e: EdgeRecord): Geom =>
  e.cx !== undefined ? [e.x0, e.y0, e.cx, e.cy!, e.x1, e.y1] : [e.x0, e.y0, (e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, e.x1, e.y1];

/** Parse a DefineMorphShape (46) / DefineMorphShape2 (84) tag body. */
export function parseDefineMorphShape(r: ByteReader, code: number): RawMorph {
  const v2 = code === 84;
  const id = r.u16();
  const startBounds = readRect(r);
  const endBounds = readRect(r);
  if (v2) { readRect(r); readRect(r); r.u8(); } // StartEdgeBounds, EndEdgeBounds, flags
  const offset = r.u32();
  const endEdgesPos = r.pos + offset;
  const styles: MorphStyles = { fills: [], lines: [] };
  for (let i = readCount(r); i > 0; i--) styles.fills.push(readMorphFillStyle(r));
  for (let i = readCount(r); i > 0; i--) styles.lines.push(readMorphLineStyle(r, v2));
  const fBits = r.ub(4), lBits = r.ub(4);
  const startRecs: ShapeRecord<never>[] = readShapeRecords<never>(r, fBits, lBits, null);
  r.pos = endEdgesPos;
  const efBits = r.ub(4), elBits = r.ub(4);
  const endRecs: ShapeRecord<never>[] = readShapeRecords<never>(r, efBits, elBits, null);

  // ---- pair edges
  const endEdges = endRecs.filter((e): e is EdgeRecord => e.t === 'edge');
  const recs: PathRec<MorphStyles>[] = [];
  let k = 0, converted = 0, startEdges = 0;
  for (const rec of startRecs) {
    if (rec.t === 'style') {
      recs.push({ t: 'style', move: !!rec.moveTo, fill0: rec.fill0, fill1: rec.fill1, line: rec.line });
      continue;
    }
    startEdges++;
    const e = endEdges[k++];
    if (!e) throw new Error(`Morph ${id}: end shape has fewer edges than start shape`);
    const sq = rec.cx !== undefined, eq = e.cx !== undefined;
    if (sq !== eq) converted++;
    recs.push({ t: 'seg', seg: { q: sq || eq, a: toGeom(rec), b: toGeom(e) } });
  }
  if (k !== endEdges.length) throw new Error(`Morph ${id}: edge count mismatch ${k} vs ${endEdges.length}`);

  // ---- layering + chaining (identical to static shapes)
  const stats = emptyStats();
  const accs = layerize(recs, styles, (s) => ({ fills: s.fills.length, lines: s.lines.length }), stats);
  const layers: MorphLayer[] = [];
  for (const acc of accs) {
    const layer: MorphLayer = { fillStyles: acc.styles.fills, lineStyles: acc.styles.lines, fills: [], strokes: [] };
    acc.fillSegs.forEach((segs, i) => {
      if (!segs.length) return;
      const cs = chainContours(segs);
      stats.contours += cs.length;
      for (const c of cs) if (!c.closed) stats.unclosed++;
      layer.fills.push({ s: i, ...morphPath(cs.map((c) => c.segs), cs.map((c) => c.closed)) });
    });
    acc.strokePaths.forEach((paths, i) => {
      if (!paths.length) return;
      const noClose = !!acc.styles.lines[i][0].noClose;
      layer.strokes.push({ s: i, ...morphPath(paths, paths.map((p) => !noClose && closedA(p))) });
    });
    if (layer.fills.length || layer.strokes.length) layers.push(layer);
  }
  return {
    id, ver: v2 ? 2 : 1, startRecords: startRecs, endRecords: endRecs, styles,
    def: { t: 'morph', id, ver: v2 ? 2 : 1, startBounds, endBounds, layers },
    stats: { ...stats, startEdges, endEdges: endEdges.length, converted },
  };
}

const closedA = (segs: Seg[]) => {
  const f = segs[0].a, l = segs[segs.length - 1].a;
  return f[0] === l[4] && f[1] === l[5];
};

/** Shared command string + flat start/end coordinate arrays (px). */
function morphPath(paths: Seg[][], closed: boolean[]): { cmd: string; a: number[]; b: number[] } {
  let cmd = '';
  const a: number[] = [], b: number[] = [];
  paths.forEach((segs, pi) => {
    if (!segs.length) return;
    const s0 = segs[0];
    cmd += 'M';
    a.push(s0.a[0] / 20, s0.a[1] / 20);
    b.push(s0.b![0] / 20, s0.b![1] / 20);
    for (const s of segs) {
      const ga = s.a, gb = s.b!;
      if (s.q) {
        cmd += 'Q';
        a.push(ga[2] / 20, ga[3] / 20, ga[4] / 20, ga[5] / 20);
        b.push(gb[2] / 20, gb[3] / 20, gb[4] / 20, gb[5] / 20);
      } else {
        cmd += 'L';
        a.push(ga[4] / 20, ga[5] / 20);
        b.push(gb[4] / 20, gb[5] / 20);
      }
    }
    if (closed[pi]) cmd += 'Z';
  });
  return { cmd, a, b };
}
