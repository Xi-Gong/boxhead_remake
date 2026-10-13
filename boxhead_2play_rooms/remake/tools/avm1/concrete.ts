/**
 * Concrete AVM1 value semantics (SWF 6-8 rules) used to fold the obfuscator's opaque predicates and dispatcher
 * arithmetic. Only primitive values are modelled; anything else is "unknown" to the folding engine.
 */

export type Prim = number | string | boolean | null | undefined;

export function isPrim(v: unknown): v is Prim {
  return v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

/** AVM1 ToNumber for SWF >= 7 (undefined/null -> NaN; '' -> NaN; hex '0x..' accepted). */
export function toNumber(v: Prim): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined || v === null) return NaN;
  const s = v.trim();
  if (s === '') return NaN;
  if (/^[-+]?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  const n = Number(s);
  return n;
}

/** AVM1 ToString of a number (Flash prints up to 15 significant digits). */
export function numberToString(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(15)).toString();
  return s;
}

export function toStr(v: Prim): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null) return 'null';
  return 'undefined';
}

export function toBool(v: Prim): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return !Number.isNaN(v) && v !== 0;
  if (typeof v === 'string') return v.length > 0; // SWF >= 7
  return false;
}

export function toInt32(n: number): number { return n | 0; }

export function typeOf(v: Prim): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return typeof v;
}

/** ECMA-262 ed.3 abstract equality on primitives (ActionEquals2). */
export function equals2(a: Prim, b: Prim): boolean {
  const ta = typeOf(a), tb = typeOf(b);
  if (ta === tb) return a === b;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return toNumber(a) === toNumber(b);
}

export function strictEquals(a: Prim, b: Prim): boolean { return a === b; }

/** Less2: returns true/false or undefined (when NaN involved). */
export function less2(a: Prim, b: Prim): boolean | undefined {
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  const x = toNumber(a), y = toNumber(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return x < y;
}

export function add2(a: Prim, b: Prim): Prim {
  if (typeof a === 'string' || typeof b === 'string') return toStr(a) + toStr(b);
  return toNumber(a) + toNumber(b);
}

export type BinOp =
  | 'Add' | 'Subtract' | 'Multiply' | 'Divide' | 'Modulo' | 'Equals' | 'Less' | 'And' | 'Or'
  | 'StringEquals' | 'StringAdd' | 'StringLess' | 'StringGreater' | 'Add2' | 'Less2' | 'Equals2'
  | 'StrictEquals' | 'Greater' | 'BitAnd' | 'BitOr' | 'BitXor' | 'BitLShift' | 'BitRShift' | 'BitURShift';

/** Evaluate a binary op: `a` is the deeper operand (pushed first), `b` the top of stack. */
export function evalBinary(op: string, a: Prim, b: Prim): Prim {
  switch (op) {
    case 'Add': return toNumber(a) + toNumber(b);
    case 'Subtract': return toNumber(a) - toNumber(b);
    case 'Multiply': return toNumber(a) * toNumber(b);
    case 'Divide': {
      const d = toNumber(b);
      return toNumber(a) / d;
    }
    case 'Modulo': return toNumber(a) % toNumber(b);
    case 'Equals': return toNumber(a) === toNumber(b);
    case 'Less': return toNumber(a) < toNumber(b);
    case 'And': return toBool(a) && toBool(b);
    case 'Or': return toBool(a) || toBool(b);
    case 'StringEquals': return toStr(a) === toStr(b);
    case 'StringAdd': return toStr(a) + toStr(b);
    case 'StringLess': return toStr(a) < toStr(b);
    case 'StringGreater': return toStr(a) > toStr(b);
    case 'Add2': return add2(a, b);
    case 'Less2': return less2(a, b);
    case 'Greater': return less2(b, a);
    case 'Equals2': return equals2(a, b);
    case 'StrictEquals': return strictEquals(a, b);
    case 'BitAnd': return toInt32(toNumber(a)) & toInt32(toNumber(b));
    case 'BitOr': return toInt32(toNumber(a)) | toInt32(toNumber(b));
    case 'BitXor': return toInt32(toNumber(a)) ^ toInt32(toNumber(b));
    case 'BitLShift': return toInt32(toNumber(a)) << (toInt32(toNumber(b)) & 31);
    case 'BitRShift': return toInt32(toNumber(a)) >> (toInt32(toNumber(b)) & 31);
    case 'BitURShift': return (toInt32(toNumber(a)) >>> (toInt32(toNumber(b)) & 31));
    default: throw new Error(`not a binary op: ${op}`);
  }
}

export function evalUnary(op: string, a: Prim): Prim {
  switch (op) {
    case 'Not': return !toBool(a);
    case 'ToInteger': { const n = toNumber(a); return Number.isNaN(n) ? 0 : Math.trunc(n); }
    case 'ToNumber': return toNumber(a);
    case 'ToString': return toStr(a);
    case 'Increment': return toNumber(a) + 1;
    case 'Decrement': return toNumber(a) - 1;
    case 'TypeOf': return typeOf(a);
    case 'StringLength': case 'MBStringLength': return toStr(a).length;
    case 'CharToAscii': case 'MBCharToAscii': { const s = toStr(a); return s.length ? s.charCodeAt(0) : 0; }
    case 'AsciiToChar': case 'MBAsciiToChar': return String.fromCharCode(toNumber(a));
    default: throw new Error(`not a unary op: ${op}`);
  }
}

export const BINARY_OPS: ReadonlySet<string> = new Set([
  'Add', 'Subtract', 'Multiply', 'Divide', 'Modulo', 'Equals', 'Less', 'And', 'Or', 'StringEquals', 'StringAdd',
  'StringLess', 'StringGreater', 'Add2', 'Less2', 'Equals2', 'StrictEquals', 'Greater', 'BitAnd', 'BitOr', 'BitXor',
  'BitLShift', 'BitRShift', 'BitURShift',
]);

export const UNARY_OPS: ReadonlySet<string> = new Set([
  'Not', 'ToInteger', 'ToNumber', 'ToString', 'Increment', 'Decrement', 'TypeOf', 'StringLength', 'MBStringLength',
  'CharToAscii', 'MBCharToAscii', 'AsciiToChar', 'MBAsciiToChar',
]);
