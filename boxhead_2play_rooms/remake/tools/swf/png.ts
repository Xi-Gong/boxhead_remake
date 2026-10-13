/**
 * Minimal PNG encoder (8-bit RGBA or RGB, filter type chosen per row) using node:zlib deflate + crc32.
 */
import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)) >>> 0);
  return out;
}

/** Paeth predictor (PNG spec). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Encode `rgba` (w*h*4 bytes, straight alpha). If `alpha` is false the alpha channel is dropped (color type 2).
 * Each row uses the filter (None/Sub/Up/Paeth) with the smallest sum of absolute residuals.
 */
export function encodePng(w: number, h: number, rgba: Uint8Array, alpha = true): Uint8Array {
  const bpp = alpha ? 4 : 3;
  const stride = w * bpp;
  const raw = new Uint8Array(w * h * bpp);
  if (alpha) raw.set(rgba.subarray(0, w * h * 4));
  else for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) { raw[j] = rgba[i]; raw[j + 1] = rgba[i + 1]; raw[j + 2] = rgba[i + 2]; }

  const filtered = new Uint8Array(h * (stride + 1));
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  const types = [0, 1, 2, 4];
  for (let y = 0; y < h; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 4; f++) {
      const out = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= bpp ? prev[x - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : paeth(a, b, c);
        const v = (row[x] - pred) & 0xff;
        out[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    filtered[y * (stride + 1)] = types[best];
    filtered.set(cand[best], y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(filtered, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
