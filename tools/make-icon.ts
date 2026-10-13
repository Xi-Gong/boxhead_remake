/**
 * Builds the app icon from the game's own art (Bambo portrait, SWF bitmap 517, extracted by tools/extract.ts):
 * crop to the character, box-downscale to 256x256 RGBA and write build/icon.png (electron-builder converts it to .ico).
 *
 *   node tools/make-icon.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pngjs from 'pngjs';
import { ASSETS_OUT, ROOT, isMain } from './paths.ts';

const { PNG } = pngjs;

export function makeIcon(srcPath = join(ASSETS_OUT, 'bitmaps', '517.png'), outPath = resolve(ROOT, 'build', 'icon.png'), size = 256): void {
  const src = PNG.sync.read(readFileSync(srcPath));
  // Square crop around the character (400x400 portrait; figure spans roughly x 70..330, y 20..360).
  const crop = { x: 30, y: 10, s: 360 };
  const out = new PNG({ width: size, height: size });
  const k = crop.s / size;
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      // area-average of the source pixels covered by this output pixel (premultiplied to avoid dark fringes)
      const x0 = crop.x + ox * k, x1 = x0 + k, y0 = crop.y + oy * k, y1 = y0 + k;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const w = wx * wy;
          if (w <= 0 || sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) { wsum += Math.max(w, 0); continue; }
          const i = (sy * src.width + sx) * 4;
          const pa = src.data[i + 3]! / 255;
          r += src.data[i]! * pa * w; g += src.data[i + 1]! * pa * w; b += src.data[i + 2]! * pa * w; a += pa * w;
          wsum += w;
        }
      }
      const o = (oy * size + ox) * 4;
      const A = wsum > 0 ? a / wsum : 0;
      out.data[o] = A > 0 ? Math.round(r / a) : 0;
      out.data[o + 1] = A > 0 ? Math.round(g / a) : 0;
      out.data[o + 2] = A > 0 ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(A * 255);
    }
  }
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, PNG.sync.write(out));
}

if (isMain(import.meta.url)) {
  makeIcon();
  console.log('make-icon: build/icon.png (256x256)');
}
