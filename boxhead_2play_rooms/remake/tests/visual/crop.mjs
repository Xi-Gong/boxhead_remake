/**
 * Zoomed side-by-side crop of a stage region (lane V): reference | remake.
 *
 *   node tests/visual/crop.mjs <scene> <x> <y> <w> <h> [zoom=4] [out=tests/visual/out/crop.png] [--dump]
 */
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
const [scene, xs, ys, ws, hs, ss, out] = process.argv.slice(2);
const x0 = +xs, y0 = +ys, w = +ws, h = +hs, s = +(ss ?? 4);
const R = fileURLToPath(new URL('./', import.meta.url));
const imgs = [PNG.sync.read(readFileSync(R + 'reference/' + scene + '.png')), PNG.sync.read(readFileSync(R + 'out/remake/' + scene + '.png'))];
const o = new PNG({ width: (w * s) * 2 + 4, height: h * s });
o.data.fill(255);
imgs.forEach((im, k) => {
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const sx = x0 + Math.floor(x / s), sy = y0 + Math.floor(y / s);
    const si = (sy * im.width + sx) * 4, di = (y * o.width + x + k * (w * s + 4)) * 4;
    o.data[di] = im.data[si]; o.data[di + 1] = im.data[si + 1]; o.data[di + 2] = im.data[si + 2]; o.data[di + 3] = 255;
  }
});
writeFileSync(out ?? (R + 'out/crop.png'), PNG.sync.write(o));
// also dump pixel rows if small
if (process.argv.includes('--dump')) {
  for (let y = y0; y < y0 + h; y++) {
    const row = imgs.map(im => { let r = []; for (let x = x0; x < x0 + w; x++) { const i = (y * im.width + x) * 4; r.push(((im.data[i] << 16) | (im.data[i+1] << 8) | im.data[i+2]).toString(16).padStart(6, '0')); } return r.join(' '); });
    console.log(y, 'REF', row[0]); console.log(y, 'REM', row[1]);
  }
}
