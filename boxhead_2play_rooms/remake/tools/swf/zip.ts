/**
 * Minimal read-only ZIP reader (central directory + stored/deflate entries) used to inspect the reference FLA
 * (an XFL zip exported by JPEXS) from tests. No dependencies: Node zlib.inflateRawSync only.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the local file header. */
  localOffset: number;
}

export class ZipFile {
  readonly buf: Uint8Array;
  readonly entries = new Map<string, ZipEntry>();
  private readonly view: DataView;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // End of central directory record: signature 0x06054b50, searched backwards (comment may follow it).
    let eocd = -1;
    for (let p = buf.length - 22; p >= Math.max(0, buf.length - 22 - 0xffff); p--) {
      if (this.view.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
    }
    if (eocd < 0) throw new Error('ZIP: end of central directory not found');
    const count = this.view.getUint16(eocd + 10, true);
    let p = this.view.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < count; i++) {
      if (this.view.getUint32(p, true) !== 0x02014b50) throw new Error(`ZIP: bad central directory entry at ${p}`);
      const method = this.view.getUint16(p + 10, true);
      const compressedSize = this.view.getUint32(p + 20, true);
      const size = this.view.getUint32(p + 24, true);
      const nameLen = this.view.getUint16(p + 28, true);
      const extraLen = this.view.getUint16(p + 30, true);
      const commentLen = this.view.getUint16(p + 32, true);
      const localOffset = this.view.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      this.entries.set(name, { name, method, compressedSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  static fromPath(path: string): ZipFile { return new ZipFile(new Uint8Array(readFileSync(path))); }

  names(): string[] { return [...this.entries.keys()]; }

  /** Uncompressed bytes of an entry (stored or deflate). */
  read(name: string): Uint8Array {
    const e = this.entries.get(name);
    if (!e) throw new Error(`ZIP: no entry ${name}`);
    const p = e.localOffset;
    if (this.view.getUint32(p, true) !== 0x04034b50) throw new Error(`ZIP: bad local header for ${name}`);
    const nameLen = this.view.getUint16(p + 26, true);
    const extraLen = this.view.getUint16(p + 28, true);
    const data = this.buf.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return new Uint8Array(inflateRawSync(data));
    throw new Error(`ZIP: unsupported method ${e.method} for ${name}`);
  }

  text(name: string): string { return new TextDecoder('utf-8').decode(this.read(name)); }
}
