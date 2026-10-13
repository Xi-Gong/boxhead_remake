/** Shared fixtures for the SWF extractor tests (built once per test file, in memory). */
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH, FLA_PATH } from '../../../tools/paths.ts';
import { buildLibrary, type BuildResult } from '../../../tools/swf/library.ts';
import { ZipFile } from '../../../tools/swf/zip.ts';

let swf: SwfFile | undefined;
let build: BuildResult | undefined;
let fla: ZipFile | undefined;

export function getSwf(): SwfFile { return (swf ??= SwfFile.fromPath(SWF_PATH)); }
export function getBuild(): BuildResult { return (build ??= buildLibrary(getSwf())); }
export function getFla(): ZipFile { return (fla ??= ZipFile.fromPath(FLA_PATH)); }

/** Attributes of every `<tag .../>` element in an XML string (no dependency XML parser; FLA XML is regular). */
export function xmlElements(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:]+)="([^"]*)"/g)) attrs[a[1]] = decodeXml(a[2]);
    out.push(attrs);
  }
  return out;
}

export function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'"
      : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
}

/** Parse SVG path data produced by shapeConvert (M/L/Q/Z, explicit letters) into commands. */
export function parsePath(d: string): { c: string; n: number[] }[] {
  const out: { c: string; n: number[] }[] = [];
  for (const m of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const n = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
    out.push({ c: m[1], n });
  }
  return out;
}

/** MSB-first bit writer for hand-encoded SWF records (byte() flushes to a byte boundary first). */
export class Bits {
  bytes: number[] = [];
  private acc = 0;
  private n = 0;
  u(v: number, bits: number): this {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | (Math.floor(v / 2 ** i) & 1);
      if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; }
    }
    return this;
  }
  s(v: number, bits: number): this { return this.u(v < 0 ? v + 2 ** bits : v, bits); }
  flush(): this { if (this.n) this.u(0, 8 - this.n); return this; }
  byte(...b: number[]): this { this.flush(); this.bytes.push(...b); return this; }
  u16(v: number): this { return this.byte(v & 255, v >> 8); }
  u32(v: number): this { return this.byte(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
  fixed(v: number): this { return this.u32(Math.round(v * 65536) >>> 0); }
  fixed8(v: number): this { return this.u16(Math.round(v * 256) & 0xffff); }
  toArray(): Uint8Array { this.flush(); return Uint8Array.from(this.bytes); }
}
