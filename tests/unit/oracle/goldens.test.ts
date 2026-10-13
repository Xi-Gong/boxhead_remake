// Shape of the oracle goldens + cross-player consistency (Flash Player 8 / 28 vs 32).
import { describe, expect, it } from 'vitest';
import { golden, goldenIds, hasGolden, mergedResults } from './golden.ts';
import { AS1C_EXPECTED } from '../../../tools/oracle/probes/p0_hello.ts';

const EXPECTED = [
  'p0_hello', 'p0_as1c', 'p1_forin', 'p2_numeric', 'p3_bitmap', 'p4_bounds', 'p5_filters', 'p6_numtostr', 'p7_math',
  'p8a_tables', 'p8b_init_1_9', 'p8c_init_10_14', 'p8e_init_15_18', 'p8d_nav18', 'p9_sort', 'p11_construct',
  'p11_construct_fp28', 'p11_construct_fp8',
];

describe('oracle goldens: shape', () => {
  it('every expected golden exists', () => {
    for (const id of EXPECTED) expect(hasGolden(id), id).toBe(true);
  });
  for (const id of goldenIds()) {
    it(`${id} is well-formed`, () => {
      const g = golden(id);
      expect(g.probe).toBe(id);
      expect(g.player).toMatch(/^WIN \d+,\d+,\d+,\d+$/);
      expect(g.swfVersion).toBe(8);
      expect(Object.keys(g.results).length).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(g.results)) {
        expect(typeof v, k).toBe('string');
        expect(k.includes('='), k).toBe(false);
      }
      expect(g.results.error).toBeUndefined();
      // SharedObject-channel goldens record the flush() result; "true" = written without a quota prompt
      if ('flush' in g.results) expect(g.results.flush).toBe('true');
    });
  }
  it('trace-channel goldens come from the FP32 debug projector, P8 from FP28', () => {
    expect(golden('p1_forin').player).toBe('WIN 32,0,0,465');
    expect(golden('p8a_tables').player).toBe('WIN 28,0,0,126');
    expect(golden('p11_construct_fp8').player).toBe('WIN 8,0,22,0');
  });
  it('as1c compiler self-test matches the expected values', () => {
    expect(golden('p0_as1c').results).toEqual(AS1C_EXPECTED);
  });
});

/** Keys where Flash Player 8 differs from Flash Player 32 (measured; everything else is identical). */
const FP8_KNOWN_DIFF: Record<string, RegExp> = {
  p2_numeric: /^x:(1000000000|-1000000000)$/, // _x overflow (> 2^31 twips) wraps differently
  p5_filters: /^(cmC_offset76|cmC_offset204|cmC_third_mix|cmC_alpha_offset|cmA_offset_on_transparent|inplace\.cmC_offset204)\./, // ColorMatrix rounding
  p6_numtostr: /^\((4294967295|1e21)\)\.toString\(16\)$/, // FP32 prints "-(0000000"
  p7_math: /^(sin\(PI\)|cos\(PI\/2\))$/, // last digits of libm results
};

describe('oracle goldens: cross-player', () => {
  const probes = ['p1_forin', 'p2_numeric', 'p3_bitmap', 'p4_bounds', 'p5_filters', 'p6_numtostr', 'p7_math'];
  for (const p of probes) {
    it(`Flash Player 28 gives exactly the FP32 results for ${p}`, () => {
      const x = p === 'p5_filters' ? mergedResults('x28_p5_filters_') : mergedResults(`x28_${p}`);
      expect(x).toEqual(golden(p).results);
    });
    it(`Flash Player 8 gives the FP32 results for ${p} (except the known differences)`, () => {
      const x = p === 'p5_filters' ? mergedResults('x8_p5_filters_') : mergedResults(`x8_${p}`);
      const ref = golden(p).results;
      expect(Object.keys(x).sort()).toEqual(Object.keys(ref).sort());
      const diff = Object.keys(ref).filter((k) => ref[k] !== x[k]);
      const unexpected = diff.filter((k) => !FP8_KNOWN_DIFF[p]?.test(k));
      expect(unexpected).toEqual([]);
    });
  }
  it('P11 construction order is identical in Flash Player 8, 28 and 32', () => {
    const strip = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'flush'));
    expect(strip(golden('p11_construct_fp8').results)).toEqual(strip(golden('p11_construct_fp28').results));
    expect(strip(golden('p11_construct').results)).toEqual(strip(golden('p11_construct_fp28').results));
  });
});
