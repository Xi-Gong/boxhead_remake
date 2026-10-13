/**
 * Probe V1: where does Flash Player draw a FILTERED display object at a fractional position?   OWNER: lane V
 *
 *   node tools/oracle/visual/snapProbe.ts [--player=8|28] [--filter=cm|glow|ds]
 *
 * Builds a 640x480 SWF (white stage) with a 20x20 black square sprite placed many times: unfiltered and with an
 * identity ColorMatrix filter (changes no pixel, but forces the filter/bitmap-cache path), at fractional x/y offsets,
 * with the square at an integer or fractional offset inside the sprite, and under a 0.77x scale. The projector window
 * is captured background-safe (projector.ts) and the rendered left/top edge of every square is measured from its darkness centroid.
 * Prints expected (exact) vs rendered edges -> the snapping rule of the filter path. Output also in
 * generated/visual/snap_probe.json (+ snap_probe.png).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { captureProjector, killProjector, launchProjector, projectorExe } from './projector.ts';
import { GENERATED, isMain } from '../../paths.ts';
import { defineRectShape, encodeTag, placeObject2, placeObject3, wrapSwf, type FilterRecord } from '../swfWrite.ts';
import { TAG } from '../../swf/SwfFile.ts';

const OUT = resolve(GENERATED, 'visual');

export interface SnapCase { id: number; x: number; y: number; scale: number; inner: number; filtered: boolean }

/** Filters that change no pixel of the square: identity ColorMatrix, an invisible (alpha 0) glow / drop shadow. */
export const PROBE_FILTERS: Record<string, FilterRecord> = {
  cm: { t: 'colorMatrix', m: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] },
  glow: { t: 'glow', color: [255, 0, 0, 0], blurX: 4, blurY: 4, strength: 1, passes: 1 },
  ds: { t: 'dropShadow', color: [0, 0, 0, 0], blurX: 5, blurY: 5, angleRad: Math.PI / 4, distance: 5, strength: 0.18, passes: 1 },
};
const FRACS = [0, 0.05, 0.25, 0.45, 0.5, 0.55, 0.75, 0.95];

export function snapCases(): SnapCase[] {
  const out: SnapCase[] = [];
  let id = 0;
  // rows: (inner offset, scale) variants; columns: fraction; two rows per variant (unfiltered, filtered)
  const variants = [{ inner: 0, scale: 1 }, { inner: 5.3, scale: 1 }, { inner: 0, scale: 0.77 }, { inner: 5.3, scale: 0.77 }];
  variants.forEach((v, vi) => {
    for (const filtered of [false, true]) {
      FRACS.forEach((f, fi) => {
        out.push({ id: id++, x: 20 + fi * 76 + f, y: 20 + (vi * 2 + (filtered ? 1 : 0)) * 54 + f, scale: v.scale, inner: v.inner, filtered });
      });
    }
  });
  return out;
}

export function buildSnapSwf(cases: SnapCase[], filter: FilterRecord = PROBE_FILTERS.cm!): Uint8Array {
  const tags: Uint8Array[] = [];
  tags.push(encodeTag(TAG.FileAttributes, Uint8Array.of(0, 0, 0, 0)));
  tags.push(encodeTag(TAG.SetBackgroundColor, Uint8Array.of(255, 255, 255)));
  // shapes 1 (square at 0,0) and 2 (square at 5.3,5.3); sprites 11, 12 wrapping them
  tags.push(defineRectShape({ id: 1, x: 0, y: 0, w: 20, h: 20, fill: 0x000000 }));
  tags.push(defineRectShape({ id: 2, x: 5.3, y: 5.3, w: 20, h: 20, fill: 0x000000 }));
  const sprite = (id: number, shape: number): Uint8Array => {
    const body = [Uint8Array.of(id & 255, id >> 8, 1, 0), placeObject2({ depth: 1, charId: shape, matrix: {} }), encodeTag(TAG.ShowFrame, new Uint8Array(0)), encodeTag(TAG.End, new Uint8Array(0))];
    return encodeTag(TAG.DefineSprite, concat(body), true);
  };
  tags.push(sprite(11, 1), sprite(12, 2));
  for (const c of cases) {
    const m = { a: c.scale, d: c.scale, tx: c.x, ty: c.y };
    const charId = c.inner ? 12 : 11;
    tags.push(c.filtered ? placeObject3({ depth: c.id + 1, charId, matrix: m, filters: [filter] }) : placeObject2({ depth: c.id + 1, charId, matrix: m }));
  }
  tags.push(encodeTag(TAG.ShowFrame, new Uint8Array(0)), encodeTag(TAG.End, new Uint8Array(0)));
  return wrapSwf(concat(tags), 1, { width: 640, height: 480, frameRate: 12 });
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Measure the rendered left/top edge of the square of each case (darkness centroid minus half the size). */
export function measure(img: PNG, cases: SnapCase[]): (SnapCase & { expX: number; expY: number; gotX: number; gotY: number })[] {
  return cases.map((c) => {
    const size = 20 * c.scale;
    const expX = c.x + c.inner * c.scale, expY = c.y + c.inner * c.scale;
    const x0 = Math.floor(expX) - 3, x1 = Math.ceil(expX + size) + 3, y0 = Math.floor(expY) - 3, y1 = Math.ceil(expY + size) + 3;
    let sx = 0, sy = 0, s = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      const d = (255 - img.data[i]) / 255;
      sx += d * (x + 0.5); sy += d * (y + 0.5); s += d;
    }
    return { ...c, expX, expY, gotX: sx / s - size / 2, gotY: sy / s - size / 2 };
  });
}

async function main(): Promise<void> {
  const playerArg = process.argv.find((a) => a.startsWith('--player='))?.split('=')[1] ?? '28';
  const player = projectorExe(playerArg);
  mkdirSync(OUT, { recursive: true });
  const fname = process.argv.find((a) => a.startsWith('--filter='))?.split('=')[1] ?? 'cm';
  const filter = PROBE_FILTERS[fname];
  if (!filter) throw new Error(`--filter=${Object.keys(PROBE_FILTERS).join('|')}`);
  const cases = snapCases();
  const swf = join(OUT, 'snap_probe.swf');
  writeFileSync(swf, buildSnapSwf(cases, filter));
  const child = { pid: launchProjector(player, swf).pid };
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const png = join(OUT, `snap_probe_fp${playerArg}_${fname}.png`);
    const out = captureProjector(child.pid, png);
    if (!out.startsWith('ok 640x480')) throw new Error(out);
    const res = measure(PNG.sync.read(readFileSync(png)), cases);
    writeFileSync(join(OUT, `snap_probe_fp${playerArg}_${fname}.json`), JSON.stringify(res, null, 1));
    for (const r of res) {
      console.log(`${r.filtered ? 'F' : '-'} scale=${r.scale} inner=${r.inner} pos=${r.x.toFixed(2)},${r.y.toFixed(2)}  exact edge ${r.expX.toFixed(3)},${r.expY.toFixed(3)}  rendered ${r.gotX.toFixed(3)},${r.gotY.toFixed(3)}  d=${(r.gotX - r.expX).toFixed(3)},${(r.gotY - r.expY).toFixed(3)}`);
    }
  } finally {
    killProjector(child.pid);
  }
}

if (isMain(import.meta.url)) await main();
