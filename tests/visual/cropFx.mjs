/**
 * Zoomed side-by-side crop of an EFFECT scene region (lane X2): reference | remake | |difference| x4.
 *
 *   node tests/visual/cropFx.mjs <scene> <x> <y> <w> <h> [zoom=4] [--dump]
 * Output: tests/visual/fx/crop-<scene>.png. --dump prints the pixel rows (hex RGB) of both images.
 */
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [scene, xs, ys, ws, hs, ss] = args;
const x0 = +xs, y0 = +ys, w = +ws, h = +hs, s = +(ss ?? 4);
const R = fileURLToPath(new URL('./fx/', import.meta.url));
const ref = PNG.sync.read(readFileSync(R + 'reference/' + scene + '.png'));
const rem = PNG.sync.read(readFileSync(R + 'remake/' + scene + '.png'));
const o = new PNG({ width: w * s * 3 + 8, height: h * s });
o.data.fill(255);
const px = (im, x, y) => { const i = (y * im.width + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
for (let y = 0; y < h * s; y++) {
  for (let x = 0; x < w * s; x++) {
    const sx = x0 + Math.floor(x / s), sy = y0 + Math.floor(y / s);
    const a = px(ref, sx, sy), b = px(rem, sx, sy);
    const d = a.map((v, k) => Math.min(255, Math.abs(v - b[k]) * 4));
    [a, b, d].forEach((c, k) => {
      const di = (y * o.width + x + k * (w * s + 4)) * 4;
      o.data[di] = c[0]; o.data[di + 1] = c[1]; o.data[di + 2] = c[2]; o.data[di + 3] = 255;
    });
  }
}
writeFileSync(R + `crop-${scene}.png`, PNG.sync.write(o));
if (process.argv.includes('--dump')) {
  const hex = (c) => ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0');
  for (let y = y0; y < y0 + h; y++) {
    const r = [], m = [];
    for (let x = x0; x < x0 + w; x++) { r.push(hex(px(ref, x, y))); m.push(hex(px(rem, x, y))); }
    console.log(String(y).padStart(3), 'REF', r.join(' '));
    console.log(String(y).padStart(3), 'REM', m.join(' '));
  }
}
console.log('wrote', R + `crop-${scene}.png`);
