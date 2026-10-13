/**
 * Minimal ZIP reader (stored / deflate entries) for the XFL `.fla` export — no dependencies.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export class ZipReader {
  readonly buf: Uint8Array;
  readonly entries: ZipEntry[] = [];
  private readonly view: DataView;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // End of central directory record (search backwards for PK\x05\x06)
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (this.view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip file (no EOCD)');
    const count = this.view.getUint16(eocd + 10, true);
    let p = this.view.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < count; i++) {
      if (this.view.getUint32(p, true) !== 0x02014b50) throw new Error(`bad central directory entry at ${p}`);
      const method = this.view.getUint16(p + 10, true);
      const compressedSize = this.view.getUint32(p + 20, true);
      const size = this.view.getUint32(p + 24, true);
      const nameLen = this.view.getUint16(p + 28, true);
      const extraLen = this.view.getUint16(p + 30, true);
      const commentLen = this.view.getUint16(p + 32, true);
      const localHeaderOffset = this.view.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      this.entries.push({ name, method, compressedSize, size, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  static fromPath(path: string): ZipReader {
    return new ZipReader(new Uint8Array(readFileSync(path)));
  }

  read(e: ZipEntry): Uint8Array {
    const p = e.localHeaderOffset;
    if (this.view.getUint32(p, true) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
    const nameLen = this.view.getUint16(p + 26, true);
    const extraLen = this.view.getUint16(p + 28, true);
    const start = p + 30 + nameLen + extraLen;
    const data = this.buf.subarray(start, start + e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return new Uint8Array(inflateRawSync(data));
    throw new Error(`unsupported zip method ${e.method} for ${e.name}`);
  }

  readText(e: ZipEntry): string {
    return new TextDecoder('utf-8').decode(this.read(e));
  }
}
