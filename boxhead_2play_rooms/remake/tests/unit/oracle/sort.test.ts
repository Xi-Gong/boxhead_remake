// P9: Flash's Array.sort/sortOn order. tools/oracle/flashSort.ts reproduces every measured result; the engine's
// sortOn (src/engine/flash/as2.ts, lane C) is compared on the World/Map/CMap_Cell.Nav_Direction case.
import { describe, expect, it } from 'vitest';
import { SORT_FLAGS, flashSortPermutation, flashSortWith } from '../../../tools/oracle/flashSort.ts';
import { forIn, sortArray, sortOn, toAS2String } from '../../../src/engine/flash/as2.ts';
import { golden } from './golden.ts';

const R = () => golden('p9_sort').results;
const NAV_FLAGS = SORT_FLAGS.RETURNINDEXEDARRAY | SORT_FLAGS.NUMERIC | SORT_FLAGS.DESCENDING;
const VALS = [undefined, 0, 1, 2];
const VALS3 = [undefined, 0, 1];
const navVals = (c: number) => Array.from({ length: 8 }, (_, i) => VALS[(c >> (2 * i)) & 3]);
const navExpected = (c: number) => R()[`nav.${c >> 8}`]!.substr((c & 255) * 8, 8);

describe('P9 reference model (tools/oracle/flashSort.ts)', () => {
  it('flags as Flash defines them', () => { expect(R().flags).toBe('26|8,16,2,4,1'); });
  it('Nav_Direction sortOn: all 65536 inputs of 8 neighbours with nDist in {undefined,0,1,2}', () => {
    let bad = 0;
    for (let c = 0; c < 65536; c++) if (flashSortPermutation(navVals(c), NAV_FLAGS).join('') !== navExpected(c)) bad++;
    expect(bad).toBe(0);
  });
  it('sortOn NUMERIC|DESCENDING (array result): 6561 inputs over {undefined,0,1}', () => {
    let bad = 0;
    for (let c = 0; c < 6561; c++) {
      const v = Array.from({ length: 8 }, (_, i) => VALS3[Math.floor(c / 3 ** i) % 3]);
      if (flashSortPermutation(v, SORT_FLAGS.NUMERIC | SORT_FLAGS.DESCENDING).join('') !== R()[`objdesc.${c >> 8}`]!.substr((c & 255) * 8, 8)) bad++;
    }
    expect(bad).toBe(0);
  });
  it('ascending RETURNINDEXEDARRAY|NUMERIC over 5 elements', () => {
    for (let c = 0; c < 243; c++) {
      const v = Array.from({ length: 5 }, (_, i) => VALS3[Math.floor(c / 3 ** i) % 3]);
      expect(flashSortPermutation(v, SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY).join('')).toBe(R().asc5!.substr(c * 5, 5));
    }
  });
  it('Array.sort(compareFunction) uses the same quicksort (CMap_Cell._SortOrder-style comparator)', () => {
    for (let c = 0; c < 256; c++) {
      const ks = Array.from({ length: 8 }, (_, i) => (c >> i) & 1);
      const cmp = (p: number, q: number) => (p <= q ? (p >= q ? 0 : 1) : -1);
      expect(flashSortWith(ks, cmp).join('')).toBe(R().cmp8!.substr(c * 8, 8));
    }
  });
  it('misc cases', () => {
    const r = R();
    expect(flashSortPermutation([1, undefined, 0, undefined, 2], SORT_FLAGS.NUMERIC).join(',')).toBe(r['misc.sortOn_numeric_undefined_asc']);
    expect(flashSortPermutation([1, undefined, 0, undefined, 2], SORT_FLAGS.NUMERIC | SORT_FLAGS.DESCENDING).join(',')).toBe(r['misc.sortOn_numeric_undefined_desc']);
    expect(flashSortPermutation([1, NaN, 0, '5', -1, null], SORT_FLAGS.NUMERIC).join(',')).toBe(r['misc.sortOn_numeric_nan_str_null_asc']);
    expect(flashSortPermutation([10, 9, 100, -5, 2.5], NAV_FLAGS).join(',')).toBe(r['misc.sortOn_numeric_desc_distinct']);
    expect(flashSortPermutation([10, 9, 1, 100, 2]).map((i) => [10, 9, 1, 100, 2][i]).join(',')).toBe(r['misc.default_numbers']);
    expect(r['misc.named_only_array_sort']).toBe('t9,t3,t5|len=0'); // sort() of an Array with only named props is a no-op
    expect(r['misc.uniquesort_dup']).toBe('0|1,2,2');
  });
});

describe('P9 vs engine sortOn / sortArray (src/engine/flash/as2.ts)', () => {
  it('engine sortOn agrees with Flash when all keys are distinct numbers', () => {
    const arr = [10, 9, 100, -5, 2.5].map((n) => ({ nDist: n }));
    expect((sortOn(arr, 'nDist', NAV_FLAGS) as number[]).join(',')).toBe(R()['misc.sortOn_numeric_desc_distinct']);
  });
  // [ORACLE P9] fixed by lane O-fix: as2.ts ports flashSort.ts (unstable first-element-pivot quicksort, DESCENDING =
  // reverse of the ascending result).
  it('engine sortOn reproduces all 65536 Nav_Direction tie orders (World/Map/CMap_Cell.Nav_Direction)', () => {
    let bad = 0;
    for (let c = 0; c < 65536; c++) {
      const arr = navVals(c).map((v) => (v === undefined ? {} : { nDist: v }));
      if ((sortOn(arr as Record<string, number>[], 'nDist', NAV_FLAGS) as number[]).join('') !== navExpected(c)) bad++;
    }
    expect(bad).toBe(0);
  });
  it('engine sortOn: undefined ELEMENTS (edge cells without a neighbour) compare like missing fields', () => {
    for (let c = 0; c < 65536; c += 7) {
      const arr = navVals(c).map((v) => (v === undefined ? undefined : { nDist: v }));
      expect((sortOn(arr as any, 'nDist', NAV_FLAGS) as number[]).join(''), `case ${c}`).toBe(navExpected(c));
    }
  });
  it('engine sortOn NUMERIC|DESCENDING (array result): 6561 inputs over {undefined,0,1}', () => {
    let bad = 0;
    for (let c = 0; c < 6561; c++) {
      const objs = Array.from({ length: 8 }, (_, i) => { const v = VALS3[Math.floor(c / 3 ** i) % 3]; return v === undefined ? { id: i } : { id: i, nDist: v }; });
      const out = sortOn(objs as any[], 'nDist', SORT_FLAGS.NUMERIC | SORT_FLAGS.DESCENDING) as any[];
      if (out.map((o) => o.id).join('') !== R()[`objdesc.${c >> 8}`]!.substr((c & 255) * 8, 8)) bad++;
    }
    expect(bad).toBe(0);
  });
  it('engine sortOn ascending RETURNINDEXEDARRAY|NUMERIC over 5 elements', () => {
    for (let c = 0; c < 243; c++) {
      const objs = Array.from({ length: 5 }, (_, i) => { const v = VALS3[Math.floor(c / 3 ** i) % 3]; return v === undefined ? {} : { nDist: v }; });
      expect((sortOn(objs as any[], 'nDist', SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY) as number[]).join('')).toBe(R().asc5!.substr(c * 5, 5));
    }
  });
  it('engine sortArray(compareFunction) uses the same quicksort (CMap_Cell._SortOrder-style comparator)', () => {
    const cmp = (p: { k: number }, q: { k: number }) => (p.k <= q.k ? (p.k >= q.k ? 0 : 1) : -1);
    for (let c = 0; c < 256; c++) {
      const ks = Array.from({ length: 8 }, (_, i) => ({ k: (c >> i) & 1, i }));
      expect((sortArray(ks, cmp) as typeof ks).map((o) => o.i).join('')).toBe(R().cmp8!.substr(c * 8, 8));
    }
  });
  it('engine sort()/sortOn() misc cases', () => {
    const r = R();
    const j = (a: unknown[]) => a.map((v) => toAS2String(v)).join(',');
    expect(j(sortArray([10, 9, 1, 100, 2]) as number[])).toBe(r['misc.default_numbers']);
    expect(j(sortArray([3, undefined, 1, null, 'a', 2, 'B']) as unknown[])).toBe(r['misc.default_mixed']);
    expect(j(sortArray([10, 9, 1, 100, 2, undefined, -1], SORT_FLAGS.NUMERIC) as unknown[])).toBe(r['misc.numeric_with_undefined']);
    expect(j(sortArray([10, 9, 1, 100, 2], SORT_FLAGS.NUMERIC | SORT_FLAGS.DESCENDING) as number[])).toBe(r['misc.numeric_desc']);
    const a = [10, 9, 1, 100, 2];
    const ri = sortArray(a, SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY) as number[];
    expect(`${ri.join(',')}|${a.join(',')}`).toBe(r['misc.numeric_indexed']);
    const u = [1, 2, 2];
    expect(`${toAS2String(sortArray(u, SORT_FLAGS.UNIQUESORT))}|${u.join(',')}`).toBe(r['misc.uniquesort_dup']);
    expect((sortOn([{ v: 10 }, { v: 9 }, { v: 100 }], 'v') as { v: number }[]).map((o) => o.v).join(',')).toBe(r['misc.sortOn_string_compare']);
    const mo: any = []; mo.t5 = { y: 1 }; mo.t3 = { y: 0 }; mo.t9 = { y: 2 };
    sortArray(mo, (p: any, q: any) => (p.y < q.y ? 1 : p.y > q.y ? -1 : 0));
    expect(`${forIn(mo).join(',')}|len=${mo.length}`).toBe(r['misc.named_only_array_sort']);
    const und = [{ n: 1 }, {}, { n: 0 }, {}, { n: 2 }] as any[];
    expect((sortOn(und, 'n', SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY) as number[]).join(',')).toBe(r['misc.sortOn_numeric_undefined_asc']);
    expect((sortOn(und, 'n', SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY | SORT_FLAGS.DESCENDING) as number[]).join(',')).toBe(r['misc.sortOn_numeric_undefined_desc']);
    const nn = [{ n: 1 }, { n: NaN }, { n: 0 }, { n: '5' }, { n: -1 }, { n: null }] as any[];
    expect((sortOn(nn, 'n', SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY) as number[]).join(',')).toBe(r['misc.sortOn_numeric_nan_str_null_asc']);
    expect((sortOn(nn, 'n', SORT_FLAGS.NUMERIC | SORT_FLAGS.RETURNINDEXEDARRAY | SORT_FLAGS.DESCENDING) as number[]).join(',')).toBe(r['misc.sortOn_numeric_nan_str_null_desc']);
  });
});
