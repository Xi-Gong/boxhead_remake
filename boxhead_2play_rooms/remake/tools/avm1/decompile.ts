/**
 * Phase 2 of the deobfuscating disassembler: from the explored state graph (explore.ts) to
 *   1. a clean CFG of real instructions grouped into basic blocks,
 *   2. per-block statements built with a symbolic expression stack (concrete inputs become literals),
 *   3. condensation of short-circuit (&&, ||) and ternary diamonds and straight-line chains,
 *   4. a structured pseudo-code tree (if/else, while, for, for..in, break/continue, goto fallback).
 * Every statement keeps the absolute SWF offset of the instruction that produced it.
 */
import type { ExploreResult, PNode, AVal } from './explore.ts';
import { formatOperands } from './opcodes.ts';
import { makeGraph, dominators, postDominators, naturalLoops, reversePostOrder, toDot, type Graph, type Loop } from './cfg.ts';
import {
  type Expr, type Stmt, type RenderCtx, render, renderStmt, mapExpr, mapStmt, stmtExprs, hasSideEffect,
  readsReg, readsVar, sameExpr, negate, simplifyCond, someExpr,
} from './expr.ts';
import { toNumber } from './concrete.ts';

export interface Block {
  id: number;
  nodes: PNode[];
  succ: number[];
  pred: number[];
  /** Abstract stack at entry (phase 1). */
  stackIn: AVal[];
  /** Phase-2 expression objects of the incoming stack (placeholders / literals), for identity checks. */
  inStack: Expr[];
  stmts: Stmt[];
  out: Expr[];
  /** Branch condition: succ[0] is taken when true, succ[1] otherwise. */
  cond?: Expr;
  condOff?: number;
  exit?: { k: 'return' | 'end' | 'throw' | 'fallout' | 'abort'; e?: Expr | null; off: number };
  dead?: boolean;
  /** First instruction offset. */
  off: number;
}

export interface DecompiledUnit {
  blocks: Block[];
  entry: number;
  /** Structured pseudo-code. */
  tree: SNode[];
  warnings: string[];
  /** Clean instruction listing grouped by original blocks (before condensation). */
  listing: string[];
  /** Graphviz of the condensed block graph. */
  dot: (name: string, ctx: RenderCtx) => string;
}

const GETPROP_NAMES = [
  '_x', '_y', '_xscale', '_yscale', '_currentframe', '_totalframes', '_alpha', '_visible', '_width', '_height',
  '_rotation', '_target', '_framesloaded', '_name', '_droptarget', '_url', '_highquality', '_focusrect',
  '_soundbuftime', '_quality', '_xmouse', '_ymouse',
];

const BIN_SYMBOL: Record<string, string> = {
  Add: '+', Add2: '+', Subtract: '-', Multiply: '*', Divide: '/', Modulo: '%', Equals: '==', Equals2: '==',
  StrictEquals: '===', Less: '<', Less2: '<', Greater: '>', And: 'and', Or: 'or', StringEquals: 'eq',
  StringAdd: 'add', StringLess: 'lt', StringGreater: 'gt', BitAnd: '&', BitOr: '|', BitXor: '^',
  BitLShift: '<<', BitRShift: '>>', BitURShift: '>>>', InstanceOf: 'instanceof',
};

const lit = (v: string | number | boolean | null | undefined): Expr => ({ t: 'lit', v });

function avalExpr(a: AVal): Expr {
  if (a.k === 'c') return lit(a.v);
  if (a.k === 'jf') return lit('<junk function>');
  return lit('<?>');
}

// =================================================================================================================
// Block graph (all reachable state nodes; folded ones are kept inside blocks to track the full stack)

export function buildBlocks(res: ExploreResult): { blocks: Block[]; entry: number; listing: string[] } {
  if (res.entry < 0) return { blocks: [], entry: -1, listing: [] };
  const N = res.nodes;
  const preds = new Map<number, number[]>();
  const order: number[] = [];
  const seen = new Set<number>([res.entry]);
  const st = [res.entry];
  while (st.length) {
    const v = st.pop()!;
    order.push(v);
    for (const s of N[v].succ) {
      if (s < 0) continue;
      if (!preds.has(s)) preds.set(s, []);
      preds.get(s)!.push(v);
      if (!seen.has(s)) { seen.add(s); st.push(s); }
    }
  }
  const ends = (v: number) => N[v].succ.length !== 1 || !!N[v].exit || (N[v].ins.name === 'If' && !N[v].folded);
  const isLeader = (v: number): boolean => {
    if (v === res.entry) return true;
    const ps = preds.get(v) ?? [];
    if (ps.length !== 1) return true;
    return ends(ps[0]);
  };
  const leaders = order.filter(isLeader).sort((a, b) => N[a].pc - N[b].pc || a - b);
  leaders.sort((a, b) => (a === res.entry ? -1 : b === res.entry ? 1 : 0));
  const blockOf = new Map<number, number>();
  const blocks: Block[] = [];
  for (const l of leaders) {
    const b: Block = {
      id: blocks.length, nodes: [], succ: [], pred: [], stackIn: N[l].stackIn, inStack: [], stmts: [], out: [],
      off: N[l].pc,
    };
    let v = l;
    const guard = new Set<number>();
    for (;;) {
      b.nodes.push(N[v]);
      blockOf.set(v, b.id);
      guard.add(v);
      if (ends(v)) break;
      const nx = N[v].succ[0];
      if (nx < 0 || isLeader(nx) || guard.has(nx)) break;
      v = nx;
    }
    blocks.push(b);
  }
  const extra: Block[] = [];
  for (const b of blocks) {
    const last = b.nodes[b.nodes.length - 1];
    if (last.exit) continue;
    for (const s of last.succ) {
      if (s < 0 || !blockOf.has(s)) {
        const x: Block = {
          id: blocks.length + extra.length, nodes: [], succ: [], pred: [], stackIn: [], inStack: [], stmts: [], out: [],
          off: -1, exit: { k: 'abort', off: -1 },
        };
        extra.push(x);
        b.succ.push(x.id);
      } else b.succ.push(blockOf.get(s)!);
    }
  }
  blocks.push(...extra);
  for (const b of blocks) for (const s of b.succ) if (!blocks[s].pred.includes(b.id)) blocks[s].pred.push(b.id);

  // Listing: real instructions only (folded junk summarised)
  const listing: string[] = [];
  for (const b of blocks) {
    if (!b.nodes.length) continue;
    const real = b.nodes.filter(n => !n.folded);
    if (!real.length && b.succ.length === 1) continue;
    const sig = b.stackIn.map(a => (a.k === 'c' ? 'c' : a.k === 'e' ? 'enum' : a.k === 'jf' ? 'jf' : 't'));
    listing.push(`  b${b.id}:  ; preds ${b.pred.map(p => 'b' + p).join(',') || '-'}${sig.length ? `  stack-in [${sig.join(',')}]` : ''}`);
    let folded = 0;
    for (const n of b.nodes) {
      if (n.folded) { folded++; continue; }
      const pool = n.pool >= 0 ? res.pools[n.pool] : null;
      const ops = formatOperands(n.ins, pool);
      const lits = n.inp.map(a => (a.k === 'c' ? render(avalExpr(a)) : a.k === 'e' ? 'enum' : '·'));
      listing.push(`    ${String(n.pc).padStart(8)}  ${n.ins.name}${ops ? ' ' + ops : ''}${n.inp.length ? `   ⟨${lits.join(', ')}⟩` : ''}${n.note ? '  ; ' + n.note : ''}`);
    }
    const last = b.nodes[b.nodes.length - 1];
    const fold = folded ? ` (${folded} folded)` : '';
    if (last.exit) listing.push(`              ; exit ${last.exit}${fold}`);
    else listing.push(`              ; -> ${b.succ.map(s => 'b' + s).join(', ')}${fold}`);
  }
  return { blocks, entry: 0, listing };
}

// =================================================================================================================
// Block expression building (full stack: concrete slots are literal expressions)

interface BuildState {
  tmpCount: number;
  warnings: string[];
  /** Offset of the instruction that created an expression (for temporaries). */
  origin: WeakMap<Expr, number>;
}

function buildBlockStmts(b: Block, bs: BuildState, pools: string[][]): void {
  const enumMarkers = new Set<Expr>();
  const stack: Expr[] = b.stackIn.map((a, i): Expr => {
    if (a.k === 'c') return lit(a.v);
    if (a.k === 'jf') return lit('<junk function>');
    if (a.k === 'e') { const m: Expr = { t: 'enumnext', at: a.at }; enumMarkers.add(m); return m; }
    return { t: 'in', blk: b.id, i };
  });
  b.inStack = stack.slice();
  const enumCur = new Map<number, Expr>();
  const stmts: Stmt[] = [];
  const storeResults = new Set<Expr>();

  const flushTemps = (except: Set<Expr>) => {
    for (let i = 0; i < stack.length; i++) {
      const e = stack[i];
      if (except.has(e) || e.t === 'in' || enumMarkers.has(e)) continue;
      if (hasSideEffect(e)) {
        const name = `$t${++bs.tmpCount}`;
        stmts.push({ k: 'assign', target: { t: 'tmp', name }, v: e, off: bs.origin.get(e) ?? -1 });
        stack[i] = { t: 'tmp', name };
      }
    }
  };
  const emit = (s: Stmt, consumed: Expr[] = []) => {
    flushTemps(new Set(consumed));
    stmts.push(s);
  };
  /** Before assigning `target`, protect stack entries that read it (postfix ++/-- recognised). */
  const protect = (target: Expr, value: Expr): Expr | null => {
    if (target.t !== 'reg' && target.t !== 'var') return null;
    const reads = (e: Expr) => (target.t === 'reg' ? readsReg(e, target.n) : readsVar(e, (target as { name: string }).name));
    let post: Expr | null = null;
    for (let i = 0; i < stack.length; i++) {
      const e = stack[i];
      if (e === value || enumMarkers.has(e) || !reads(e)) continue;
      if (sameExpr(e, target) && value.t === 'bin' && (value.op === '+' || value.op === '-') &&
        value.b.t === 'lit' && value.b.v === 1 && sameExpr(value.a, target) && !post) {
        post = { t: 'post', target, op: value.op === '+' ? '++' : '--' };
        stack[i] = post;
        continue;
      }
      const name = `$t${++bs.tmpCount}`;
      stmts.push({ k: 'assign', target: { t: 'tmp', name }, v: e, off: -1 });
      stack[i] = { t: 'tmp', name };
    }
    return post;
  };

  for (const n of b.nodes) {
    const ins = n.ins;
    const off = n.pc;
    // Inputs aligned with n.inp (deepest first). 'e' inputs are virtual pops (the marker stays on the stack).
    const inp: Expr[] = new Array(n.inp.length);
    for (let j = n.inp.length - 1; j >= 0; j--) {
      const a = n.inp[j];
      if (a.k === 'e') {
        const cur = enumCur.get(a.at);
        if (cur) { inp[j] = cur; enumCur.delete(a.at); } else inp[j] = { t: 'enumnext', at: a.at };
        continue;
      }
      const v = stack.pop();
      if (!v) { inp[j] = a.k === 'c' ? lit(a.v) : lit(undefined); continue; }
      inp[j] = v;
    }
    if (n.folded) {
      // Pure / junk: outputs are concrete (or obfuscator values); keep identity for duplicated inputs.
      if (ins.name === 'PushDuplicate' && inp.length === 1) { stack.push(inp[0], inp[0]); continue; }
      if (ins.name === 'StackSwap' && inp.length === 2) { stack.push(inp[1], inp[0]); continue; }
      for (const o of n.out) {
        if (o.k === 'e') continue;
        stack.push(o.k === 'c' ? lit(o.v) : o.k === 'jf' ? lit('<junk function>') : lit('<obfuscator value>'));
      }
      continue;
    }
    const pushOut = (e: Expr) => { bs.origin.set(e, off); stack.push(e); };
    const name = ins.name;
    switch (name) {
      case 'Push': {
        const pool = n.pool >= 0 ? pools[n.pool] : null;
        for (const v of ins.push!) {
          switch (v.t) {
            case 'register': stack.push({ t: 'reg', n: v.v }); break;
            case 'string': stack.push(lit(v.v)); break;
            case 'float': case 'double': case 'integer': stack.push(lit(v.v)); break;
            case 'boolean': stack.push(lit(v.v)); break;
            case 'null': stack.push(lit(null)); break;
            case 'undefined': stack.push(lit(undefined)); break;
            case 'constant': stack.push(lit(pool && v.v < pool.length ? pool[v.v] : `<c${v.v}?>`)); break;
          }
        }
        break;
      }
      case 'Pop': {
        const e = inp[0];
        if (storeResults.has(e)) break;
        if (e.t === 'in' || e.t === 'lit') stmts.push({ k: 'discard', e, off });
        else if (hasSideEffect(e)) emit({ k: 'expr', e, off }, [e]);
        else stmts.push({ k: 'discard', e, off });
        break;
      }
      case 'PushDuplicate': stack.push(inp[0], inp[0]); break;
      case 'StackSwap': stack.push(inp[1], inp[0]); break;
      case 'GetVariable': {
        const nm = inp[0];
        pushOut(nm.t === 'lit' && typeof nm.v === 'string' ? { t: 'var', name: nm.v } : { t: 'eval', e: nm });
        break;
      }
      case 'SetVariable': case 'DefineLocal': {
        const [nm, v] = inp;
        const target: Expr = nm.t === 'lit' && typeof nm.v === 'string' ? { t: 'var', name: nm.v } : { t: 'eval', e: nm };
        if (protect(target, v)) break; // `x++` folded into the pending stack entry
        emit({ k: 'assign', target, v, off, decl: name === 'DefineLocal' }, [v]);
        break;
      }
      case 'DefineLocal2': {
        const nm = inp[0];
        emit({ k: 'decl', name: nm.t === 'lit' && typeof nm.v === 'string' ? { t: 'var', name: nm.v } : nm, off });
        break;
      }
      case 'GetMember': pushOut({ t: 'mem', o: inp[0], p: inp[1] }); break;
      case 'SetMember': {
        const [o, p, v] = inp;
        const target: Expr = { t: 'mem', o, p };
        // `o.p++` / `o.p--`: the old value was pushed first and stays on the stack
        const top = stack[stack.length - 1];
        if (top && v.t === 'bin' && (v.op === '+' || v.op === '-') && v.b.t === 'lit' && v.b.v === 1 &&
          sameExpr(v.a, target) && sameExpr(top, target) && !hasSideEffect(target)) {
          stack[stack.length - 1] = { t: 'post', target, op: v.op === '+' ? '++' : '--' };
          break;
        }
        emit({ k: 'assign', target, v, off }, [o, p, v]);
        break;
      }
      case 'Delete': pushOut({ t: 'delete', o: inp[0], p: inp[1] }); break;
      case 'Delete2': pushOut({ t: 'delete', o: null, p: inp[0] }); break;
      case 'StoreRegister': {
        const target: Expr = { t: 'reg', n: ins.num! };
        if (n.inp[0].k === 'e') {
          const at = (n.inp[0] as { at: number }).at;
          emit({ k: 'assign', target, v: { t: 'enumnext', at }, off });
          enumCur.set(at, target);
          break;
        }
        const v = inp[0];
        const post = protect(target, v);
        if (post) { stack.push(v); storeResults.add(v); break; }
        emit({ k: 'assign', target, v, off }, [v]);
        if (v.t === 'lit') { stack.push(v); break; }
        const r: Expr = { t: 'reg', n: ins.num! };
        storeResults.add(r);
        stack.push(r);
        break;
      }
      case 'CallFunction': {
        const k = n.inp.length - 2;
        const args = inp.slice(0, k).reverse();
        const nm = inp[k + 1];
        pushOut(nm.t === 'lit' && typeof nm.v === 'string'
          ? { t: 'call', f: { t: 'var', name: nm.v }, args }
          : { t: 'call', f: { t: 'eval', e: nm }, args });
        break;
      }
      case 'CallMethod': case 'NewMethod': {
        const k = n.inp.length - 3;
        const args = inp.slice(0, k).reverse();
        const obj = inp[k + 1], nm = inp[k + 2];
        const emptyName = nm.t === 'lit' && (nm.v === undefined || nm.v === '');
        const f: Expr = emptyName ? obj : { t: 'mem', o: obj, p: nm };
        pushOut(name === 'CallMethod' ? { t: 'call', f, args } : { t: 'new', f, args });
        break;
      }
      case 'NewObject': {
        const k = n.inp.length - 2;
        const args = inp.slice(0, k).reverse();
        const nm = inp[k + 1];
        pushOut({ t: 'new', f: nm.t === 'lit' && typeof nm.v === 'string' ? { t: 'var', name: nm.v } : { t: 'eval', e: nm }, args });
        break;
      }
      case 'InitArray': {
        const k = n.inp.length - 1;
        pushOut({ t: 'arr', items: inp.slice(0, k).reverse() });
        break;
      }
      case 'InitObject': {
        const k = (n.inp.length - 1) / 2;
        // Source (push) order, as ffdec prints it. NOTE: the VM creates the properties in the reverse order
        // (last pair popped first), which is what for..in enumerates first.
        const props: Array<[Expr, Expr]> = [];
        for (let i = 0; i < k; i++) props.push([inp[2 * i], inp[2 * i + 1]]);
        pushOut({ t: 'obj', props });
        break;
      }
      case 'ImplementsOp': {
        const k = n.inp.length - 2;
        emit({ k: 'expr', e: { t: 'builtin', name: '§implements', args: [inp[k + 1], ...inp.slice(0, k).reverse()] }, off });
        break;
      }
      case 'Extends': emit({ k: 'expr', e: { t: 'builtin', name: '§extends', args: [inp[0], inp[1]] }, off }); break;
      case 'Enumerate': case 'Enumerate2': {
        const o: Expr = name === 'Enumerate' ? { t: 'eval', e: inp[0] } : inp[0];
        emit({ k: 'expr', e: { t: 'builtin', name: `§forin@${off}`, args: [o] }, off });
        const m: Expr = { t: 'enumnext', at: off };
        enumMarkers.add(m);
        stack.push(m);
        break;
      }
      case 'Return': b.exit = { k: 'return', e: inp[0].t === 'lit' && inp[0].v === undefined ? null : inp[0], off }; break;
      case 'Throw': b.exit = { k: 'throw', e: inp[0], off }; break;
      case 'End': b.exit = { k: 'end', off }; break;
      case '<end of function>': b.exit = { k: 'return', e: null, off }; break;
      case '<out of buffer>': b.exit = { k: 'abort', off }; break;
      case 'If': b.cond = inp[0]; b.condOff = off; break;
      case 'GetTime': pushOut({ t: 'builtin', name: 'getTimer', args: [] }); break;
      case 'DefineFunction': case 'DefineFunction2': {
        if (ins.fn!.name) emit({ k: 'raw', text: `function ${ins.fn!.name} = function@${off};`, off });
        else stack.push({ t: 'fn', off });
        break;
      }
      case 'Not': pushOut(negate(inp[0])); break;
      case 'Increment': pushOut({ t: 'bin', op: '+', a: inp[0], b: lit(1) }); break;
      case 'Decrement': pushOut({ t: 'bin', op: '-', a: inp[0], b: lit(1) }); break;
      case 'ToInteger': pushOut({ t: 'builtin', name: 'int', args: [inp[0]] }); break;
      case 'ToNumber': pushOut({ t: 'builtin', name: 'Number', args: [inp[0]] }); break;
      case 'ToString': pushOut({ t: 'builtin', name: 'String', args: [inp[0]] }); break;
      case 'TypeOf': pushOut({ t: 'un', op: 'typeof', a: inp[0] }); break;
      case 'StringLength': case 'MBStringLength': pushOut({ t: 'builtin', name: 'length', args: [inp[0]] }); break;
      case 'CharToAscii': case 'MBCharToAscii': pushOut({ t: 'builtin', name: 'ord', args: [inp[0]] }); break;
      case 'AsciiToChar': case 'MBAsciiToChar': pushOut({ t: 'builtin', name: 'chr', args: [inp[0]] }); break;
      case 'RandomNumber': pushOut({ t: 'builtin', name: 'random', args: [inp[0]] }); break;
      case 'TargetPath': pushOut({ t: 'builtin', name: 'targetPath', args: [inp[0]] }); break;
      case 'StringExtract': case 'MBStringExtract': pushOut({ t: 'builtin', name: 'substring', args: inp.slice() }); break;
      case 'CastOp': pushOut({ t: 'call', f: inp[0], args: [inp[1]] }); break;
      case 'GetProperty': {
        const idx = inp[1];
        const pn = idx.t === 'lit' ? GETPROP_NAMES[toNumber(idx.v)] : undefined;
        pushOut(pn ? { t: 'mem', o: inp[0], p: lit(pn) } : { t: 'builtin', name: 'getProperty', args: inp.slice() });
        break;
      }
      case 'SetProperty': {
        const idx = inp[1];
        const pn = idx.t === 'lit' ? GETPROP_NAMES[toNumber(idx.v)] : undefined;
        if (pn) emit({ k: 'assign', target: { t: 'mem', o: inp[0], p: lit(pn) }, v: inp[2], off });
        else emit({ k: 'expr', e: { t: 'builtin', name: 'setProperty', args: inp.slice() }, off });
        break;
      }
      case 'Trace': emit({ k: 'expr', e: { t: 'builtin', name: 'trace', args: [inp[0]] }, off }); break;
      case 'With': emit({ k: 'raw', text: `§with (${render(inp[0])}) { /* until ${n.scopeEnd} */`, off }); break;
      case 'Try': emit({ k: 'raw', text: `§try /* ${formatOperands(ins)} */`, off }); break;
      default: {
        const sym = BIN_SYMBOL[name];
        if (sym && n.inp.length === 2) { pushOut({ t: 'bin', op: sym, a: inp[0], b: inp[1] }); break; }
        const args = inp.slice();
        let text = name;
        switch (name) {
          case 'Play': text = 'play'; break;
          case 'Stop': text = 'stop'; break;
          case 'NextFrame': text = 'nextFrame'; break;
          case 'PreviousFrame': text = 'prevFrame'; break;
          case 'StopSounds': text = 'stopAllSounds'; break;
          case 'ToggleQuality': text = 'toggleHighQuality'; break;
          case 'GotoFrame': text = 'gotoAndStop'; args.push(lit(ins.num! + 1)); break;
          case 'GoToLabel': text = 'gotoAndStop'; args.push(lit(ins.str!)); break;
          case 'GotoFrame2': text = ins.num! & 1 ? 'gotoAndPlay' : 'gotoAndStop'; break;
          case 'GetURL': text = 'getURL'; args.push(lit(ins.str!), lit(ins.str2!)); break;
          case 'GetURL2': text = 'getURL2'; args.push(lit(ins.num!)); break;
          case 'SetTarget': text = 'tellTarget'; args.push(lit(ins.str!)); break;
          case 'SetTarget2': text = 'tellTarget'; break;
          case 'Call': text = 'call'; break;
          case 'CloneSprite': text = 'duplicateMovieClip'; break;
          case 'RemoveSprite': text = 'removeMovieClip'; break;
          case 'EndDrag': text = 'stopDrag'; break;
          default: text = '§' + name; break;
        }
        const e: Expr = { t: 'builtin', name: text, args };
        if (n.out.some(o => o.k === 't')) pushOut(e); else emit({ k: 'expr', e, off });
      }
    }
  }
  const last = b.nodes[b.nodes.length - 1];
  if (last && last.exit && !b.exit) b.exit = { k: last.exit, off: last.pc };
  b.stmts = stmts;
  b.out = stack;
}

// =================================================================================================================
// Condensation

/**
 * Substitution of a block's incoming stack: placeholders by slot index, and the block's own incoming literal
 * objects by identity (so that pass-through slots keep the predecessor's objects after a merge).
 */
function substBlock(target: Block, values: Expr[]): (x: Expr) => Expr | undefined {
  const byObj = new Map<Expr, Expr>();
  target.inStack.forEach((e, i) => { if (e.t !== 'in' && values[i] !== undefined) byObj.set(e, values[i]); });
  return (x: Expr) => {
    if (x.t === 'in' && x.blk === target.id) return values[x.i] ?? x;
    return byObj.get(x);
  };
}

function exprUsesIn(e: Expr, blk: number, i: number): boolean {
  return someExpr(e, x => x.t === 'in' && x.blk === blk && x.i === i);
}

function applySubst(J: Block, f: (x: Expr) => Expr | undefined): void {
  J.stmts = J.stmts.map(s => mapStmt(s, f));
  J.out = J.out.map(e => mapExpr(e, f));
  if (J.cond) J.cond = mapExpr(J.cond, f);
  if (J.exit?.e) J.exit = { ...J.exit, e: mapExpr(J.exit.e, f) };
}

/** True when block S leaves stack slots [0, k) untouched (identity), given its incoming stack objects. */
function passthrough(S: Block, k: number): boolean {
  for (let i = 0; i < k; i++) if (S.out[i] !== S.inStack[i]) return false;
  return true;
}

function condense(blocks: Block[], entry: number, bs: BuildState): void {
  const live = () => blocks.filter(b => !b.dead);
  const replacePred = (blk: Block, oldP: number, newP: number) => {
    blk.pred = [...new Set(blk.pred.map(p => (p === oldP ? newP : p)))];
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10000) {
    changed = false;
    // 0. empty forwarding blocks (only folded jumps): redirect their predecessors
    for (const B of live()) {
      if (B.id === entry || B.dead || B.cond || B.exit || B.succ.length !== 1 || B.stmts.length) continue;
      const C = blocks[B.succ[0]];
      if (C === B || C.dead || C.inStack.length !== B.out.length || B.out.length !== B.inStack.length) continue;
      if (!passthrough(B, B.inStack.length)) continue;
      if (B.inStack.some((e, i) => e.t === 'in' && C.inStack[i].t !== 'in')) continue;
      for (const p of B.pred) {
        const P = blocks[p];
        P.succ = P.succ.map(x => (x === B.id ? C.id : x));
      }
      C.pred = [...new Set(C.pred.filter(x => x !== B.id).concat(B.pred))];
      B.dead = true;
      changed = true;
    }
    // 1. linear merge
    for (const B of live()) {
      if (B.dead || B.exit || B.cond || B.succ.length !== 1) continue;
      const C = blocks[B.succ[0]];
      if (C.dead || C === B || C.id === entry || C.pred.length !== 1 || C.pred[0] !== B.id) continue;
      if (C.inStack.length !== B.out.length) {
        bs.warnings.push(`stack depth mismatch b${B.id}->b${C.id} (${B.out.length} vs ${C.inStack.length})`);
        continue;
      }
      const vals = B.out.slice();
      for (let i = 0; i < vals.length; i++) {
        if (C.inStack[i].t !== 'in' || !hasSideEffect(vals[i]) || vals[i].t === 'enumnext') continue;
        const firstUse = C.stmts.findIndex(s => stmtExprs(s).some(e => exprUsesIn(e, C.id, i)));
        if (firstUse === 0 || (firstUse < 0 && C.stmts.length === 0)) continue;
        const name = `$t${++bs.tmpCount}`;
        B.stmts.push({ k: 'assign', target: { t: 'tmp', name }, v: vals[i], off: bs.origin.get(vals[i]) ?? -1 });
        vals[i] = { t: 'tmp', name };
      }
      applySubst(C, substBlock(C, vals));
      B.stmts.push(...C.stmts);
      B.out = C.out;
      B.cond = C.cond;
      B.condOff = C.condOff;
      B.exit = C.exit;
      B.succ = C.succ.slice();
      B.nodes = B.nodes.concat(C.nodes);
      for (const s of C.succ) replacePred(blocks[s], C.id, B.id);
      C.dead = true;
      changed = true;
    }
    // 2. short-circuit (&&, ||) and ternary diamonds
    for (const D of live()) {
      if (D.dead || !D.cond || D.succ.length !== 2) continue;
      const k = D.out.length;
      const [T, F] = D.succ.map(s => blocks[s]);
      if (T === F) continue;
      let done = false;
      for (const [S, J, jTaken] of [[F, T, true], [T, F, false]] as Array<[Block, Block, boolean]>) {
        if (k < 1 || S.dead || J.dead || S.pred.length !== 1 || S.pred[0] !== D.id) continue;
        if (S.exit || S.cond || S.succ.length !== 1 || S.succ[0] !== J.id) continue;
        if (S.inStack.length !== k || S.out.length !== k || J.inStack.length !== k) continue;
        if (J.inStack[k - 1].t !== 'in') continue;
        if (!passthrough(S, k - 1)) continue;
        const top = S.inStack[k - 1];
        if (!S.stmts.every(s => s.k === 'discard' && s.e === top)) continue;
        if (S.out[k - 1] === top || (top.t === 'in' && exprUsesIn(S.out[k - 1], S.id, k - 1))) continue;
        const y = mapExpr(S.out[k - 1], substBlock(S, D.out));
        const x = D.out[k - 1];
        const c = simplifyCond(D.cond);
        const cIsX = sameExpr(c, x);
        const cIsNotX = !cIsX && (sameExpr(negate(c), x) || (c.t === 'un' && c.op === '!' && sameExpr(c.a, x)));
        let v: Expr;
        if (jTaken) v = cIsX ? { t: 'bin', op: '||', a: x, b: y } : cIsNotX ? { t: 'bin', op: '&&', a: x, b: y } : { t: 'tern', c: negate(c), a: y, b: x };
        else v = cIsX ? { t: 'bin', op: '&&', a: x, b: y } : cIsNotX ? { t: 'bin', op: '||', a: x, b: y } : { t: 'tern', c: negate(c), a: x, b: y };
        D.out = D.out.slice(0, k - 1).concat([v]);
        D.cond = undefined; D.condOff = undefined;
        D.succ = [J.id];
        J.pred = J.pred.filter(p => p !== S.id);
        if (!J.pred.includes(D.id)) J.pred.push(D.id);
        S.dead = true;
        changed = true;
        done = true;
        break;
      }
      if (done || !D.cond) continue;
      if (T.dead || F.dead || T.pred.length !== 1 || F.pred.length !== 1) continue;
      if (T.exit || F.exit || T.cond || F.cond || T.succ.length !== 1 || F.succ.length !== 1 || T.succ[0] !== F.succ[0]) continue;
      if (T.stmts.length || F.stmts.length) continue;
      const J = blocks[T.succ[0]];
      if (T.inStack.length !== k || F.inStack.length !== k || T.out.length !== k + 1 || F.out.length !== k + 1) continue;
      if (J.inStack.length !== k + 1 || J.inStack[k].t !== 'in') continue;
      if (!passthrough(T, k) || !passthrough(F, k)) continue;
      const vt = mapExpr(T.out[k], substBlock(T, D.out));
      const vf = mapExpr(F.out[k], substBlock(F, D.out));
      D.out = D.out.concat([{ t: 'tern', c: negate(simplifyCond(D.cond)), a: vf, b: vt }]);
      D.cond = undefined; D.condOff = undefined;
      D.succ = [J.id];
      J.pred = J.pred.filter(p => p !== T.id && p !== F.id).concat([D.id]);
      T.dead = true; F.dead = true;
      changed = true;
    }
    // 3. uniform incoming values
    for (const J of live()) {
      if (J.id === entry || !J.inStack.length || !J.pred.length) continue;
      const preds = J.pred.map(p => blocks[p]);
      if (preds.some(p => p.out.length !== J.inStack.length)) continue;
      const vals: Expr[] = J.inStack.slice();
      let any = false;
      for (let i = 0; i < J.inStack.length; i++) {
        if (J.inStack[i].t !== 'in') continue;
        const first = preds[0].out[i];
        if (first.t === 'in' || hasSideEffect(first) || someExpr(first, x => x.t === 'in')) continue;
        if (preds.every(p => sameExpr(p.out[i], first))) { vals[i] = first; any = true; }
      }
      if (!any) continue;
      const before = JSON.stringify([J.stmts, J.out, J.cond ?? null]);
      applySubst(J, substBlock(J, vals));
      J.inStack = vals;
      if (JSON.stringify([J.stmts, J.out, J.cond ?? null]) !== before) changed = true;
    }
  }
  // 4. Remaining carried values become explicit stack temporaries.
  for (const J of live()) {
    if (!J.inStack.length) continue;
    const used = new Set<number>();
    const discarded = new Set<number>();
    const chk = (e: Expr) => { someExpr(e, x => { if (x.t === 'in' && x.blk === J.id) used.add(x.i); return false; }); };
    for (const st of J.stmts) {
      if (st.k === 'discard' && st.e.t === 'in' && st.e.blk === J.id) { discarded.add(st.e.i); continue; }
      stmtExprs(st).forEach(chk);
    }
    J.out.forEach(chk);
    if (J.cond) chk(J.cond);
    if (J.exit?.e) chk(J.exit.e);
    // Values only popped at the join: the predecessors evaluate them as expression statements.
    for (const i of discarded) {
      if (used.has(i)) continue;
      for (const p of J.pred.map(x => blocks[x])) {
        const v = p.out[i];
        if (v && v.t !== 'in' && hasSideEffect(v)) p.stmts.push({ k: 'expr', e: v, off: bs.origin.get(v) ?? -1 });
      }
      J.stmts = J.stmts.filter(st => !(st.k === 'discard' && st.e.t === 'in' && st.e.blk === J.id && st.e.i === i));
    }
    if (!used.size) continue;
    const vals: Expr[] = J.inStack.map((e, i) => (e.t === 'in' ? { t: 'tmp', name: `§stack${i}_b${J.id}` } : e));
    applySubst(J, substBlock(J, vals));
    for (const p of J.pred.map(x => blocks[x])) {
      for (const i of used) {
        const v = p.out[i];
        if (v && !(v.t === 'tmp' && v.name === `§stack${i}_b${J.id}`) && !(v.t === 'in' && v.blk === J.id && v.i === i)) {
          p.stmts.push({ k: 'assign', target: vals[i], v, off: -1 });
        }
      }
    }
    bs.warnings.push(`b${J.id}: ${used.size} stack value(s) carried across a join (shown as §stack temporaries)`);
  }
}

// =================================================================================================================
// Register-0 peephole: the AS2 compiler uses r0 as a scratch register for chained assignments
// (`a.x = b.y = v`), assignment expressions (`(this.v = e) != undefined`) and pre-increments (`++o.p > 5`).

function peepholeR0(blocks: Block[]): void {
  const isR0 = (e: Expr) => e.t === 'reg' && e.n === 0;
  const countR0 = (e: Expr): number => { let n = 0; someExpr(e, x => { if (isR0(x)) n++; return false; }); return n; };
  const stmtReadsR0 = (s: Stmt): number => {
    if (s.k === 'assign' && isR0(s.target)) return countR0(s.v);
    return stmtExprs(s).reduce((a, e) => a + countR0(e), 0);
  };
  const live = blocks.filter(b => !b.dead);
  // Backward liveness of r0 over the block graph.
  const use = new Map<number, boolean>(), def = new Map<number, boolean>();
  for (const b of live) {
    let u = false, d = false;
    for (const s of b.stmts) {
      if (!d && stmtReadsR0(s)) { u = true; break; }
      if (s.k === 'assign' && isR0(s.target)) { d = true; break; }
    }
    if (!d && !u && ((b.cond && countR0(b.cond)) || (b.exit?.e && countR0(b.exit.e)))) u = true;
    use.set(b.id, u); def.set(b.id, d);
  }
  const liveIn = new Map<number, boolean>(live.map(b => [b.id, use.get(b.id)!]));
  const liveOut = new Map<number, boolean>();
  for (let changed = true, guard = 0; changed && guard < 1000; guard++) {
    changed = false;
    for (const b of live) {
      const lo = b.succ.some(s => liveIn.get(s));
      liveOut.set(b.id, lo);
      const li = use.get(b.id)! || (lo && !def.get(b.id));
      if (li !== liveIn.get(b.id)) { liveIn.set(b.id, li); changed = true; }
    }
  }
  for (const b of live) {
    const S = b.stmts;
    for (let i = 0; i < S.length; i++) {
      const s0 = S[i];
      if (s0.k !== 'assign' || !isR0(s0.target) || s0.decl || countR0(s0.v)) continue;
      let j = i + 1;
      let e: Expr = s0.v;
      const chain: Stmt[] = [];
      while (j < S.length) {
        const sj = S[j];
        // StoreRegister of a literal leaves the literal object itself on the stack: match it by identity
        const viaR0 = sj.k === 'assign' && (isR0(sj.v) || (s0.v.t === 'lit' && sj.v === s0.v));
        if (sj.k === 'assign' && viaR0 && !isR0(sj.target) && !countR0(sj.target)) { chain.push(sj); j++; } else break;
      }
      for (const c of chain) if (c.k === 'assign') e = { t: 'assign', target: c.target, v: e };
      // remaining uses of r0 before the next write
      let k = j, uses = 0, useIdx = -1;
      for (; k < S.length; k++) {
        const sk = S[k];
        const r = stmtReadsR0(sk);
        if (r) { uses += r; if (useIdx < 0) useIdx = k; }
        if (sk.k === 'assign' && isR0(sk.target)) break;
      }
      const tailFree = k < S.length; // r0 rewritten later in this block
      // the value may still be needed by a successor block
      if (!tailFree && liveOut.get(b.id)) continue;
      const condUses = !tailFree && b.cond ? countR0(b.cond) : 0;
      const outUses = !tailFree ? (b.exit?.e ? countR0(b.exit.e) : 0) : 0;
      const replace = (x: Expr) => (isR0(x) ? e : undefined);
      if (uses + condUses + outUses === 0 && chain.length) {
        // `T_last = ... = T1 = V;`
        const last = chain[chain.length - 1] as Extract<Stmt, { k: 'assign' }>;
        const inner = e.t === 'assign' ? e.v : e;
        S.splice(i, j - i, { k: 'assign', target: last.target, v: inner, off: last.off });
        continue;
      }
      if (uses === 1 && condUses + outUses === 0 && useIdx === j) {
        S[j] = mapStmt(S[j], replace);
        S.splice(i, j - i);
        continue;
      }
      if (uses === 0 && condUses + outUses === 1 && j === S.length) {
        if (condUses) b.cond = mapExpr(b.cond!, replace);
        else if (b.exit?.e) b.exit = { ...b.exit, e: mapExpr(b.exit.e, replace) };
        S.splice(i, j - i);
        continue;
      }
    }
  }
}

// =================================================================================================================
// Structuring

export type SNode =
  | { k: 'stmt'; s: Stmt }
  | { k: 'if'; cond: Expr; then: SNode[]; else: SNode[] | null; off: number }
  | { k: 'while'; cond: Expr | null; body: SNode[]; off: number; forInit?: Stmt; forIncr?: Stmt }
  | { k: 'forin'; target: Expr; obj: Expr; body: SNode[]; off: number }
  | { k: 'switch'; disc: Expr; cases: Array<{ labels: Array<Expr | 'default'>; body: SNode[] }>; off: number }
  | { k: 'break'; off?: number }
  | { k: 'continue'; off?: number }
  | { k: 'goto'; label: number }
  | { k: 'label'; label: number };

interface Ctx {
  /** Enclosing loops and switches (switch: header -1, follow = end of switch). */
  loops: Array<{ header: number; follow: number | null; body: Set<number>; kind?: 'switch' }>;
}

function structure(blocks: Block[], entryId: number): { tree: SNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const liveBlocks = blocks.filter(b => !b.dead);
  const idx = new Map<number, number>();
  liveBlocks.forEach((b, i) => idx.set(b.id, i));
  const edges: Array<[number, number]> = [];
  for (const b of liveBlocks) for (const s of b.succ) if (idx.has(s)) edges.push([idx.get(b.id)!, idx.get(s)!]);
  const g: Graph = makeGraph(liveBlocks.length, idx.get(entryId)!, edges);
  const idom = dominators(g.succ, g.pred, g.entry);
  const ipdom = postDominators(g);
  const loops = naturalLoops(g, idom);
  const loopByHeader = new Map<number, Loop>();
  for (const L of loops) loopByHeader.set(L.header, L);

  const emitted = new Set<number>();
  const labels = new Set<number>();
  const B = (i: number) => liveBlocks[i];

  const loopFollow = (L: Loop): number | null => {
    if (!L.exits.length) return null;
    if (L.exits.length === 1) return L.exits[0];
    // Prefer the exit that post-dominates the header, else the exit reached from the header itself.
    const pd = ipdom[L.header];
    if (pd !== undefined && pd < g.n && L.exits.includes(pd)) return pd;
    for (const s of g.succ[L.header]) if (L.exits.includes(s)) return s;
    // Otherwise the exit with the highest offset
    return [...L.exits].sort((a, b) => B(b).off - B(a).off)[0];
  };

  const stmtNodes = (b: Block): SNode[] => b.stmts.filter(s => !(s.k === 'discard' && !hasSideEffect(s.e) && s.e.t !== 'builtin' && s.e.t !== 'var' && s.e.t !== 'mem'))
    .map(s => ({ k: 'stmt', s }) as SNode);

  const exitNode = (e: NonNullable<Block['exit']>): SNode => {
    if (e.k === 'return') return { k: 'stmt', s: { k: 'return', e: e.e ?? null, off: e.off } };
    if (e.k === 'throw') return { k: 'stmt', s: { k: 'throw', e: e.e!, off: e.off } };
    if (e.k === 'end') return { k: 'stmt', s: { k: 'end', off: e.off } };
    return { k: 'stmt', s: { k: 'raw', text: `§${e.k}; // control flow lost here`, off: e.off } };
  };

  /**
   * Emit the region starting at `start` until `stop` (exclusive). `headerFirst`: `start` is the header of the
   * innermost loop being emitted (skip the loop-control checks for it once).
   */
  const seq = (start: number | null, stop: number | null, ctx: Ctx, depth: number, headerFirst = false): SNode[] => {
    const out: SNode[] = [];
    let cur = start;
    let first = headerFirst;
    let guard = 0;
    while (cur !== null && cur !== stop) {
      if (guard++ > 100000 || depth > 600) { warnings.push('structuring guard hit'); break; }
      if (!first) {
        let handled = false;
        for (let li = ctx.loops.length - 1; li >= 0 && !handled; li--) {
          const L = ctx.loops[li];
          if (cur === L.header) {
            out.push({ k: 'continue' });
            if (ctx.loops.slice(li + 1).some(x => x.kind !== 'switch')) warnings.push(`continue to outer loop at b${B(cur).id}`);
            handled = true;
          } else if (cur === L.follow) {
            out.push({ k: 'break' });
            if (li !== ctx.loops.length - 1) warnings.push(`break out of an outer ${L.kind === 'switch' ? 'switch' : 'loop'} at b${B(cur).id}`);
            handled = true;
          }
        }
        if (handled) return out;
        if (emitted.has(cur)) {
          const eb = B(cur);
          if (eb.exit && g.succ[cur].length === 0 && stmtNodes(eb).length <= 4) {
            // small shared exit (`return x;`): duplicate instead of goto, as the compiler source had it
            out.push(...stmtNodes(eb), exitNode(eb.exit));
            return out;
          }
          out.push({ k: 'goto', label: cur }); labels.add(cur); return out;
        }
        const L = loopByHeader.get(cur);
        if (L && !ctx.loops.some(x => x.header === cur)) {
          const follow = loopFollow(L);
          const inner: Ctx = { loops: [...ctx.loops, { header: cur, follow, body: L.body }] };
          out.push({ k: 'label', label: cur });
          const body = seq(cur, null, inner, depth + 1, true);
          out.push({ k: 'while', cond: null, body, off: B(cur).off });
          cur = follow;
          continue;
        }
      }
      first = false;
      emitted.add(cur);
      if (!headerFirst || cur !== start) out.push({ k: 'label', label: cur });
      const b = B(cur);
      out.push(...stmtNodes(b));
      if (b.exit) { out.push(exitNode(b.exit)); return out; }
      const succ = g.succ[cur];
      if (!b.cond || succ.length === 1) {
        if (succ[0] === undefined) return out;
        cur = succ[0];
        continue;
      }
      const inLoop = ctx.loops[ctx.loops.length - 1];
      const t = succ[0], f = succ[1];
      const sw = detectSwitch(cur);
      if (sw) {
        // drop the `rN = discriminant` store that precedes the tests
        const last = out[out.length - 1];
        let disc: Expr = sw.reg;
        if (last && last.k === 'stmt' && last.s.k === 'assign' && sameExpr(last.s.target, sw.reg)) { disc = last.s.v; out.pop(); }
        for (const x of sw.tests) emitted.add(x);
        const order = [...new Set([...sw.cases.map(c => c.target), ...(sw.def !== null ? [sw.def] : [])])]
          .sort((a, b2) => B(a).off - B(b2).off);
        const body = new Set<number>();
        const st2 = [...order];
        while (st2.length) {
          const x = st2.pop()!;
          if (x === sw.end || body.has(x)) continue;
          body.add(x);
          for (const y of g.succ[x]) st2.push(y);
        }
        const swCtx: Ctx = { loops: [...ctx.loops, { header: -1, follow: sw.end, body, kind: 'switch' }] };
        const cases: Array<{ labels: Array<Expr | 'default'>; body: SNode[] }> = [];
        order.forEach((tgt, i) => {
          const labels2: Array<Expr | 'default'> = sw.cases.filter(c => c.target === tgt).map(c => c.value);
          if (tgt === sw.def) labels2.push('default');
          const stopAt = i + 1 < order.length ? order[i + 1] : sw.end;
          cases.push({ labels: labels2, body: seq(tgt, stopAt, swCtx, depth + 1) });
        });
        out.push({ k: 'switch', disc, cases, off: b.condOff ?? b.off });
        if (sw.end === null) return out;
        cur = sw.end;
        continue;
      }
      const cond0 = simplifyCond(b.cond);
      const off0 = b.condOff ?? b.off;
      if (inLoop && t !== f) {
        // `if (c) break;` / `if (c) continue;` then continue with the other arm inline
        // only for loop exits; a jump back to the header is structured as `if (c) { rest }` (ffdec's shape)
        const ctl = (x: number): SNode | null => (x === inLoop.follow && inLoop.kind !== 'switch' ? { k: 'break' } : null);
        const ct = ctl(t), cf = ctl(f);
        if (ct && !cf) { out.push({ k: 'if', cond: cond0, then: [ct], else: null, off: off0 }); cur = f; continue; }
        if (cf && !ct) { out.push({ k: 'if', cond: negate(cond0), then: [cf], else: null, off: off0 }); cur = t; continue; }
      }
      let join: number | null = ipdom[cur] !== undefined && ipdom[cur] < g.n ? ipdom[cur] : null;
      const swEnd = inLoop && inLoop.kind === 'switch' && join === inLoop.follow; // in a switch the end is a fine join (`break` after the if)
      if (join !== null && inLoop && !inLoop.body.has(join) && !swEnd) join = null;
      if (join !== null && inLoop && join === inLoop.follow && !swEnd) join = null;
      if (swEnd && stop !== null && stop !== inLoop!.follow) {
        // case fall-through: if the next case label is reachable from here (not via the end), it is the join
        const seen = new Set<number>();
        const st = [t, f];
        let hit = false;
        while (st.length && !hit) {
          const y = st.pop()!;
          if (seen.has(y) || y === inLoop!.follow) continue;
          if (y === stop) { hit = true; break; }
          seen.add(y);
          for (const z of g.succ[y]) st.push(z);
        }
        if (hit) join = stop;
      }
      if (join === null || (inLoop && join === inLoop.header)) { const cj = commonJoin(t, f, stop, inLoop); if (cj !== null || join === null) join = cj; }
      // inside an enclosing if-arm, a branch to the loop header is a `continue`; the arm still ends at that arm's stop
      if (inLoop && join === inLoop.header && stop !== null && stop !== inLoop.header) join = stop;
      const armStop = join ?? stop;
      const cond = simplifyCond(b.cond);
      const off = b.condOff ?? b.off;
      let node: SNode;
      if (t === join) {
        node = { k: 'if', cond: negate(cond), then: seq(f, armStop, ctx, depth + 1), else: null, off };
      } else if (f === join) {
        node = { k: 'if', cond, then: seq(t, armStop, ctx, depth + 1), else: null, off };
      } else {
        const thenArm = seq(f, armStop, ctx, depth + 1);
        const elseArm = seq(t, armStop, ctx, depth + 1);
        node = { k: 'if', cond: negate(cond), then: thenArm, else: elseArm.length ? elseArm : null, off };
      }
      out.push(node);
      if (join === null) return out;
      cur = join;
    }
    return out;
  };

  const rpoIndex = new Int32Array(g.n).fill(-1);
  {
    const order = reversePostOrder(g.succ, g.entry);
    order.forEach((v, i) => { rpoIndex[v] = i; });
  }
  /**
   * Join of an if whose arms do not have a real post-dominator (one arm returns): the earliest block reachable from
   * both arms (within the current loop / region), provided every other common block is reachable from it.
   */
  function commonJoin(t: number, f: number, stop: number | null, inLoop: Ctx['loops'][number] | undefined): number | null {
    const reach = (from: number): Set<number> => {
      const seen = new Set<number>();
      const st = [from];
      while (st.length) {
        const x = st.pop()!;
        if (seen.has(x)) continue;
        if (inLoop && (x === inLoop.header || x === inLoop.follow || !inLoop.body.has(x))) continue;
        seen.add(x);
        if (x === stop) continue;
        for (const y of g.succ[x]) st.push(y);
      }
      return seen;
    };
    const rt = reach(t), rf = reach(f);
    const common = [...rt].filter(x => rf.has(x));
    if (!common.length) return null;
    common.sort((a, b) => rpoIndex[a] - rpoIndex[b]);
    const cand = common[0];
    const rc = reach(cand);
    if (!common.every(x => rc.has(x))) return null;
    return cand;
  }

  /** switch: chain of `R === const` tests on the same register, each falling through to the next test. */
  function detectSwitch(v: number): { reg: Expr; tests: number[]; cases: Array<{ value: Expr; target: number }>; def: number | null; end: number | null } | null {
    const isTest = (x: number): { reg: Expr; value: Expr } | null => {
      const bx = B(x);
      if (!bx.cond || g.succ[x].length !== 2) return null;
      const c = simplifyCond(bx.cond);
      if (c.t !== 'bin' || c.op !== '===' || hasSideEffect(c.b) || (c.a.t !== 'reg' && c.a.t !== 'tmp')) return null;
      return { reg: c.a, value: c.b };
    };
    const first = isTest(v);
    if (!first) return null;
    const tests = [v];
    const cases = [{ value: first.value, target: g.succ[v][0] }];
    let x = v;
    for (;;) {
      const nx = g.succ[x][1];
      const tn = isTest(nx);
      if (!tn || !sameExpr(tn.reg, first.reg) || B(nx).stmts.length || g.pred[nx].length !== 1) {
        let end0 = ipdom[v] !== undefined && ipdom[v] < g.n ? ipdom[v] : null;
        if (end0 === null) {
          // some cases return: the end is the earliest block (not a case target) reached from >= 2 case entries
          const targets = [...cases.map(c => c.target), nx];
          const tset = new Set(targets);
          const count = new Map<number, number>();
          for (const t0 of new Set(targets)) {
            const seen = new Set<number>();
            const st = [t0];
            while (st.length) {
              const y = st.pop()!;
              if (seen.has(y)) continue;
              seen.add(y);
              if (y !== t0 && tset.has(y)) continue;
              for (const z of g.succ[y]) st.push(z);
            }
            for (const y of seen) if (!tset.has(y) || y === nx) count.set(y, (count.get(y) ?? 0) + 1);
          }
          const cands = [...count.entries()].filter(([y, c]) => c >= 2 && !cases.some(cc => cc.target === y)).map(([y]) => y);
          cands.sort((a, b2) => rpoIndex[a] - rpoIndex[b2]);
          if (cands.length) end0 = cands[0];
        }
        if (cases.length < 2) return null;
        return { reg: first.reg, tests, cases, def: nx === end0 ? null : nx, end: end0 };
      }
      tests.push(nx);
      cases.push({ value: tn.value, target: g.succ[nx][0] });
      x = nx;
    }
  }

  const tree = seq(g.entry, null, { loops: [] }, 0);
  // unreachable live blocks (should not happen)
  for (let i = 0; i < g.n; i++) if (!emitted.has(i) && idom[i] !== -1) warnings.push(`block b${B(i).id} not emitted`);
  return { tree: dropDeadTemps(prettify(cleanLabels(tree, labels), liveBlocks)), warnings };
}

function cleanLabels(tree: SNode[], used: Set<number>): SNode[] {
  const out: SNode[] = [];
  for (const n of tree) {
    if (n.k === 'label') { if (used.has(n.label)) out.push(n); continue; }
    if (n.k === 'if') out.push({ ...n, then: cleanLabels(n.then, used), else: n.else ? cleanLabels(n.else, used) : null });
    else if (n.k === 'while' || n.k === 'forin') out.push({ ...n, body: cleanLabels(n.body, used) });
    else if (n.k === 'switch') out.push({ ...n, cases: n.cases.map(c => ({ ...c, body: cleanLabels(c.body, used) })) });
    else out.push(n);
  }
  return out;
}

const isJump = (n: SNode | undefined): boolean =>
  !!n && (n.k === 'break' || n.k === 'continue' || n.k === 'goto' ||
    (n.k === 'stmt' && (n.s.k === 'return' || n.s.k === 'throw' || n.s.k === 'end')) ||
    (n.k === 'if' && !!n.else && endsWithJump(n.then) && endsWithJump(n.else)));
const endsWithJump = (l: SNode[]): boolean => isJump(l[l.length - 1]);

function hasLoopControl(l: SNode[], kind: 'continue' | 'break'): boolean {
  for (const n of l) {
    if (n.k === kind) return true;
    if (n.k === 'if' && (hasLoopControl(n.then, kind) || (n.else && hasLoopControl(n.else, kind)))) return true;
    if (n.k === 'switch' && kind === 'continue' && n.cases.some(c => hasLoopControl(c.body, kind))) return true;
  }
  return false;
}

/** Does any statement / condition in the tree reference an expression equal to `e`? */
function treeUses(l: SNode[], e: Expr): boolean {
  const hit = (x: Expr) => someExpr(x, y => sameExpr(y, e));
  for (const n of l) {
    switch (n.k) {
      case 'stmt': if (stmtExprs(n.s).some(hit)) return true; break;
      case 'if': if (hit(n.cond) || treeUses(n.then, e) || (n.else && treeUses(n.else, e))) return true; break;
      case 'while':
        if ((n.cond && hit(n.cond)) || treeUses(n.body, e)) return true;
        if (n.forInit && stmtExprs(n.forInit).some(hit)) return true;
        if (n.forIncr && stmtExprs(n.forIncr).some(hit)) return true;
        break;
      case 'forin': if (hit(n.target) || hit(n.obj) || treeUses(n.body, e)) return true; break;
      case 'switch': if (hit(n.disc) || n.cases.some(c => treeUses(c.body, e))) return true; break;
      default: break;
    }
  }
  return false;
}

/** A `continue;` in tail position of a loop body (also inside trailing if-arms) is redundant. */
function stripTailContinue(l: SNode[]): SNode[] {
  let out = l;
  while (out.length && out[out.length - 1].k === 'continue') out = out.slice(0, -1);
  const last = out[out.length - 1];
  if (last && last.k === 'if') {
    const then = stripTailContinue(last.then);
    const els = last.else ? stripTailContinue(last.else) : null;
    out = [...out.slice(0, -1), { ...last, then, else: els && els.length ? els : null }];
  }
  return out;
}

function assignTarget(s: Stmt): Expr | null {
  return s.k === 'assign' && (s.target.t === 'reg' || s.target.t === 'var') ? s.target : null;
}

function prettify(tree: SNode[], blocks: Block[]): SNode[] {
  void blocks;
  const out: SNode[] = [];
  for (let i = 0; i < tree.length; i++) {
    let n = tree[i];
    // `for (k in o) { ...; return ...; }` (no back edge): §forin(o); r = next; if (r != null) { body }
    {
      const a = tree[i], b1 = tree[i + 1], c = tree[i + 2];
      if (a && b1 && c && a.k === 'stmt' && a.s.k === 'expr' && a.s.e.t === 'builtin' && a.s.e.name.startsWith('§forin@') &&
        b1.k === 'stmt' && b1.s.k === 'assign' && b1.s.v.t === 'enumnext' && c.k === 'if' && !c.else &&
        c.cond.t === 'bin' && c.cond.op === '!=' && sameExpr(c.cond.a, b1.s.target) && c.cond.b.t === 'lit' && c.cond.b.v === null &&
        endsWithJump(c.then)) {
        let target = b1.s.target;
        let body = prettify(c.then, blocks);
        const f0 = body[0];
        if (f0 && f0.k === 'stmt' && f0.s.k === 'assign' && sameExpr(f0.s.v, target) &&
          (f0.s.target.t === 'reg' || f0.s.target.t === 'var') && !treeUses(body.slice(1), target)) {
          target = f0.s.target;
          body = body.slice(1);
        }
        out.push({ k: 'forin', target, obj: a.s.e.args[0], body, off: a.s.off });
        i += 2;
        continue;
      }
    }
    if (n.k === 'if') {
      let then = prettify(n.then, blocks);
      let els = n.else ? prettify(n.else, blocks) : null;
      if (els && !els.length) els = null;
      if (!then.length && els) { n = { ...n, cond: negate(n.cond), then: els, else: null }; then = n.then; els = null; }
      n = { ...n, then, else: els };
      // else-hoisting: `if (c) { ...; break } else { B }` -> `if (c) { ...; break } B`
      if (n.else && endsWithJump(n.then)) {
        out.push({ ...n, else: null });
        tree = [...tree.slice(0, i + 1), ...n.else, ...tree.slice(i + 1)];
        continue;
      }
      out.push(n);
      continue;
    }
    if (n.k === 'while') {
      let body = prettify(n.body, blocks);
      // strip trailing continue
      body = stripTailContinue(body);
      let cond = n.cond;
      // while (true) { if (c) break; ... } -> while (!c) { ... }
      const first = body[0];
      if (!cond && first && first.k === 'if' && !first.else && first.then.length === 1 && first.then[0].k === 'break') {
        cond = negate(first.cond);
        body = body.slice(1);
      }
      // for..in cleanup emitted by the compiler before `return`/`break` inside for..in: pop names until null
      if (cond && !body.length && /^§nextKey\(enum@\d+\) != null$/.test(render(cond))) continue;
      // for..in: while(true){ r = §nextKey(enum@X); if (r == null) break; ... }
      const prev = out[out.length - 1];
      if (!cond && body.length >= 2 && body[0].k === 'stmt' && body[0].s.k === 'assign' && body[0].s.v.t === 'enumnext' &&
        body[1].k === 'if' && !body[1].else && body[1].then.length === 1 && body[1].then[0].k === 'break' &&
        prev && prev.k === 'stmt' && prev.s.k === 'expr' && prev.s.e.t === 'builtin' && prev.s.e.name.startsWith('§forin@')) {
        out.pop();
        let target = body[0].s.target;
        let rest = body.slice(2);
        // `for (r0 in o) { k = r0; ... }` -> `for (k in o) { ... }`
        const f0 = rest[0];
        if (f0 && f0.k === 'stmt' && f0.s.k === 'assign' && sameExpr(f0.s.v, target) &&
          (f0.s.target.t === 'reg' || f0.s.target.t === 'var') && !treeUses(rest.slice(1), target)) {
          target = f0.s.target;
          rest = rest.slice(1);
        }
        out.push({ k: 'forin', target, obj: prev.s.e.args[0], body: rest, off: prev.s.off });
        continue;
      }
      let w: SNode = { ...n, cond, body };
      // for (init; cond; incr)
      if (cond && prev && prev.k === 'stmt') {
        const tv = assignTarget(prev.s);
        const lastN = body[body.length - 1];
        const v = lastN && lastN.k === 'stmt' && lastN.s.k === 'assign' ? lastN.s.v : null;
        const counterStep = !!v && v.t === 'bin' && ['+', '-', '*', '/'].includes(v.op) && !!tv && sameExpr(v.a, tv);
        if (tv && lastN && lastN.k === 'stmt' && lastN.s.k === 'assign' && sameExpr(lastN.s.target, tv) && counterStep &&
          body.length > 1 && someExpr(cond, x => sameExpr(x, tv)) && !hasLoopControl(body, 'continue')) {
          out.pop();
          w = { ...w, body: body.slice(0, -1), forInit: prev.s, forIncr: lastN.s };
        }
      }
      out.push(w);
      continue;
    }
    if (n.k === 'forin') { out.push({ ...n, body: prettify(n.body, blocks) }); continue; }
    if (n.k === 'switch') { out.push({ ...n, cases: n.cases.map(c => ({ ...c, body: prettify(c.body, blocks) })) }); continue; }
    out.push(n);
  }
  return out;
}

/** Temporaries that are never read (e.g. unused addProperty results) become plain expression statements. */
function dropDeadTemps(tree: SNode[]): SNode[] {
  const reads = new Set<string>();
  const scanE = (e: Expr) => { someExpr(e, x => { if (x.t === 'tmp') reads.add(x.name); return false; }); };
  const scan = (l: SNode[]) => {
    for (const n of l) {
      switch (n.k) {
        case 'stmt':
          if (n.s.k === 'assign' && n.s.target.t === 'tmp') scanE(n.s.v);
          else stmtExprs(n.s).forEach(scanE);
          break;
        case 'if': scanE(n.cond); scan(n.then); if (n.else) scan(n.else); break;
        case 'while':
          if (n.cond) scanE(n.cond);
          scan(n.body);
          if (n.forInit) stmtExprs(n.forInit).forEach(scanE);
          if (n.forIncr) stmtExprs(n.forIncr).forEach(scanE);
          break;
        case 'forin': scanE(n.obj); scan(n.body); break;
        case 'switch': scanE(n.disc); n.cases.forEach(c => scan(c.body)); break;
        default: break;
      }
    }
  };
  scan(tree);
  const fix = (l: SNode[]): SNode[] => l.map((n): SNode => {
    switch (n.k) {
      case 'stmt':
        if (n.s.k === 'assign' && n.s.target.t === 'tmp' && n.s.target.name.startsWith('$t') && !reads.has(n.s.target.name)) {
          return { k: 'stmt', s: { k: 'expr', e: n.s.v, off: n.s.off } };
        }
        return n;
      case 'if': return { ...n, then: fix(n.then), else: n.else ? fix(n.else) : null };
      case 'while': return { ...n, body: fix(n.body) };
      case 'forin': return { ...n, body: fix(n.body) };
      case 'switch': return { ...n, cases: n.cases.map(c => ({ ...c, body: fix(c.body) })) };
      default: return n;
    }
  });
  return fix(tree);
}

// =================================================================================================================
// Rendering

export function renderTree(tree: SNode[], ctx: RenderCtx, indent = '  ', showOffsets = true): string[] {
  const lines: string[] = [];
  const offTag = (o: number | undefined) => (showOffsets && o !== undefined && o >= 0 ? `  // @${o}` : '');
  const stmtInline = (s: Stmt) => renderStmt(s, ctx).replace(/;$/, '');
  const incrText = (s: Stmt): string => {
    if (s.k === 'assign' && s.v.t === 'bin' && (s.v.op === '+' || s.v.op === '-') && sameExpr(s.v.a, s.target) && s.v.b.t === 'lit' && s.v.b.v === 1) {
      return `${render(s.target, ctx)}${s.v.op}${s.v.op}`;
    }
    if (s.k === 'assign' && s.v.t === 'bin' && (s.v.op === '+' || s.v.op === '-') && sameExpr(s.v.a, s.target)) {
      return `${render(s.target, ctx)} ${s.v.op}= ${render(s.v.b, ctx)}`;
    }
    return stmtInline(s);
  };
  const walk = (l: SNode[], ind: string) => {
    for (const n of l) {
      switch (n.k) {
        case 'stmt': lines.push(ind + renderStmt(n.s, ctx) + offTag(n.s.off)); break;
        case 'break': lines.push(ind + 'break;'); break;
        case 'continue': lines.push(ind + 'continue;'); break;
        case 'goto': lines.push(ind + `goto L${n.label};`); break;
        case 'label': lines.push(ind.slice(2) + `L${n.label}:`); break;
        case 'if': {
          lines.push(ind + `if (${render(n.cond, ctx)}) {` + offTag(n.off));
          walk(n.then, ind + indent);
          if (n.else) {
            if (n.else.length === 1 && n.else[0].k === 'if') {
              lines.push(ind + '} else');
              walk(n.else, ind);
              break;
            }
            lines.push(ind + '} else {');
            walk(n.else, ind + indent);
          }
          lines.push(ind + '}');
          break;
        }
        case 'while': {
          if (n.forInit && n.forIncr && n.cond) {
            lines.push(ind + `for (${stmtInline(n.forInit)}; ${render(n.cond, ctx)}; ${incrText(n.forIncr)}) {` +
              (showOffsets ? `  // init @${n.forInit.off} test @${n.off} incr @${n.forIncr.off}` : ''));
          } else lines.push(ind + `while (${n.cond ? render(n.cond, ctx) : 'true'}) {` + offTag(n.off));
          walk(n.body, ind + indent);
          lines.push(ind + '}');
          break;
        }
        case 'forin': {
          lines.push(ind + `for (${render(n.target, ctx)} in ${render(n.obj, ctx)}) {` + offTag(n.off));
          walk(n.body, ind + indent);
          lines.push(ind + '}');
          break;
        }
        case 'switch': {
          lines.push(ind + `switch (${render(n.disc, ctx)}) {` + offTag(n.off));
          for (const c of n.cases) {
            for (const l of c.labels) lines.push(ind + indent + (l === 'default' ? 'default:' : `case ${render(l, ctx)}:`));
            walk(c.body, ind + indent + indent);
          }
          lines.push(ind + '}');
          break;
        }
      }
    }
  };
  walk(tree, indent);
  return lines;
}

// =================================================================================================================
// Entry point

export function decompile(res: ExploreResult): DecompiledUnit {
  const { blocks, entry, listing } = buildBlocks(res);
  const bs: BuildState = { tmpCount: 0, warnings: [], origin: new WeakMap() };
  if (!blocks.length) {
    return { blocks, entry, tree: [], warnings: ['empty unit'], listing, dot: () => '' };
  }
  for (const b of blocks) if (b.nodes.length) buildBlockStmts(b, bs, res.pools);
  condense(blocks, entry, bs);
  peepholeR0(blocks);
  const { tree, warnings } = structure(blocks, entry);
  // the compiler's implicit `return;` at the end of a function body is noise
  const lastTop = tree[tree.length - 1];
  if (lastTop && lastTop.k === 'stmt' && lastTop.s.k === 'return' && !lastTop.s.e && res.nodes[res.entry]?.ins &&
    blocks.some(b => !b.dead && b.exit?.k === 'return')) tree.pop();
  const dot = (name: string, ctx: RenderCtx) => {
    const live = blocks.filter(b => !b.dead);
    const ix = new Map(live.map((b, i) => [b.id, i]));
    const g = makeGraph(live.length, 0, live.flatMap(b => b.succ.filter(s => ix.has(s)).map(s => [ix.get(b.id)!, ix.get(s)!] as [number, number])));
    return toDot(g, name, i => {
      const b = live[i];
      const head = `b${b.id} @${b.off}`;
      const body = b.stmts.map(s => renderStmt(s, ctx)).slice(0, 12);
      const tail = b.cond ? [`if (${render(b.cond, ctx)})`] : b.exit ? [b.exit.k] : [];
      return [head, ...body, ...tail].join('\n');
    }, (a, _b, k) => (live[a].cond ? (k === 0 ? 'T' : 'F') : undefined));
  };
  return { blocks, entry, tree, warnings: [...bs.warnings, ...warnings], listing, dot };
}
