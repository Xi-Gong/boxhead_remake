/**
 * Flash two-sided fill reconstruction: SWF shape records -> per-layer closed fill contours + stroke subpaths.
 *
 * SWF edges carry up to two fill styles (FillStyle0 / FillStyle1, one per side) and one line style. Per style layer:
 *   - every edge is pushed onto FillStyle1's list as-is and onto FillStyle0's list reversed (same control point),
 *     so all edges bounding a fill region run in the same rotational direction around it;
 *   - each fill's edges are chained into contours by exact integer-twip endpoint matching (Map keyed "x,y");
 *   - one even-odd path per fill style is emitted (because the even-odd fill of a set of closed loops depends only on
 *     the edge multiset, the way edges are grouped into loops does not matter);
 *   - strokes become subpaths per line style, broken on moveTo / line-style change / discontinuity.
 * A new layer starts at every StateNewStyles record (later layers draw on top; inside a layer: fills, then strokes,
 * both in style-index order).
 *
 * The core (`layerize`, `chainContours`) is geometry-agnostic so morph.ts can run the identical chaining on paired
 * start/end edges (`Seg.b`).
 */
import type { ShapeLayer } from '../../src/shared/assetSchema.ts';
import type { RawShape, ShapeRecord, StyleArrays } from './shapes.ts';

// ---------------------------------------------------------------- segment model

/** Segment geometry in integer twips: [x0, y0, cx, cy, x1, y1] (control point unused for straight segments). */
export type Geom = [number, number, number, number, number, number];

export interface Seg {
  /** Quadratic curve (true) or straight line. */
  q: boolean;
  /** Geometry (shape / morph start). */
  a: Geom;
  /** Morph end geometry (same layout, same q). */
  b?: Geom;
}

export function reverseGeom(g: Geom): Geom { return [g[4], g[5], g[2], g[3], g[0], g[1]]; }

export function reverseSeg(s: Seg): Seg {
  return s.b ? { q: s.q, a: reverseGeom(s.a), b: reverseGeom(s.b) } : { q: s.q, a: reverseGeom(s.a) };
}

function geomIsPoint(g: Geom, q: boolean): boolean {
  return g[0] === g[4] && g[1] === g[5] && (!q || (g[2] === g[0] && g[3] === g[1]));
}

export function isZeroLength(s: Seg): boolean {
  return geomIsPoint(s.a, s.q) && (!s.b || geomIsPoint(s.b, s.q));
}

/** Generic path record stream consumed by `layerize` (shape records after absolute-coordinate decoding). */
export type PathRec<L> =
  | { t: 'style'; move: boolean; fill0?: number; fill1?: number; line?: number; newLayer?: L }
  | { t: 'seg'; seg: Seg };

// ---------------------------------------------------------------- layering

export interface LayerAcc<L> {
  /** Style payload of the layer (StyleArrays for shapes). */
  styles: L;
  nFills: number;
  nLines: number;
  /** Per fill style (index = style - 1): directed segments (fill1 as-is, fill0 reversed). */
  fillSegs: Seg[][];
  /** Per line style (index = style - 1): subpaths in record order. */
  strokePaths: Seg[][][];
}

export interface ConvertStats {
  layers: number;
  /** Edge records. */
  edges: number;
  /** Edge records with zero length (dropped). */
  zeroLength: number;
  /** Directed fill segments emitted (= sum over non-zero edges of [fill0 > 0] + [fill1 > 0], valid indices only). */
  fillSegments: number;
  /** Stroke segments emitted. */
  strokeSegments: number;
  contours: number;
  /** Fill contours whose chain could not be closed (still emitted). */
  unclosed: number;
  /** Style indices beyond the style arrays (ignored). */
  badStyleRefs: number;
}

export function emptyStats(): ConvertStats {
  return { layers: 0, edges: 0, zeroLength: 0, fillSegments: 0, strokeSegments: 0, contours: 0, unclosed: 0, badStyleRefs: 0 };
}

/**
 * Split records into style layers and distribute directed segments to fill styles and stroke subpaths.
 * `countOf` returns the number of fill / line styles of a layer payload.
 */
export function layerize<L>(
  recs: PathRec<L>[],
  initial: L,
  countOf: (l: L) => { fills: number; lines: number },
  stats: ConvertStats,
): LayerAcc<L>[] {
  const layers: LayerAcc<L>[] = [];
  let layer!: LayerAcc<L>;
  const newLayer = (styles: L) => {
    const { fills, lines } = countOf(styles);
    layer = {
      styles, nFills: fills, nLines: lines,
      fillSegs: Array.from({ length: fills }, () => []),
      strokePaths: Array.from({ length: lines }, () => []),
    };
    layers.push(layer);
  };
  newLayer(initial);

  let fill0 = 0, fill1 = 0, line = 0;
  /** Current open stroke subpath (belongs to `line` of the current layer), null after a break. */
  let curStroke: Seg[] | null = null;

  for (const rec of recs) {
    if (rec.t === 'style') {
      if (rec.newLayer !== undefined) {
        newLayer(rec.newLayer);
        // Indices refer to the new arrays; selections not set by this record are reset.
        fill0 = fill1 = line = 0;
        curStroke = null;
      }
      if (rec.move) curStroke = null;
      if (rec.fill0 !== undefined) fill0 = rec.fill0;
      if (rec.fill1 !== undefined) fill1 = rec.fill1;
      if (rec.line !== undefined && rec.line !== line) { line = rec.line; curStroke = null; }
      continue;
    }
    const seg = rec.seg;
    stats.edges++;
    if (isZeroLength(seg)) { stats.zeroLength++; continue; }
    if (fill1 > 0) {
      if (fill1 <= layer.nFills) { layer.fillSegs[fill1 - 1].push(seg); stats.fillSegments++; } else stats.badStyleRefs++;
    }
    if (fill0 > 0) {
      if (fill0 <= layer.nFills) { layer.fillSegs[fill0 - 1].push(reverseSeg(seg)); stats.fillSegments++; } else stats.badStyleRefs++;
    }
    if (line > 0) {
      if (line <= layer.nLines) {
        const last = curStroke?.[curStroke.length - 1];
        const contiguous = !!last && last.a[4] === seg.a[0] && last.a[5] === seg.a[1] &&
          (!last.b || !seg.b || (last.b[4] === seg.b[0] && last.b[5] === seg.b[1]));
        if (!curStroke || !contiguous) {
          curStroke = [];
          layer.strokePaths[line - 1].push(curStroke);
        }
        curStroke.push(seg);
        stats.strokeSegments++;
      } else stats.badStyleRefs++;
    }
  }
  stats.layers += layers.length;
  return layers;
}

// ---------------------------------------------------------------- contour chaining

export interface Contour { segs: Seg[]; closed: boolean }

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Chain directed segments into contours by exact endpoint matching. Segments are consumed in input order; at a
 * vertex with several candidates the first unused one wins, preferring (for morphs) one whose END geometry also
 * continues the current end-geometry point. A contour closes as soon as it returns to its start point.
 */
export function chainContours(segs: Seg[]): Contour[] {
  const byStart = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const k = key(s.a[0], s.a[1]);
    const list = byStart.get(k);
    if (list) list.push(i); else byStart.set(k, [i]);
  });
  const used = new Uint8Array(segs.length);
  const out: Contour[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const first = segs[i];
    const contour: Seg[] = [first];
    const sx = first.a[0], sy = first.a[1];
    let cur = first;
    let closed = false;
    for (;;) {
      if (cur.a[4] === sx && cur.a[5] === sy) { closed = true; break; }
      const list = byStart.get(key(cur.a[4], cur.a[5]));
      let pick = -1;
      if (list) {
        for (const j of list) {
          if (used[j]) continue;
          if (pick < 0) pick = j;
          const b = segs[j].b, cb = cur.b;
          if (!b || !cb || (b[0] === cb[4] && b[1] === cb[5])) { pick = j; break; }
        }
      }
      if (pick < 0) break;
      used[pick] = 1;
      cur = segs[pick];
      contour.push(cur);
    }
    out.push({ segs: contour, closed });
  }
  return out;
}

// ---------------------------------------------------------------- formatting

/** Integer twips -> exact px decimal string ("0.05", "-12.3", "40"). */
export function twipsStr(t: number): string {
  if (!Number.isInteger(t)) return numStr(t / 20);
  const neg = t < 0;
  const abs = neg ? -t : t;
  const ip = Math.floor(abs / 20);
  const rem = abs % 20; // remainder * 5 = hundredths
  let s = String(ip);
  if (rem) {
    const h = rem * 5;
    s += '.' + (h % 10 === 0 ? String(h / 10) : h < 10 ? '0' + h : String(h));
  }
  return neg ? '-' + s : s;
}

/** Compact number formatting: ≤3 decimals, trailing zeros trimmed, no "-0". */
export function numStr(n: number): string {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) || v === 0 ? '0' : String(v);
}

/**
 * SVG path data (px) for a list of contours / subpaths. Format: explicit command letter for every segment
 * (M/L/Q/Z only), numbers separated by single spaces, e.g. "M10 20L30 -5Q1 2 3 4Z".
 * `close(segs)` decides whether to append Z.
 */
export function pathData(paths: Seg[][], close: (segs: Seg[]) => boolean): string {
  let d = '';
  for (const segs of paths) {
    if (!segs.length) continue;
    const s0 = segs[0].a;
    d += `M${twipsStr(s0[0])} ${twipsStr(s0[1])}`;
    for (const s of segs) {
      const g = s.a;
      d += s.q
        ? `Q${twipsStr(g[2])} ${twipsStr(g[3])} ${twipsStr(g[4])} ${twipsStr(g[5])}`
        : `L${twipsStr(g[4])} ${twipsStr(g[5])}`;
    }
    if (close(segs)) d += 'Z';
  }
  return d;
}

const isClosedPath = (segs: Seg[]) => {
  const f = segs[0].a, l = segs[segs.length - 1].a;
  return f[0] === l[4] && f[1] === l[5];
};

// ---------------------------------------------------------------- shapes

/** Decode DefineShape records into the generic PathRec stream. */
export function shapeRecsToPathRecs<S>(records: ShapeRecord<S>[]): PathRec<S>[] {
  const out: PathRec<S>[] = [];
  for (const r of records) {
    if (r.t === 'style') {
      out.push({ t: 'style', move: !!r.moveTo, fill0: r.fill0, fill1: r.fill1, line: r.line, newLayer: r.newStyles });
    } else if (r.cx !== undefined) {
      out.push({ t: 'seg', seg: { q: true, a: [r.x0, r.y0, r.cx, r.cy!, r.x1, r.y1] } });
    } else {
      out.push({ t: 'seg', seg: { q: false, a: [r.x0, r.y0, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.x1, r.y1] } });
    }
  }
  return out;
}

export interface ConvertedShape {
  layers: ShapeLayer[];
  stats: ConvertStats;
  /** Fill contours per layer/style (twips), for invariant checks. */
  contours: { layer: number; s: number; contours: Contour[] }[];
}

/** Full conversion of a parsed DefineShape* into schema layers. */
export function convertShape(raw: RawShape): ConvertedShape {
  const stats = emptyStats();
  const accs = layerize(shapeRecsToPathRecs(raw.records), raw.styles, (l) => ({ fills: l.fills.length, lines: l.lines.length }), stats);
  const layers: ShapeLayer[] = [];
  const contours: ConvertedShape['contours'] = [];
  accs.forEach((acc, li) => {
    const layer: ShapeLayer = { fillStyles: acc.styles.fills, lineStyles: acc.styles.lines, fills: [], strokes: [] };
    acc.fillSegs.forEach((segs, i) => {
      if (!segs.length) return;
      const cs = chainContours(segs);
      stats.contours += cs.length;
      for (const c of cs) if (!c.closed) stats.unclosed++;
      contours.push({ layer: li, s: i, contours: cs });
      layer.fills.push({ s: i, d: pathData(cs.map((c) => c.segs), (segs) => isClosedPath(segs)) });
    });
    acc.strokePaths.forEach((paths, i) => {
      if (!paths.length) return;
      const noClose = !!acc.styles.lines[i].noClose;
      layer.strokes.push({ s: i, d: pathData(paths, (segs) => !noClose && isClosedPath(segs)) });
    });
    if (layer.fills.length || layer.strokes.length) layers.push(layer);
  });
  return { layers, stats, contours };
}

// ---------------------------------------------------------------- bounds helpers (tests / reports)

/** Exact bounds (px) of a list of segments, including quadratic extrema. */
export function segsBoundsPx(segs: Seg[]): { xMin: number; yMin: number; xMax: number; yMax: number } {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const add = (x: number, y: number) => {
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  };
  for (const s of segs) {
    const [x0, y0, cx, cy, x1, y1] = s.a;
    add(x0, y0); add(x1, y1);
    if (s.q) {
      for (const [p0, p1, p2, axis] of [[x0, cx, x1, 0], [y0, cy, y1, 1]] as const) {
        const den = p0 - 2 * p1 + p2;
        if (den === 0) continue;
        const t = (p0 - p1) / den;
        if (t <= 0 || t >= 1) continue;
        const v = (1 - t) * (1 - t) * p0 + 2 * t * (1 - t) * p1 + t * t * p2;
        const tx = (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * cx + t * t * x1;
        const ty = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * cy + t * t * y1;
        if (axis === 0) add(v, ty); else add(tx, v);
      }
    }
  }
  return { xMin: xMin / 20, yMin: yMin / 20, xMax: xMax / 20, yMax: yMax / 20 };
}
