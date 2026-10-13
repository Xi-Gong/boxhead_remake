import { describe, expect, it } from 'vitest';
import {
  AsArr, AsObj, DataVmError, OP, numberToString, runDataScript, toAsValue,
} from '../../../tools/avm1/dataVm.ts';
import type { VmValue } from '../../../tools/avm1/dataVm.ts';

// ------------------------------------------------------------------ tiny AVM1 assembler (test-only)

type PushItem =
  | { s: string } | { f32: number } | null | undefined | { reg: number } | boolean
  | { d: number } | { i: number } | { c8: number } | { c16: number };

const utf8z = (s: string) => [...new TextEncoder().encode(s), 0];
const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

function act(code: number, payload: number[] = []): number[] {
  return code >= 0x80 ? [code, ...u16(payload.length), ...payload] : [code];
}

/** AVM1 Push type 6: IEEE double with its two little-endian 32-bit halves swapped (high word first). */
function avm1DoubleBytes(v: number): number[] {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [...b.subarray(4, 8), ...b.subarray(0, 4)];
}

function push(...items: PushItem[]): number[] {
  const p: number[] = [];
  for (const it of items) {
    if (it === null) p.push(2);
    else if (it === undefined) p.push(3);
    else if (typeof it === 'boolean') p.push(5, it ? 1 : 0);
    else if ('s' in it) p.push(0, ...utf8z(it.s));
    else if ('f32' in it) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, it.f32, true); p.push(1, ...b); }
    else if ('reg' in it) p.push(4, it.reg);
    else if ('d' in it) p.push(6, ...avm1DoubleBytes(it.d));
    else if ('i' in it) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, it.i, true); p.push(7, ...b); }
    else if ('c8' in it) p.push(8, it.c8);
    else p.push(9, ...u16(it.c16));
  }
  return act(OP.Push, p);
}

const pool = (...strings: string[]) => act(OP.ConstantPool, [...u16(strings.length), ...strings.flatMap(utf8z)]);
const asm = (...parts: number[][]) => new Uint8Array([...parts.flat(), OP.End]);
const s = (v: string) => ({ s: v });
const i = (v: number) => ({ i: v });

/** Run `code` and return the value it stored in timeline variable `r`. */
function result(...parts: number[][]): VmValue {
  return runDataScript(asm(push(s('r')), ...parts, act(OP.DefineLocal))).timeline.get('r');
}

// ------------------------------------------------------------------ tests

describe('dataVm: InitArray / InitObject ordering', () => {
  it('InitArray: the first popped element becomes index 0', () => {
    // compilers emit `[1, 2, 3]` as push 3, 2, 1, 3; InitArray
    const r = result(push(i(3), i(2), i(1), i(3)), act(OP.InitArray));
    expect(toAsValue(r)).toEqual([1, 2, 3]);
  });

  it('InitArray: nested arrays keep per-level order', () => {
    // [[1, 2], [3]] → push 3, 1(count) InitArray → [3]; push 2, 1, 2 InitArray → [1,2]; push 2 InitArray
    const r = result(
      push(i(3), i(1)), act(OP.InitArray),
      push(i(2), i(1), i(2)), act(OP.InitArray),
      push(i(2)), act(OP.InitArray),
    );
    expect(toAsValue(r)).toEqual([[1, 2], [3]]);
  });

  it('InitArray with 0 elements and InitObject with 0 properties', () => {
    expect(toAsValue(result(push({ d: 0 }), act(OP.InitArray)))).toEqual([]);
    expect(toAsValue(result(push(i(0)), act(OP.InitObject)))).toEqual({ $: [] });
  });

  it('InitObject: properties are created in pop order (last written pair first)', () => {
    // `{a: 1, b: 2, c: 3}` is emitted as push "a",1,"b",2,"c",3,3; InitObject
    const r = result(push(s('a'), i(1), s('b'), i(2), s('c'), i(3), i(3)), act(OP.InitObject));
    expect(toAsValue(r)).toEqual({ $: [['c', 3], ['b', 2], ['a', 1]] });
  });

  it('InitObject: a duplicate name keeps its first slot and takes the later-popped value, with a warning', () => {
    const vm = runDataScript(asm(
      push(s('r'), s('x'), i(1), s('y'), i(2), s('x'), i(3), i(3)), act(OP.InitObject), act(OP.DefineLocal),
    ));
    expect(toAsValue(vm.timeline.get('r'))).toEqual({ $: [['x', 1], ['y', 2]] });
    expect(vm.warnings.join()).toMatch(/duplicate property "x"/);
  });

  it('SetMember: re-assigning keeps the slot, a new name is appended', () => {
    const vm = runDataScript(asm(
      push(s('o'), s('a'), i(1), s('b'), i(2), i(2)), act(OP.InitObject), act(OP.DefineLocal), // o = {a:1, b:2} → [b, a]
      push(s('o')), act(OP.GetVariable), push(s('b'), i(20)), act(OP.SetMember), // o.b = 20
      push(s('o')), act(OP.GetVariable), push(s('z'), i(9)), act(OP.SetMember), // o.z = 9
    ));
    expect(toAsValue(vm.timeline.get('o'))).toEqual({ $: [['b', 20], ['a', 1], ['z', 9]] });
  });
});

describe('dataVm: push types and conversions', () => {
  it('decodes all Push types (constant pool, swapped-half doubles, floats, registers)', () => {
    const vm = runDataScript(asm(
      pool('zero', 'one'),
      push(s('x'), s('str'), { f32: 1.5 }, null, undefined, true, false, { d: 0.17609018126512477 }, { d: -0.5 },
        i(-7), { c8: 1 }, { c16: 0 }, i(11)),
      act(OP.InitArray), act(OP.DefineLocal),
      push(s('reg'), i(42)), act(OP.StoreRegister, [1]), act(OP.Pop), push({ reg: 1 }), act(OP.DefineLocal),
    ));
    // first popped = index 0, so the array is the push list reversed
    expect(toAsValue(vm.timeline.get('x'))).toEqual(['zero', 'one', -7, -0.5, 0.17609018126512477, false, true, null, null, 1.5, 'str']);
    expect(vm.timeline.get('reg')).toBe(42);
  });

  it('numberToString follows AS2 (15 significant digits)', () => {
    expect(numberToString(40)).toBe('40');
    expect(numberToString(0.1 + 0.2)).toBe('0.3');
    expect(numberToString(-0.88045090632562)).toBe('-0.88045090632562');
    expect(numberToString(1 / 3)).toBe('0.333333333333333');
    expect(numberToString(NaN)).toBe('NaN');
  });

  it('Add2 concatenates when either side is a string, adds numbers otherwise', () => {
    expect(result(push(s('n = '), i(40)), act(OP.Add2))).toBe('n = 40');
    expect(result(push(i(40), s('!')), act(OP.Add2))).toBe('40!');
    expect(result(push(i(2), { d: 0.5 }), act(OP.Add2))).toBe(2.5);
    expect(result(push(true, i(1)), act(OP.Add2))).toBe(2);
  });
});

describe('dataVm: variables, members, constructors and methods', () => {
  it('runs a miniature of the XSI script shape', () => {
    // var mRot = [[1,2]]; var mSet = {mRotations: mRot};
    // mItems = new Array(); _global.mXSI_Data = {mItems: mItems};
    // mItems.push({mGroupID: "G", mXSI: mSet}); trace("Items = " + _global.mXSI_Data.mItems.length); mLoaded = true;
    const vm = runDataScript(asm(
      pool('mRot', 'mSet', 'mRotations', 'mItems', 'Array', '_global', 'mXSI_Data', 'push', 'mGroupID', 'G', 'mXSI', 'Items = ', 'length', 'mLoaded'),
      push({ c8: 0 }, i(2), i(1), i(2)), act(OP.InitArray), push(i(1)), act(OP.InitArray), act(OP.DefineLocal),
      push({ c8: 1 }, { c8: 2 }, { c8: 0 }), act(OP.GetVariable), push(i(1)), act(OP.InitObject), act(OP.DefineLocal),
      push({ c8: 3 }, { d: 0 }, { c8: 4 }), act(OP.NewObject), act(OP.SetVariable),
      push({ c8: 5 }), act(OP.GetVariable), push({ c8: 6 }, { c8: 3 }, { c8: 3 }), act(OP.GetVariable), push(i(1)),
      act(OP.InitObject), act(OP.SetMember),
      push({ c8: 8 }, { c8: 9 }, { c8: 10 }, { c8: 1 }), act(OP.GetVariable), push(i(2)), act(OP.InitObject),
      push(i(1), { c8: 3 }), act(OP.GetVariable), push({ c8: 7 }), act(OP.CallMethod), act(OP.Pop),
      push({ c8: 11 }, { c8: 5 }), act(OP.GetVariable), push({ c8: 6 }), act(OP.GetMember), push({ c8: 3 }), act(OP.GetMember),
      push({ c8: 12 }), act(OP.GetMember), act(OP.Add2), act(OP.Trace),
      push({ c8: 13 }, true), act(OP.SetVariable),
    ));
    expect(vm.traces).toEqual(['Items = 1']);
    expect(vm.warnings).toEqual([]);
    expect(vm.timeline.get('mLoaded')).toBe(true);
    const data = vm.global.get('mXSI_Data') as AsObj;
    const items = data.get('mItems') as AsArr;
    expect(items).toBe(vm.timeline.get('mItems')); // same object, not a copy
    expect(toAsValue(items)).toEqual([
      { $: [['mXSI', { $: [['mRotations', [[1, 2]]]] }], ['mGroupID', 'G']] },
    ]);
    expect(vm.opcodeCounts).toMatchObject({ NewObject: 1, CallMethod: 1, Trace: 1, SetMember: 1, GetMember: 3 });
  });

  it('GetVariable reads the timeline before _global and warns on undefined names', () => {
    const vm = runDataScript(asm(
      push(s('_global')), act(OP.GetVariable), push(s('v'), s('global')), act(OP.SetMember),
      push(s('a'), s('v')), act(OP.GetVariable), act(OP.DefineLocal), // a = v  (from _global)
      push(s('v'), s('local')), act(OP.DefineLocal),
      push(s('b'), s('v')), act(OP.GetVariable), act(OP.DefineLocal), // b = v  (timeline wins)
      push(s('c'), s('nope')), act(OP.GetVariable), act(OP.DefineLocal),
    ));
    expect(vm.timeline.get('a')).toBe('global');
    expect(vm.timeline.get('b')).toBe('local');
    expect(vm.timeline.get('c')).toBeUndefined();
    expect(vm.warnings).toEqual(['GetVariable of undefined variable "nope"']);
  });

  it('new Array(n) creates n holes; Array members length and index work', () => {
    const vm = runDataScript(asm(
      push(s('h'), i(3), i(1), s('Array')), act(OP.NewObject), act(OP.DefineLocal),
      push(s('arr'), i(30), i(20), i(10), i(3)), act(OP.InitArray), act(OP.DefineLocal),
      push(s('n'), s('arr')), act(OP.GetVariable), push(s('length')), act(OP.GetMember), act(OP.DefineLocal),
      push(s('e'), s('arr')), act(OP.GetVariable), push(s('1')), act(OP.GetMember), act(OP.DefineLocal),
    ));
    expect(toAsValue(vm.timeline.get('h'))).toEqual([null, null, null]);
    expect(vm.timeline.get('n')).toBe(3);
    expect(vm.timeline.get('e')).toBe(20);
  });
});

describe('dataVm: strictness', () => {
  it('throws on opcodes outside the data subset', () => {
    expect(() => runDataScript(asm(act(0x99, [0, 0])))).toThrow(/unsupported opcode 0x99/); // Jump
    expect(() => runDataScript(asm(push(true), act(0x9d, [0, 0])))).toThrow(/unsupported opcode 0x9d/); // If
    expect(() => runDataScript(asm(push(i(1), i(2)), act(0x0a)))).toThrow(/unsupported opcode 0x0a/); // Add (SWF4)
  });

  it('throws on stack underflow, unknown constructors and methods, and paths', () => {
    expect(() => runDataScript(asm(act(OP.Pop)))).toThrow(DataVmError);
    expect(() => runDataScript(asm(push(i(0), s('Date')), act(OP.NewObject)))).toThrow(/NewObject "Date"/);
    expect(() => runDataScript(asm(push(i(0), i(0)), act(OP.InitArray), push(s('pop')), act(OP.CallMethod))))
      .toThrow(/CallMethod "pop"/);
    expect(() => runDataScript(asm(push(s('_root.x')), act(OP.GetVariable)))).toThrow(/path/);
    expect(() => runDataScript(asm(push({ c8: 0 })))).toThrow(/out of pool/);
  });

  it('stops at End and reports the offset after it', () => {
    const bytes = new Uint8Array([...push(i(1)), OP.Pop, OP.End, 0xff, 0xff]);
    const vm = runDataScript(bytes);
    expect(vm.actions).toBe(2);
    expect(vm.endOffset).toBe(bytes.length - 2);
  });
});

describe('dataVm: toAsValue', () => {
  it('maps undefined to null and counts shared references', () => {
    const shared = new AsObj();
    shared.set('k', undefined);
    const root = new AsArr([shared, shared, 'x']);
    const stats = { sharedRefs: 0 };
    expect(toAsValue(root, stats)).toEqual([{ $: [['k', null]] }, { $: [['k', null]] }, 'x']);
    expect(stats.sharedRefs).toBe(1);
  });

  it('rejects cycles', () => {
    const o = new AsObj();
    o.set('self', o);
    expect(() => toAsValue(o)).toThrow(/cyclic/);
  });
});
