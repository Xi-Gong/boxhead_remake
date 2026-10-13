import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { explore } from '../../../tools/avm1/explore.ts';
import { decompile, renderTree } from '../../../tools/avm1/decompile.ts';
import { analyzeUnit, type UnitResult } from '../../../tools/avm1/unit.ts';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH } from '../../../tools/paths.ts';
import { disassembleAll, getTimerSites } from '../../../tools/disasm.ts';
import { selfCheck } from '../../../tools/avm1/selfcheck.ts';
import { assemble, F2, type Item } from './asm.ts';

const strip = (lines: string[]) => lines.map(l => l.replace(/\s+\/\/ .*$/, '').trim()).filter(Boolean);

function decompileScript(items: Item[]): string[] {
  const { bytes } = assemble(items);
  const u = analyzeUnit(bytes, { start: 0, end: bytes.length });
  return strip(renderTree(u.dec.tree, u.ctx));
}

function decompileFn(body: Item[], params: Array<[number, string]> = [], regs = 4): string[] {
  const flags = F2.suppressThis | F2.suppressArguments | F2.suppressSuper;
  const { bytes } = assemble([{ fn2: { params, regs, flags, body } }, { op: 'End' }]);
  const u = analyzeUnit(bytes, { start: 0, end: bytes.length });
  const f = u.functions[0];
  return strip(renderTree(f.dec.tree, f.ctx));
}

describe('deobfuscation of a flattened dispatcher', () => {
  // \x01 = -90 + "\x01\x02"() (junk fn returning 100) = 10; state 10 -> 15 -> 8 -> exit. Junk pushes are consumed by
  // junk If/Not; the real statements live in the cases.
  const prog: Item[] = [
    { fn: { name: '\x01\x02', params: [], body: [{ push: [100] }, { op: 'Return' }] } },
    { push: ['\x01', -90, 0, '\x01\x02'] }, { op: 'CallFunction' }, { op: 'Add2' }, { op: 'DefineLocal' },
    { label: 'head' },
    { push: ['\x01'] }, { op: 'GetVariable' }, { push: [10] }, { op: 'Equals' }, { op: 'Not' }, { if: 'c2' },
    { push: ['\x01', '\x01'] }, { op: 'GetVariable' }, { push: [5] }, { op: 'Add' }, { op: 'SetVariable' },
    { push: [true] }, // junk, consumed by the If in the next case
    { jump: 'head' },
    { label: 'c2' },
    { push: ['\x01'] }, { op: 'GetVariable' }, { push: [15] }, { op: 'Equals' }, { op: 'Not' }, { if: 'c3' },
    { push: ['\x01', '\x01'] }, { op: 'GetVariable' }, { push: [7] }, { op: 'Subtract' }, { op: 'SetVariable' },
    { if: 'skip' }, // opaque: always taken (junk true)
    { push: ['dead', 'code'] }, { op: 'SetVariable' },
    { label: 'skip' },
    { push: ['_global'] }, { op: 'GetVariable' }, { push: ['x', 42] }, { op: 'SetMember' },
    { jump: 'head' },
    { label: 'c3' },
    { push: ['\x01'] }, { op: 'GetVariable' }, { push: [8] }, { op: 'Equals' }, { op: 'Not' }, { if: 'head' },
    // real conditional: if (foo) { bar(); }
    { push: ['foo'] }, { op: 'GetVariable' }, { op: 'Not' }, { if: 'end' },
    { push: [0, 'bar'] }, { op: 'CallFunction' }, { op: 'Pop' },
    { label: 'end' },
    { op: 'End' },
  ];

  it('folds the dispatcher, junk function and opaque predicates', () => {
    const { bytes } = assemble(prog);
    const ex = explore(bytes, { start: 0, end: bytes.length, mode: 'script' });
    expect([...ex.obfVars].sort()).toEqual(['\x01', '\x01\x02']);
    const lines = strip(renderTree(decompile(ex).tree, { regName: n => `r${n}`, fnName: o => `f${o}` }));
    expect(lines).toEqual(['_global.x = 42;', 'if (foo) {', 'bar();', '}', 'end;']);
  });
});

describe('structuring', () => {
  it('recovers a for loop with a register counter', () => {
    const lines = decompileFn([
      { push: [0] }, { store: 1 }, { op: 'Pop' },
      { label: 'L' }, { push: [{ reg: 1 }, 10] }, { op: 'Less2' }, { op: 'Not' }, { if: 'E' },
      { push: [{ reg: 1 }] }, { op: 'Trace' },
      { push: [{ reg: 1 }] }, { op: 'Increment' }, { store: 1 }, { op: 'Pop' },
      { jump: 'L' },
      { label: 'E' },
    ]);
    expect(lines).toEqual(['for (_loc1_ = 0; _loc1_ < 10; _loc1_++) {', 'trace(_loc1_);', '}']);
  });

  it('recovers && / ternary values and if/else', () => {
    const lines = decompileFn([
      // r2 = a && b
      { push: ['a'] }, { op: 'GetVariable' }, { op: 'PushDuplicate' }, { op: 'Not' }, { if: 'J' },
      { op: 'Pop' }, { push: ['b'] }, { op: 'GetVariable' },
      { label: 'J' }, { store: 2 }, { op: 'Pop' },
      // r3 = c ? 1 : undefined   (one arm pushes a literal: needs join widening)
      { push: ['c'] }, { op: 'GetVariable' }, { if: 'T' }, { push: [undefined] }, { jump: 'E' },
      { label: 'T' }, { push: [1] },
      { label: 'E' }, { store: 3 }, { op: 'Pop' },
      // if (r2) { trace(1) } else { trace(2) }
      { push: [{ reg: 2 }] }, { op: 'Not' }, { if: 'ELSE' }, { push: [1] }, { op: 'Trace' }, { jump: 'END' },
      { label: 'ELSE' }, { push: [2] }, { op: 'Trace' },
      { label: 'END' },
    ]);
    expect(lines).toEqual([
      '_loc2_ = a && b;', '_loc3_ = !c ? undefined : 1;',
      'if (_loc2_) {', 'trace(1);', '} else {', 'trace(2);', '}',
    ]);
  });

  it('recovers for..in and switch', () => {
    const lines = decompileScript([
      { push: ['o'] }, { op: 'GetVariable' }, { op: 'Enumerate2' },
      { label: 'L' }, { store: 0 }, { push: [null] }, { op: 'Equals2' }, { if: 'E' },
      { push: ['k', { reg: 0 }] }, { op: 'DefineLocal' },
      { push: ['k'] }, { op: 'GetVariable' }, { op: 'Trace' },
      { jump: 'L' },
      { label: 'E' },
      { push: ['x'] }, { op: 'GetVariable' }, { store: 0 }, { push: ['a'] }, { op: 'StrictEquals' }, { if: 'CA' },
      { push: [{ reg: 0 }, 'b'] }, { op: 'StrictEquals' }, { if: 'CB' }, { jump: 'END' },
      { label: 'CA' }, { push: [1] }, { op: 'Trace' }, { jump: 'END' },
      { label: 'CB' }, { push: [2] }, { op: 'Trace' },
      { label: 'END' }, { op: 'End' },
    ]);
    expect(lines).toEqual([
      'for (k in o) {', 'trace(k);', '}',
      'switch (x) {', 'case "a":', 'trace(1);', 'break;', 'case "b":', 'trace(2);', '}',
      'end;',
    ]);
  });
});

describe.skipIf(!existsSync(SWF_PATH))('real game bytecode', () => {
  const swf = SwfFile.fromPath(SWF_PATH);
  const entries = disassembleAll(swf);
  const byClass = new Map(entries.filter(e => e.unit.classPath).map(e => [e.unit.classPath!, e]));
  const fn = (cls: string, name: string) => {
    const u = byClass.get(cls)!.unit;
    const f = u.functions.find(x => x.name === name)!;
    return { f, lines: strip(renderTree(f.dec.tree, f.ctx)) };
  };

  it('names one unit per class (114 classes)', () => {
    expect(byClass.size).toBe(114);
    for (const c of ['CMain', 'Thing.Creature.CThing_Creature_Player', 'World.Init.CWorld_Init_Piece', 'scidd.Math.CLine']) {
      expect(byClass.has(c)).toBe(true);
    }
  });

  it('CMain.ProcessFrames: getTimer() where ffdec printed 3858 / 7786', () => {
    const { lines } = fn('CMain', 'CMain.prototype.ProcessFrames');
    expect(lines).toEqual([
      'if (this.mSingleFrame) {', 'this.mTimeSlice = getTimer();', 'return 1;', '}',
      '_loc3_ = 1000 / tFrameRate;',
      'this.mTimeSlice = this.mTimeSlice != undefined ? this.mTimeSlice : getTimer();',
      '_loc2_ = Math.floor((getTimer() - this.mTimeSlice) / _loc3_);',
      'if (_loc2_ > 0) {',
      'this.mTimeSlice = this.mTimeSlice + _loc2_ * _loc3_;',
      '_loc2_ = _loc2_ <= this.mFrameCap ? _loc2_ : this.mFrameCap;',
      'return _loc2_;', '}', 'return 0;',
    ]);
  });

  it('CMain.Process: `7120;` is `_loc5_ = getTimer();` and the tick loop is a for loop', () => {
    const { lines } = fn('CMain', 'CMain.prototype.Process');
    expect(lines[0]).toBe('_loc5_ = getTimer();');
    expect(lines).toContain('for (_loc3_ = _loc4_; _loc3_; _loc3_--) {');
    expect(lines).toContain('this.fState(_loc3_ == 1);');
  });

  it('CThing_Angle.Create_LookupTables: both loop counters recovered', () => {
    const { lines } = fn('Thing.Math.CThing_Angle', 'Thing.Math.CThing_Angle.Create_LookupTables');
    expect(lines).toContain('for (_loc2_ = 32; _loc2_; _loc2_--) {');
    expect(lines).toContain('for (_loc1_ = 255; _loc1_ >= 0; _loc1_--) {');
    expect(lines).toContain('Thing.Math.CThing_Angle.mLookup256[_loc2_][_loc1_] = Math.round(_loc1_ / (256 / _loc2_)) % _loc2_;');
  });

  it('known semantic hotspots', () => {
    expect(fn('Thing.Creature.CThing_Creature_Player', 'Thing.Creature.CThing_Creature_Player.prototype.InitWeapons').lines.join('\n'))
      .toContain('mKeyID:(_loc2_ + 1) % 10');
    expect(fn('Thing.Creature.CThing_Creature', 'Thing.Creature.CThing_Creature.prototype.State_EnterMap_Init').lines)
      .toContain('for (_loc2_ = 0; _loc2_ < 8; _loc2_ += 2) {');
    expect(fn('World.Map.CMap_Cell', 'World.Map.CMap_Cell.Nav_Update').lines)
      .toContain('for (_loc3_ = 0; _loc3_ < 5 && World.Map.CMap_Cell.nList.length; _loc3_++) {');
    const bh = fn('Thing.Creature.CThing_Creature', 'Thing.Creature.CThing_Creature.prototype.State_BulletHit').lines;
    // the kill block is only reached when the collision result is NaN
    expect(bh.indexOf('this.SetState("State_Dying");')).toBeGreaterThan(bh.lastIndexOf('return;'));
  });

  it('every getTimer opcode is reported (40)', () => {
    const sites = getTimerSites(entries);
    expect(sites.reduce((a, s) => a + s.opcodes.length, 0)).toBe(40);
    expect(sites.every(s => s.opcodes.length >= 1)).toBe(true);
  });

  it('self-check: every side-effecting instruction appears in the output', () => {
    let checked = 0;
    const missing: string[] = [];
    const run = (u: UnitResult) => {
      const r = selfCheck(u.explored, u.dec.tree, u.ctx);
      checked += r.checked;
      missing.push(...r.missing.map(m => `${m.op}@${m.offset}`));
      for (const f of u.functions) {
        const rf = selfCheck(f.explored, f.dec.tree, f.ctx);
        checked += rf.checked;
        missing.push(...rf.missing.map(m => `${f.name}:${m.op}@${m.offset}`));
      }
    };
    for (const e of entries) if (!e.file.startsWith('sprite_755')) run(e.unit);
    expect(checked).toBeGreaterThan(4500);
    expect(missing).toEqual([]);
  });

  it('no goto and no lost control flow in any class', () => {
    for (const e of entries) {
      if (e.source.kind !== 'initaction') continue;
      const all = [e.unit, ...e.unit.functions].map(x => renderTree(x.dec.tree, x.ctx).join('\n')).join('\n');
      expect(all, e.file).not.toMatch(/\bgoto L|control flow lost|<obfuscator value>|<junk function>/);
    }
  });
});
