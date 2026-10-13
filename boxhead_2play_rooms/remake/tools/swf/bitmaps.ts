/**
 * Bitmaps: DefineBits (+ JPEGTables), DefineBitsJPEG2/3, DefineBitsLossless / DefineBitsLossless2.
 *
 * - JPEG data is normalized by walking its marker segments: the JPEGTables stream and the image stream are merged
 *   into a single SOI ... EOI file, dropping the erroneous EOI/SOI (FFD9 FFD8) pairs SWF encoders leave between and
 *   in front of the streams. Dimensions are read from the SOFn marker.
 * - Lossless: format 3 (colormapped, rows padded to 4 bytes), 4 (PIX15, rows padded to 4 bytes, Lossless v1 only),
 *   5 (32-bit). Lossless2 pixels and colormap entries are PREMULTIPLIED ARGB; they are un-premultiplied for PNG.
 */
import { inflateSync } from 'node:zlib';
import type { ByteReader } from './ByteReader.ts';
import { encodePng } from './png.ts';

export interface DecodedBitmap {
  id: number;
  w: number;
  h: number;
  format: 'png' | 'jpg';
  alpha: boolean;
  /** Encoded file bytes. */
  file: Uint8Array;
  /** Source tag name + details for the inventory report. */
  source: string;
  notes: string[];
}

// ---------------------------------------------------------------- JPEG

const isStandalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd7); // TEM, RSTn

/**
 * Merge/normalize JPEG streams into one well-formed JFIF/JPEG file: single SOI, APPn segments (JFIF header) hoisted
 * directly after SOI, then all other segments in stream order (tables before frame/scan data), single trailing EOI.
 * `removed` counts the dropped EOI/SOI markers.
 */
export function normalizeJpeg(data: Uint8Array): { bytes: Uint8Array; removed: number } {
  const app: Uint8Array[] = [];
  const rest: Uint8Array[] = [];
  let i = 0, markers = 0;
  const n = data.length;
  while (i < n) {
    if (data[i] !== 0xff) throw new Error(`JPEG: expected marker at ${i}`);
    const m = data[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (m === 0xd8 || m === 0xd9) { markers++; i += 2; continue; } // SOI / EOI: re-emitted once below
    if (isStandalone(m)) { rest.push(data.subarray(i, i + 2)); i += 2; continue; }
    const len = (data[i + 2] << 8) | data[i + 3];
    let end = i + 2 + len;
    if (m === 0xda) { // SOS: include entropy-coded data up to the next real marker
      while (end < n && !(data[end] === 0xff && data[end + 1] !== 0x00 && !(data[end + 1] >= 0xd0 && data[end + 1] <= 0xd7))) end++;
    }
    (m >= 0xe0 && m <= 0xef ? app : rest).push(data.subarray(i, end));
    i = end;
  }
  const parts = [Uint8Array.of(0xff, 0xd8), ...app, ...rest, Uint8Array.of(0xff, 0xd9)];
  const bytes = new Uint8Array(parts.reduce((k, p) => k + p.length, 0));
  let o = 0;
  for (const p of parts) { bytes.set(p, o); o += p.length; }
  return { bytes, removed: markers - 2 };
}

/** Width/height from the first SOFn marker. */
export function jpegSize(data: Uint8Array): { w: number; h: number } {
  let i = 2;
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff) { i++; continue; }
    const m = data[i + 1];
    if (m === 0xd8 || m === 0xd9 || isStandalone(m) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = (data[i + 2] << 8) | data[i + 3];
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (data[i + 5] << 8) | data[i + 6], w: (data[i + 7] << 8) | data[i + 8] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG: no SOF marker');
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
const GIF_SIG = [0x47, 0x49, 0x46, 0x38];
const startsWith = (d: Uint8Array, sig: number[]) => sig.every((b, k) => d[k] === b);

/** DefineBits (6) with the global JPEGTables. */
export function parseDefineBits(r: ByteReader, jpegTables: Uint8Array | null): DecodedBitmap {
  const id = r.u16();
  const img = r.bytes(r.remaining);
  const joined = new Uint8Array((jpegTables?.length ?? 0) + img.length);
  if (jpegTables) joined.set(jpegTables, 0);
  joined.set(img, jpegTables?.length ?? 0);
  const { bytes, removed } = normalizeJpeg(joined);
  const { w, h } = jpegSize(bytes);
  return { id, w, h, format: 'jpg', alpha: false, file: bytes, source: 'DefineBits', notes: [`removed ${removed} EOI/SOI markers`] };
}

/** DefineBitsJPEG2 (21) / DefineBitsJPEG3 (35). JPEG3 alpha would need a JPEG decoder: reported, alpha dropped. */
export function parseDefineBitsJpeg23(r: ByteReader, code: number): DecodedBitmap {
  const id = r.u16();
  const v3 = code === 35;
  const alphaOffset = v3 ? r.u32() : 0;
  const img = r.bytes(v3 ? alphaOffset : r.remaining);
  const notes: string[] = [];
  if (startsWith(img, PNG_SIG) || startsWith(img, GIF_SIG)) {
    throw new Error(`DefineBitsJPEG${v3 ? 3 : 2} ${id}: embedded PNG/GIF data is not supported`);
  }
  const { bytes, removed } = normalizeJpeg(img);
  notes.push(`removed ${removed} EOI/SOI markers`);
  if (v3) notes.push('JPEG3 alpha channel NOT applied (no JPEG decoder)');
  const { w, h } = jpegSize(bytes);
  return { id, w, h, format: 'jpg', alpha: false, file: bytes, source: v3 ? 'DefineBitsJPEG3' : 'DefineBitsJPEG2', notes };
}

// ---------------------------------------------------------------- lossless

const unpremul = (c: number, a: number) => (a === 0 ? 0 : a === 255 ? c : Math.min(255, Math.round((c * 255) / a)));

/** DefineBitsLossless (20) / DefineBitsLossless2 (36) -> PNG. */
export function parseDefineBitsLossless(r: ByteReader, code: number): DecodedBitmap {
  const v2 = code === 36;
  const id = r.u16();
  const format = r.u8();
  const w = r.u16(), h = r.u16();
  const tableSize = format === 3 ? r.u8() + 1 : 0;
  const data = new Uint8Array(inflateSync(r.bytes(r.remaining)));
  const rgba = new Uint8Array(w * h * 4);
  const notes: string[] = [];
  let notPremultiplied = 0;

  if (format === 3) {
    const entry = v2 ? 4 : 3;
    const table = new Uint8Array(tableSize * 4);
    for (let i = 0; i < tableSize; i++) {
      const o = i * entry;
      const red = data[o], g = data[o + 1], b = data[o + 2], a = v2 ? data[o + 3] : 255;
      if (v2 && (red > a || g > a || b > a)) notPremultiplied++;
      table[i * 4] = v2 ? unpremul(red, a) : red;
      table[i * 4 + 1] = v2 ? unpremul(g, a) : g;
      table[i * 4 + 2] = v2 ? unpremul(b, a) : b;
      table[i * 4 + 3] = a;
    }
    const base = tableSize * entry;
    const stride = (w + 3) & ~3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = data[base + y * stride + x];
        const o = (y * w + x) * 4;
        if (idx < tableSize) rgba.set(table.subarray(idx * 4, idx * 4 + 4), o);
        // out-of-range index -> transparent black (left zeroed)
      }
    }
    notes.push(`colormapped, ${tableSize} colors`);
  } else if (format === 4) {
    if (v2) throw new Error(`DefineBitsLossless2 ${id}: format 4 is not valid`);
    const stride = (w * 2 + 3) & ~3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * stride + x * 2;
        const v = (data[p] << 8) | data[p + 1];
        const c5 = (s: number) => { const c = (v >> s) & 31; return (c << 3) | (c >> 2); };
        const o = (y * w + x) * 4;
        rgba[o] = c5(10); rgba[o + 1] = c5(5); rgba[o + 2] = c5(0); rgba[o + 3] = 255;
      }
    }
    notes.push('PIX15');
  } else if (format === 5) {
    for (let i = 0; i < w * h; i++) {
      const a = v2 ? data[i * 4] : 255;
      const red = data[i * 4 + 1], g = data[i * 4 + 2], b = data[i * 4 + 3];
      if (v2 && (red > a || g > a || b > a)) notPremultiplied++;
      rgba[i * 4] = v2 ? unpremul(red, a) : red;
      rgba[i * 4 + 1] = v2 ? unpremul(g, a) : g;
      rgba[i * 4 + 2] = v2 ? unpremul(b, a) : b;
      rgba[i * 4 + 3] = a;
    }
    notes.push(v2 ? 'ARGB32 premultiplied' : 'XRGB32');
  } else {
    throw new Error(`DefineBitsLossless${v2 ? 2 : ''} ${id}: unknown format ${format}`);
  }
  if (notPremultiplied) notes.push(`WARNING: ${notPremultiplied} entries have color > alpha (not premultiplied?)`);
  return {
    id, w, h, format: 'png', alpha: v2, file: encodePng(w, h, rgba, v2),
    source: `DefineBitsLossless${v2 ? '2' : ''} format ${format}`, notes,
  };
}
