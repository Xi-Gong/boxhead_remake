import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import type { BitmapDef, SoundDef } from '../../../src/shared/assetSchema.ts';
import { ASSETS_OUT, AUDIO_REF_DIR, FLA_PATH, ROOT, SWF_PATH } from '../../../tools/paths.ts';
import { TAG } from '../../../tools/swf/SwfFile.ts';
import { encodePng } from '../../../tools/swf/png.ts';
import { normalizeJpeg } from '../../../tools/swf/bitmaps.ts';
import { getBuild, getFla, getSwf, xmlElements } from './helpers.ts';

// v0.2.0: assets/projects (the ffdec FLA export) and assets/ClassicResources were deleted from the repo - the
// cross-check tests below degrade to skips; the SWF stays and everything else keeps running. Regeneration:
// assets/README.md ("Regenerating the deleted reference material").
const haveFla = existsSync(FLA_PATH);
const haveAudioRef = existsSync(AUDIO_REF_DIR);

const { lib, files } = getBuild();
const fileBytes = (path: string) => files.find((f) => f.path === path)!.bytes;
const doc = haveFla ? getFla().text('DOMDocument.xml') : '';
const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('DefineSound -> mp3', () => {
  const sounds = Object.values(lib.chars).filter((c): c is SoundDef => c.t === 'sound');
  const flaSounds = xmlElements(doc, 'DOMSoundItem');

  it.skipIf(!haveFla)('31 sounds; sampleCount / rate / channels equal the FLA DOMSoundItems', () => {
    expect(sounds).toHaveLength(31);
    expect(flaSounds).toHaveLength(31);
    for (const item of flaSounds) {
      const id = Number(/^sound(\d+)\.mp3$/.exec(item.name)![1]);
      const s = lib.chars[id] as SoundDef;
      expect(s?.t, item.name).toBe('sound');
      expect(s.format).toBe('mp3');
      expect(s.sampleCount, item.name).toBe(Number(item.sampleCount));
      const [, khz, , ch] = /^(\d+)kHz (\d+)bit (Mono|Stereo)$/.exec(item.format)!;
      expect(Math.round(s.rate / 1000), item.name).toBe(Number(khz) === 5 ? 6 : Number(khz) === 11 ? 11 : Number(khz));
      expect(s.stereo, item.name).toBe(ch === 'Stereo');
      if (item.linkageIdentifier) expect(lib.exports[item.linkageIdentifier]).toBe(id);
    }
  });

  it.skipIf(!haveFla || !haveAudioRef)('MP3 payloads are byte-identical to the FLA library and ClassicResources/Audios/boxhead4', () => {
    const ref = existsSync(AUDIO_REF_DIR) ? readdirSync(AUDIO_REF_DIR) : [];
    expect(ref.length).toBe(31);
    for (const s of sounds) {
      const mine = fileBytes(s.file);
      expect(bytesEqual(mine, getFla().read(`LIBRARY/sound${s.id}.mp3`)), `fla sound${s.id}`).toBe(true);
      const name = ref.find((f) => f === `${s.id}.mp3` || f.startsWith(`${s.id}_`));
      expect(name, `reference for ${s.id}`).toBeDefined();
      expect(bytesEqual(mine, new Uint8Array(readFileSync(join(AUDIO_REF_DIR, name!)))), name).toBe(true);
      expect([mine[0], mine[1] & 0xe0]).toEqual([0xff, 0xe0]); // starts with an MPEG frame sync (no SeekSamples)
    }
  });

  it('committed MP3s start with an MPEG frame sync (no SeekSamples) - always on', () => {
    // The FLA/ClassicResources references above are gone from the repo; this check guards the committed assets
    // themselves (v0.2.0: public/assets ships in git).
    expect(sounds).toHaveLength(31);
    for (const s of sounds) {
      const mine = readFileSync(join(ASSETS_OUT, s.file));
      expect([mine[0], mine[1]! & 0xe0], s.file).toEqual([0xff, 0xe0]);
    }
  });
});

describe('committed extracted assets = fresh extraction (v0.2.0: public/assets ships in the repo)', () => {
  it.skipIf(!existsSync(SWF_PATH))('every committed file is byte-identical to a fresh extraction (incl. manifest)', () => {
    const out = mkdtempSync(join(tmpdir(), 'boxhead-assets-'));
    const reports = join(out, 'reports');
    try {
      execFileSync(process.execPath, [join(ROOT, 'tools/extract.ts'), '--out', out, '--reports', reports], { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
      const fresh = walk(out).filter((p) => !p.startsWith(reports)); // reports are diagnostics, not assets
      expect(fresh.length).toBeGreaterThan(50); // library.json, xsi.json, 29 bitmaps, 31 sounds, manifest
      for (const p of fresh) {
        const rel = p.slice(out.length + 1);
        const committed = join(ASSETS_OUT, rel);
        expect(existsSync(committed), rel).toBe(true);
        expect(readFileSync(p).equals(readFileSync(committed)), rel).toBe(true);
      }
      // And nothing extra is committed beyond what the extractor produces.
      for (const p of walk(ASSETS_OUT)) {
        expect(fresh.some((q) => q.slice(out.length + 1) === p.slice(ASSETS_OUT.length + 1)), p).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('bitmaps', () => {
  const bitmaps = Object.values(lib.chars).filter((c): c is BitmapDef => c.t === 'bitmap');
  const flaBitmaps = xmlElements(doc, 'DOMBitmapItem');

  it.skipIf(!haveFla)('29 bitmaps with the FLA sizes (18 level previews 350x182, 4 at 400x400)', () => {
    expect(bitmaps).toHaveLength(29);
    expect(flaBitmaps).toHaveLength(29);
    for (const item of flaBitmaps) {
      const id = Number(/^bitmap(\d+)\./.exec(item.name)![1]);
      const b = lib.chars[id] as BitmapDef;
      expect([b.w, b.h], item.name).toEqual([Number(item.frameRight), Number(item.frameBottom)]);
      expect(b.format).toBe(item.isJPEG === 'true' ? 'jpg' : 'png');
    }
    const previews = bitmaps.filter((b) => b.w === 350 && b.h === 182).map((b) => b.id);
    expect(previews).toEqual([409, 427, 431, 435, 439, 443, 447, 451, 455, 460, 464, 468, 472, 476, 480, 484, 488, 492]);
    expect(bitmaps.filter((b) => b.w === 400 && b.h === 400).map((b) => b.id)).toEqual([506, 511, 514, 517]);
  });

  it.skipIf(!haveFla)('JPEGs (DefineBits + JPEGTables) are byte-identical to the FLA export', () => {
    for (const b of bitmaps.filter((x) => x.format === 'jpg')) {
      expect(bytesEqual(fileBytes(b.file), getFla().read(`LIBRARY/bitmap${b.id}.jpg`)), `bitmap ${b.id}`).toBe(true);
    }
  });

  it.skipIf(!haveFla)('lossless PNGs equal the FLA export (exact when opaque, ±1 after un-premultiplying Lossless2)', () => {
    for (const b of bitmaps.filter((x) => x.format === 'png')) {
      const mine = PNG.sync.read(Buffer.from(fileBytes(b.file)));
      const ref = PNG.sync.read(Buffer.from(getFla().read(`LIBRARY/bitmap${b.id}.png`)));
      expect([mine.width, mine.height]).toEqual([ref.width, ref.height]);
      let maxDiff = 0, alphaDiff = 0;
      for (let i = 0; i < mine.data.length; i += 4) {
        if (mine.data[i + 3] !== ref.data[i + 3]) alphaDiff++;
        if (mine.data[i + 3] === 0) continue;
        for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(mine.data[i + k] - ref.data[i + k]));
      }
      expect(alphaDiff, `bitmap ${b.id} alpha`).toBe(0);
      expect(maxDiff, `bitmap ${b.id}`).toBeLessThanOrEqual(b.alpha ? 1 : 0);
    }
  });

  it('un-premultiplied Lossless2 pixels re-premultiply to the exact SWF data', () => {
    const swf = getSwf();
    let checked = 0;
    for (const tag of swf.tags()) {
      if (tag.code !== TAG.DefineBitsLossless2) continue;
      const r = swf.reader(tag);
      const id = r.u16(), format = r.u8(), w = r.u16(), h = r.u16();
      expect(format).toBe(5);
      const argb = inflateSync(r.bytes(r.remaining));
      const png = PNG.sync.read(Buffer.from(fileBytes(`bitmaps/${id}.png`)));
      let bad = 0;
      for (let i = 0; i < w * h; i++) {
        const a = argb[i * 4];
        if (png.data[i * 4 + 3] !== a) bad++;
        for (let k = 0; k < 3; k++) if (Math.round((png.data[i * 4 + k] * a) / 255) !== argb[i * 4 + 1 + k]) bad++;
      }
      expect(bad, `bitmap ${id}`).toBe(0);
      checked++;
    }
    expect(checked).toBe(9);
  });

  it('PNG encoder round-trips (RGBA and RGB)', () => {
    const w = 7, h = 5, px = new Uint8Array(w * h * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 37 + (i >> 2) * 11) & 255;
    const rgba = PNG.sync.read(Buffer.from(encodePng(w, h, px, true)));
    expect(Array.from(rgba.data)).toEqual(Array.from(px));
    const rgb = PNG.sync.read(Buffer.from(encodePng(w, h, px, false)));
    for (let i = 0; i < w * h; i++) expect([rgb.data[i * 4], rgb.data[i * 4 + 1], rgb.data[i * 4 + 2], rgb.data[i * 4 + 3]]).toEqual([px[i * 4], px[i * 4 + 1], px[i * 4 + 2], 255]);
  });

  it('JPEG normalization merges tables + image and drops stray EOI/SOI pairs', () => {
    const tables = Uint8Array.of(0xff, 0xd8, 0xff, 0xdb, 0, 3, 7, 0xff, 0xd9);
    const image = Uint8Array.of(0xff, 0xd9, 0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xda, 0, 2, 1, 0xff, 0x00, 2, 0xff, 0xd9);
    const { bytes, removed } = normalizeJpeg(Uint8Array.from([...tables, ...image]));
    expect(Array.from(bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xdb, 0, 3, 7, 0xff, 0xda, 0, 2, 1, 0xff, 0x00, 2, 0xff, 0xd9]);
    expect(removed).toBe(3); // 5 SOI/EOI markers in, 2 out
  });
});
