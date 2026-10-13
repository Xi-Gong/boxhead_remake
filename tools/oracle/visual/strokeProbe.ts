/**
 * Probe V3: how does Flash Player rasterize thin STROKES (DefineShape line styles) at integer / fractional positions,
 * on the stage and through BitmapData.draw?                                          OWNER: lane V (visual)
 *
 *   node tools/oracle/visual/strokeProbe.ts [--player=8|28]
 *
 * 20x20 squares with a black stroke (no fill) of width w in {1, 2, 3, 0.05 (hairline), 1.5} placed at x = X + f,
 * y = Y + f (f = 0, 0.25, 0.5, 0.75). Rows 1-5: on the stage; rows 6-10: the same shapes drawn into a white
 * BitmapData with BitmapData.draw(clip, matrix) and shown with attachBitmap. Prints the darkness profile across the
 * top edge (rows Y-3..Y+3 at the square's horizontal centre) for every case; generated/visual/stroke_probe_fp<v>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { captureProjector, killProjector, launchProjector, projectorExe } from './projector.ts';
import { GENERATED, isMain } from '../../paths.ts';
import { TAG } from '../../swf/SwfFile.ts';
import { compileAS } from '../as1c.ts';
import { defineRectShape, encodeTag, placeObject2, wrapSwf } from '../swfWrite.ts';

const OUT = resolve(GENERATED, 'visual');
export const WIDTHS = [1, 2, 3, 0.05, 1.5];
export const FRACS = [0, 0.25, 0.5, 0.75];

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export interface StrokeCase { w: number; f: number; viaDraw: boolean; x: number; y: number; kind?: 'api' | 'scaled'; scale?: number }

export function strokeCases(): StrokeCase[] {
  const out: StrokeCase[] = [];
  for (const viaDraw of [false, true]) {
    WIDTHS.forEach((w, wi) => FRACS.forEach((f, fi) => {
      out.push({ w, f, viaDraw, x: 20 + fi * 40 + (viaDraw ? 320 : 0) + f, y: 20 + wi * 40 + f });
    }));
  }
  // extra stage rows: drawing-API lineStyle(w) squares, and DefineShape strokes under a scaled placement
  const extra: { kind: 'api' | 'scaled'; w: number; scale: number }[] = [
    { kind: 'api', w: 1, scale: 1 }, { kind: 'api', w: 2, scale: 1 }, { kind: 'api', w: 0, scale: 1 },
    { kind: 'scaled', w: 1, scale: 2 }, { kind: 'scaled', w: 2, scale: 0.5 }, { kind: 'scaled', w: 1, scale: 0.77 },
  ];
  extra.forEach((e, ei) => FRACS.forEach((f, fi) => {
    out.push({ w: e.w, f, viaDraw: false, kind: e.kind, scale: e.scale, x: 20 + fi * 50 + (ei >= 3 ? 320 : 0) + f, y: 240 + (ei % 3) * 60 + f });
  }));
  return out;
}

export function buildStrokeSwf(cases: StrokeCase[]): Uint8Array {
  const tags: Uint8Array[] = [encodeTag(TAG.FileAttributes, Uint8Array.of(0, 0, 0, 0)), encodeTag(TAG.SetBackgroundColor, Uint8Array.of(255, 255, 255))];
  WIDTHS.forEach((w, i) => tags.push(defineRectShape({ id: 1 + i, x: 0, y: 0, w: 20, h: 20, fill: null, lineWidth: w, lineColor: 0 })));
  // sprites wrapping each shape (for BitmapData.draw sources), exported for attachMovie
  WIDTHS.forEach((_w, i) => {
    const id = 11 + i;
    tags.push(encodeTag(TAG.DefineSprite, concat([Uint8Array.of(id & 255, id >> 8, 1, 0), placeObject2({ depth: 1, charId: 1 + i, matrix: {} }), encodeTag(TAG.ShowFrame, new Uint8Array(0)), encodeTag(TAG.End, new Uint8Array(0))]), true));
  });
  const exp = [WIDTHS.length & 255, WIDTHS.length >> 8];
  const names: number[] = [];
  WIDTHS.forEach((_w, i) => { const id = 11 + i; names.push(id & 255, id >> 8, ...Buffer.from(`S${i}`), 0); });
  tags.push(encodeTag(TAG.ExportAssets, Uint8Array.from([...exp, ...names])));
  let depth = 1;
  const drawCalls: string[] = [];
  const api: string[] = [];
  for (const c of cases) {
    const wi = WIDTHS.indexOf(c.w);
    if (c.kind === 'api') {
      const n = api.length;
      api.push(`var a${n} = _root.createEmptyMovieClip("api${n}", ${7000 + n}); a${n}.lineStyle(${c.w}, 0, 100); a${n}.moveTo(${c.x}, ${c.y}); a${n}.lineTo(${c.x + 20}, ${c.y}); a${n}.lineTo(${c.x + 20}, ${c.y + 20}); a${n}.lineTo(${c.x}, ${c.y + 20}); a${n}.lineTo(${c.x}, ${c.y});`);
      continue;
    }
    if (c.kind === 'scaled') { tags.push(placeObject2({ depth: depth++, charId: 1 + wi, matrix: { a: c.scale, d: c.scale, tx: c.x, ty: c.y } })); continue; }
    if (!c.viaDraw) tags.push(placeObject2({ depth: depth++, charId: 1 + wi, matrix: { tx: c.x, ty: c.y } }));
    else drawCalls.push(`bm.draw(_root.src${wi}, new flash.geom.Matrix(1, 0, 0, 1, ${c.x - 320}, ${c.y}));`);
  }
  const as = `
var bm = new flash.display.BitmapData(320, 220, false, 0xFFFFFF);
${WIDTHS.map((_w, i) => `_root.attachMovie("S${i}", "src${i}", ${5000 + i}); _root.src${i}._visible = false;`).join('\n')}
${drawCalls.join('\n')}
var h = _root.createEmptyMovieClip("holder", 6000); h._x = 320; h.attachBitmap(bm, 1);
${api.join('\n')}
`;
  tags.push(encodeTag(TAG.DoAction, compileAS(as), true));
  tags.push(encodeTag(TAG.ShowFrame, new Uint8Array(0)), encodeTag(TAG.End, new Uint8Array(0)));
  return wrapSwf(concat(tags), 1, { width: 640, height: 480, frameRate: 12 });
}

/** Darkness (0..1) of rows y0-3..y0+3 at the square's horizontal centre (top edge) and columns across the left edge. */
export function profiles(img: { width: number; data: Uint8Array }, c: StrokeCase): { top: number[]; left: number[] } {
  const dk = (x: number, y: number): number => +((255 - img.data[(y * img.width + x) * 4]!) / 255).toFixed(3);
  const half = 10 * (c.kind === 'scaled' ? c.scale ?? 1 : 1);
  const cx = Math.floor(c.x + half), cy = Math.floor(c.y + half), y0 = Math.floor(c.y), x0 = Math.floor(c.x);
  const top: number[] = [], left: number[] = [];
  for (let y = y0 - 3; y <= y0 + 3; y++) top.push(dk(cx, y));
  for (let x = x0 - 3; x <= x0 + 3; x++) left.push(dk(x, cy));
  return { top, left };
}

async function main(): Promise<void> {
  const playerArg = process.argv.find((a) => a.startsWith('--player='))?.split('=')[1] ?? '28';
  const player = projectorExe(playerArg);
  mkdirSync(OUT, { recursive: true });
  const cases = strokeCases();
  const swf = join(OUT, 'stroke_probe.swf');
  writeFileSync(swf, buildStrokeSwf(cases));
  const child = { pid: launchProjector(player, swf).pid };
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const png = join(OUT, `stroke_probe_fp${playerArg}.png`);
    const out = captureProjector(child.pid, png);
    if (!out.startsWith('ok 640x480')) throw new Error(out);
    const img = PNG.sync.read(readFileSync(png));
    const res = cases.map((c) => ({ ...c, ...profiles(img, c) }));
    writeFileSync(join(OUT, `stroke_probe_fp${playerArg}.json`), JSON.stringify(res, null, 1));
    for (const r of res) console.log(`${r.kind ? `${r.kind}x${r.scale}` : r.viaDraw ? 'draw ' : 'stage'} w=${r.w} f=${r.f} y0=${Math.floor(r.y)} top[y0-3..y0+3]=${r.top.map((v) => v.toFixed(2)).join(' ')}  left=${r.left.map((v) => v.toFixed(2)).join(' ')}`);
  } finally {
    killProjector(child.pid);
  }
}

if (isMain(import.meta.url)) await main();
