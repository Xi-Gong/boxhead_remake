/**
 * Tiny AVM1 (ActionScript 1/2 bytecode, SWF <= 8) assembler for oracle probes.       OWNER: oracle lane
 *
 * Encoding reference: SWF File Format Specification v19, chapter 5.
 *  - Actions >= 0x80 carry a UI16 length followed by that many operand bytes.
 *  - Push type 6 (double) stores the two 32-bit little-endian halves HIGH WORD FIRST (see ByteReader.avm1Double).
 *  - Jump/If offsets are SI16, relative to the byte after the branch instruction.
 *  - DefineFunction/DefineFunction2 are followed inline by `codeSize` bytes of body (no End action in the body).
 *  - A DoAction/DoInitAction body ends with ActionEndFlag 0x00 (`assemble({ end: true })`).
 *
 * Usage:
 *   const a = new Asm();
 *   a.push('PROBE:hello=1').op('Trace');
 *   const bytes = a.assemble({ end: true });
 * Most probes are written in the mini ActionScript dialect compiled by ./as1c.ts, which emits through this class.
 */
import { OP } from '../avm1/opcodes.ts';

/** A register operand for Push (Push type 4). */
export interface Reg { readonly reg: number }
export const reg = (n: number): Reg => ({ reg: n });
export const isReg = (v: unknown): v is Reg => typeof v === 'object' && v !== null && 'reg' in v;

/** Explicit Push typing when the default (int32 -> type 7, else type 6 double) is not wanted. */
export interface TypedPush { readonly pushType: 'double' | 'integer' | 'float'; readonly value: number }
export const asDouble = (value: number): TypedPush => ({ pushType: 'double', value });

export type PushOperand = string | number | boolean | null | undefined | Reg | TypedPush;

type Item =
  | { k: 'bytes'; b: Uint8Array }
  | { k: 'label'; name: string }
  | { k: 'branch'; op: number; label: string };

/** DefineFunction2 flags (UI16, spec bit order). */
export const F2 = {
  PreloadThis: 0x0001, SuppressThis: 0x0002, PreloadArguments: 0x0004, SuppressArguments: 0x0008,
  PreloadSuper: 0x0010, SuppressSuper: 0x0020, PreloadRoot: 0x0040, PreloadParent: 0x0080, PreloadGlobal: 0x0100,
} as const;

const utf8 = new TextEncoder();

/** Growable little-endian byte sink. */
export class ByteSink {
  private buf = new Uint8Array(256);
  length = 0;
  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.length + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.length));
    this.buf = nb;
  }
  u8(v: number): this { this.ensure(1); this.buf[this.length++] = v & 0xff; return this; }
  u16(v: number): this { this.u8(v); this.u8(v >>> 8); return this; }
  s16(v: number): this { return this.u16(v & 0xffff); }
  u32(v: number): this { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); return this; }
  s32(v: number): this { return this.u32(v >>> 0); }
  f32(v: number): this { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); return this.bytes(new Uint8Array(d.buffer)); }
  f64(v: number): this { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v, true); return this.bytes(new Uint8Array(d.buffer)); }
  /** AVM1 Push double: high 32-bit word first, each half little-endian. */
  avm1Double(v: number): this {
    const d = new DataView(new ArrayBuffer(8));
    d.setFloat64(0, v, true);
    const b = new Uint8Array(d.buffer);
    return this.bytes(b.subarray(4, 8)).bytes(b.subarray(0, 4));
  }
  bytes(b: Uint8Array): this { this.ensure(b.length); this.buf.set(b, this.length); this.length += b.length; return this; }
  /** Null-terminated UTF-8 string (SWF 6+). */
  str(s: string): this {
    const b = utf8.encode(s);
    if (b.includes(0)) throw new Error(`AVM1 string contains NUL: ${JSON.stringify(s)}`);
    return this.bytes(b).u8(0);
  }
  toBytes(): Uint8Array { return this.buf.slice(0, this.length); }
}

/** Encode one action record. */
export function action(code: number, operands?: Uint8Array): Uint8Array {
  if (code < 0x80) {
    if (operands && operands.length) throw new Error(`action 0x${code.toString(16)} takes no operands`);
    return Uint8Array.of(code);
  }
  const ops = operands ?? new Uint8Array(0);
  if (ops.length > 0xffff) throw new Error(`action 0x${code.toString(16)} operands too long (${ops.length})`);
  return new ByteSink().u8(code).u16(ops.length).bytes(ops).toBytes();
}

function opcode(name: string): number {
  const c = OP[name];
  if (c === undefined) throw new Error(`unknown AVM1 mnemonic ${name}`);
  return c;
}

/** Encode one Push value (type byte + payload). */
export function encodePushValue(s: ByteSink, v: PushOperand): void {
  if (typeof v === 'string') { s.u8(0).str(v); return; }
  if (v === null) { s.u8(2); return; }
  if (v === undefined) { s.u8(3); return; }
  if (typeof v === 'boolean') { s.u8(5).u8(v ? 1 : 0); return; }
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff && !Object.is(v, -0)) s.u8(7).s32(v);
    else s.u8(6).avm1Double(v);
    return;
  }
  if (isReg(v)) { s.u8(4).u8(v.reg); return; }
  if (v.pushType === 'double') { s.u8(6).avm1Double(v.value); return; }
  if (v.pushType === 'float') { s.u8(1).f32(v.value); return; }
  s.u8(7).s32(v.value);
}

export interface Param2 { name: string; reg: number }

export class Asm {
  private items: Item[] = [];
  private static labelSeq = 0;

  /** A fresh, unique label name. */
  newLabel(prefix = 'L'): string { return `${prefix}_${Asm.labelSeq++}`; }

  label(name: string): this { this.items.push({ k: 'label', name }); return this; }

  raw(b: Uint8Array): this { this.items.push({ k: 'bytes', b }); return this; }

  /** Zero-operand action by mnemonic (e.g. 'Add2', 'Trace', 'GetMember'). Several may be given. */
  op(...names: string[]): this {
    for (const n of names) {
      const c = opcode(n);
      if (c >= 0x80) throw new Error(`${n} needs operands; use its dedicated method`);
      this.raw(action(c));
    }
    return this;
  }

  /** Push values; splits into several Push actions if the operand block would exceed 65535 bytes. */
  push(...vals: PushOperand[]): this {
    let s = new ByteSink();
    for (const v of vals) {
      const one = new ByteSink();
      encodePushValue(one, v);
      if (s.length + one.length > 0xffff) { this.raw(action(0x96, s.toBytes())); s = new ByteSink(); }
      s.bytes(one.toBytes());
    }
    if (s.length) this.raw(action(0x96, s.toBytes()));
    return this;
  }

  jump(label: string): this { this.items.push({ k: 'branch', op: 0x99, label }); return this; }
  /** If: pops a value, branches when it is true. */
  if(label: string): this { this.items.push({ k: 'branch', op: 0x9d, label }); return this; }

  storeRegister(n: number): this { return this.raw(action(0x87, Uint8Array.of(n))); }
  constantPool(strings: string[]): this {
    const s = new ByteSink().u16(strings.length);
    for (const x of strings) s.str(x);
    return this.raw(action(0x88, s.toBytes()));
  }
  gotoFrame(frameIndex0: number): this { return this.raw(action(0x81, new ByteSink().u16(frameIndex0).toBytes())); }
  gotoLabel(label: string): this { return this.raw(action(0x8c, new ByteSink().str(label).toBytes())); }
  getURL(url: string, target: string): this { return this.raw(action(0x83, new ByteSink().str(url).str(target).toBytes())); }
  /** GotoFrame2 (pops frame): play flag bit 0. */
  gotoFrame2(play: boolean): this { return this.raw(action(0x9f, Uint8Array.of(play ? 1 : 0))); }

  /** SWF5 DefineFunction. Name '' = anonymous (pushed on the stack); otherwise defined in the current scope. */
  defineFunction(name: string, params: string[], body: Asm): this {
    const code = body.assemble();
    if (code.length > 0xffff) throw new Error(`function ${name} body too long (${code.length})`);
    const s = new ByteSink().str(name).u16(params.length);
    for (const p of params) s.str(p);
    s.u16(code.length);
    return this.raw(action(0x9b, s.toBytes())).raw(code);
  }

  /** SWF7 DefineFunction2. */
  defineFunction2(name: string, params: Param2[], registerCount: number, flags: number, body: Asm): this {
    const code = body.assemble();
    if (code.length > 0xffff) throw new Error(`function ${name} body too long (${code.length})`);
    const s = new ByteSink().str(name).u16(params.length).u8(registerCount).u16(flags);
    for (const p of params) s.u8(p.reg).str(p.name);
    s.u16(code.length);
    return this.raw(action(0x8e, s.toBytes())).raw(code);
  }

  /** Append another assembler's items (labels must be unique across both). */
  append(other: Asm): this { this.items.push(...other.items); return this; }

  /** Resolve labels and produce bytecode. `end: true` appends ActionEndFlag (0x00) for DoAction bodies. */
  assemble(opts: { end?: boolean } = {}): Uint8Array {
    const labelAt = new Map<string, number>();
    let pc = 0;
    for (const it of this.items) {
      if (it.k === 'label') {
        if (labelAt.has(it.name)) throw new Error(`duplicate label ${it.name}`);
        labelAt.set(it.name, pc);
      } else pc += it.k === 'bytes' ? it.b.length : 5;
    }
    const out = new ByteSink();
    for (const it of this.items) {
      if (it.k === 'bytes') out.bytes(it.b);
      else if (it.k === 'branch') {
        const target = labelAt.get(it.label);
        if (target === undefined) throw new Error(`undefined label ${it.label}`);
        const rel = target - (out.length + 5);
        if (rel < -0x8000 || rel > 0x7fff) throw new Error(`branch to ${it.label} out of range (${rel})`);
        out.u8(it.op).u16(2).s16(rel);
      }
    }
    if (opts.end) out.u8(0);
    return out.toBytes();
  }

  // ------------------------------------------------------------------ probe helpers

  /** trace('PROBE:' + key + '=' + <value on stack>) — pops the value pushed by `pushValue`. */
  traceProbe(key: string, pushValue: (a: Asm) => void): this {
    this.push(`PROBE:${key}=`);
    pushValue(this);
    return this.op('Add2', 'Trace');
  }

  /** trace a literal line. */
  traceLine(line: string): this { return this.push(line).op('Trace'); }
}
