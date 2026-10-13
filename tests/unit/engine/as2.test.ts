import { describe, expect, it } from 'vitest';
import { ArrayFlags, AsDict, as2Config, forIn, int, numberToString, sortOn, toAS2String, toNumber } from '../../../src/engine/flash/as2.ts';

describe('forIn (AVM1 enumeration order: reverse creation order)', () => {
  it('objects: object initialisers create properties last-to-first, so {abc, def} enumerates abc, def', () => {
    // AVM1 InitObject pops the last pair first -> creation order def, abc -> enumeration abc, def.
    // In TS the literal creates abc first, so a plain object enumerates in reverse literal order:
    expect(forIn({ abc: 1, def: 2 })).toEqual(['def', 'abc']);
    const o: Record<string, number> = {};
    o.first = 1; o.second = 2; o.third = 3;
    expect(forIn(o)).toEqual(['third', 'second', 'first']);
  });

  it('arrays: indices high to low, named keys (added after the elements) first', () => {
    const a: unknown[] & { foo?: string } = ['a', 'b', 'c'];
    expect(forIn(a)).toEqual(['2', '1', '0']);
    a.foo = 'x';
    expect(forIn(a)).toEqual(['foo', '2', '1', '0']);
    const sparse: unknown[] = [];
    sparse[5] = 1; sparse[1] = 2;
    expect(forIn(sparse)).toEqual(['5', '1']);
  });

  it('AsDict keeps creation order for integer-like keys (JS objects would sort them)', () => {
    const d = new AsDict<number>();
    d.set('t10', 1); d.set(3, 2); d.set('t2', 3); d.set(1, 4);
    expect(forIn(d)).toEqual(['1', 't2', '3', 't10']);
    d.delete(3);
    expect(forIn(d)).toEqual(['1', 't2', 't10']);
    expect(d.get('1')).toBe(4);
  });

  it('insertion mode switch', () => {
    as2Config.forInOrder = 'insertion';
    try { expect(forIn({ a: 1, b: 2 })).toEqual(['a', 'b']); } finally { as2Config.forInOrder = 'reverse-insertion'; }
  });

  it('null / primitives enumerate nothing', () => {
    expect(forIn(undefined)).toEqual([]);
    expect(forIn(null)).toEqual([]);
    expect(forIn(5)).toEqual([]);
  });
});

describe('numberToString (AVM1 formatting)', () => {
  it('15 significant digits', () => {
    expect(numberToString(0.1 + 0.2)).toBe('0.3');
    expect(numberToString(1 / 3)).toBe('0.333333333333333');
    expect(numberToString(2 / 3)).toBe('0.666666666666667');
    expect(numberToString(-1.14263966374765)).toBe('-1.14263966374765');
    expect(numberToString(Math.cos(Math.PI / 2) * 2)).toBe('1.22464679914735e-16');
    expect(numberToString(123456789.123456789)).toBe('123456789.123457');
  });

  it('integers, specials, exponent thresholds (>= 1e15, < 1e-5)', () => {
    expect(numberToString(0)).toBe('0');
    expect(numberToString(-0)).toBe('0');
    expect(numberToString(42)).toBe('42');
    expect(numberToString(-2147483648)).toBe('-2147483648');
    expect(numberToString(4294967295)).toBe('4294967295');
    expect(numberToString(123456789012345)).toBe('123456789012345');
    expect(numberToString(1e15)).toBe('1e+15');
    expect(numberToString(1.5e21)).toBe('1.5e+21');
    expect(numberToString(0.00001)).toBe('0.00001');
    expect(numberToString(0.000012345)).toBe('0.000012345');
    expect(numberToString(0.000001)).toBe('1e-6');
    expect(numberToString(-2.5e-7)).toBe('-2.5e-7');
    expect(numberToString(NaN)).toBe('NaN');
    expect(numberToString(Infinity)).toBe('Infinity');
    expect(numberToString(-Infinity)).toBe('-Infinity');
  });

  it('toAS2String', () => {
    expect(toAS2String(undefined)).toBe('undefined');
    expect(toAS2String(null)).toBe('null');
    expect(toAS2String(true)).toBe('true');
    expect(toAS2String(0.1 * 3)).toBe('0.3');
    expect('+' + toAS2String(100 * 5)).toBe('+500');
  });
});

describe('int / toNumber', () => {
  it('int truncates toward zero and wraps to int32', () => {
    expect(int(3.9)).toBe(3);
    expect(int(-3.9)).toBe(-3);
    expect(int('12.7')).toBe(12);
    expect(int(NaN)).toBe(0);
    expect(int(Infinity)).toBe(0);
    expect(int(undefined)).toBe(0);
    expect(int(3e9)).toBe(-1294967296);
    expect(int(2147483648)).toBe(-2147483648);
  });

  it('toNumber follows AVM1 (SWF6+) string rules', () => {
    expect(toNumber('12')).toBe(12);
    expect(toNumber('  12')).toBe(12);
    expect(Number.isNaN(toNumber('12  '))).toBe(true); // trailing characters fail
    expect(Number.isNaN(toNumber(''))).toBe(true);
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(Number.isNaN(toNumber('Infinity'))).toBe(true);
    expect(toNumber('0x1F')).toBe(31);
    expect(toNumber('0xFFFFFFFF')).toBe(-1);
    expect(Number.isNaN(toNumber('-0x1F'))).toBe(true); // Flash bug
    expect(toNumber('010')).toBe(8); // octal
    expect(toNumber('-010')).toBe(-8);
    expect(toNumber('08')).toBe(8);
    expect(toNumber('0')).toBe(0);
    expect(toNumber('1.5e3')).toBe(1500);
    expect(toNumber('.5')).toBe(0.5);
    expect(toNumber('5.')).toBe(5);
    expect(toNumber('1e')).toBe(1);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(Number.isNaN(toNumber(undefined))).toBe(true);
    expect(Number.isNaN(toNumber(null))).toBe(true);
    expect(toNumber({ valueOf: () => 7 })).toBe(7);
  });
});

describe('sortOn (Flash Player results from the Ruffle AVM1 corpus)', () => {
  const objs = (): { n: number }[] => [{ n: 3 }, { n: 5 }, { n: 22 }, { n: 2 }, { n: 1 }];
  const ns = (a: { n: unknown }[]): unknown[] => a.map((o) => o.n);

  it('default is a string compare and sorts in place', () => {
    const a = objs();
    expect(sortOn(a, 'n')).toBe(a);
    expect(ns(a)).toEqual([1, 2, 22, 3, 5]);
  });

  it('NUMERIC, DESCENDING', () => {
    expect(ns(sortOn(objs(), 'n', ArrayFlags.NUMERIC) as { n: number }[])).toEqual([1, 2, 3, 5, 22]);
    expect(ns(sortOn(objs(), 'n', ArrayFlags.DESCENDING) as { n: number }[])).toEqual([5, 3, 22, 2, 1]);
  });

  it('RETURNINDEXEDARRAY leaves the array untouched', () => {
    const a = objs();
    expect(sortOn(a, 'n', ArrayFlags.RETURNINDEXEDARRAY)).toEqual([4, 3, 2, 0, 1]);
    expect(ns(a)).toEqual([3, 5, 22, 2, 1]);
  });

  it('RETURNINDEXEDARRAY | NUMERIC | DESCENDING (CMap_Cell.as:340)', () => {
    const a = objs();
    expect(sortOn(a, 'n', ArrayFlags.RETURNINDEXEDARRAY | ArrayFlags.NUMERIC | ArrayFlags.DESCENDING)).toEqual([2, 1, 0, 3, 4]);
    expect(ns(a)).toEqual([3, 5, 22, 2, 1]);
    const d = [{ nDist: 1.5 }, { nDist: 10 }, { nDist: 2 }];
    expect(sortOn(d, 'nDist', ArrayFlags.RETURNINDEXEDARRAY | ArrayFlags.NUMERIC | ArrayFlags.DESCENDING)).toEqual([1, 2, 0]);
  });

  it('CASEINSENSITIVE keeps the original order of equal keys; UNIQUESORT with ties returns 0', () => {
    const a = [{ n: 'hello' }, { n: 'HELLO' }, { n: 'test' }, { n: 'TEST' }];
    expect(ns(sortOn(a, 'n', ArrayFlags.CASEINSENSITIVE) as { n: string }[])).toEqual(['hello', 'HELLO', 'test', 'TEST']);
    const u = [{ n: 'test' }, { n: 'hello' }, { n: 'TEST' }, { n: 'hello' }];
    expect(sortOn(u, 'n', ArrayFlags.UNIQUESORT)).toBe(0);
    expect(ns(u)).toEqual(['test', 'hello', 'TEST', 'hello']);
  });
});
