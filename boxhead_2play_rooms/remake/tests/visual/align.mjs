/**
 * Sub-pixel alignment of a stage region: original reference vs remake capture (lane V, visual fidelity).
 *
 *   node tests/visual/align.mjs <scene> <x> <y> <w> <h>
 *
 * Searches (dx, dy) in [-3, 3] px (0.05 px steps, bilinear sampling of the remake) minimising the mean absolute
 * luminance difference: "remake sampled at (x+dx, y+dy) ~ reference at (x, y)", i.e. dx < 0 means the remake draws
 * the content further LEFT than Flash. Used to find layout offsets (e.g. FlashType text, filtered objects).
 */
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const [scene, xs, ys, ws, hs] = process.argv.slice(2);
const x0 = +xs, y0 = +ys, w = +ws, h = +hs;
const R = fileURLToPath(new URL('./', import.meta.url));
const a = PNG.sync.read(readFileSync(R + 'reference/' + scene + '.png')), b = PNG.sync.read(readFileSync(R + 'out/remake/' + scene + '.png'));
const lum = (im, x, y) => { const i = (y * 640 + x) * 4; return 0.3 * im.data[i] + 0.59 * im.data[i + 1] + 0.11 * im.data[i + 2]; };
const samp = (im, x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  return (1 - fx) * (1 - fy) * lum(im, xi, yi) + fx * (1 - fy) * lum(im, xi + 1, yi) + (1 - fx) * fy * lum(im, xi, yi + 1) + fx * fy * lum(im, xi + 1, yi + 1); };
let best = [1e9, 0, 0];
for (let dy = -3; dy <= 3.0001; dy += 0.05) for (let dx = -3; dx <= 3.0001; dx += 0.05) {
  let s = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) s += Math.abs(lum(a, x, y) - samp(b, x + dx, y + dy));
  s /= w * h;
  if (s < best[0]) best = [s, dx, dy];
}
let s0 = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) s0 += Math.abs(lum(a, x, y) - lum(b, x, y));
console.log(`${scene} [${x0},${y0},${w},${h}] best dx=${best[1].toFixed(2)} dy=${best[2].toFixed(2)} mae=${best[0].toFixed(2)} (unshifted ${(s0 / (w * h)).toFixed(2)})`);
