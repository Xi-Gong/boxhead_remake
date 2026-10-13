/**
 * Probe V2: where does Flash Player draw STATIC TEXT (DefineText), with and without CSMTextSettings ("anti-alias for
 * readability" = FlashType/Saffron renderer)?                                        OWNER: lane V (visual)
 *
 *   node tools/oracle/visual/textProbe.ts [--player=8|28] [--dense [--scale=s]] [textId ...]
 *
 * Injects into a COPY of the game SWF, before root frame 62's ShowFrame: a white full-stage rectangle (new DefineShape)
 * at depth 30000 and copies of the game's own static texts at depths above it, at fractional positions
 * x = X0 + f, y = Y0 + f (f = 0, 0.1, ... 0.9) and a few scales. The projector window is captured and, per instance,
 * the darkness-weighted ink centroid is compared with the THEORETICAL centroid (area centroid of the glyph outlines
 * of public/assets/library.json, placed exactly by the text matrix / record offsets / advances). Prints the offset
 * rendered - theoretical per instance; generated/visual/text_probe_<id>.json/png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { captureProjector, killProjector, launchProjector, projectorExe } from './projector.ts';
import { ROOT, GENERATED, SWF_PATH, isMain } from '../../paths.ts';
import { SwfFile, TAG } from '../../swf/SwfFile.ts';
import { defineRectShape, placeObject2, reserializeWithInjections } from '../swfWrite.ts';

const OUT = resolve(GENERATED, 'visual');

interface Glyph { d: string }
interface Rec { fontId: number; color: number[]; x: number; y: number; height: number; glyphs: { i: number; adv: number }[] }
interface TextDef { id: number; bounds: { xMin: number; yMin: number; xMax: number; yMax: number }; m: { a: number; b: number; c: number; d: number; tx: number; ty: number }; records: Rec[] }

function lib(): { text(id: number): TextDef; glyph(font: number, i: number): Glyph | undefined } {
  const j = JSON.parse(readFileSync(resolve(ROOT, 'public', 'assets', 'library.json'), 'utf8'));
  const chars = j.chars;
  const get = (id: number): any => (Array.isArray(chars) ? chars.find((c: any) => c.id === id) : chars[id]);
  return { text: (id) => get(id), glyph: (f, i) => get(f)?.glyphs?.[i] };
}

/** Area and area-centroid of an SVG path (M/L/Q/Z in font units; quads flattened). Signed areas: holes subtract. */
function pathMoments(d: string): { a: number; mx: number; my: number } {
  const tok = d.match(/[MLQZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, A = 0, MX = 0, MY = 0;
  const seg = (x1: number, y1: number): void => {
    const cr = x * y1 - x1 * y;
    A += cr; MX += (x + x1) * cr; MY += (y + y1) * cr;
    x = x1; y = y1;
  };
  let cmd = '';
  while (i < tok.length) {
    const t = tok[i]!;
    if (/[MLQZ]/.test(t)) { cmd = t; i++; if (cmd === 'Z') { seg(sx, sy); } continue; }
    if (cmd === 'M') { if (x !== sx || y !== sy) seg(sx, sy); x = sx = Number(tok[i]); y = sy = Number(tok[i + 1]); i += 2; }
    else if (cmd === 'L') { seg(Number(tok[i]), Number(tok[i + 1])); i += 2; }
    else if (cmd === 'Q') {
      const cx = Number(tok[i]), cy = Number(tok[i + 1]), ex = Number(tok[i + 2]), ey = Number(tok[i + 3]);
      const x0 = x, y0 = y;
      for (let k = 1; k <= 8; k++) { const t2 = k / 8, u = 1 - t2; seg(u * u * x0 + 2 * u * t2 * cx + t2 * t2 * ex, u * u * y0 + 2 * u * t2 * cy + t2 * t2 * ey); }
      i += 4;
    } else i++;
  }
  if (x !== sx || y !== sy) seg(sx, sy);
  return { a: A / 2, mx: MX / 6, my: MY / 6 };
}

/** Theoretical ink centroid of a text placed with matrix (s, s, tx, ty), in stage px. */
function theory(L: ReturnType<typeof lib>, t: TextDef, s: number, tx: number, ty: number): { x: number; y: number } {
  let A = 0, MX = 0, MY = 0;
  for (const r of t.records) {
    const k = r.height / 1024;
    let x = r.x;
    for (const g of r.glyphs) {
      const gl = L.glyph(r.fontId, g.i);
      if (gl?.d) {
        const m = pathMoments(gl.d);
        // glyph -> text space: (x + k*gx, y + k*gy); area scales by k^2
        const a = m.a * k * k;
        A += a;
        MX += a * (x + k * (m.a ? m.mx / m.a : 0));
        MY += a * (r.y + k * (m.a ? m.my / m.a : 0));
      }
      x += g.adv;
    }
  }
  const cx = MX / A, cy = MY / A;
  // text matrix then placement
  const X = t.m.a * cx + t.m.c * cy + t.m.tx, Y = t.m.b * cx + t.m.d * cy + t.m.ty;
  return { x: s * X + tx, y: s * Y + ty };
}

export interface Inst { textId: number; s: number; tx: number; ty: number; f: number; axis: 'x' | 'y' | 'xy'; cell: { x: number; y: number; w: number; h: number } }

function layout(t: TextDef, scales: number[], steps: number, axes: ('x' | 'y' | 'xy')[]): Inst[] {
  const out: Inst[] = [];
  let cx = 10, cy = 10, rowH = 0;
  for (const s of scales) {
    for (const axis of axes) {
      const w = (t.bounds.xMax - t.bounds.xMin) * s + 12, h = (t.bounds.yMax - t.bounds.yMin) * s + 12;
      for (let k = 0; k < steps; k++) {
        if (cx + w > 630) { cx = 10; cy += rowH + 4; rowH = 0; }
        const f = k / steps;
        const fx = axis === 'y' ? 0 : f, fy = axis === 'x' ? 0 : f;
        out.push({ textId: t.id, s, f, axis, tx: Math.round(cx + 6 - t.bounds.xMin * s) + fx, ty: Math.round(cy + 6 - t.bounds.yMin * s) + fy, cell: { x: Math.floor(cx), y: Math.floor(cy), w: Math.ceil(w), h: Math.ceil(h) } });
        cx += w + 4; rowH = Math.max(rowH, h);
      }
    }
  }
  if (cy + rowH > 478) throw new Error('probe layout overflows the stage: use fewer scales/steps');
  return out;
}

/** --grid=<f>: the text at scale 1 all over the stage, every position x = X + f, y = Y + f (X, Y integers). */
function gridLayout(t: TextDef, f: number): Inst[] {
  const out: Inst[] = [];
  const w = Math.ceil(t.bounds.xMax - t.bounds.xMin + 12), h = Math.ceil(t.bounds.yMax - t.bounds.yMin + 12);
  for (let cy = 4; cy + h < 476; cy += h + 3) {
    for (let cx = 4; cx + w < 636; cx += w + 3) {
      out.push({ textId: t.id, s: 1, f, axis: 'xy', tx: Math.round(cx + 6 - t.bounds.xMin) + f, ty: Math.round(cy + 6 - t.bounds.yMin) + f, cell: { x: cx, y: cy, w, h } });
    }
  }
  return out;
}

export function buildTextProbe(insts: Inst[]): Uint8Array {
  const swf = SwfFile.fromPath(SWF_PATH);
  const tags: Uint8Array[] = [defineRectShape({ id: 65000, x: 0, y: 0, w: 640, h: 480, fill: 0xffffff }), placeObject2({ depth: 30000, charId: 65000, matrix: {} })];
  insts.forEach((it, n) => tags.push(placeObject2({ depth: 30001 + n, charId: it.textId, matrix: { a: it.s, d: it.s, tx: it.tx, ty: it.ty } })));
  void TAG;
  return reserializeWithInjections(swf, [{ frame: 62, tags }], { compress: true });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const playerArg = args.find((a) => a.startsWith('--player='))?.split('=')[1] ?? '28';
  const player = projectorExe(playerArg);
  const ids = args.filter((a) => !a.startsWith('--')).map(Number);
  const L = lib();
  mkdirSync(OUT, { recursive: true });
  for (const id of ids.length ? ids : [522, 459, 497, 206, 259, 503]) {
    const t = L.text(id);
    const w = t.bounds.xMax - t.bounds.xMin;
    const scales = w > 200 ? [0.5, 0.71] : w > 60 ? [1, 0.71, 0.5] : [1, 2, 0.71, 0.5];
    const dense = args.includes('--dense');
    const gridF = args.find((a) => a.startsWith('--grid='))?.split('=')[1];
    const insts = gridF !== undefined ? gridLayout(t, Number(gridF))
      : dense ? layout(t, [Number(args.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 1)], 20, ['x', 'y']) : layout(t, scales, 10, ['xy']);
    const swfPath = join(OUT, `text_probe_${id}.swf`);
    writeFileSync(swfPath, buildTextProbe(insts));
    const child = { pid: launchProjector(player, swfPath).pid };
    try {
      await new Promise((r) => setTimeout(r, 6000));
      const png = join(OUT, `text_probe_${id}_fp${playerArg}.png`);
      const out = captureProjector(child.pid, png);
      if (!out.startsWith('ok 640x480')) throw new Error(out);
      const img = PNG.sync.read(readFileSync(png));
      const res = insts.map((it) => {
        let sx = 0, sy = 0, s = 0;
        for (let y = it.cell.y; y < it.cell.y + it.cell.h; y++) for (let x = it.cell.x; x < it.cell.x + it.cell.w; x++) {
          const i = (y * 640 + x) * 4;
          const dk = (255 - (img.data[i]! + img.data[i + 1]! + img.data[i + 2]!) / 3) / 255;
          sx += dk * (x + 0.5); sy += dk * (y + 0.5); s += dk;
        }
        const th = theory(L, t, it.s, it.tx, it.ty);
        return { ...it, inkX: sx / s, inkY: sy / s, thX: th.x, thY: th.y, dx: sx / s - th.x, dy: sy / s - th.y, ink: s };
      });
      writeFileSync(join(OUT, `text_probe_${id}_fp${playerArg}.json`), JSON.stringify(res, null, 1));
      for (const r of res) console.log(`text ${id} s=${r.s} ${r.axis} f=${r.f.toFixed(2)} pos=${r.tx.toFixed(2)},${r.ty.toFixed(2)} ink-theory dx=${r.dx.toFixed(3)} dy=${r.dy.toFixed(3)} dx+fx=${(r.dx + (r.axis === 'y' ? 0 : r.f)).toFixed(3)} dy+fy=${(r.dy + (r.axis === 'x' ? 0 : r.f)).toFixed(3)} (ink ${r.ink.toFixed(0)})`);
    } finally {
      killProjector(child.pid);
    }
  }
}

if (isMain(import.meta.url)) await main();
