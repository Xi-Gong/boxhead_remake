import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { decodeInstruction, formatOperands, OPCODE_NAMES } from '../../../tools/avm1/opcodes.ts';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH } from '../../../tools/paths.ts';
import { assemble, F2 } from './asm.ts';

describe('AVM1 opcode decoding', () => {
  it('covers the SWF <= 8 opcode set', () => {
    for (const name of ['Push', 'If', 'Jump', 'ConstantPool', 'DefineFunction2', 'DefineFunction', 'Try', 'With',
      'GotoFrame2', 'GetURL2', 'StoreRegister', 'GetTime', 'Enumerate2', 'InitObject', 'CallMethod', 'Extends',
      'ImplementsOp', 'CastOp', 'StrictEquals', 'Greater', 'StringGreater', 'InstanceOf', 'Throw', 'WaitForFrame2']) {
      expect(Object.values(OPCODE_NAMES)).toContain(name);
    }
  });

  it('decodes every Push type (AVM1 double word order, int32, constants, registers)', () => {
    const { bytes } = assemble([{ push: ['hi', { f: 1.5 }, null, undefined, { reg: 3 }, true, { d: 0.1 }, -7, { c: 2 }, { c: 300 }] }]);
    const ins = decodeInstruction(bytes, 0);
    expect(ins.name).toBe('Push');
    expect(ins.bad).toBeUndefined();
    expect(ins.push).toEqual([
      { t: 'string', v: 'hi' }, { t: 'float', v: 1.5 }, { t: 'null' }, { t: 'undefined' }, { t: 'register', v: 3 },
      { t: 'boolean', v: true }, { t: 'double', v: 0.1 }, { t: 'integer', v: -7 }, { t: 'constant', v: 2 },
      { t: 'constant', v: 300 },
    ]);
    expect(formatOperands(ins, ['a', 'b', 'c'])).toBe('"hi", 1.5f, null, undefined, r3, true, 0.1, -7, "c", c300?');
    expect(ins.size).toBe(bytes.length);
  });

  it('resolves branch targets as absolute offsets', () => {
    const { bytes, labels } = assemble([{ label: 'top' }, { op: 'Pop' }, { if: 'top' }, { jump: 'end' }, { op: 'Pop' }, { label: 'end' }]);
    const iff = decodeInstruction(bytes, 1);
    expect(iff.name).toBe('If');
    expect(iff.target).toBe(labels.top);
    expect(iff.branchOffset).toBe(-6);
    const jmp = decodeInstruction(bytes, iff.next);
    expect(jmp.target).toBe(labels.end);
    // the same bytes placed at an offset in a larger buffer give shifted absolute targets
    const big = new Uint8Array(100 + bytes.length);
    big.set(bytes, 100);
    expect(decodeInstruction(big, 101).target).toBe(100 + labels.top);
  });

  it('decodes ConstantPool, StoreRegister, DefineFunction2 registers/flags/params', () => {
    const { bytes } = assemble([
      { pool: ['_global', 'CMain'] },
      { store: 4 },
      { fn2: { name: 'f', params: [[2, 'a'], [0, 'b']], regs: 5, flags: F2.preloadThis | F2.preloadGlobal | F2.suppressArguments, body: [{ op: 'Pop' }] } },
    ]);
    const cp = decodeInstruction(bytes, 0);
    expect(cp.pool).toEqual(['_global', 'CMain']);
    const st = decodeInstruction(bytes, cp.next);
    expect(st.name).toBe('StoreRegister');
    expect(st.num).toBe(4);
    const fn = decodeInstruction(bytes, st.next);
    expect(fn.name).toBe('DefineFunction2');
    expect(fn.fn).toMatchObject({ name: 'f', registerCount: 5, codeSize: 1, params: [{ register: 2, name: 'a' }, { register: 0, name: 'b' }] });
    // preloaded registers are allocated in order this, arguments, super, _root, _parent, _global from r1
    expect(fn.fn!.preloaded).toEqual([undefined, 'this', '_global']);
    expect(formatOperands(fn)).toContain('flags=[suppressArguments,preloadThis,preloadGlobal]');
  });

  it('decodes Try, With, GotoFrame2 and GetURL2 operands', () => {
    const { bytes } = assemble([
      { raw: [0x8f, 0x09, 0x00, 0x01, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, 0x65, 0x00] }, // Try catch "e"
      { raw: [0x94, 0x02, 0x00, 0x10, 0x00] }, // With size 16
      { raw: [0x9f, 0x03, 0x00, 0x03, 0x02, 0x00] }, // GotoFrame2 play + scene bias 2
      { raw: [0x9a, 0x01, 0x00, 0x42] }, // GetURL2
    ]);
    const t = decodeInstruction(bytes, 0);
    expect(t.tryInfo).toMatchObject({ trySize: 5, catchSize: 3, finallySize: 0, hasCatch: true, catchName: 'e' });
    const w = decodeInstruction(bytes, t.next);
    expect(w.num).toBe(16);
    const g = decodeInstruction(bytes, w.next);
    expect(g).toMatchObject({ name: 'GotoFrame2', num: 3, num2: 2 });
    expect(decodeInstruction(bytes, g.next)).toMatchObject({ name: 'GetURL2', num: 0x42 });
  });

  it('flags garbage instead of throwing', () => {
    const ins = decodeInstruction(new Uint8Array([0x96, 0x05, 0x00, 0x00, 0x41]), 0); // unterminated string
    expect(ins.bad).toBeDefined();
    expect(decodeInstruction(new Uint8Array([0x01]), 0).bad).toBe('unknown opcode');
  });

  it.skipIf(!existsSync(SWF_PATH))('decodes real game bytes (Push int -1, register, constant)', () => {
    const swf = SwfFile.fromPath(SWF_PATH);
    // CScreen_SelectWorld.Setup_LevelSelection: Push -1, r1, c73 (`mcGotoFrame(this._parent.mcLevelIcons, -1)`)
    const ins = decodeInstruction(swf.data, 605994);
    expect(ins.push).toEqual([{ t: 'integer', v: -1 }, { t: 'register', v: 1 }, { t: 'constant', v: 73 }]);
    // the first DoInitAction starts with the junk function "\x01\x02" of the control-flow-flattening dispatcher
    const first = decodeInstruction(swf.data, 84494);
    expect(first).toMatchObject({ name: 'DefineFunction', fn: { name: '\x01\x02', codeSize: 9 } });
  });
});
