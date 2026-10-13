/**
 * Reference model of Flash Player's AVM1 Array.sort / Array.sortOn, fitted to oracle probe P9
 * (tests/goldens/flash/p9_sort.json): it reproduces all 72,603 measured results exactly (65,536 exhaustive
 * Nav_Direction cases, 6,561 object sorts, 243 ascending index sorts, 256 compare-function sorts, misc cases) and is
 * identical in Flash Player 8, 28 and 32.                                             OWNER: oracle lane
 *
 * Algorithm (unstable): recursive quicksort, pivot = FIRST element of the range (never moved before partitioning),
 *   left scan:  do left++  while left <= hi && cmp(a[left], pivot) < 0
 *   right scan: do right-- while right > lo && cmp(a[right], pivot) >= 0
 *   if right < left: stop, else swap(left, right) and continue; finally swap(lo, right); recurse [lo, right-1],
 *   [right+1, hi].
 * DESCENDING is NOT a negated comparator: the array is sorted ascending and the result is then REVERSED (so equal
 * keys come out in the reverse of their ascending-sort order).
 * NUMERIC comparator (sortOn/sort with Array.NUMERIC): numeric compare when both values are numbers, otherwise the
 * default string compare of String(a) vs String(b) — so undefined ("undefined") sorts after all numbers and null
 * ("null") after NaN ("NaN"). Without NUMERIC everything is compared as strings (case-sensitive unless
 * CASEINSENSITIVE).
 *
 * Lane C can port `quickSortIndices` into src/engine/flash/as2.ts (sortOn) — see tests/unit/oracle/sort.test.ts.
 */

export const SORT_FLAGS = { CASEINSENSITIVE: 1, DESCENDING: 2, UNIQUESORT: 4, RETURNINDEXEDARRAY: 8, NUMERIC: 16 } as const;

/** Sort `idx` in place with Flash's quicksort; `cmp` compares two elements of `idx`. */
export function quickSortIndices(idx: number[], cmp: (a: number, b: number) => number, lo = 0, hi = idx.length - 1): void {
  if (lo >= hi) return;
  let left = lo;
  let right = hi + 1;
  for (;;) {
    do left++; while (left <= hi && cmp(idx[left]!, idx[lo]!) < 0);
    do right--; while (right > lo && cmp(idx[right]!, idx[lo]!) >= 0);
    if (right < left) break;
    const t = idx[left]!; idx[left] = idx[right]!; idx[right] = t;
  }
  const t = idx[lo]!; idx[lo] = idx[right]!; idx[right] = t;
  quickSortIndices(idx, cmp, lo, right - 1);
  quickSortIndices(idx, cmp, right + 1, hi);
}

const asString = (v: unknown): string => {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v); // only integer test values are compared as strings here
  return String(v);
};

/** Flash's sortOn/sort comparator for primitive values. */
export function flashCompare(a: unknown, b: unknown, options = 0): number {
  if ((options & SORT_FLAGS.NUMERIC) && typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  let x = asString(a), y = asString(b);
  if (options & SORT_FLAGS.CASEINSENSITIVE) { x = x.toLowerCase(); y = y.toLowerCase(); }
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Flash `values.sort(options)` / `objs.sortOn(field, options)` on extracted key values: returns the permutation. */
export function flashSortPermutation(values: readonly unknown[], options = 0): number[] {
  const idx = values.map((_, i) => i);
  quickSortIndices(idx, (i, j) => flashCompare(values[i], values[j], options));
  if (options & SORT_FLAGS.DESCENDING) idx.reverse();
  return idx;
}

/** Flash `arr.sort(compareFunction)` permutation. */
export function flashSortWith<T>(arr: readonly T[], compare: (a: T, b: T) => number): number[] {
  const idx = arr.map((_, i) => i);
  quickSortIndices(idx, (i, j) => compare(arr[i]!, arr[j]!));
  return idx;
}
