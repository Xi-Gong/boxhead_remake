/**
 * ActionScript 2 (AVM1, SWF v8) language semantics that the ported game code depends on.
 *
 * Every `for (k in o)` in the AS2 sources MUST be ported as `for (const k of forIn(o))` so that enumeration order
 * is decided here, in one place (verified against Flash Player by oracle probe P1).
 */

/**
 * Enumeration order model ('reverse-insertion', confirmed by oracle probe P1 in Flash Player 8/28/32):
 *   - objects: keys in REVERSE CREATION order (`o.a; o.b; o.c` -> c,b,a); delete + re-add moves a key to the front,
 *     overwriting keeps its place; integer-like keys are NOT reordered (use AsDict for those — JS sorts them first);
 *     the key list is a snapshot taken before the loop.
 *   - AS2 object LITERALS enumerate in SOURCE order (`{a:1, b:2, c:3}` -> a,b,c: InitObject creates the pairs
 *     last-to-first; `{a:1, b:2, a:3}` -> b,a with a = 1). A TS port of an AS2 literal that is enumerated (directly, or
 *     as an attachMovie/duplicateMovieClip initObject, which the engine copies with forIn) must therefore be written
 *     with its keys REVERSED — CONVENTIONS.md porting rule 6, tagged `// [ORACLE P1]` (CHud, CScreen_Debrief,
 *     CScreen_Debrief_Winner initObjects; the oracle-fix audit found no other enumerated literal in src/game).
 *   - arrays: Flash enumerates array elements in reverse CREATION order too (`a[5]; a[2]; a[0]` -> 0,2,5) with named
 *     properties interleaved by creation. A JS array cannot record creation order, so forIn() models arrays as
 *     indices HIGH -> LOW, then named properties (reverse creation) — exact for arrays filled by literal, push() or
 *     ascending index assignment. KNOWN LIMITATION (oracle test as2.test.ts `it.fails`): arrays filled out of index
 *     order. The oracle-fix audit of every forIn() in src/game found none (out-of-order arrays such as mValidKeys,
 *     mLevels, CMap.Draw rows are only read by index); a future call site that needs it must use AsDict.
 *   - visible (enumerable) prototype members are listed BEFORE own members in Flash; AS2 classes hide theirs
 *     (ASSetPropFlags) and forIn() lists own members only (proto() fields stay hidden, as in Flash). KNOWN LIMITATION
 *     (`it.fails`): AS1-style visible prototypes — no game object is enumerated that relies on them.
 *   - MovieClips: vars first, then children by descending depth (not modelled: the game never enumerates a clip).
 * 'insertion' is kept for experiments only.
 */
export type ForInOrder = 'reverse-insertion' | 'insertion';
export const as2Config: { forInOrder: ForInOrder } = { forInOrder: 'reverse-insertion' };

/**
 * Insertion-ordered dictionary for AS2 objects used as hash maps (e.g. `mThings["t"+id]`, cell `mObjects`).
 * Use this instead of a plain JS object whenever keys could be integer-like (JS reorders those) or when the code
 * enumerates the object with for..in.
 */
export class AsDict<V = any> {
  private map = new Map<string, V>();
  get(k: string | number): V | undefined { return this.map.get(String(k)); }
  set(k: string | number, v: V): void { this.map.set(String(k), v); }
  has(k: string | number): boolean { return this.map.has(String(k)); }
  /** AS2 `delete o[k]`. Returns true if it existed. */
  delete(k: string | number): boolean { return this.map.delete(String(k)); }
  get size(): number { return this.map.size; }
  /** Keys in creation order (NOT AS2 for..in order — use forIn() for that). */
  keys(): string[] { return [...this.map.keys()]; }
  values(): V[] { return [...this.map.values()]; }
  clear(): void { this.map.clear(); }
}

/** Snapshot of keys in AS2 for..in order. Works on arrays, AsDict and plain objects (own enumerable props). */
export function forIn(o: unknown): string[] {
  if (o == null) return [];
  let keys: string[];
  if (o instanceof AsDict) keys = o.keys();
  else if (Array.isArray(o)) {
    const own = Object.keys(o);
    // Dense own-index arrays already have precisely the ascending index list. Checking the last
    // key also excludes named/noncanonical properties (which JS orders after the array indices).
    // Avoid a second key array, per-index strings and regex scans in area/affector hot loops.
    if (own.length === o.length && (own.length === 0 || own[own.length - 1] === String(o.length - 1))) keys = own;
    else {
      keys = [];
      for (let i = 0; i < o.length; i++) if (i in o) keys.push(String(i));
      for (const k of own) if (!/^(0|[1-9]\d*)$/.test(k)) keys.push(k);
    }
  } else if (typeof o === 'object' || typeof o === 'function') {
    // NOTE: JS orders integer-like keys first (ascending). Objects with such keys whose enumeration order matters
    // must be AsDict instead.
    keys = Object.keys(o as object);
  } else return [];
  return as2Config.forInOrder === 'reverse-insertion' ? keys.reverse() : keys;
}

/**
 * Define AS2 class-body `var` initializers on the prototype (AS2 semantics: values live on the prototype, are visible
 * during super-constructor calls, and object/array initializers are SHARED between instances).
 * Usage after a class declaration:  proto(CThing_Weapon, { mFireRate: 10, mAmmo: 999999 });
 */
export function proto(cls: { prototype: any }, fields: Record<string, unknown>): void {
  for (const k of Object.keys(fields)) cls.prototype[k] = fields[k];
}

/**
 * AS2 `int(x)` (ActionToInteger): ToNumber, then ECMA ToInt32 — truncates toward zero and wraps to a signed
 * 32-bit integer (NaN/±Infinity -> 0, int(3e9) -> -1294967296).
 */
export function int(x: unknown): number {
  return toNumber(x) | 0;
}

/**
 * AS2 `a >>> b` ([ORACLE P7]): AVM1 converts the result back to int32, so `-1 >>> 0` is -1 (JS: 4294967295) while
 * `-1 >>> 1` is 2147483647. Use this for every ported `>>>` (src/game has none — audited by the oracle-fix lane).
 */
export function ushr(a: unknown, b: unknown): number {
  return (toNumber(a) >>> toNumber(b)) | 0;
}

/** Parse `digits` (optional leading sign) in `radix` as a wrapping int32, like Flash's hex/octal string parsing. */
function parseWrappingInt(s: string, radix: number): number {
  let i = 0;
  let neg = false;
  if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; i = 1; }
  if (i >= s.length) return NaN;
  let v = 0;
  for (; i < s.length; i++) {
    const d = parseInt(s[i]!, radix);
    if (Number.isNaN(d)) return NaN;
    v = (Math.imul(v, radix) + d) | 0;
  }
  return neg ? -v | 0 : v;
}

const DECIMAL_RE = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d*)?$/;

/**
 * AVM1 (SWF6+) string -> number:
 *   "0x1F" -> 31 (wrapping int32, "0xFFFFFFFF" -> -1; a sign before "0x" gives NaN — Flash bug),
 *   "010" / "-010" -> octal 8 / -8 (a leading 0 followed only by 0-7), "0" -> 0,
 *   otherwise strict decimal: leading whitespace allowed, trailing characters (even spaces) -> NaN, "" -> NaN,
 *   "Infinity" -> NaN, "1e" -> 1.
 */
function stringToNumber(s: string): number {
  const unsigned = s[0] === '+' || s[0] === '-' ? s.slice(1) : s;
  if (unsigned[0] === '0') {
    const rest = unsigned.slice(1);
    if (rest[0] === 'x' || rest[0] === 'X') return parseWrappingInt(s.slice(2), 16);
    if (/^[0-7]*$/.test(rest)) return parseWrappingInt(s, 8);
  }
  if (!DECIMAL_RE.test(s)) return NaN;
  const t = s.trimStart().replace(/[eE][+-]?$/, '');
  return Number(t);
}

/** AVM1 (SWF7+) ToNumber for primitives (objects: call valueOf() yourself first). */
export function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  if (x === undefined || x === null) return NaN;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'string') return stringToNumber(x);
  if (typeof x === 'object' && typeof (x as { valueOf?: unknown }).valueOf === 'function') {
    const v = (x as { valueOf(): unknown }).valueOf();
    if (v !== x && (typeof v !== 'object' || v === null)) return toNumber(v);
  }
  return NaN;
}

/**
 * AVM1 number -> string, as Flash Player prints numbers: 15 significant digits (ties away from zero), trailing zeros
 * trimmed; exponential notation ("1.5e+21", "1e-7") when the decimal exponent is >= 15 or < -5 (unlike JS, which
 * switches at 21 / -7). Examples: 0.1+0.2 -> "0.3", 1e15 -> "1e+15", 0.000001 -> "1e-6", 0.00001 -> "0.00001".
 */
export function numberToString(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (n === 0) return '0';
  if (Number.isInteger(n) && n >= -2147483648 && n < 2147483648) return String(n);
  const neg = n < 0;
  const a = Math.abs(n);
  const s = a.toExponential(14);
  const ei = s.indexOf('e');
  const digits = s.slice(0, ei).replace('.', '').replace(/0+$/, '');
  const exp = parseInt(s.slice(ei + 1), 10);
  // [ORACLE P6] the notation is chosen from the exponent of the UNROUNDED value (its shortest repr), the digits and the
  // printed exponent come from the 15-digit rounding: 999999999999999.9 -> "1000000000000000" (not "1e+15"),
  // 9.999999999999999e22 -> "1e+23".
  const se = a.toExponential();
  const exp0 = parseInt(se.slice(se.indexOf('e') + 1), 10);
  let out: string;
  if (exp0 >= 15 || exp0 < -5) {
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (exp > 0 ? '+' : '') + exp;
  } else if (exp >= 0) {
    const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    const frac = digits.slice(exp + 1);
    out = frac ? intPart + '.' + frac : intPart;
  } else {
    out = '0.' + '0'.repeat(-exp - 1) + digits;
  }
  return neg ? '-' + out : out;
}

/** AS2 String(x) for SWF v7+ (undefined -> "undefined"). */
export function toAS2String(x: unknown): string {
  if (typeof x === 'number') return numberToString(x);
  if (x === undefined) return 'undefined';
  if (x === null) return 'null';
  return String(x);
}

/** AS2 Array sort option flags. */
export const ArrayFlags = { CASEINSENSITIVE: 1, DESCENDING: 2, UNIQUESORT: 4, RETURNINDEXEDARRAY: 8, NUMERIC: 16 } as const;

/**
 * Flash Player's AVM1 Array sort ([ORACLE P9], identical in FP 8/28/32; reference model tools/oracle/flashSort.ts,
 * which reproduces all 72,603 measured results). Sorts the index permutation `idx` in place; `cmp` compares two
 * elements of `idx`. UNSTABLE quicksort, pivot = FIRST element of the range (not moved before partitioning):
 *   left scan:  do left++  while left <= hi && cmp(a[left], pivot) < 0
 *   right scan: do right-- while right > lo && cmp(a[right], pivot) >= 0
 *   stop when right < left, else swap(left, right); finally swap(lo, right); recurse on both sides.
 * (Iterative with an explicit range stack — the sub-ranges are disjoint, so the processing order does not matter.)
 */
export function flashQuickSort(idx: number[], cmp: (a: number, b: number) => number): void {
  const stack: number[] = [0, idx.length - 1];
  while (stack.length) {
    const hi = stack.pop()!, lo = stack.pop()!;
    if (lo >= hi) continue;
    let left = lo, right = hi + 1;
    for (;;) {
      do left++; while (left <= hi && cmp(idx[left]!, idx[lo]!) < 0);
      do right--; while (right > lo && cmp(idx[right]!, idx[lo]!) >= 0);
      if (right < left) break;
      const t = idx[left]!; idx[left] = idx[right]!; idx[right] = t;
    }
    const t = idx[lo]!; idx[lo] = idx[right]!; idx[right] = t;
    stack.push(lo, right - 1, right + 1, hi);
  }
}

/**
 * Flash's default sort comparator for two values ([ORACLE P9]): with NUMERIC, numeric comparison only when BOTH values
 * are numbers (NaN compares equal to everything); otherwise String(a) vs String(b) (AS2 conversion, so undefined ->
 * "undefined" sorts after all digits, null -> "null" after "NaN"), case-insensitive with CASEINSENSITIVE.
 */
export function flashCompare(a: unknown, b: unknown, options = 0): number {
  if ((options & ArrayFlags.NUMERIC) && typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  let x = toAS2String(a), y = toAS2String(b);
  if (options & ArrayFlags.CASEINSENSITIVE) { x = x.toLowerCase(); y = y.toLowerCase(); }
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Shared tail of sortOn / sortArray: DESCENDING, UNIQUESORT, RETURNINDEXEDARRAY, in-place reorder. */
function finishSort<T>(arr: T[], idx: number[], cmp: (i: number, j: number) => number, options: number): T[] | number[] | 0 {
  // [ORACLE P9] DESCENDING is NOT a negated comparator: sort ascending, then reverse the whole permutation (equal keys
  // come out in the reverse of their ascending-sort order).
  if (options & ArrayFlags.DESCENDING) idx.reverse();
  if (options & ArrayFlags.UNIQUESORT) {
    for (let k = 1; k < idx.length; k++) if (cmp(idx[k - 1]!, idx[k]!) === 0) return 0; // array left untouched
  }
  if (options & ArrayFlags.RETURNINDEXEDARRAY) return idx;
  const sorted = idx.map((i) => arr[i]!);
  for (let i = 0; i < sorted.length; i++) arr[i] = sorted[i]!;
  return arr;
}

/**
 * AS2 `array.sortOn(field, options)` with Flash's exact (unstable) order — see flashQuickSort / flashCompare.
 * `field` may be an array of field names (compared in turn). Missing elements / fields compare as undefined.
 * With RETURNINDEXEDARRAY returns the permutation (array of original indices) and leaves `arr` untouched.
 * With UNIQUESORT and two equal keys returns 0 and leaves `arr` untouched (Flash).
 */
export function sortOn<T extends Record<string, any>>(arr: T[], field: string | string[], options = 0): T[] | number[] | 0 {
  const fields = Array.isArray(field) ? field.map(String) : [String(field)];
  const opt = toNumber(options) | 0;
  const cmp = (i: number, j: number): number => {
    for (const f of fields) {
      const r = flashCompare(arr[i]?.[f], arr[j]?.[f], opt);
      if (r !== 0) return r;
    }
    return 0;
  };
  const idx = Array.from({ length: arr.length }, (_, i) => i);
  flashQuickSort(idx, cmp);
  return finishSort(arr, idx, cmp, opt);
}

/**
 * AS2 `array.sort()`, `array.sort(options)`, `array.sort(compareFunction[, options])` with Flash's exact (unstable)
 * order. A compare function is used as is (`< 0` = before); without one, flashCompare(options) is used. Only the
 * index elements 0..length-1 take part (an Array used as a string-keyed hash map has length 0: a no-op, like Flash).
 */
export function sortArray<T>(arr: T[], compareOrOptions?: ((a: T, b: T) => number) | number, options?: number): T[] | number[] | 0 {
  const fn = typeof compareOrOptions === 'function' ? compareOrOptions : undefined;
  const opt = (toNumber(fn ? options ?? 0 : compareOrOptions ?? 0) | 0);
  const cmp = fn
    ? (i: number, j: number): number => toNumber(fn(arr[i]!, arr[j]!))
    : (i: number, j: number): number => flashCompare(arr[i], arr[j], opt);
  const idx = Array.from({ length: arr.length }, (_, i) => i);
  flashQuickSort(idx, cmp);
  return finishSort(arr, idx, cmp, opt);
}

/** AS2 `x.length` on strings is the same; `substr`, `substring` etc. are JS-compatible. */

/** AS2 `getURL` — intentionally a no-op in the remake (scope: no external links). */
export function getURL(_url?: string, _window?: string): void { /* no-op by design (deviations.ts) */ }

/** Global object (`_global`). Populated by the boot frame scripts (mProduct, mDebug, mHostedOnCMG, ...). */
export const _global: Record<string, any> = {};
