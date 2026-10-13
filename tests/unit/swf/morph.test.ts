import { describe, expect, it } from 'vitest';
import type { MorphLayer } from '../../../src/shared/assetSchema.ts';
import type { EdgeRecord, RawShape } from '../../../tools/swf/shapes.ts';
import { convertShape } from '../../../tools/swf/shapeConvert.ts';
import type { RawMorph } from '../../../tools/swf/morph.ts';
import { getBuild, parsePath } from './helpers.ts';

type Cmd = { c: string; n: number[] };

/** Morph cmd string + flat coordinates -> command list. */
function morphCmds(cmd: string, xs: number[]): Cmd[] {
  const out: Cmd[] = [];
  let k = 0;
  for (const c of cmd) {
    const n = c === 'Q' ? 4 : c === 'Z' ? 0 : 2;
    out.push({ c, n: xs.slice(k, k + n) });
    k += n;
  }
  return out;
}

/** Directed segment keys from a command list; a quad whose control is the exact midpoint counts as a line. */
function segKeys(cmds: Cmd[]): string[] {
  const keys: string[] = [];
  let x = 0, y = 0;
  const r = (v: number) => Math.round(v * 20); // back to twips (exact)
  const h = (v: number) => Math.round(v * 40); // half twips (converted straight edges have midpoint controls)
  for (const { c, n } of cmds) {
    if (c === 'M') { [x, y] = n; continue; }
    if (c === 'Z') continue;
    const [ex, ey] = c === 'L' ? n : [n[2], n[3]];
    if (c === 'Q' && !(h(n[0]) === r(x) + r(ex) && h(n[1]) === r(y) + r(ey))) keys.push(`Q${r(x)},${r(y)},${r(n[0])},${r(n[1])},${r(ex)},${r(ey)}`);
    else keys.push(`L${r(x)},${r(y)},${r(ex)},${r(ey)}`);
    [x, y] = [ex, ey];
  }
  return keys.sort();
}

function edgeKey(e: EdgeRecord, reversed: boolean): string {
  const curve = e.cx !== undefined && !(e.cx * 2 === e.x0 + e.x1 && e.cy! * 2 === e.y0 + e.y1);
  const [x0, y0, x1, y1] = reversed ? [e.x1, e.y1, e.x0, e.y0] : [e.x0, e.y0, e.x1, e.y1];
  return curve ? `Q${x0},${y0},${e.cx},${e.cy},${x1},${y1}` : `L${x0},${y0},${x1},${y1}`;
}

describe('DefineMorphShape', () => {
  const morphs: RawMorph[] = [...getBuild().raw.morphs.values()];

  it('has 32 morphs, all paired edge-for-edge and closed', () => {
    expect(morphs).toHaveLength(32);
    for (const m of morphs) {
      expect(m.stats.startEdges, `morph ${m.id}`).toBe(m.stats.endEdges);
      expect(m.stats.unclosed, `morph ${m.id}`).toBe(0);
      for (const layer of m.def.layers) for (const f of layer.fills) {
        expect(f.a.length).toBe(f.b.length);
        // every contour closes in BOTH geometries
        for (const geom of [f.a, f.b]) {
          const cmds = morphCmds(f.cmd, geom);
          let start: number[] = [], cur: number[] = [];
          for (const { c, n } of cmds) {
            if (c === 'M') { start = n; cur = n; } else if (c === 'L') cur = n; else if (c === 'Q') cur = n.slice(2);
            else expect(cur, `morph ${m.id} contour closes`).toEqual(start);
          }
        }
      }
    }
  });

  it('ratio 0 (start geometry) equals the static conversion of the start edges', () => {
    for (const m of morphs) {
      const raw: RawShape = {
        id: m.id, ver: 3, bounds: m.def.startBounds,
        styles: { fills: m.styles.fills.map((p) => p[0]), lines: m.styles.lines.map((p) => p[0]) },
        records: m.startRecords,
      };
      const conv = convertShape(raw);
      const layer: MorphLayer = m.def.layers[0];
      expect(conv.layers[0].fills.map((f) => f.s)).toEqual(layer.fills.map((f) => f.s));
      layer.fills.forEach((f, i) => {
        const statik = parsePath(conv.layers[0].fills[i].d);
        const morph = morphCmds(f.cmd, f.a);
        expect(morph.length).toBe(statik.length);
        let px = 0, py = 0;
        morph.forEach((mc, k) => {
          const sc = statik[k];
          if (mc.c === 'Q' && sc.c === 'L') { // straight start edge converted to a quad: control at the midpoint
            expect(mc.n[0]).toBeCloseTo((px + sc.n[0]) / 2, 9);
            expect(mc.n[1]).toBeCloseTo((py + sc.n[1]) / 2, 9);
            expect(mc.n.slice(2)).toEqual(sc.n);
          } else {
            expect(mc.c).toBe(sc.c);
            expect(mc.n).toEqual(sc.n);
          }
          if (mc.c !== 'Z') [px, py] = mc.n.slice(-2);
        });
      });
    }
  });

  it('ratio 65535 (end geometry) is exactly the end edges, directed by the start fill sides', () => {
    for (const m of morphs) {
      const ends = m.endRecords.filter((r): r is EdgeRecord => r.t === 'edge');
      const expected = new Map<number, string[]>();
      let f0 = 0, f1 = 0, k = 0;
      for (const r of m.startRecords) {
        if (r.t === 'style') { if (r.fill0 !== undefined) f0 = r.fill0; if (r.fill1 !== undefined) f1 = r.fill1; continue; }
        const e = ends[k++];
        if (f1) (expected.get(f1 - 1) ?? expected.set(f1 - 1, []).get(f1 - 1)!).push(edgeKey(e, false));
        if (f0) (expected.get(f0 - 1) ?? expected.set(f0 - 1, []).get(f0 - 1)!).push(edgeKey(e, true));
      }
      for (const f of m.def.layers[0].fills) {
        expect(segKeys(morphCmds(f.cmd, f.b)), `morph ${m.id} fill ${f.s}`).toEqual(expected.get(f.s)!.sort());
      }
    }
  });

  it('interpolating at ratio t is a plain lerp of a/b (shared command stream)', () => {
    const m = morphs.find((x) => x.id === 569)!; // muzzle/flame style morph (circle -> elongated)
    const f = m.def.layers[0].fills[0];
    expect(f.cmd).toBe('MQQQQQQQQZ');
    const t = 0.5;
    const mid = f.a.map((v, i) => v + (f.b[i] - v) * t);
    expect(mid.slice(0, 2)).toEqual([-2.85, -2.8]);
  });
});
