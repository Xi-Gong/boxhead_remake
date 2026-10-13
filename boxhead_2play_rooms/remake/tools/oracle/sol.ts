/**
 * Local SharedObject (.sol, AMF0) reader + the "SO channel" used to get probe results out of RELEASE projectors
 * (which never write flashlog.txt).                                                  OWNER: oracle lane
 *
 * Why: the FP32 (32.0.0.465) and FP30 projectors on this machine carry a kill switch (EOL/region block) — content
 * runs for ~100 ms (first frame or two), then the player replaces it with an "outdated version" notice. Single-frame
 * probes finish inside that window, but the real game (P8) needs thousands of frames, so P8 runs in the release
 * projector FlashPlayer28.exe (28.0.0.126; FlashPlayer8.exe also works) and reports through a SharedObject:
 *   P(key, value) appends "key=value" to SharedObject.getLocal(<name>, "/").data.lines and END() sets data.end and
 *   flushes. Files: %APPDATA%\Macromedia\Flash Player\#SharedObjects\<random>\localhost\<name>.sol
 * Only files named oracle_*.sol are ever deleted by the runner (the user's own game saves live next to them).
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SO_ROOT = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Macromedia', 'Flash Player', '#SharedObjects');

/** Find every `<name>.sol` (or every file matching `name` when it is a RegExp) under #SharedObjects (any depth). */
export function findSol(name: string | RegExp): string[] {
  const out: string[] = [];
  if (!existsSync(SO_ROOT)) return out;
  const walk = (dir: string, depth: number): void => {
    if (depth > 12) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (typeof name === 'string' ? e === `${name}.sol` : name.test(e)) out.push(p);
    }
  };
  walk(SO_ROOT, 0);
  return out;
}

/**
 * Delete ALL of our probe SharedObjects (files named oracle_*.sol). Needed before every run: the ~100 KB local storage
 * quota is shared by every SharedObject of the "localhost" domain, so leftovers from earlier probes make flush() pend.
 */
export function deleteAllOracleSols(): void {
  for (const p of findSol(/^oracle_.*\.sol$/)) rmSync(p, { force: true });
}

/** Delete our own probe SharedObjects (name must start with "oracle_"). */
export function deleteSol(name: string): void {
  if (!name.startsWith('oracle_')) throw new Error(`refusing to delete non-oracle SharedObject ${name}`);
  for (const p of findSol(name)) rmSync(p, { force: true });
}

// ------------------------------------------------------------------------------------------------ AMF0

class Amf0 {
  private v: DataView;
  pos: number;
  private buf: Uint8Array;
  private refs: unknown[] = [];
  constructor(buf: Uint8Array, pos: number) { this.buf = buf; this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); this.pos = pos; }
  u8(): number { return this.buf[this.pos++]; }
  u16(): number { const x = this.v.getUint16(this.pos); this.pos += 2; return x; }
  u32(): number { const x = this.v.getUint32(this.pos); this.pos += 4; return x; }
  utf(n: number): string { const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + n)); this.pos += n; return s; }
  str(): string { return this.utf(this.u16()); }
  props(into: Record<string, unknown>): void {
    for (;;) {
      const k = this.str();
      if (k === '' && this.buf[this.pos] === 9) { this.pos++; return; }
      into[k] = this.value();
    }
  }
  value(): unknown {
    const t = this.u8();
    switch (t) {
      case 0: { const x = this.v.getFloat64(this.pos); this.pos += 8; return x; }
      case 1: return this.u8() !== 0;
      case 2: return this.str();
      case 3: { const o: Record<string, unknown> = {}; this.refs.push(o); this.props(o); return o; }
      case 5: return null;
      case 6: return undefined;
      case 7: return this.refs[this.u16()];
      case 8: { this.u32(); const o: Record<string, unknown> = {}; this.refs.push(o); this.props(o); return o; }
      case 10: { const n = this.u32(); const a: unknown[] = []; this.refs.push(a); for (let i = 0; i < n; i++) a.push(this.value()); return a; }
      case 11: { const d = this.v.getFloat64(this.pos); this.pos += 10; return new Date(d); }
      case 12: return this.utf(this.u32());
      case 15: return this.utf(this.u32());
      case 16: { this.str(); const o: Record<string, unknown> = {}; this.refs.push(o); this.props(o); return o; }
      default: throw new Error(`AMF0 type ${t} at ${this.pos - 1}`);
    }
  }
}

/** Parse a .sol file (AMF0 encoding) into its data object. */
export function parseSol(bytes: Uint8Array): { name: string; data: Record<string, unknown> } {
  if (bytes[0] !== 0x00 || bytes[1] !== 0xbf) throw new Error('not a .sol file');
  const r = new Amf0(bytes, 6);
  const sig = r.utf(4);
  if (sig !== 'TCSO') throw new Error('bad .sol signature');
  r.pos += 6;
  const name = r.str();
  r.u32(); // AMF version (0)
  const data: Record<string, unknown> = {};
  while (r.pos < bytes.length) {
    const k = r.str();
    const v = r.value();
    data[k] = v;
    r.pos++; // trailing 0x00
  }
  return { name, data };
}

/** Lines ("key=value") stored by the SO-channel prelude, in order. AS2 arrays arrive as ECMA arrays (index keys). */
export function solLines(data: Record<string, unknown>): string[] {
  const lines = data.lines;
  if (Array.isArray(lines)) return lines.map(String);
  if (lines && typeof lines === 'object') {
    const o = lines as Record<string, unknown>;
    return Object.keys(o).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map((k) => String(o[k]));
  }
  return [];
}

export function readSolIfExists(name: string): Record<string, unknown> | null {
  for (const p of findSol(name)) {
    try { return parseSol(new Uint8Array(readFileSync(p))).data; } catch { /* partially written */ }
  }
  return null;
}

/**
 * AS prelude for the SO channel. P()/END() replace the trace-based ones. Results are buffered in __L and written on
 * END() / CHECKPOINT() (flush is slow; every flush rewrites the whole file).
 */
export function soPrelude(soName: string): string {
  return `
var __so = SharedObject.getLocal(${JSON.stringify(soName)}, "/");
__so.clear();
var __L = new Array();
function P(k, v) { __L.push(k + "=" + v); }
function CHECKPOINT() { __so.data.lines = __L; __so.data.count = __L.length; __so.flush(); }
function END() { __L.push("END"); __so.data.lines = __L; __so.data.end = 1; __so.data.count = __L.length; P("flush", __so.flush()); __so.data.lines = __L; __so.flush(); }
function keysOf(o) { var s = ""; var first = true; for (var k in o) { s += (first ? "" : ",") + k; first = false; } return s; }
function hex8(n) {
  var d = "0123456789ABCDEF"; var s = ""; var i;
  if (n < 0) n += 4294967296;
  for (i = 0; i < 8; i++) { s = d.charAt(n % 16) + s; n = Math.floor(n / 16); }
  return s;
}
P("$version", $version);
`;
}
