/**
 * AVM1 (ActionScript 1/2 bytecode) opcode table and single-instruction decoder for SWF versions <= 8.
 * Reference: SWF File Format Specification v19, chapter 5 ("Actions").
 *
 * Decoding works on ABSOLUTE offsets in the decompressed SWF buffer (`SwfFile.data`): the obfuscated game jumps
 * from DoInitAction tags into neighbouring non-standard tag-253 blobs, so instructions are never clamped to a tag.
 */

/** Opcode → mnemonic. Opcodes >= 0x80 carry a u16 length field followed by `length` bytes of operands. */
export const OPCODE_NAMES: Readonly<Record<number, string>> = {
  0x00: 'End',
  // SWF 3
  0x04: 'NextFrame', 0x05: 'PreviousFrame', 0x06: 'Play', 0x07: 'Stop', 0x08: 'ToggleQuality', 0x09: 'StopSounds',
  0x81: 'GotoFrame', 0x83: 'GetURL', 0x8a: 'WaitForFrame', 0x8b: 'SetTarget', 0x8c: 'GoToLabel',
  // SWF 4
  0x0a: 'Add', 0x0b: 'Subtract', 0x0c: 'Multiply', 0x0d: 'Divide', 0x0e: 'Equals', 0x0f: 'Less',
  0x10: 'And', 0x11: 'Or', 0x12: 'Not', 0x13: 'StringEquals', 0x14: 'StringLength', 0x15: 'StringExtract',
  0x17: 'Pop', 0x18: 'ToInteger', 0x1c: 'GetVariable', 0x1d: 'SetVariable', 0x20: 'SetTarget2', 0x21: 'StringAdd',
  0x22: 'GetProperty', 0x23: 'SetProperty', 0x24: 'CloneSprite', 0x25: 'RemoveSprite', 0x26: 'Trace',
  0x27: 'StartDrag', 0x28: 'EndDrag', 0x29: 'StringLess', 0x30: 'RandomNumber', 0x31: 'MBStringLength',
  0x32: 'CharToAscii', 0x33: 'AsciiToChar', 0x34: 'GetTime', 0x35: 'MBStringExtract', 0x36: 'MBCharToAscii',
  0x37: 'MBAsciiToChar',
  0x96: 'Push', 0x99: 'Jump', 0x9a: 'GetURL2', 0x9d: 'If', 0x9e: 'Call', 0x9f: 'GotoFrame2', 0x8d: 'WaitForFrame2',
  // SWF 5
  0x3a: 'Delete', 0x3b: 'Delete2', 0x3c: 'DefineLocal', 0x3d: 'CallFunction', 0x3e: 'Return', 0x3f: 'Modulo',
  0x40: 'NewObject', 0x41: 'DefineLocal2', 0x42: 'InitArray', 0x43: 'InitObject', 0x44: 'TypeOf',
  0x45: 'TargetPath', 0x46: 'Enumerate', 0x47: 'Add2', 0x48: 'Less2', 0x49: 'Equals2', 0x4a: 'ToNumber',
  0x4b: 'ToString', 0x4c: 'PushDuplicate', 0x4d: 'StackSwap', 0x4e: 'GetMember', 0x4f: 'SetMember',
  0x50: 'Increment', 0x51: 'Decrement', 0x52: 'CallMethod', 0x53: 'NewMethod', 0x60: 'BitAnd', 0x61: 'BitOr',
  0x62: 'BitXor', 0x63: 'BitLShift', 0x64: 'BitRShift', 0x65: 'BitURShift',
  0x87: 'StoreRegister', 0x88: 'ConstantPool', 0x94: 'With', 0x9b: 'DefineFunction',
  // SWF 6
  0x54: 'InstanceOf', 0x55: 'Enumerate2', 0x66: 'StrictEquals', 0x67: 'Greater', 0x68: 'StringGreater',
  // SWF 7
  0x2a: 'Throw', 0x2b: 'CastOp', 0x2c: 'ImplementsOp', 0x69: 'Extends', 0x8e: 'DefineFunction2', 0x8f: 'Try',
};

export const OP: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(OPCODE_NAMES).map(([k, v]) => [v, Number(k)]),
);

/**
 * Stack effect of fixed-arity opcodes: [pops, pushes]. Variable-arity opcodes (CallFunction, CallMethod,
 * NewObject, NewMethod, InitArray, InitObject, ImplementsOp, Push, Enumerate…) are handled by the stack simulator.
 */
export const STACK_EFFECT: Readonly<Record<string, readonly [number, number]>> = {
  End: [0, 0], NextFrame: [0, 0], PreviousFrame: [0, 0], Play: [0, 0], Stop: [0, 0], ToggleQuality: [0, 0],
  StopSounds: [0, 0], GotoFrame: [0, 0], GetURL: [0, 0], SetTarget: [0, 0], GoToLabel: [0, 0],
  Add: [2, 1], Subtract: [2, 1], Multiply: [2, 1], Divide: [2, 1], Equals: [2, 1], Less: [2, 1], And: [2, 1],
  Or: [2, 1], Not: [1, 1], StringEquals: [2, 1], StringLength: [1, 1], StringExtract: [3, 1], Pop: [1, 0],
  ToInteger: [1, 1], GetVariable: [1, 1], SetVariable: [2, 0], SetTarget2: [1, 0], StringAdd: [2, 1],
  GetProperty: [2, 1], SetProperty: [3, 0], CloneSprite: [3, 0], RemoveSprite: [1, 0], Trace: [1, 0],
  EndDrag: [0, 0], StringLess: [2, 1], RandomNumber: [1, 1], MBStringLength: [1, 1], CharToAscii: [1, 1],
  AsciiToChar: [1, 1], GetTime: [0, 1], MBStringExtract: [3, 1], MBCharToAscii: [1, 1], MBAsciiToChar: [1, 1],
  Jump: [0, 0], GetURL2: [2, 0], If: [1, 0], Call: [1, 0], GotoFrame2: [1, 0], WaitForFrame: [0, 0],
  WaitForFrame2: [1, 0],
  Delete: [2, 1], Delete2: [1, 1], DefineLocal: [2, 0], Return: [1, 0], Modulo: [2, 1], DefineLocal2: [1, 0],
  TypeOf: [1, 1], TargetPath: [1, 1], Add2: [2, 1], Less2: [2, 1], Equals2: [2, 1], ToNumber: [1, 1],
  ToString: [1, 1], PushDuplicate: [1, 2], StackSwap: [2, 2], GetMember: [2, 1], SetMember: [3, 0],
  Increment: [1, 1], Decrement: [1, 1], BitAnd: [2, 1], BitOr: [2, 1], BitXor: [2, 1], BitLShift: [2, 1],
  BitRShift: [2, 1], BitURShift: [2, 1], StoreRegister: [1, 1], ConstantPool: [0, 0], With: [1, 0],
  InstanceOf: [2, 1], StrictEquals: [2, 1], Greater: [2, 1], StringGreater: [2, 1], Throw: [1, 0],
  CastOp: [2, 1], Extends: [2, 0], DefineFunction: [0, 0], DefineFunction2: [0, 0], Try: [0, 0],
};

// ---------------------------------------------------------------------------------------------------------------
// Push values

export type PushValue =
  | { t: 'string'; v: string }
  | { t: 'float'; v: number }
  | { t: 'null' }
  | { t: 'undefined' }
  | { t: 'register'; v: number }
  | { t: 'boolean'; v: boolean }
  | { t: 'double'; v: number }
  | { t: 'integer'; v: number }
  /** Constant-pool index (Push types 8 and 9). */
  | { t: 'constant'; v: number };

// ---------------------------------------------------------------------------------------------------------------
// Decoded instruction

export interface FunctionParam {
  /** Register number (DefineFunction2 only; 0 = not stored in a register). */
  register: number;
  name: string;
}

export interface DefineFunctionInfo {
  name: string;
  params: FunctionParam[];
  /** Body length in bytes; the body starts right after this instruction. */
  codeSize: number;
  /** DefineFunction2 only. */
  registerCount?: number;
  flags?: number;
  /** DefineFunction2 only: preloaded register names, index = register number (e.g. [ , 'this', '_global']). */
  preloaded?: Array<string | undefined>;
}

export interface TryInfo {
  trySize: number;
  catchSize: number;
  finallySize: number;
  catchInRegister: boolean;
  hasCatch: boolean;
  hasFinally: boolean;
  catchName?: string;
  catchRegister?: number;
}

export interface Instruction {
  /** Absolute offset of the opcode byte. */
  offset: number;
  code: number;
  name: string;
  /** Total encoded size (1 or 3 + payload length). */
  size: number;
  /** Absolute offset of the following instruction (offset + size). */
  next: number;
  /** Payload length field (opcodes >= 0x80), else 0. */
  payloadLength: number;
  /** Jump / If: absolute branch target. */
  target?: number;
  /** Jump / If: signed branch offset relative to `next`. */
  branchOffset?: number;
  push?: PushValue[];
  pool?: string[];
  fn?: DefineFunctionInfo;
  tryInfo?: TryInfo;
  /** StoreRegister register; GotoFrame frame; WaitForFrame frame; GetURL2 flags; GotoFrame2 flags; With size. */
  num?: number;
  /** GotoFrame2 scene bias; WaitForFrame skip count. */
  num2?: number;
  /** GetURL url / SetTarget / GoToLabel string. */
  str?: string;
  /** GetURL target. */
  str2?: string;
  /** Set when the instruction's payload could not be decoded consistently (garbage / overrun). */
  bad?: string;
}

const textDecoder = new TextDecoder('utf-8');

/** Minimal bounded cursor (local to avoid ByteReader's alignment/bit state overhead in the hot path). */
class Cur {
  buf: Uint8Array;
  pos: number;
  end: number;
  constructor(buf: Uint8Array, pos: number, end: number) { this.buf = buf; this.pos = pos; this.end = end; }
  need(n: number): void { if (this.pos + n > this.end) throw new RangeError(`operand overrun at ${this.pos}`); }
  u8(): number { this.need(1); return this.buf[this.pos++]; }
  u16(): number { this.need(2); const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8); this.pos += 2; return v; }
  s16(): number { const v = this.u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  s32(): number {
    this.need(4);
    const b = this.buf, p = this.pos;
    this.pos += 4;
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24));
  }
  f32(): number {
    this.need(4);
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }
  /** AVM1 double: high 32-bit word first, each word little-endian. */
  avm1Double(): number {
    this.need(8);
    const tmp = new Uint8Array(8);
    tmp.set(this.buf.subarray(this.pos + 4, this.pos + 8), 0);
    tmp.set(this.buf.subarray(this.pos, this.pos + 4), 4);
    this.pos += 8;
    return new DataView(tmp.buffer).getFloat64(0, true);
  }
  str(): string {
    const start = this.pos;
    while (this.pos < this.end && this.buf[this.pos] !== 0) this.pos++;
    if (this.pos >= this.end) throw new RangeError(`unterminated string at ${start}`);
    const s = textDecoder.decode(this.buf.subarray(start, this.pos));
    this.pos++;
    return s;
  }
}

/** Names of DefineFunction2 preloadable registers in allocation order, with their flag bit. */
const PRELOAD_ORDER: ReadonlyArray<readonly [string, number, number]> = [
  // [name, preload bit, suppress bit] (bits of the 16-bit flags word as read: byte0 << 8 | byte1)
  ['this', 0x0100, 0x0200],
  ['arguments', 0x0400, 0x0800],
  ['super', 0x1000, 0x2000],
  ['_root', 0x4000, 0],
  ['_parent', 0x8000, 0],
  ['_global', 0x0001, 0],
];

export function describeFunction2Flags(flags: number): string {
  const out: string[] = [];
  if (flags & 0x8000) out.push('preloadParent');
  if (flags & 0x4000) out.push('preloadRoot');
  if (flags & 0x2000) out.push('suppressSuper');
  if (flags & 0x1000) out.push('preloadSuper');
  if (flags & 0x0800) out.push('suppressArguments');
  if (flags & 0x0400) out.push('preloadArguments');
  if (flags & 0x0200) out.push('suppressThis');
  if (flags & 0x0100) out.push('preloadThis');
  if (flags & 0x0001) out.push('preloadGlobal');
  return out.join(',');
}

/**
 * Decode one instruction at absolute `offset`. `limit` bounds the read (defaults to buffer end).
 * Never throws: malformed payloads produce an instruction with `bad` set.
 */
export function decodeInstruction(buf: Uint8Array, offset: number, limit = buf.length): Instruction {
  if (offset < 0 || offset >= limit) {
    return { offset, code: -1, name: '<out of range>', size: 1, next: offset + 1, payloadLength: 0, bad: 'offset out of range' };
  }
  const code = buf[offset];
  const name = OPCODE_NAMES[code] ?? `Unknown_0x${code.toString(16).padStart(2, '0')}`;
  if (code < 0x80) {
    const ins: Instruction = { offset, code, name, size: 1, next: offset + 1, payloadLength: 0 };
    if (!(code in OPCODE_NAMES)) ins.bad = 'unknown opcode';
    return ins;
  }
  if (offset + 3 > limit) {
    return { offset, code, name, size: 1, next: offset + 1, payloadLength: 0, bad: 'truncated header' };
  }
  const len = buf[offset + 1] | (buf[offset + 2] << 8);
  const size = 3 + len;
  const ins: Instruction = { offset, code, name, size, next: offset + size, payloadLength: len };
  if (!(code in OPCODE_NAMES)) ins.bad = 'unknown opcode';
  const end = Math.min(offset + size, limit);
  const c = new Cur(buf, offset + 3, end);
  try {
    switch (code) {
      case 0x81: ins.num = c.u16(); break; // GotoFrame
      case 0x83: ins.str = c.str(); ins.str2 = c.str(); break; // GetURL
      case 0x87: ins.num = c.u8(); break; // StoreRegister
      case 0x88: { // ConstantPool
        const n = c.u16();
        const pool: string[] = [];
        for (let i = 0; i < n; i++) pool.push(c.str());
        ins.pool = pool;
        break;
      }
      case 0x8a: ins.num = c.u16(); ins.num2 = c.u8(); break; // WaitForFrame
      case 0x8b: case 0x8c: ins.str = c.str(); break; // SetTarget, GoToLabel
      case 0x8d: ins.num2 = c.u8(); break; // WaitForFrame2
      case 0x8e: { // DefineFunction2
        const fname = c.str();
        const nParams = c.u16();
        const registerCount = c.u8();
        const b0 = c.u8(), b1 = c.u8();
        const flags = (b0 << 8) | b1;
        const params: FunctionParam[] = [];
        for (let i = 0; i < nParams; i++) {
          const register = c.u8();
          params.push({ register, name: c.str() });
        }
        const codeSize = c.u16();
        const preloaded: Array<string | undefined> = [];
        let reg = 1;
        for (const [pname, bit] of PRELOAD_ORDER) {
          if (flags & bit) preloaded[reg++] = pname;
        }
        ins.fn = { name: fname, params, codeSize, registerCount, flags, preloaded };
        break;
      }
      case 0x8f: { // Try
        const f = c.u8();
        const trySize = c.u16(), catchSize = c.u16(), finallySize = c.u16();
        const t: TryInfo = {
          trySize, catchSize, finallySize,
          catchInRegister: !!(f & 4), hasFinally: !!(f & 2), hasCatch: !!(f & 1),
        };
        if (t.catchInRegister) t.catchRegister = c.u8(); else t.catchName = c.str();
        ins.tryInfo = t;
        break;
      }
      case 0x94: ins.num = c.u16(); break; // With (block size)
      case 0x96: { // Push
        const vals: PushValue[] = [];
        while (c.pos < end) {
          const t = c.u8();
          switch (t) {
            case 0: vals.push({ t: 'string', v: c.str() }); break;
            case 1: vals.push({ t: 'float', v: c.f32() }); break;
            case 2: vals.push({ t: 'null' }); break;
            case 3: vals.push({ t: 'undefined' }); break;
            case 4: vals.push({ t: 'register', v: c.u8() }); break;
            case 5: vals.push({ t: 'boolean', v: c.u8() !== 0 }); break;
            case 6: vals.push({ t: 'double', v: c.avm1Double() }); break;
            case 7: vals.push({ t: 'integer', v: c.s32() }); break;
            case 8: vals.push({ t: 'constant', v: c.u8() }); break;
            case 9: vals.push({ t: 'constant', v: c.u16() }); break;
            default: throw new RangeError(`bad push type ${t}`);
          }
        }
        ins.push = vals;
        break;
      }
      case 0x99: case 0x9d: { // Jump, If
        const o = c.s16();
        ins.branchOffset = o;
        ins.target = offset + size + o;
        break;
      }
      case 0x9a: ins.num = c.u8(); break; // GetURL2
      case 0x9b: { // DefineFunction
        const fname = c.str();
        const nParams = c.u16();
        const params: FunctionParam[] = [];
        for (let i = 0; i < nParams; i++) params.push({ register: 0, name: c.str() });
        const codeSize = c.u16();
        ins.fn = { name: fname, params, codeSize };
        break;
      }
      case 0x9f: { // GotoFrame2
        const f = c.u8();
        ins.num = f;
        if (f & 2) ins.num2 = c.u16();
        break;
      }
      default: break;
    }
  } catch (e) {
    ins.bad = (e as Error).message;
  }
  return ins;
}

// ---------------------------------------------------------------------------------------------------------------
// Formatting helpers

/** JS-ish string literal. */
export function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + c.toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + '"';
}

/** AS2-ish number literal (integers without exponent; NaN/Infinity spelled out). */
export function numLiteral(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  if (Object.is(n, -0)) return '-0';
  return String(n);
}

/** Format a push value, resolving constant-pool references when a pool is given. */
export function formatPushValue(v: PushValue, pool?: readonly string[] | null, regNames?: ReadonlyArray<string | undefined>): string {
  switch (v.t) {
    case 'string': return quote(v.v);
    case 'float': return numLiteral(v.v) + 'f';
    case 'double': return numLiteral(v.v);
    case 'integer': return numLiteral(v.v);
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case 'boolean': return v.v ? 'true' : 'false';
    case 'register': {
      const n = regNames?.[v.v];
      return n ? `r${v.v}:${n}` : `r${v.v}`;
    }
    case 'constant': {
      if (pool && v.v < pool.length) return quote(pool[v.v]);
      return `c${v.v}?`;
    }
  }
}

/** One-line operand text for listings. */
export function formatOperands(ins: Instruction, pool?: readonly string[] | null, regNames?: ReadonlyArray<string | undefined>): string {
  switch (ins.name) {
    case 'Push': return (ins.push ?? []).map(v => formatPushValue(v, pool, regNames)).join(', ');
    case 'Jump': case 'If': return `-> ${ins.target} (${ins.branchOffset! >= 0 ? '+' : ''}${ins.branchOffset})`;
    case 'StoreRegister': {
      const n = regNames?.[ins.num!];
      return n ? `r${ins.num}:${n}` : `r${ins.num}`;
    }
    case 'ConstantPool': return `[${ins.pool!.length}] ` + ins.pool!.map(quote).join(', ');
    case 'DefineFunction': case 'DefineFunction2': {
      const f = ins.fn!;
      const ps = f.params.map(p => (p.register ? `r${p.register}:` : '') + p.name).join(', ');
      let s = `${f.name ? quote(f.name) : '<anon>'}(${ps}) size=${f.codeSize}`;
      if (ins.name === 'DefineFunction2') {
        s += ` regs=${f.registerCount} flags=[${describeFunction2Flags(f.flags!)}]`;
      }
      return s;
    }
    case 'Try': {
      const t = ins.tryInfo!;
      return `try=${t.trySize} catch=${t.catchSize} finally=${t.finallySize} ` +
        (t.catchInRegister ? `catch->r${t.catchRegister}` : `catch->${quote(t.catchName ?? '')}`);
    }
    case 'With': return `size=${ins.num}`;
    case 'GotoFrame': return String(ins.num);
    case 'GetURL': return `${quote(ins.str!)}, ${quote(ins.str2!)}`;
    case 'SetTarget': case 'GoToLabel': return quote(ins.str!);
    case 'WaitForFrame': return `${ins.num} skip ${ins.num2}`;
    case 'WaitForFrame2': return `skip ${ins.num2}`;
    case 'GetURL2': return `flags=0x${ins.num!.toString(16)}`;
    case 'GotoFrame2': return `${ins.num! & 1 ? 'play' : 'stop'}${ins.num2 !== undefined ? ' bias ' + ins.num2 : ''}`;
    default: return ins.payloadLength ? `<${ins.payloadLength} bytes>` : '';
  }
}
