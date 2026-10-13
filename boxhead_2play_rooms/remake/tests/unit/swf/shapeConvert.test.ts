import { describe, expect, it } from 'vitest';
import type { FillStyle, Rect } from '../../../src/shared/assetSchema.ts';
import { ByteReader } from '../../../tools/swf/ByteReader.ts';
import { parseDefineShape, type EdgeRecord, type RawShape, type ShapeRecord, type StyleArrays } from '../../../tools/swf/shapes.ts';
import { convertShape, segsBoundsPx, twipsStr, type Contour } from '../../../tools/swf/shapeConvert.ts';
import { Bits, getBuild, parsePath } from './helpers.ts';

// ---------------------------------------------------------------- synthetic helpers

const solid = (r: number): FillStyle => ({ t: 'solid', c: [r, 0, 0, 255] });
const S = (o: Omit<Extract<ShapeRecord<StyleArrays>, { t: 'style' }>, 't'>): ShapeRecord<StyleArrays> => ({ t: 'style', ...o });
/** Polyline edges through points (twips). */
const poly = (...pts: [number, number][]): EdgeRecord[] =>
  pts.slice(1).map((p, i) => ({ t: 'edge', x0: pts[i][0], y0: pts[i][1], x1: p[0], y1: p[1] }));
const shape = (fills: FillStyle[], records: ShapeRecord<StyleArrays>[], lines: StyleArrays['lines'] = []): RawShape =>
  ({ id: 1, ver: 3, bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }, styles: { fills, lines }, records });

/** Even-odd point containment against contours (quadratics flattened). */
function evenOdd(contours: Contour[], x: number, y: number): boolean {
  let inside = false;
  for (const c of contours) {
    const pts: [number, number][] = [];
    for (const s of c.segs) {
      const [x0, y0, cx, cy, x1, y1] = s.a;
      if (!pts.length) pts.push([x0, y0]);
      if (s.q) for (let t = 0.125; t <= 1; t += 0.125) pts.push([(1 - t) ** 2 * x0 + 2 * t * (1 - t) * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t * t * y1]);
      else pts.push([x1, y1]);
    }
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

describe('twipsStr / number formatting', () => {
  it('formats twips as exact px decimals', () => {
    expect([0, 1, 2, 10, 20, 21, -3, -20, 247, 400].map(twipsStr)).toEqual(['0', '0.05', '0.1', '0.5', '1', '1.05', '-0.15', '-1', '12.35', '20']);
  });
});

describe('two-sided fill reconstruction (synthetic)', () => {
  it('two squares sharing an edge: each fill gets one closed square, shared edge used in both directions', () => {
    // Left square fill A (1), right square fill B (2), drawn Flash-style: the middle edge carries both fills.
    // y-down screen space: a clockwise loop has its interior on the right of travel = FillStyle1.
    // A (left square) is traced clockwise with fill1 = A. The shared edge runs downwards: A is on its right
    // (fill1 = 1) and B on its left (fill0 = 2). B's remaining edges are traced clockwise with fill1 = B.
    const recs: ShapeRecord<StyleArrays>[] = [
      S({ moveTo: [0, 0], fill0: 0, fill1: 1 }),
      ...poly([0, 0], [200, 0]),
      S({ fill0: 2, fill1: 1 }),
      ...poly([200, 0], [200, 200]),
      S({ fill0: 0, fill1: 1 }),
      ...poly([200, 200], [0, 200], [0, 0]),
      S({ moveTo: [200, 0], fill0: 0, fill1: 2 }),
      ...poly([200, 0], [400, 0], [400, 200], [200, 200]),
    ];
    const { layers, stats, contours } = convertShape(shape([solid(1), solid(2)], recs));
    expect(stats.unclosed).toBe(0);
    expect(stats.fillSegments).toBe(8); // 7 edges, the shared one counts twice
    expect(layers).toHaveLength(1);
    expect(layers[0].fills.map((f) => f.s)).toEqual([0, 1]);
    const a = contours.find((c) => c.s === 0)!.contours, b = contours.find((c) => c.s === 1)!.contours;
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].segs).toHaveLength(4);
    expect(b[0].segs).toHaveLength(4);
    expect(evenOdd(a, 100, 100)).toBe(true);
    expect(evenOdd(a, 300, 100)).toBe(false);
    expect(evenOdd(b, 300, 100)).toBe(true);
    expect(evenOdd(b, 100, 100)).toBe(false);
    expect(layers[0].fills[0].d).toBe('M0 0L10 0L10 10L0 10L0 0Z');
    // B starts with the reversed shared edge (inserted first), then continues clockwise
    expect(layers[0].fills[1].d).toBe('M10 10L10 0L20 0L20 10L10 10Z');
  });

  it('square with a hole: two closed contours, even-odd leaves the hole empty', () => {
    const recs: ShapeRecord<StyleArrays>[] = [
      S({ moveTo: [0, 0], fill1: 1 }),
      ...poly([0, 0], [600, 0], [600, 600], [0, 600], [0, 0]),
      // hole traced in the same direction but with the fill on the other side
      S({ moveTo: [200, 200], fill0: 1, fill1: 0 }),
      ...poly([200, 200], [400, 200], [400, 400], [200, 400], [200, 200]),
    ];
    const { contours, stats } = convertShape(shape([solid(1)], recs));
    const cs = contours[0].contours;
    expect(cs).toHaveLength(2);
    expect(cs.every((c) => c.closed)).toBe(true);
    expect(stats.unclosed).toBe(0);
    expect(evenOdd(cs, 100, 100)).toBe(true); // ring
    expect(evenOdd(cs, 300, 300)).toBe(false); // hole
    expect(evenOdd(cs, 700, 300)).toBe(false); // outside
  });

  it('reverses a curve for fill0 keeping its control point', () => {
    const recs: ShapeRecord<StyleArrays>[] = [
      S({ moveTo: [0, 0], fill0: 1 }),
      { t: 'edge', x0: 0, y0: 0, cx: 100, cy: -100, x1: 200, y1: 0 },
      ...poly([200, 0], [0, 0]),
    ];
    const { layers } = convertShape(shape([solid(1)], recs));
    // both edges reversed: the curve now runs 200,0 -> 0,0 (same control), then the line 0,0 -> 200,0
    expect(layers[0].fills[0].d).toBe('M10 0Q5 -5 0 0L10 0Z');
  });

  it('StateNewStyles starts a new layer with its own styles; selections reset', () => {
    const recs: ShapeRecord<StyleArrays>[] = [
      S({ moveTo: [0, 0], fill1: 1 }),
      ...poly([0, 0], [100, 0], [100, 100], [0, 0]),
      S({ newStyles: { fills: [solid(7), solid(8)], lines: [{ w: 1, c: [0, 0, 0, 255] }] }, moveTo: [500, 500], fill1: 2, line: 1 }),
      ...poly([500, 500], [600, 500], [600, 600], [500, 500]),
      S({ moveTo: [0, 0] }), // no selection change: still fill1 = 2 / line 1 of layer 2
      ...poly([700, 700], [800, 700], [800, 800], [700, 700]),
    ];
    // last poly starts at 700,700 while the pen is at 0,0 — edges carry absolute coordinates, that is fine here
    const { layers, stats } = convertShape(shape([solid(1)], recs));
    expect(layers).toHaveLength(2);
    expect(layers[0].fillStyles).toEqual([solid(1)]);
    expect(layers[0].fills.map((f) => f.s)).toEqual([0]);
    expect(layers[1].fillStyles).toEqual([solid(7), solid(8)]);
    expect(layers[1].fills.map((f) => f.s)).toEqual([1]);
    expect(parsePath(layers[1].fills[0].d).filter((c) => c.c === 'M')).toHaveLength(2);
    // strokes: two subpaths (moveTo breaks), both closed
    expect(layers[1].strokes).toHaveLength(1);
    expect(layers[1].strokes[0].d).toBe('M25 25L30 25L30 30L25 25ZM35 35L40 35L40 40L35 35Z');
    expect(stats.layers).toBe(2);
  });

  it('stroke subpaths continue across fill-only style changes and honour noClose', () => {
    const recs: ShapeRecord<StyleArrays>[] = [
      S({ moveTo: [0, 0], line: 1 }),
      ...poly([0, 0], [100, 0]),
      S({ fill1: 1 }), // fill change only: stroke continues
      ...poly([100, 0], [100, 100], [0, 0]),
    ];
    const lines = [{ w: 2, c: [0, 0, 0, 255] as [number, number, number, number], noClose: true }];
    const { layers } = convertShape(shape([solid(1)], recs, lines));
    expect(layers[0].strokes[0].d).toBe('M0 0L5 0L5 5L0 0'); // closed geometry, but no Z because of noClose
  });

  it('emits (and counts) contours that cannot be closed', () => {
    const recs: ShapeRecord<StyleArrays>[] = [S({ moveTo: [0, 0], fill1: 1 }), ...poly([0, 0], [100, 0], [100, 100])];
    const { layers, stats } = convertShape(shape([solid(1)], recs));
    expect(stats.unclosed).toBe(1);
    expect(layers[0].fills[0].d).toBe('M0 0L5 0L5 5');
  });

  it('drops zero-length edges', () => {
    const recs: ShapeRecord<StyleArrays>[] = [S({ moveTo: [0, 0], fill1: 1 }), ...poly([0, 0], [0, 0], [100, 0], [0, 100], [0, 0])];
    const { stats } = convertShape(shape([solid(1)], recs));
    expect(stats.zeroLength).toBe(1);
    expect(stats.fillSegments).toBe(3);
    expect(stats.unclosed).toBe(0);
  });
});

describe('DefineShape binary parsing (synthetic)', () => {
  it('parses a DefineShape3 square with a curve, absolute coordinates in twips', () => {
    const w = new Bits();
    w.byte(1, 0); // id = 1
    w.u(10, 5).s(0, 10).s(400, 10).s(0, 10).s(400, 10).flush(); // RECT 0..20 px
    w.byte(1, 0x00, 255, 0, 0, 128); // 1 solid fill RGBA
    w.byte(0); // 0 line styles
    w.u(1, 4).u(0, 4); // NumFillBits 1, NumLineBits 0
    w.u(0, 1).u(0, 1).u(0, 1).u(1, 1).u(0, 1).u(1, 1); // style change: fill1 + moveTo
    w.u(9, 5).s(0, 9).s(0, 9); // moveTo 0,0
    w.u(1, 1); // fill1 = 1
    w.u(1, 1).u(1, 1).u(8, 4).u(0, 1).u(0, 1).s(400, 10); // straight horizontal +400 (10-bit deltas)
    w.u(1, 1).u(1, 1).u(8, 4).u(0, 1).u(1, 1).s(400, 10); // straight vertical +400
    w.u(1, 1).u(0, 1).u(8, 4).s(-200, 10).s(100, 10).s(-200, 10).s(-100, 10); // curve back to 0,400 via 200,500
    w.u(1, 1).u(1, 1).u(8, 4).u(1, 1).s(0, 10).s(-400, 10); // general line to 0,0
    w.u(0, 6).flush(); // end record
    const r = new ByteReader(Uint8Array.from(w.bytes));
    const s = parseDefineShape(r, 32);
    expect(r.remaining).toBe(0);
    expect(s.bounds).toEqual({ xMin: 0, xMax: 20, yMin: 0, yMax: 20 });
    expect(s.styles.fills).toEqual([{ t: 'solid', c: [255, 0, 0, 128] }]);
    const edges = s.records.filter((x) => x.t === 'edge');
    expect(edges).toEqual([
      { t: 'edge', x0: 0, y0: 0, x1: 400, y1: 0 },
      { t: 'edge', x0: 400, y0: 0, x1: 400, y1: 400 },
      { t: 'edge', x0: 400, y0: 400, cx: 200, cy: 500, x1: 0, y1: 400 },
      { t: 'edge', x0: 0, y0: 400, x1: 0, y1: 0 },
    ]);
    expect(convertShape(s).layers[0].fills[0].d).toBe('M0 0L20 0L20 20Q10 25 0 20L0 0Z');
  });
});

describe('invariants over all 232 shapes', () => {
  const { raw } = getBuild();
  const shapes = [...raw.shapes.values()];

  it('has 232 shapes and every fill contour closes', () => {
    expect(shapes).toHaveLength(232);
    for (const { raw: s, conv } of shapes) {
      expect(conv.stats.unclosed, `shape ${s.id}`).toBe(0);
      for (const { contours } of conv.contours) for (const c of contours) {
        const f = c.segs[0].a, l = c.segs[c.segs.length - 1].a;
        expect(c.closed && f[0] === l[4] && f[1] === l[5], `shape ${s.id}`).toBe(true);
        // consecutive segments are connected exactly
        for (let i = 1; i < c.segs.length; i++) expect(c.segs[i].a[0] === c.segs[i - 1].a[4] && c.segs[i].a[1] === c.segs[i - 1].a[5]).toBe(true);
      }
    }
  });

  it('conserves edges: directed fill segments = sum over edges of [fill0] + [fill1] (independent count)', () => {
    for (const { raw: s, conv } of shapes) {
      let f0 = 0, f1 = 0, expected = 0, nFills = s.styles.fills.length;
      for (const r of s.records) {
        if (r.t === 'style') {
          if (r.newStyles) { f0 = f1 = 0; nFills = r.newStyles.fills.length; }
          if (r.fill0 !== undefined) f0 = r.fill0;
          if (r.fill1 !== undefined) f1 = r.fill1;
          continue;
        }
        const zero = r.x0 === r.x1 && r.y0 === r.y1 && (r.cx === undefined || (r.cx === r.x0 && r.cy === r.y0));
        if (zero) continue;
        if (f0 > 0 && f0 <= nFills) expected++;
        if (f1 > 0 && f1 <= nFills) expected++;
      }
      const emitted = conv.contours.reduce((n, c) => n + c.contours.reduce((k, x) => k + x.segs.length, 0), 0);
      expect(emitted, `shape ${s.id}`).toBe(expected);
      expect(conv.stats.fillSegments).toBe(expected);
      expect(conv.stats.edges).toBe(s.records.filter((r) => r.t === 'edge').length);
      expect(conv.stats.badStyleRefs).toBe(0);
    }
  });

  it('path data round-trips: segment counts per fill path match the contours', () => {
    for (const { raw: s, conv } of shapes) {
      conv.layers.forEach((layer) => {
        for (const f of layer.fills) {
          const cmds = parsePath(f.d);
          expect(cmds.every((c) => (c.c === 'M' || c.c === 'L' ? c.n.length === 2 : c.c === 'Q' ? c.n.length === 4 : c.n.length === 0))).toBe(true);
          expect(cmds.filter((c) => c.c === 'M').length).toBe(cmds.filter((c) => c.c === 'Z').length); // all closed
          expect(cmds.every((c) => c.n.every((v) => Number.isFinite(v) && Math.round(v * 20) === v * 20 || Math.abs(v * 20 - Math.round(v * 20)) < 1e-9))).toBe(true);
        }
      });
      const segs = conv.contours.reduce((n, c) => n + c.contours.reduce((k, x) => k + x.segs.length, 0), 0);
      const parsed = conv.layers.reduce((n, l) => n + l.fills.reduce((k, f) => k + parsePath(f.d).filter((c) => c.c === 'L' || c.c === 'Q').length, 0), 0);
      expect(parsed, `shape ${s.id}`).toBe(segs);
    }
  });

  it('geometry lies within the tag bounds (edge bounds for DefineShape4)', () => {
    const eps = 0.05; // 1 twip
    const outside = (g: Rect, b: Rect) => g.xMin < b.xMin - eps || g.yMin < b.yMin - eps || g.xMax > b.xMax + eps || g.yMax > b.yMax + eps;
    const bad: string[] = [];
    for (const { raw: s, conv } of shapes) {
      const all = conv.contours.flatMap((c) => c.contours.flatMap((x) => x.segs));
      if (!all.length) continue;
      const g = segsBoundsPx(all);
      if (outside(g, s.bounds)) bad.push(`${s.id} bounds ${JSON.stringify(g)} vs ${JSON.stringify(s.bounds)}`);
      if (s.edgeBounds && outside(g, s.edgeBounds)) bad.push(`${s.id} edgeBounds ${JSON.stringify(g)} vs ${JSON.stringify(s.edgeBounds)}`);
    }
    expect(bad).toEqual([]);
  });
});
