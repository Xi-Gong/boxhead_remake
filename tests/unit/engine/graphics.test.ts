import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Graphics } from '../../../src/engine/flash/Graphics.ts';
import { ColorTransform, Matrix } from '../../../src/engine/flash/geom.ts';

// ---------------------------------------------------------------- recording Path2D / context mocks (Node has no canvas)
type Cmd = (string | number)[];
class FakePath2D {
  cmds: Cmd[] = [];
  device = false;
  moveTo(x: number, y: number): void { this.cmds.push(['M', x, y]); }
  lineTo(x: number, y: number): void { this.cmds.push(['L', x, y]); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void { this.cmds.push(['Q', cx, cy, x, y]); }
  closePath(): void { this.cmds.push(['Z']); }
  addPath(p: FakePath2D): void { this.cmds.push(...p.cmds); this.device = true; }
}

interface Op { op: 'fill' | 'stroke'; style: string; width?: number; device?: boolean; cmds: Cmd[]; rule?: string }

function fakeCtx(scale = 2): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const ctx = {
    fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: true,
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }),
    setTransform: () => {},
    fill(p: FakePath2D, rule?: string) { ops.push({ op: 'fill', style: String(this.fillStyle), cmds: p.cmds, rule }); },
    stroke(p: FakePath2D) { ops.push({ op: 'stroke', style: String(this.strokeStyle), width: this.lineWidth, device: p.device, cmds: p.cmds }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const g0 = globalThis as unknown as { Path2D?: unknown };
let savedPath2D: unknown;
beforeAll(() => { savedPath2D = g0.Path2D; g0.Path2D = FakePath2D; });
afterAll(() => { g0.Path2D = savedPath2D; });

describe('Graphics bounds (Flash shape bounds incl. half stroke width)', () => {
  it('empty drawing has no bounds; moveTo alone does not count', () => {
    const g = new Graphics();
    expect(g.bounds()).toBeNull();
    g.moveTo(10, 10);
    expect(g.bounds()).toBeNull();
    expect(g.isEmpty).toBe(false);
    g.clear();
    expect(g.isEmpty).toBe(true);
  });

  it('fill without line: geometry bounds', () => {
    const g = new Graphics();
    g.beginFill(0xff0000, 100);
    g.moveTo(10, 20); g.lineTo(50, 20); g.lineTo(50, 60); g.lineTo(10, 60);
    g.endFill();
    expect(g.bounds()!.toString()).toBe('(x=10, y=20, w=40, h=40)');
    expect(g.edgeBounds()!.toString()).toBe('(x=10, y=20, w=40, h=40)');
  });

  it('lines extend bounds by half their thickness; hairlines do not', () => {
    const g = new Graphics();
    g.lineStyle(4, 0, 100);
    g.moveTo(0, 0); g.lineTo(100, 0);
    expect(g.bounds()!.toString()).toBe('(x=-2, y=-2, w=104, h=4)');
    expect(g.edgeBounds()!.toString()).toBe('(x=0, y=0, w=100, h=0)');
    const h = new Graphics();
    h.lineStyle(0, 0, 100);
    h.moveTo(0, 0); h.lineTo(10, 5);
    expect(h.bounds()!.toString()).toBe('(x=0, y=0, w=10, h=5)');
  });

  it('curves use the exact extremum, not the control point', () => {
    const g = new Graphics();
    g.lineStyle(0);
    g.moveTo(0, 0); g.curveTo(50, 100, 100, 0);
    const b = g.bounds()!;
    expect(b.y).toBe(0);
    expect(b.height).toBe(50); // apex of the quadratic = half the control height
    expect(b.width).toBe(100);
  });

  it('thickness is clamped to 0..255; undefined thickness = no line', () => {
    const g = new Graphics();
    g.lineStyle(1000, 0);
    g.moveTo(0, 0); g.lineTo(10, 0);
    expect(g.bounds()!.y).toBe(-127.5);
    const n = new Graphics();
    n.lineStyle(undefined);
    n.moveTo(0, 0); n.lineTo(10, 0);
    expect(n.bounds()!.toString()).toBe('(x=0, y=0, w=10, h=0)');
  });
});

describe('Graphics paint order and Flash path semantics', () => {
  it('fills auto-close and paint before the lines drawn while they were open', () => {
    const g = new Graphics();
    g.lineStyle(2, 0x00ff00, 100);
    g.beginFill(0xff0000, 50);
    g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 10);
    g.endFill();
    const { ctx, ops } = fakeCtx(1);
    g.render(ctx, null, 1);
    expect(ops.map((o) => o.op)).toEqual(['fill', 'stroke']);
    expect(ops[0]!.style).toBe('rgba(255,0,0,0.4980392156862745)'); // alpha 50 -> trunc(127.5) = 127
    expect(ops[0]!.rule).toBe('evenodd');
    // the fill got a closing segment back to (0,0), and so did the outline
    expect(ops[0]!.cmds).toEqual([['M', 0, 0], ['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 0]]);
    expect(ops[1]!.cmds.slice(-1)).toEqual([['L', 0, 0]]);
    expect(ops[1]!.cmds).toContainEqual(['L', 0, 0]);
    expect(ops[1]!.width).toBe(2);
  });

  it('lines drawn without a fill paint in command order with later fills', () => {
    const g = new Graphics();
    g.lineStyle(3, 0x0000ff);
    g.moveTo(0, 0); g.lineTo(5, 5);
    g.beginFill(0x00ff00);
    g.lineStyle(undefined);
    g.moveTo(0, 0); g.lineTo(5, 0); g.lineTo(5, 5);
    g.endFill();
    const { ctx, ops } = fakeCtx(1);
    g.render(ctx, null, 1);
    expect(ops.map((o) => `${o.op}:${o.style}`)).toEqual(['stroke:rgb(0,0,255)', 'fill:rgb(0,255,0)']);
  });

  it('an open fill renders auto-closed before endFill()', () => {
    const g = new Graphics();
    g.beginFill(0x123456);
    g.moveTo(1, 1); g.lineTo(9, 1); g.lineTo(9, 9);
    const { ctx, ops } = fakeCtx(1);
    g.render(ctx, null, 1);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.style).toBe('rgb(18,52,86)');
  });

  it('hairlines are stroked in device space at 1px, snapped to pixel centres; thin scaled lines too', () => {
    // lane V (strokeProbe): Flash draws a hairline / sub-pixel / whole-width stroke on the pixel grid: device points
    // of a 1 px line move to floor(v) + 0.5 (src/engine/flash/strokeSnap.ts). Device-space path = built from points.
    const g = new Graphics();
    g.lineStyle(0, 0xff0000, 100);
    g.moveTo(0, 0); g.lineTo(10, 0);
    const { ctx, ops } = fakeCtx(2);
    g.render(ctx, null, 2);
    expect(ops[0]).toMatchObject({ op: 'stroke', width: 1 });
    expect(ops[0]!.cmds.slice(-2)).toEqual([['M', 0.5, 0.5], ['L', 20.5, 0.5]]);
    const t = new Graphics();
    t.lineStyle(0.25, 0);
    t.moveTo(0, 0); t.lineTo(10, 0);
    const r = fakeCtx(2);
    t.render(r.ctx, null, 2);
    expect(r.ops[0]).toMatchObject({ width: 1 });
    expect(r.ops[0]!.cmds.slice(-2)).toEqual([['M', 0.5, 0.5], ['L', 20.5, 0.5]]);
    // lineStyle(1) at device scale 2 = 2 device px (even): points round to pixel edges
    const e = new Graphics();
    e.lineStyle(1, 0);
    e.moveTo(0.3, 0.3); e.lineTo(10, 0.3);
    const q = fakeCtx(2);
    e.render(q.ctx, null, 2);
    expect(q.ops[0]).toMatchObject({ width: 2 });
    expect(q.ops[0]!.cmds.slice(-2)).toEqual([['M', 1, 1], ['L', 20, 1]]);
  });

  it('XSI DI pattern: invisible lines (alpha 0) and alpha 0 fills are skipped, colour transform applied', () => {
    const g = new Graphics();
    g.lineStyle(2, 0, 100); // PEdge
    g.moveTo(0, 0); g.lineTo(10, 0);
    g.beginFill(0, 0);
    g.lineStyle(0, 0, 0);
    g.endFill();
    g.beginFill(0x808080, 100);
    g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 10);
    g.endFill();
    g.beginFill(0xffffff, 25); // shade overlay
    g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 10);
    g.endFill();
    const { ctx, ops } = fakeCtx(2);
    g.render(ctx, new ColorTransform(1, 1, 1, 0.5), 2);
    expect(ops.map((o) => `${o.op}:${o.style}`)).toEqual([
      'stroke:rgba(0,0,0,0.4980392156862745)', 'fill:rgba(128,128,128,0.4980392156862745)', 'fill:rgba(255,255,255,0.12156862745098039)', // alpha 25 -> 63, x0.5 -> 31
    ]);
  });

  it('beginGradientFill validates its type; box matrices are converted', () => {
    const g = new Graphics();
    g.beginGradientFill('conic', [0], [100], [0], new Matrix());
    g.moveTo(0, 0); g.lineTo(1, 1);
    const { ctx, ops } = fakeCtx(1);
    g.render(ctx, null, 1);
    expect(ops).toHaveLength(0);
  });
});

describe('Graphics hitTest', () => {
  it('even-odd fills and stroke distance', () => {
    const g = new Graphics();
    g.beginFill(0);
    g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 10); g.lineTo(0, 10);
    g.moveTo(3, 3); g.lineTo(7, 3); g.lineTo(7, 7); g.lineTo(3, 7);
    g.endFill();
    expect(g.hitTest(1, 1)).toBe(true);
    expect(g.hitTest(5, 5)).toBe(false); // hole (even-odd)
    expect(g.hitTest(11, 5)).toBe(false);
    const l = new Graphics();
    l.lineStyle(4, 0);
    l.moveTo(0, 0); l.lineTo(10, 0);
    expect(l.hitTest(5, 1.9)).toBe(true);
    expect(l.hitTest(5, 2.1)).toBe(false);
  });
});
