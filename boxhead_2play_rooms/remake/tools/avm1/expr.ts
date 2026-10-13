/**
 * Expression / statement trees for the AVM1 pseudo-decompiler, with a precedence-aware printer.
 */
import { type Prim, toStr } from './concrete.ts';
import { quote, numLiteral } from './opcodes.ts';

export type Expr =
  | { t: 'lit'; v: Prim }
  | { t: 'var'; name: string }
  | { t: 'eval'; e: Expr }
  | { t: 'reg'; n: number }
  | { t: 'mem'; o: Expr; p: Expr }
  | { t: 'bin'; op: string; a: Expr; b: Expr }
  | { t: 'un'; op: string; a: Expr }
  | { t: 'call'; f: Expr; args: Expr[] }
  | { t: 'new'; f: Expr; args: Expr[] }
  /** Built-in / global function form: getTimer(), int(x), random(n)… */
  | { t: 'builtin'; name: string; args: Expr[] }
  | { t: 'fn'; off: number }
  | { t: 'arr'; items: Expr[] }
  | { t: 'obj'; props: Array<[Expr, Expr]> }
  | { t: 'tern'; c: Expr; a: Expr; b: Expr }
  | { t: 'assign'; target: Expr; v: Expr }
  | { t: 'post'; target: Expr; op: '++' | '--' }
  /** Incoming stack slot of a block (resolved by condensation). */
  | { t: 'in'; blk: number; i: number }
  | { t: 'tmp'; name: string }
  /** Next property name of a for..in enumeration started at offset `at`. */
  | { t: 'enumnext'; at: number }
  | { t: 'delete'; o: Expr | null; p: Expr };

export type Stmt =
  | { k: 'expr'; e: Expr; off: number }
  | { k: 'assign'; target: Expr; v: Expr; off: number; decl?: boolean }
  | { k: 'decl'; name: Expr; off: number }
  /** Pop of a value that has no side effect (kept only to drive pattern matching, never printed if pure). */
  | { k: 'discard'; e: Expr; off: number }
  | { k: 'return'; e: Expr | null; off: number }
  | { k: 'throw'; e: Expr; off: number }
  | { k: 'end'; off: number }
  | { k: 'raw'; text: string; off: number };

export interface RenderCtx {
  regName(n: number): string;
  fnName(off: number): string;
}

export const DEFAULT_CTX: RenderCtx = {
  regName: n => `r${n}`,
  fnName: off => `function@${off}`,
};

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Operator precedence (higher binds tighter). */
function binPrec(op: string): number {
  switch (op) {
    case '||': case 'or': return 5;
    case '&&': case 'and': return 6;
    case '|': return 7;
    case '^': return 8;
    case '&': return 9;
    case '==': case '!=': case '===': case '!==': case 'eq': case 'ne': return 10;
    case '<': case '>': case '<=': case '>=': case 'instanceof': case 'lt': case 'gt': case 'le': case 'ge': return 11;
    case '<<': case '>>': case '>>>': return 12;
    case '+': case '-': case 'add': return 13;
    case '*': case '/': case '%': return 14;
    default: return 13;
  }
}

export function prec(e: Expr): number {
  switch (e.t) {
    case 'assign': return 3;
    case 'tern': return 4;
    case 'bin': return binPrec(e.op);
    case 'un': case 'delete': return 15;
    case 'post': return 16;
    case 'new': return 17;
    case 'lit': return typeof e.v === 'number' && e.v < 0 ? 15 : 20;
    default: return 20;
  }
}

export function litText(v: Prim): string {
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'number') return numLiteral(v);
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  return toStr(v);
}

function memberText(o: Expr, p: Expr, ctx: RenderCtx): string {
  const os = wrap(o, 18, ctx);
  if (p.t === 'lit' && typeof p.v === 'string' && IDENT.test(p.v)) return `${os}.${p.v}`;
  return `${os}[${render(p, ctx)}]`;
}

function wrap(e: Expr, minPrec: number, ctx: RenderCtx): string {
  const s = render(e, ctx);
  return prec(e) < minPrec ? `(${s})` : s;
}

export function render(e: Expr, ctx: RenderCtx = DEFAULT_CTX): string {
  switch (e.t) {
    case 'lit': return litText(e.v);
    case 'var': return IDENT.test(e.name) ? e.name : `eval(${quote(e.name)})`;
    case 'eval': return `eval(${render(e.e, ctx)})`;
    case 'reg': return ctx.regName(e.n);
    case 'mem': return memberText(e.o, e.p, ctx);
    case 'bin': {
      const p = binPrec(e.op);
      // left-assoc: left operand may have equal precedence; right needs strictly higher
      return `${wrap(e.a, p, ctx)} ${e.op} ${wrap(e.b, p + 1, ctx)}`;
    }
    case 'un': {
      const sep = /[a-z]$/.test(e.op) ? ' ' : '';
      return `${e.op}${sep}${wrap(e.a, 15, ctx)}`;
    }
    case 'delete':
      if (e.o) return `delete ${memberText(e.o, e.p, ctx)}`;
      return e.p.t === 'lit' && typeof e.p.v === 'string' && IDENT.test(e.p.v) ? `delete ${e.p.v}` : `delete ${render(e.p, ctx)}`;
    case 'call': return `${wrap(e.f, 18, ctx)}(${e.args.map(a => render(a, ctx)).join(', ')})`;
    case 'new': return `new ${wrap(e.f, 18, ctx)}(${e.args.map(a => render(a, ctx)).join(', ')})`;
    case 'builtin': return `${e.name}(${e.args.map(a => render(a, ctx)).join(', ')})`;
    case 'fn': return ctx.fnName(e.off);
    case 'arr': return `[${e.items.map(a => render(a, ctx)).join(', ')}]`;
    case 'obj': return `{${e.props.map(([k, v]) => {
      const ks = k.t === 'lit' && typeof k.v === 'string' && IDENT.test(k.v) ? k.v : render(k, ctx);
      return `${ks}:${render(v, ctx)}`;
    }).join(', ')}}`;
    case 'tern': return `${wrap(e.c, 5, ctx)} ? ${wrap(e.a, 4, ctx)} : ${wrap(e.b, 4, ctx)}`;
    case 'assign': return `${render(e.target, ctx)} = ${wrap(e.v, 3, ctx)}`;
    case 'post': return `${wrap(e.target, 16, ctx)}${e.op}`;
    case 'in': return `§stack${e.i}@b${e.blk}`;
    case 'tmp': return e.name;
    case 'enumnext': return `§nextKey(enum@${e.at})`;
  }
}

export function renderStmt(s: Stmt, ctx: RenderCtx = DEFAULT_CTX): string {
  switch (s.k) {
    case 'expr': return render(s.e, ctx) + ';';
    case 'discard': return render(s.e, ctx) + ';';
    case 'assign': return (s.decl ? 'var ' : '') + `${render(s.target, ctx)} = ${render(s.v, ctx)};`;
    case 'decl': return `var ${render(s.name, ctx)};`;
    case 'return': return s.e ? `return ${render(s.e, ctx)};` : 'return;';
    case 'throw': return `throw ${render(s.e, ctx)};`;
    case 'end': return 'end;';
    case 'raw': return s.text;
  }
}

// ----------------------------------------------------------------------------------------------------------------
// Tree utilities

export function children(e: Expr): Expr[] {
  switch (e.t) {
    case 'eval': return [e.e];
    case 'mem': return [e.o, e.p];
    case 'bin': return [e.a, e.b];
    case 'un': return [e.a];
    case 'call': case 'new': return [e.f, ...e.args];
    case 'builtin': return e.args;
    case 'arr': return e.items;
    case 'obj': return e.props.flat();
    case 'tern': return [e.c, e.a, e.b];
    case 'assign': return [e.target, e.v];
    case 'post': return [e.target];
    case 'delete': return e.o ? [e.o, e.p] : [e.p];
    default: return [];
  }
}

export function someExpr(e: Expr, pred: (x: Expr) => boolean): boolean {
  if (pred(e)) return true;
  for (const c of children(e)) if (someExpr(c, pred)) return true;
  return false;
}

/** Structural map (bottom-up); returns the same object when nothing changed. */
export function mapExpr(e: Expr, f: (x: Expr) => Expr | undefined): Expr {
  const direct = f(e);
  if (direct !== undefined) return direct;
  const m = (x: Expr) => mapExpr(x, f);
  switch (e.t) {
    case 'eval': { const a = m(e.e); return a === e.e ? e : { t: 'eval', e: a }; }
    case 'mem': { const o = m(e.o), p = m(e.p); return o === e.o && p === e.p ? e : { t: 'mem', o, p }; }
    case 'bin': { const a = m(e.a), b = m(e.b); return a === e.a && b === e.b ? e : { t: 'bin', op: e.op, a, b }; }
    case 'un': { const a = m(e.a); return a === e.a ? e : { t: 'un', op: e.op, a }; }
    case 'call': case 'new': {
      const f2 = m(e.f); const args = e.args.map(m);
      return f2 === e.f && args.every((a, i) => a === e.args[i]) ? e : { t: e.t, f: f2, args };
    }
    case 'builtin': {
      const args = e.args.map(m);
      return args.every((a, i) => a === e.args[i]) ? e : { t: 'builtin', name: e.name, args };
    }
    case 'arr': {
      const items = e.items.map(m);
      return items.every((a, i) => a === e.items[i]) ? e : { t: 'arr', items };
    }
    case 'obj': {
      const props = e.props.map(([k, v]) => [m(k), m(v)] as [Expr, Expr]);
      return props.every(([k, v], i) => k === e.props[i][0] && v === e.props[i][1]) ? e : { t: 'obj', props };
    }
    case 'tern': {
      const c = m(e.c), a = m(e.a), b = m(e.b);
      return c === e.c && a === e.a && b === e.b ? e : { t: 'tern', c, a, b };
    }
    case 'assign': {
      const target = m(e.target), v = m(e.v);
      return target === e.target && v === e.v ? e : { t: 'assign', target, v };
    }
    case 'post': { const target = m(e.target); return target === e.target ? e : { t: 'post', target, op: e.op }; }
    case 'delete': {
      const o = e.o ? m(e.o) : null, p = m(e.p);
      return o === e.o && p === e.p ? e : { t: 'delete', o, p };
    }
    default: return e;
  }
}

export function mapStmt(s: Stmt, f: (x: Expr) => Expr | undefined): Stmt {
  const m = (x: Expr) => mapExpr(x, f);
  switch (s.k) {
    case 'expr': return { ...s, e: m(s.e) };
    case 'discard': return { ...s, e: m(s.e) };
    case 'assign': return { ...s, target: m(s.target), v: m(s.v) };
    case 'decl': return { ...s, name: m(s.name) };
    case 'return': return { ...s, e: s.e ? m(s.e) : null };
    case 'throw': return { ...s, e: m(s.e) };
    default: return s;
  }
}

export function stmtExprs(s: Stmt): Expr[] {
  switch (s.k) {
    case 'expr': case 'discard': return [s.e];
    case 'assign': return [s.target, s.v];
    case 'decl': return [s.name];
    case 'return': return s.e ? [s.e] : [];
    case 'throw': return [s.e];
    default: return [];
  }
}

/** Expressions whose evaluation has side effects (or observes time): must not be reordered across statements. */
export function hasSideEffect(e: Expr): boolean {
  return someExpr(e, x => x.t === 'call' || x.t === 'new' || x.t === 'assign' || x.t === 'post' ||
    x.t === 'delete' || x.t === 'enumnext' || (x.t === 'builtin' && x.name !== 'getTimer' ? BUILTIN_EFFECT.has(x.name) : false));
}

const BUILTIN_EFFECT = new Set(['random', 'trace', 'getURL', 'loadMovie', 'loadVariables', 'gotoAndPlay', 'gotoAndStop',
  'duplicateMovieClip', 'removeMovieClip', 'startDrag', 'stopDrag', 'call', 'setProperty', 'play', 'stop',
  'nextFrame', 'prevFrame', 'stopAllSounds', 'toggleHighQuality', 'tellTarget', 'targetPath']);

export function readsReg(e: Expr, n: number): boolean {
  return someExpr(e, x => x.t === 'reg' && x.n === n);
}

export function readsVar(e: Expr, name: string): boolean {
  return someExpr(e, x => x.t === 'var' && x.name === name);
}

export function sameExpr(a: Expr, b: Expr): boolean {
  if (a === b) return true;
  return render(a) === render(b);
}

const NEG: Record<string, string> = {
  '<': '>=', '>=': '<', '>': '<=', '<=': '>', '==': '!=', '!=': '==', '===': '!==', '!==': '===',
};

/** Logical negation with comparison inversion (matches how the AS2 compiler emits >=, <=, != via Not). */
export function negate(e: Expr): Expr {
  if (e.t === 'un' && e.op === '!') return e.a;
  if (e.t === 'bin' && NEG[e.op]) return { t: 'bin', op: NEG[e.op], a: e.a, b: e.b };
  if (e.t === 'lit') return { t: 'lit', v: !e.v };
  return { t: 'un', op: '!', a: e };
}

/** Simplify a branch condition: strip double negations. */
export function simplifyCond(e: Expr): Expr {
  if (e.t === 'un' && e.op === '!' && e.a.t === 'un' && e.a.op === '!') return simplifyCond(e.a.a);
  return e;
}
