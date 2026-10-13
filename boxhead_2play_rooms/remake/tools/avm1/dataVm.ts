/**
 * Minimal AVM1 evaluator for straight-line "data" scripts (lane B2).
 *
 * Built for sprite 755's 4.6 MB DoAction (the Softimage XSI character data), which only uses branch-free opcodes to
 * build nested object/array literals and `_global.mXSI_Data`. Semantics follow the SWF File Format Specification v19
 * (AVM1 chapter) and Flash Player behaviour for SWF 8:
 *
 *  - Objects record property CREATION order (insertion into an ordered Map). Re-assigning an existing property keeps
 *    its slot; only a new name is appended. AS2 `for..in` enumeration order is derived from this order (the exact
 *    mapping creation order -> for..in order is a runtime question; see generated/reports/xsi-summary.md).
 *  - InitArray (0x42): pops `count`, then `count` elements; the FIRST popped element becomes index 0
 *    (compilers push array literal elements in reverse).
 *  - InitObject (0x43): pops `count`, then `count` (value, name) pairs, creating the properties in pop order: the
 *    LAST pair pushed (= last property in the source literal) is created FIRST.
 *  - NewObject (0x40): pops name, argc, args (first popped = first argument); only `Object` and `Array`.
 *  - CallMethod (0x52): pops method name, object, argc, args; only `Array.prototype.push`.
 *  - DefineLocal / SetVariable at frame level write into the timeline (the clip running the script); GetVariable
 *    reads the timeline, then `_global` (and the special name `_global`).
 *
 * Any opcode, push type, or member access outside this subset throws, so new constructs are noticed instead of being
 * silently mis-evaluated.
 */
import { ByteReader } from '../swf/ByteReader.ts';
import type { AsObject, AsValue } from '../../src/shared/assetSchema.ts';

// Own minimal opcode table (tools/avm1/opcodes.ts belongs to lane B1).
export const OP = {
  End: 0x00,
  SetVariable: 0x1d,
  GetVariable: 0x1c,
  Pop: 0x17,
  Trace: 0x26,
  DefineLocal: 0x3c,
  NewObject: 0x40,
  InitArray: 0x42,
  InitObject: 0x43,
  Add2: 0x47,
  GetMember: 0x4e,
  SetMember: 0x4f,
  CallMethod: 0x52,
  StoreRegister: 0x87,
  ConstantPool: 0x88,
  Push: 0x96,
} as const;

const OP_NAMES: Record<number, string> = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

/** An AS2 object: properties in creation order. */
export class AsObj {
  readonly props = new Map<string, VmValue>();
  get(name: string): VmValue { return this.props.get(name); }
  set(name: string, v: VmValue): void { this.props.set(name, v); }
}

/** An AS2 Array (dense; holes are `undefined`). */
export class AsArr {
  items: VmValue[];
  constructor(items: VmValue[] = []) { this.items = items; }
}

export type VmValue = undefined | null | boolean | number | string | AsObj | AsArr;

export class DataVmError extends Error {}

export interface DataVmOptions {
  /** Abort after this many executed actions (safety net). Default 10 million. */
  maxActions?: number;
  /** Pre-existing `_global` object (default: a fresh one). */
  global?: AsObj;
}

export interface DataVmResult {
  global: AsObj;
  /** The timeline (frame-level variable scope) the script ran in. */
  timeline: AsObj;
  /** Strings passed to trace(), in order. */
  traces: string[];
  /** Non-fatal oddities (e.g. reads of undefined variables, duplicate names in InitObject). */
  warnings: string[];
  /** Number of executed actions (End excluded). */
  actions: number;
  /** Executed action count per opcode name. */
  opcodeCounts: Record<string, number>;
  /** Offset (relative to the script start) just past the End action, or the script length. */
  endOffset: number;
}

// ------------------------------------------------------------------ conversions (SWF 7+ rules)

/** ECMA-262 ToNumber as AVM1 (SWF7+) does it for primitives. */
export function toNumber(v: VmValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return NaN;
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    return Number(s);
  }
  throw new DataVmError('ToNumber of an object is not supported by the data VM');
}

/** AS2 number -> string (Flash prints up to 15 significant digits). */
export function numberToString(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (n === 0) return '0';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = n.toPrecision(15);
  if (s.includes('e')) {
    const [m, e] = s.split('e');
    const mm = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    return `${mm}e${e}`;
  }
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** ToString as AVM1 (SWF7+) does it. */
export function toStr(v: VmValue): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (v instanceof AsArr) return v.items.map((x) => (x === undefined || x === null ? '' : toStr(x))).join(',');
  return '[object Object]';
}

function toCount(v: VmValue, what: string): number {
  const n = toNumber(v);
  if (!Number.isInteger(n) || n < 0) throw new DataVmError(`${what}: bad element count ${String(v)}`);
  return n;
}

function arrayIndex(name: string): number | undefined {
  return /^(0|[1-9][0-9]*)$/.test(name) ? Number(name) : undefined;
}

// ------------------------------------------------------------------ interpreter

/**
 * Execute a straight-line AVM1 action list (DoAction body) and return the resulting `_global`/timeline state.
 * `bytes` is the action record list (starting with the first action code).
 */
export function runDataScript(bytes: Uint8Array, opts: DataVmOptions = {}): DataVmResult {
  const maxActions = opts.maxActions ?? 10_000_000;
  const global = opts.global ?? new AsObj();
  const timeline = new AsObj();
  const traces: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const registers: VmValue[] = [undefined, undefined, undefined, undefined];
  let pool: string[] = [];
  const stack: VmValue[] = [];
  const r = new ByteReader(bytes);
  let actions = 0;
  let endOffset = bytes.length;

  const pop = (): VmValue => {
    // AVM1 pops `undefined` from an empty stack; for a data script that is always a bug in our understanding.
    if (stack.length === 0) throw new DataVmError(`stack underflow at action #${actions}`);
    return stack.pop();
  };

  const getVariable = (name: string): VmValue => {
    if (/[./:]/.test(name)) throw new DataVmError(`GetVariable with a path is not supported: ${name}`);
    if (name === '_global') return global;
    if (timeline.props.has(name)) return timeline.get(name);
    if (global.props.has(name)) return global.get(name);
    warnings.push(`GetVariable of undefined variable "${name}"`);
    return undefined;
  };

  const setTimelineVar = (name: string, v: VmValue, op: string): void => {
    if (/[./:]/.test(name)) throw new DataVmError(`${op} with a path is not supported: ${name}`);
    timeline.set(name, v);
  };

  const getMember = (obj: VmValue, name: string): VmValue => {
    if (obj instanceof AsArr) {
      if (name === 'length') return obj.items.length;
      const i = arrayIndex(name);
      if (i !== undefined) return obj.items[i];
      throw new DataVmError(`GetMember: unsupported Array member "${name}"`);
    }
    if (obj instanceof AsObj) return obj.get(name);
    if (typeof obj === 'string' && name === 'length') return obj.length;
    throw new DataVmError(`GetMember "${name}" on ${toStr(obj)} is not supported`);
  };

  const setMember = (obj: VmValue, name: string, v: VmValue): void => {
    if (obj instanceof AsArr) {
      const i = arrayIndex(name);
      if (i !== undefined) {
        while (obj.items.length < i) obj.items.push(undefined);
        obj.items[i] = v;
        return;
      }
      if (name === 'length') { obj.items.length = toCount(v, 'Array.length'); return; }
      throw new DataVmError(`SetMember: unsupported Array member "${name}"`);
    }
    if (obj instanceof AsObj) { obj.set(name, v); return; }
    throw new DataVmError(`SetMember "${name}" on ${toStr(obj)} is not supported`);
  };

  while (!r.eof) {
    const at = r.pos;
    const code = r.u8();
    if (code === OP.End) { endOffset = r.pos; break; }
    if (++actions > maxActions) throw new DataVmError(`more than ${maxActions} actions`);
    const name = OP_NAMES[code];
    if (name === undefined) {
      throw new DataVmError(`unsupported opcode 0x${code.toString(16).padStart(2, '0')} at offset ${at}`);
    }
    counts[name] = (counts[name] ?? 0) + 1;
    let a: ByteReader | undefined;
    if (code >= 0x80) a = r.sub(r.u16());

    switch (code) {
      case OP.ConstantPool: {
        const n = a!.u16();
        pool = [];
        for (let i = 0; i < n; i++) pool.push(a!.string());
        break;
      }
      case OP.Push: {
        while (!a!.eof) {
          const type = a!.u8();
          switch (type) {
            case 0: stack.push(a!.string()); break;
            case 1: stack.push(a!.f32()); break;
            case 2: stack.push(null); break;
            case 3: stack.push(undefined); break;
            case 4: {
              const reg = a!.u8();
              if (reg >= registers.length) throw new DataVmError(`Push register ${reg} out of range at ${at}`);
              stack.push(registers[reg]);
              break;
            }
            case 5: stack.push(a!.u8() !== 0); break;
            case 6: stack.push(a!.avm1Double()); break;
            case 7: stack.push(a!.s32()); break;
            case 8:
            case 9: {
              const idx = type === 8 ? a!.u8() : a!.u16();
              if (idx >= pool.length) throw new DataVmError(`constant ${idx} out of pool (${pool.length}) at ${at}`);
              stack.push(pool[idx]);
              break;
            }
            default: throw new DataVmError(`unsupported Push type ${type} at offset ${at}`);
          }
        }
        break;
      }
      case OP.StoreRegister: {
        const reg = a!.u8();
        if (reg >= registers.length) throw new DataVmError(`StoreRegister ${reg} out of range at ${at}`);
        if (stack.length === 0) throw new DataVmError(`StoreRegister on empty stack at ${at}`);
        registers[reg] = stack[stack.length - 1];
        break;
      }
      case OP.Pop: pop(); break;
      case OP.InitArray: {
        const n = toCount(pop(), 'InitArray');
        const items: VmValue[] = new Array(n);
        for (let i = 0; i < n; i++) items[i] = pop(); // first popped = index 0
        stack.push(new AsArr(items));
        break;
      }
      case OP.InitObject: {
        const n = toCount(pop(), 'InitObject');
        const o = new AsObj();
        for (let i = 0; i < n; i++) {
          const v = pop();
          const k = toStr(pop());
          if (o.props.has(k)) warnings.push(`InitObject: duplicate property "${k}" at offset ${at}`);
          o.set(k, v); // creation order = pop order
        }
        stack.push(o);
        break;
      }
      case OP.NewObject: {
        const ctor = toStr(pop());
        const argc = toCount(pop(), 'NewObject');
        const args: VmValue[] = [];
        for (let i = 0; i < argc; i++) args.push(pop());
        if (ctor === 'Object') {
          if (argc !== 0) throw new DataVmError('new Object(args) is not supported');
          stack.push(new AsObj());
        } else if (ctor === 'Array') {
          if (argc === 1 && typeof args[0] === 'number') {
            const len = toCount(args[0], 'new Array(n)');
            stack.push(new AsArr(new Array<VmValue>(len).fill(undefined)));
          } else stack.push(new AsArr(args));
        } else throw new DataVmError(`NewObject "${ctor}" is not supported`);
        break;
      }
      case OP.CallMethod: {
        const method = pop();
        const obj = pop();
        const argc = toCount(pop(), 'CallMethod');
        const args: VmValue[] = [];
        for (let i = 0; i < argc; i++) args.push(pop());
        if (method === undefined || method === '') throw new DataVmError('calling a function value is not supported');
        const m = toStr(method);
        if (obj instanceof AsArr && m === 'push') {
          obj.items.push(...args);
          stack.push(obj.items.length);
        } else throw new DataVmError(`CallMethod "${m}" on ${toStr(obj)} is not supported`);
        break;
      }
      case OP.DefineLocal: {
        const v = pop();
        setTimelineVar(toStr(pop()), v, 'DefineLocal');
        break;
      }
      case OP.SetVariable: {
        const v = pop();
        setTimelineVar(toStr(pop()), v, 'SetVariable');
        break;
      }
      case OP.GetVariable: stack.push(getVariable(toStr(pop()))); break;
      case OP.GetMember: {
        const k = toStr(pop());
        stack.push(getMember(pop(), k));
        break;
      }
      case OP.SetMember: {
        const v = pop();
        const k = toStr(pop());
        setMember(pop(), k, v);
        break;
      }
      case OP.Add2: {
        const b = pop();
        const x = pop();
        if (typeof x === 'object' && x !== null) throw new DataVmError('Add2 on an object is not supported');
        if (typeof b === 'object' && b !== null) throw new DataVmError('Add2 on an object is not supported');
        stack.push(typeof x === 'string' || typeof b === 'string' ? toStr(x) + toStr(b) : toNumber(x) + toNumber(b));
        break;
      }
      case OP.Trace: traces.push(toStr(pop())); break;
      default:
        throw new DataVmError(`unsupported opcode 0x${code.toString(16)} at offset ${at}`);
    }
  }
  if (stack.length !== 0) warnings.push(`${stack.length} value(s) left on the stack at the end`);
  return { global, timeline, traces, warnings, actions, opcodeCounts: counts, endOffset };
}

// ------------------------------------------------------------------ export to the xsi.json value model

export interface ToAsValueStats {
  /** Objects/arrays reached more than once (serialized as independent copies). */
  sharedRefs: number;
}

/**
 * Convert a VM value to the JSON value model of assetSchema.ts (`AsValue`): objects become `{ $: [[name, value], ...] }`
 * in creation order, arrays plain arrays, `undefined` becomes `null`. Cycles throw. Objects reachable more than once
 * are serialized once per path (counted in `stats.sharedRefs`).
 */
export function toAsValue(v: VmValue, stats: ToAsValueStats = { sharedRefs: 0 }): AsValue {
  const seen = new Set<AsObj | AsArr>();
  const onPath = new Set<AsObj | AsArr>();
  const conv = (x: VmValue): AsValue => {
    if (x === undefined || x === null) return null;
    if (typeof x !== 'object') return x;
    if (onPath.has(x)) throw new DataVmError('cyclic structure cannot be serialized');
    if (seen.has(x)) stats.sharedRefs++;
    seen.add(x);
    onPath.add(x);
    let out: AsValue;
    if (x instanceof AsArr) out = x.items.map(conv);
    else {
      const o: AsObject = { $: [] };
      for (const [k, val] of x.props) o.$.push([k, conv(val)]);
      out = o;
    }
    onPath.delete(x);
    return out;
  };
  return conv(v);
}
