// src/engine/flash/as2.ts (lane C) vs Flash Player 32 goldens P1 (for..in), P6 (number -> string), P7 (conversions).
// Live where the engine already agrees; `it.fails` = measured deviation, TODO for the owning lane (flip to `it` once
// fixed — vitest then reports the test as passing).
import { describe, expect, it } from 'vitest';
import { AsDict, forIn, int, numberToString, toNumber, ushr } from '../../../src/engine/flash/as2.ts';
import { golden } from './golden.ts';
import { P6_CASES, P7_CASES, caseKey } from '../../../tools/oracle/probes/p6_p7_numbers.ts';

const P1 = () => golden('p1_forin').results;
const keys = (k: string): string => P1()[k]!.split('|')[0]!;

describe('P1 for..in order (engine forIn)', () => {
  it('objects: reverse creation order (successive SetMember)', () => {
    const o: Record<string, number> = {}; o.a = 1; o.b = 2; o.c = 3;
    expect(forIn(o).join(',')).toBe(keys('setMember_abc'));
  });
  it('AsDict: delete + re-add moves the key to the front; overwrite keeps its place; integer-like keys are not reordered', () => {
    const d = new AsDict(); d.set('a', 1); d.set('b', 2); d.set('c', 3); d.delete('b');
    expect(forIn(d).join(',')).toBe(keys('delete_b'));
    d.set('b', 4); expect(forIn(d).join(',')).toBe(keys('delete_b_readd'));
    d.set('a', 5); expect(forIn(d).join(',')).toBe(keys('overwrite_a'));
    const n = new AsDict(); for (const k of ['3', '1', '2', '10', 'x', '0']) n.set(k, 1);
    expect(forIn(n).join(',')).toBe(keys('numericKeys'));
    const t = new AsDict(); for (let i = 1; i <= 12; i++) t.set('t' + i, i);
    expect(forIn(t).join(',')).toBe(keys('t1_t12'));
    const big = new AsDict(); for (let i = 0; i < 300; i++) big.set('t' + (i * 7 % 300), i);
    expect(forIn(big).join(',')).toBe(keys('t_300_scrambled'));
  });
  it('arrays built by push / literal / ascending index assignment enumerate indices high -> low, named props first', () => {
    expect(forIn([10, 20, 30]).join(',')).toBe(keys('initArray_3'));
    const a: any[] = []; for (let i = 0; i < 12; i++) a.push(i);
    expect(forIn(a).join(',')).toBe(keys('push_12'));
    const b: any = [1, 2, 3]; b.foo = 1; b.bar = 2;
    expect(forIn(b).join(',')).toBe(keys('push_3_named'));
    const c: any = []; c.t5 = 1; c.t3 = 2; c.t9 = 3;
    expect(forIn(c).join(',')).toBe(keys('array_named_only'));
  });
  it('porting rule: an AS2 object LITERAL {a, b, c} enumerates a, b, c (InitObject creates the pairs last-to-first)', () => {
    // AS2 `{a:1, b:2, c:3}` must be ported with the keys in REVERSE order (or built by assignment c, b, a) so that
    // forIn() yields Flash's order.
    expect(forIn({ c: 3, b: 2, a: 1 }).join(',')).toBe(keys('initObject_abc'));
    expect(keys('initObject_dupkey')).toBe('b,a'); // {a:1, b:2, a:3}: value of a is 1 (the FIRST pair wins)
    expect(P1()['initObject_dupkey']).toBe('b,a|a=1');
  });
  // KNOWN LIMITATION (documented in as2.ts, decided by the oracle-fix lane): AVM1 arrays enumerate in reverse CREATION
  // order of their properties, not index order; a JS array cannot record that. Only arrays filled out of index order
  // differ, and the audit of every forIn() in src/game found none that is enumerated (use AsDict if one ever is).
  it.fails('arrays filled out of order (sparse / descending index / interleaved named props) — known limitation', () => {
    const s: any[] = []; s[5] = 1; s[2] = 1; s[0] = 1;
    expect(forIn(s).join(',')).toBe(keys('sparse_5_2_0'));
  });
  // KNOWN LIMITATION (documented in as2.ts): no enumerated game object relies on visible (AS1-style) prototype members.
  it.fails('enumerable prototype members are listed BEFORE own members — known limitation (game classes hide prototypes)', () => {
    function D(this: any) { this.i1 = 1; }
    D.prototype.dm = function () {}; D.prototype.dv = 1;
    const dd = new (D as any)(); dd.i2 = 2;
    expect(forIn(dd).join(',')).toBe(keys('proto_visible'));
  });
  it('documents the AS2 class-instance and movie-clip orders', () => {
    expect(keys('class_instance')).toBe('inst2,inst1'); // ASSetPropFlags-hidden prototype members are not listed
    expect(keys('movieclip')).toBe('v2,v1,ch2,ch1,ch0,chNeg'); // variables (reverse creation), then children by DESCENDING depth
    expect(keys('mutate_during_delete_unvisited')).toBe('abc'); // keys are snapshotted before the loop
  });
});

const evalJs = (e: string): unknown => Function(`return (${e})`)();

describe('P6 numberToString', () => {
  const g = () => golden('p6_numtostr').results;
  // Flash prints 15 significant digits; for |x| >= ~1e200 its digit generation is imprecise, and for 999999999999999.9
  // it chooses fixed notation from the UNROUNDED exponent. -0 does not exist in AVM1 (1/-0 is +Infinity).
  const KNOWN = new Set(['999999999999999.9', '1.7976931348623157e308', '1e300*10', '1e200', '1e300', '1/(0*-1)', '1/-0', '1/(-1e-300*1e-300)']);
  const numeric = P6_CASES.filter(([, e]) => !/toString|String|Number\(/.test(e));
  for (const [k, e] of numeric) {
    if (KNOWN.has(k)) continue;
    it(`String(${k}) = ${g()[k]}`, () => { expect(numberToString(evalJs(e) as number)).toBe(g()[k]); });
  }
  // [ORACLE P6] fixed by lane O-fix (notation from the unrounded exponent, digits from the 15-digit rounding).
  it('999999999999999.9 prints "1000000000000000" (notation chosen before rounding)', () => {
    expect(numberToString(999999999999999.9)).toBe(g()['999999999999999.9']);
  });
  it('documents the imprecise huge-exponent digits (irrelevant for the game)', () => {
    expect(g()['1e300']).toBe('9.99999999999999e+299');
    expect(g()['1/-0']).toBe('Infinity');
  });
});

describe('P7 conversions', () => {
  const g = () => golden('p7_math').results;
  for (const [k, e] of P7_CASES) {
    const m = /^Number\((".*")\)$/.exec(e);
    if (m) it(`toNumber: ${k} = ${g()[caseKey(k)]}`, () => { expect(numberToString(toNumber(JSON.parse(m[1]!)))).toBe(g()[caseKey(k)]); });
    const mi = /^int\((.*)\)$/.exec(e);
    if (mi) it(`int: ${k} = ${g()[caseKey(k)]}`, () => { expect(numberToString(int(evalJs(mi[1]!)))).toBe(g()[caseKey(k)]); });
  }
  it('documents AVM1 operator semantics the port relies on', () => {
    const r = g();
    expect(r['round(-2.5)']).toBe('-2'); // Math.round = floor(x + 0.5)
    expect(r['round(0.49999999999999994)']).toBe('1'); // unlike JS Math.round (0)
    expect(r['-1>>>0']).toBe('-1'); // >>> result is converted back to int32!
    expect(numberToString(ushr(-1, 0))).toBe(r['-1>>>0']); // engine helper as2.ushr [ORACLE P7]
    expect(numberToString(ushr(-1, 1))).toBe(r['-1>>>1']);
    expect(r['-1>>>1']).toBe('2147483647');
    expect(r['1e10|0']).toBe('1410065408'); // ToInt32 is modular
    expect(r['"a"<1']).toBe('undefined'); // comparisons involving NaN yield undefined
    expect(r['1 le NaN']).toBe('true'); // a <= b is compiled as !(a > b)
    expect(r['null*1']).toBe('NaN');
    expect(r['undefined+"x"']).toBe('undefinedx');
    expect(r['parseInt("123",0)']).toBe('NaN');
  });
});
