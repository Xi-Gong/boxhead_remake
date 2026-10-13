/**
 * Minimal AVM1 assembler for unit tests (labels, Push of every type, branches, functions).
 */
import { OP } from '../../../tools/avm1/opcodes.ts';

export type PushArg =
  | string | number | boolean | null | undefined
  | { reg: number } | { c: number } | { d: number } | { f: number };

export type Item =
  | { label: string }
  | { op: string }
  | { push: PushArg[] }
  | { jump: string } | { if: string }
  | { store: number }
  | { pool: string[] }
  | { fn2: { name?: string; params: Array<[number, string]>; regs: number; flags: number; body: Item[] } }
  | { fn: { name?: string; params: string[]; body: Item[] } }
  | { raw: number[] };

class W {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u32(v: number) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); }
  str(s: string) { for (const b of new TextEncoder().encode(s)) this.u8(b); this.u8(0); }
  f64avm1(v: number) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v, true);
    const b = new Uint8Array(dv.buffer);
    for (const x of [...b.slice(4, 8), ...b.slice(0, 4)]) this.u8(x);
  }
  f32(v: number) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, v, true);
    for (const x of new Uint8Array(dv.buffer)) this.u8(x);
  }
}

function action(w: W, code: number, payload: W | null) {
  w.u8(code);
  if (code >= 0x80) {
    const p = payload?.bytes ?? [];
    w.u16(p.length);
    for (const b of p) w.u8(b);
  }
}

/** Assemble items; returns bytes and label offsets (relative to the start). */
export function assemble(items: Item[]): { bytes: Uint8Array; labels: Record<string, number> } {
  // two passes: sizes are label-independent (branch payload is always 2 bytes)
  const labels: Record<string, number> = {};
  const emit = (resolve: boolean): number[] => {
    const w = new W();
    for (const it of items) {
      if ('label' in it) { labels[it.label] = w.bytes.length; continue; }
      if ('op' in it) { const c = OP[it.op]; if (c === undefined) throw new Error(it.op); action(w, c, null); continue; }
      if ('raw' in it) { for (const b of it.raw) w.u8(b); continue; }
      if ('push' in it) {
        const p = new W();
        for (const v of it.push) {
          if (typeof v === 'string') { p.u8(0); p.str(v); }
          else if (typeof v === 'number') {
            if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) { p.u8(7); p.u32(v >>> 0); }
            else { p.u8(6); p.f64avm1(v); }
          } else if (typeof v === 'boolean') { p.u8(5); p.u8(v ? 1 : 0); }
          else if (v === null) p.u8(2);
          else if (v === undefined) p.u8(3);
          else if ('reg' in v) { p.u8(4); p.u8(v.reg); }
          else if ('c' in v) { if (v.c < 256) { p.u8(8); p.u8(v.c); } else { p.u8(9); p.u16(v.c); } }
          else if ('d' in v) { p.u8(6); p.f64avm1(v.d); }
          else if ('f' in v) { p.u8(1); p.f32(v.f); }
        }
        action(w, 0x96, p);
        continue;
      }
      if ('jump' in it || 'if' in it) {
        const label = 'jump' in it ? it.jump : it.if;
        const p = new W();
        const next = w.bytes.length + 5;
        const target = resolve ? labels[label] : next;
        if (resolve && target === undefined) throw new Error(`label ${label}`);
        p.u16((target - next) & 0xffff);
        action(w, 'jump' in it ? 0x99 : 0x9d, p);
        continue;
      }
      if ('store' in it) { const p = new W(); p.u8(it.store); action(w, 0x87, p); continue; }
      if ('pool' in it) { const p = new W(); p.u16(it.pool.length); for (const s of it.pool) p.str(s); action(w, 0x88, p); continue; }
      if ('fn2' in it) {
        const f = it.fn2;
        const body = assemble(f.body).bytes;
        const p = new W();
        p.str(f.name ?? '');
        p.u16(f.params.length);
        p.u8(f.regs);
        p.u8((f.flags >> 8) & 0xff); p.u8(f.flags & 0xff);
        for (const [r, n] of f.params) { p.u8(r); p.str(n); }
        p.u16(body.length);
        action(w, 0x8e, p);
        for (const b of body) w.u8(b);
        continue;
      }
      if ('fn' in it) {
        const f = it.fn;
        const body = assemble(f.body).bytes;
        const p = new W();
        p.str(f.name ?? '');
        p.u16(f.params.length);
        for (const n of f.params) p.str(n);
        p.u16(body.length);
        action(w, 0x9b, p);
        for (const b of body) w.u8(b);
        continue;
      }
    }
    return w.bytes;
  };
  emit(false);
  const bytes = emit(true);
  return { bytes: new Uint8Array(bytes), labels };
}

/** DefineFunction2 flag bits in this module's (byte0 << 8 | byte1) layout. */
export const F2 = {
  preloadThis: 0x0100, suppressThis: 0x0200, preloadArguments: 0x0400, suppressArguments: 0x0800,
  preloadSuper: 0x1000, suppressSuper: 0x2000, preloadRoot: 0x4000, preloadParent: 0x8000, preloadGlobal: 0x0001,
};
