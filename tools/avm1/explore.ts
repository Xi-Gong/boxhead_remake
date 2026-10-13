/**
 * Phase 1 of the deobfuscating disassembler: abstract execution over ABSOLUTE offsets of the decompressed SWF.
 *
 * The SWF is protected by control-flow flattening: every DoInitAction starts with a dispatcher keyed on a variable
 * literally named "\x01" (`while (true) { if (\x01 == 328) { \x01 += 15; … } … }`), junk functions returning
 * constants ("\x01\x02"), junk pushes consumed by junk `If`/`Not`/`DefineLocal`, and jumps into neighbouring
 * non-standard tag-253 blobs (and even into other tags' dispatchers) where the real compiler output lives.
 *
 * We execute with a two-level value domain:
 *   - concrete primitives ("c"): literal pushes and everything computed only from them, plus obfuscator variables
 *     (names containing control characters) and junk functions -> folded away (never shown as real code);
 *   - "top" ("t"): anything produced by real code (registers, real variables, members, calls, getTimer…).
 * An instruction whose inputs are all concrete and which has no real side effect is FOLDED. A conditional branch on
 * a concrete value is resolved (opaque predicate). Everything else is REAL and becomes a node of the clean CFG.
 * Registers and real variables are never tracked concretely, so real loops are not unrolled.
 *
 * States are interned by (pc, abstract stack, obfuscator env, constant pool, scope) so that the flattened state
 * machine linearises and real join points / back edges are found naturally.
 */
import { decodeInstruction, type Instruction } from './opcodes.ts';
import { type Prim, BINARY_OPS, UNARY_OPS, evalBinary, evalUnary, toNumber, toBool } from './concrete.ts';

export type AVal =
  | { k: 'c'; v: Prim }
  /** Real value. `tag` marks for..in termination tests; `fn` marks a function literal (body offset). */
  | { k: 't'; tag?: 'enumEnd' | 'enumNotEnd'; fn?: number }
  /** for..in enumeration marker (`at` = offset of the Enumerate op): property names terminated by null. */
  | { k: 'e'; at: number }
  /** Junk (obfuscator) function: body range. */
  | { k: 'jf'; start: number; end: number; params: string[] };

export interface PNode {
  id: number;
  pc: number;
  ins: Instruction;
  /** Constant pool active when executing (index into ExploreResult.pools, -1 = none). */
  pool: number;
  /** True when the instruction was folded away (junk / opaque / pure-constant). */
  folded: boolean;
  /** Abstract inputs (deepest first). */
  inp: AVal[];
  /** Abstract outputs pushed (deepest first). */
  out: AVal[];
  /** Successor node ids. Real `If`: [taken, fallthrough]. Exits: []. */
  succ: number[];
  /** Exit kind for nodes with no successors. */
  exit?: 'return' | 'end' | 'throw' | 'fallout' | 'abort';
  /** Real `If` on an enumeration test: the successor index whose stack drops the enum marker. */
  note?: string;
  /** With/Try scope info for real With/Try instructions. */
  scopeEnd?: number;
  /** Abstract stack at entry (bottom first). Shared AVal objects; do not mutate. */
  stackIn: AVal[];
  /** Non-concrete part of the stack at entry, bottom first: 't' = real value, 'e<at>' = for..in marker. */
  sig: string[];
}

export interface FoundFunction {
  /** Offset of the DefineFunction(2) instruction. */
  offset: number;
  ins: Instruction;
  bodyStart: number;
  bodyEnd: number;
  /** Node that defined it (in the parent unit). */
  nodeId: number;
}

export interface ExploreOptions {
  /** Unit bounds: falling onto `end` = implicit return / end. */
  start: number;
  end: number;
  /** 'script' for DoAction/DoInitAction, 'function' for function bodies. */
  mode: 'script' | 'function';
  /** Initial constant pool (functions inherit the pool active at definition). */
  pool?: string[] | null;
  /** Maximum interned states. */
  maxNodes?: number;
}

export interface ExploreResult {
  entry: number;
  nodes: PNode[];
  pools: string[][];
  functions: FoundFunction[];
  warnings: string[];
  /** Obfuscator variable names seen. */
  obfVars: Set<string>;
  /** Offsets touched outside [start,end). */
  outside: number;
}

/** Obfuscator-owned names contain control characters (e.g. "\x01", "\x01\x02", "\x0f"). */
export function isObfName(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return true;
  return false;
}

interface State {
  pc: number;
  stack: AVal[];
  env: Map<string, AVal>;
  pool: number;
  /** Ends of active With blocks (innermost last). */
  scopes: number[];
}

const C = (v: Prim): AVal => ({ k: 'c', v });
const T: AVal = { k: 't' };

function avalKey(a: AVal): string {
  switch (a.k) {
    case 'c': {
      const v = a.v;
      if (v === undefined) return 'u';
      if (v === null) return 'n';
      if (typeof v === 'number') return 'd' + (Object.is(v, -0) ? '-0' : String(v));
      if (typeof v === 'boolean') return v ? 'T' : 'F';
      return 's' + JSON.stringify(v);
    }
    case 't': return a.tag ? 't' + a.tag : (a.fn !== undefined ? 'f' + a.fn : 't');
    case 'e': return 'e' + a.at;
    case 'jf': return 'j' + a.start;
  }
}

/**
 * Shape of a state: everything except the concrete/real distinction of ordinary stack slots. States with the same
 * shape are merged by widening (slot-wise join: equal values stay, anything else becomes a real value), so that real
 * join points (e.g. `c ? x : undefined`) are a single node even when one arm pushes a literal.
 * The obfuscator environment (dispatcher variables) is part of the shape and is never widened.
 */
function shapeKey(s: State): string {
  let k = s.pc + '|' + s.pool + '|' + s.scopes.join(',') + '|';
  for (const a of s.stack) k += (a.k === 'e' ? 'e' + a.at : a.k === 'jf' ? 'j' + a.start : 'v') + ',';
  k += '|';
  const names = [...s.env.keys()].sort();
  for (const n of names) k += JSON.stringify(n) + '=' + avalKey(s.env.get(n)!) + ';';
  return k;
}

const PLAIN_T: AVal = { k: 't' };

/** a ⊑ b (b at least as general as a) for ordinary slots. */
function slotLeq(a: AVal, b: AVal): boolean {
  if (b.k === 't' && !b.tag && b.fn === undefined) return true;
  return avalKey(a) === avalKey(b);
}

function slotJoin(a: AVal, b: AVal): AVal {
  return avalKey(a) === avalKey(b) ? b : PLAIN_T;
}

function cloneState(s: State): State {
  return { pc: s.pc, stack: s.stack.slice(), env: new Map(s.env), pool: s.pool, scopes: s.scopes.slice() };
}

const isC = (a: AVal | undefined): a is { k: 'c'; v: Prim } => !!a && a.k === 'c';

/** Evaluate a junk function body concretely (no real side effects allowed). Returns undefined if not foldable. */
function evalJunkFunction(buf: Uint8Array, f: { start: number; end: number }, pool: string[] | null): AVal | undefined {
  const stack: Prim[] = [];
  let pc = f.start;
  for (let steps = 0; steps < 10000; steps++) {
    if (pc === f.end) return C(undefined);
    const ins = decodeInstruction(buf, pc);
    if (ins.bad) return undefined;
    const n = ins.name;
    if (n === 'Push') {
      for (const v of ins.push!) {
        switch (v.t) {
          case 'string': stack.push(v.v); break;
          case 'float': case 'double': case 'integer': stack.push(v.v); break;
          case 'boolean': stack.push(v.v); break;
          case 'null': stack.push(null); break;
          case 'undefined': stack.push(undefined); break;
          case 'constant': if (!pool || v.v >= pool.length) return undefined; stack.push(pool[v.v]); break;
          default: return undefined;
        }
      }
    } else if (n === 'Return') {
      return C(stack.length ? stack.pop() : undefined);
    } else if (n === 'Jump') {
      pc = ins.target!; continue;
    } else if (n === 'If') {
      const c = stack.pop();
      if (toBool(c)) { pc = ins.target!; continue; }
    } else if (BINARY_OPS.has(n)) {
      const b = stack.pop(), a = stack.pop();
      stack.push(evalBinary(n, a, b));
    } else if (UNARY_OPS.has(n)) {
      stack.push(evalUnary(n, stack.pop()));
    } else if (n === 'Pop') {
      stack.pop();
    } else if (n === 'PushDuplicate') {
      const v = stack.pop(); stack.push(v, v);
    } else if (n === 'StackSwap') {
      const b = stack.pop(), a = stack.pop(); stack.push(b, a);
    } else if (n === 'End') {
      return C(undefined);
    } else {
      return undefined;
    }
    pc = ins.next;
  }
  return undefined;
}

export function explore(buf: Uint8Array, opts: ExploreOptions): ExploreResult {
  const maxNodes = opts.maxNodes ?? 400000;
  const nodes: PNode[] = [];
  /** shape key -> representative (most general) node */
  const byShape = new Map<string, number>();
  /** incoming links per node: [pred, slot] (pred -1 = entry) */
  const links: Array<Array<[number, number]>> = [];
  let widenings = 0;
  const pools: string[][] = [];
  const poolIds = new Map<string, number>();
  const functions: FoundFunction[] = [];
  const fnSeen = new Set<number>();
  const warnings: string[] = [];
  const obfVars = new Set<string>();
  let outside = 0;
  const warnOnce = new Set<string>();
  const warn = (w: string) => { if (!warnOnce.has(w) && warnOnce.size < 200) { warnOnce.add(w); warnings.push(w); } };

  const internPool = (p: string[]): number => {
    const k = JSON.stringify(p);
    let id = poolIds.get(k);
    if (id === undefined) { id = pools.length; pools.push(p); poolIds.set(k, id); }
    return id;
  };

  const init: State = {
    pc: opts.start, stack: [], env: new Map(),
    pool: opts.pool ? internPool(opts.pool) : -1, scopes: [],
  };

  // Work list of [state, predecessor node id, successor slot].
  const work: Array<[State, number, number]> = [[init, -1, 0]];
  let entry = -1;

  while (work.length) {
    const [st, pred, slot] = work.pop()!;
    // Scope exits (With blocks) happen when reaching their end offset.
    while (st.scopes.length && st.pc === st.scopes[st.scopes.length - 1]) st.scopes.pop();
    const shape = shapeKey(st);
    const rep = byShape.get(shape);
    let inherited: Array<[number, number]> = [];
    if (rep !== undefined) {
      const R = nodes[rep].stackIn;
      let leq = true;
      for (let i = 0; i < R.length && leq; i++) if (!slotLeq(st.stack[i], R[i])) leq = false;
      if (leq) {
        if (pred >= 0) nodes[pred].succ[slot] = rep; else entry = rep;
        links[rep].push([pred, slot]);
        continue;
      }
      // Widen: explore the joined state as a new representative and redirect every link of the old one.
      st.stack = st.stack.map((a, i) => slotJoin(a, R[i]));
      inherited = links[rep];
      widenings++;
    }
    if (nodes.length >= maxNodes) {
      warn(`node budget ${maxNodes} exhausted`);
      continue;
    }
    let id = nodes.length;
    byShape.set(shape, id);
    links[id] = [...inherited, [pred, slot]];
    for (const [p, sl] of links[id]) { if (p >= 0) nodes[p].succ[sl] = id; else entry = id; }

    const pc = st.pc;
    const node: PNode = {
      id, pc, ins: undefined as unknown as Instruction, pool: st.pool, folded: true, inp: [], out: [], succ: [],
      stackIn: st.stack.slice(),
      sig: st.stack.filter(a => a.k === 't' || a.k === 'e').map(a => (a.k === 'e' ? 'e' + a.at : 't')),
    };
    nodes.push(node);

    // Implicit end of unit.
    if (pc === opts.end && opts.mode === 'function') {
      node.ins = { offset: pc, code: -2, name: '<end of function>', size: 0, next: pc, payloadLength: 0 };
      node.folded = false;
      node.exit = 'return';
      continue;
    }
    if (pc < opts.start || pc >= opts.end) outside++;
    if (pc < 0 || pc >= buf.length) {
      node.ins = { offset: pc, code: -1, name: '<out of buffer>', size: 0, next: pc, payloadLength: 0 };
      node.folded = false;
      node.exit = 'abort';
      warn(`pc ${pc} outside the buffer`);
      continue;
    }
    const ins = decodeInstruction(buf, pc);
    node.ins = ins;
    const pool = st.pool >= 0 ? pools[st.pool] : null;
    const s = st.stack;
    let underflow = false;
    const pop = (): AVal => {
      if (s.length === 0) { underflow = true; return C(undefined); }
      return s.pop()!;
    };
    /** Pop n values, returning deepest first. */
    const popN = (n: number): AVal[] => { const r: AVal[] = []; for (let i = 0; i < n; i++) r.push(pop()); return r.reverse(); };

    const next = (ns: State, at: number) => { ns.pc = at; return ns; };
    const succStates: State[] = [];
    let real = false;

    const finishReal = (inp: AVal[], out: AVal[]) => {
      real = true;
      node.inp = inp; node.out = out;
      for (const o of out) s.push(o);
    };
    const finishFold = (inp: AVal[], out: AVal[]) => {
      node.inp = inp; node.out = out;
      for (const o of out) s.push(o);
    };

    if (ins.bad) {
      node.folded = false;
      node.exit = 'abort';
      warn(`bad instruction at ${pc}: ${ins.name} ${ins.bad}`);
      continue;
    }

    const n = ins.name;
    let terminated = false;
    switch (n) {
      case 'Push': {
        const out: AVal[] = [];
        for (const v of ins.push!) {
          switch (v.t) {
            case 'string': out.push(C(v.v)); break;
            case 'float': case 'double': case 'integer': out.push(C(v.v)); break;
            case 'boolean': out.push(C(v.v)); break;
            case 'null': out.push(C(null)); break;
            case 'undefined': out.push(C(undefined)); break;
            case 'register': out.push({ k: 't' }); real = true; break;
            case 'constant':
              if (pool && v.v < pool.length) out.push(C(pool[v.v]));
              else { out.push(C(`<c${v.v}?>`)); warn(`constant ${v.v} without pool at ${pc}`); }
              break;
          }
        }
        // A push containing a register read is real (it reads real state); otherwise folded.
        if (real) finishReal([], out); else finishFold([], out);
        break;
      }
      case 'Pop': {
        const a = pop();
        if (a.k === 'c' || a.k === 'jf') finishFold([a], []); else finishReal([a], []);
        break;
      }
      case 'PushDuplicate': {
        const a = pop();
        if (a.k === 'c' || a.k === 'jf') finishFold([a], [a, a]);
        else finishReal([a], [a, a]);
        break;
      }
      case 'StackSwap': {
        const b = pop(), a = pop();
        if (isC(a) && isC(b)) finishFold([a, b], [b, a]); else finishReal([a, b], [b, a]);
        break;
      }
      case 'Jump': {
        node.inp = []; node.out = [];
        succStates.push(next(st, ins.target!));
        terminated = true;
        break;
      }
      case 'If': {
        const c = pop();
        node.inp = [c];
        if (c.k === 'c') {
          succStates.push(next(st, toBool(c.v) ? ins.target! : ins.next));
        } else {
          real = true;
          const taken = cloneState(st);
          const fall = cloneState(st);
          if (c.k === 't' && c.tag) {
            // for..in termination: the branch on which the enumeration finished drops the marker.
            const endBranch = c.tag === 'enumEnd' ? taken : fall;
            const idx = endBranch.stack.map(x => x.k).lastIndexOf('e');
            if (idx >= 0) endBranch.stack.splice(idx, 1);
            node.note = c.tag;
          }
          succStates.push(next(taken, ins.target!), next(fall, ins.next));
        }
        terminated = true;
        break;
      }
      case 'ConstantPool': {
        st.pool = internPool(ins.pool!);
        node.inp = []; node.out = [];
        break;
      }
      case 'GetVariable': {
        const name = pop();
        if (isC(name) && typeof name.v === 'string' && isObfName(name.v)) {
          obfVars.add(name.v);
          const v = st.env.get(name.v) ?? C(undefined);
          finishFold([name], [v]);
        } else {
          finishReal([name], [T]);
        }
        break;
      }
      case 'SetVariable': case 'DefineLocal': {
        const [name, v] = popN(2);
        if (isC(name) && typeof name.v === 'string' && isObfName(name.v)) {
          obfVars.add(name.v);
          st.env.set(name.v, v);
          finishFold([name, v], []);
        } else finishReal([name, v], []);
        break;
      }
      case 'DefineLocal2': {
        const name = pop();
        if (isC(name) && typeof name.v === 'string' && isObfName(name.v)) {
          obfVars.add(name.v);
          if (!st.env.has(name.v)) st.env.set(name.v, C(undefined));
          finishFold([name], []);
        } else finishReal([name], []);
        break;
      }
      case 'DefineFunction': case 'DefineFunction2': {
        const f = ins.fn!;
        const bodyStart = ins.next, bodyEnd = ins.next + f.codeSize;
        if (f.name && isObfName(f.name)) {
          obfVars.add(f.name);
          st.env.set(f.name, { k: 'jf', start: bodyStart, end: bodyEnd, params: f.params.map(p => p.name) });
          finishFold([], []);
        } else {
          if (!fnSeen.has(pc)) {
            fnSeen.add(pc);
            functions.push({ offset: pc, ins, bodyStart, bodyEnd, nodeId: id });
          }
          if (f.name) finishReal([], []);
          else finishReal([], [{ k: 't', fn: pc }]);
        }
        succStates.push(next(st, bodyEnd));
        terminated = true;
        break;
      }
      case 'CallFunction': {
        const name = pop();
        const nargs = pop();
        if (!isC(nargs) || typeof toNumber(nargs.v) !== 'number' || Number.isNaN(toNumber(nargs.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [name, nargs];
          warn(`CallFunction with unknown arg count at ${pc}`);
          terminated = true;
          break;
        }
        const k = toNumber(nargs.v);
        const args: AVal[] = [];
        for (let i = 0; i < k; i++) args.push(pop()); // args[0] = first argument (top of stack)
        const inp = [...args.slice().reverse(), nargs, name];
        if (isC(name) && typeof name.v === 'string' && isObfName(name.v)) {
          obfVars.add(name.v);
          const fv = st.env.get(name.v);
          let r: AVal | undefined;
          if (fv && fv.k === 'jf') r = evalJunkFunction(buf, fv, pool);
          if (r && args.every(a => a.k === 'c')) { finishFold(inp, [r]); break; }
          warn(`call of obfuscator function ${JSON.stringify(name.v)} not foldable at ${pc}`);
        }
        finishReal(inp, [T]);
        break;
      }
      case 'CallMethod': case 'NewMethod': {
        const name = pop();
        const obj = pop();
        const nargs = pop();
        if (!isC(nargs) || Number.isNaN(toNumber(nargs.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [obj, name, nargs];
          warn(`${n} with unknown arg count at ${pc}`);
          terminated = true;
          break;
        }
        const k = toNumber(nargs.v);
        const args: AVal[] = [];
        for (let i = 0; i < k; i++) args.push(pop());
        finishReal([...args.slice().reverse(), nargs, obj, name], [T]);
        break;
      }
      case 'NewObject': {
        const name = pop();
        const nargs = pop();
        if (!isC(nargs) || Number.isNaN(toNumber(nargs.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [name, nargs];
          warn(`NewObject with unknown arg count at ${pc}`);
          terminated = true;
          break;
        }
        const k = toNumber(nargs.v);
        const args: AVal[] = [];
        for (let i = 0; i < k; i++) args.push(pop());
        finishReal([...args.slice().reverse(), nargs, name], [T]);
        break;
      }
      case 'InitArray': {
        const cnt = pop();
        if (!isC(cnt) || Number.isNaN(toNumber(cnt.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [cnt];
          warn(`InitArray with unknown count at ${pc}`); terminated = true; break;
        }
        const k = toNumber(cnt.v);
        const items: AVal[] = [];
        for (let i = 0; i < k; i++) items.push(pop()); // items[0] = element 0
        finishReal([...items.slice().reverse(), cnt], [T]);
        break;
      }
      case 'InitObject': {
        const cnt = pop();
        if (!isC(cnt) || Number.isNaN(toNumber(cnt.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [cnt];
          warn(`InitObject with unknown count at ${pc}`); terminated = true; break;
        }
        const k = toNumber(cnt.v);
        const vals: AVal[] = [];
        for (let i = 0; i < k * 2; i++) vals.push(pop()); // value, name, value, name ... (top first)
        finishReal([...vals.slice().reverse(), cnt], [T]);
        break;
      }
      case 'ImplementsOp': {
        const ctor = pop();
        const cnt = pop();
        if (!isC(cnt) || Number.isNaN(toNumber(cnt.v))) {
          node.folded = false; node.exit = 'abort'; node.inp = [ctor, cnt];
          warn(`ImplementsOp with unknown count at ${pc}`); terminated = true; break;
        }
        const k = toNumber(cnt.v);
        const items: AVal[] = [];
        for (let i = 0; i < k; i++) items.push(pop());
        finishReal([...items.slice().reverse(), cnt, ctor], []);
        break;
      }
      case 'Enumerate': case 'Enumerate2': {
        const o = pop();
        finishReal([o], [{ k: 'e', at: pc }]);
        break;
      }
      case 'StoreRegister': {
        const a = pop();
        // Registers are real state: the store is real, the value stays on the stack unchanged.
        finishReal([a], [a]);
        break;
      }
      case 'Return': {
        const a = pop();
        node.inp = [a]; real = true; node.exit = 'return'; terminated = true;
        break;
      }
      case 'Throw': {
        const a = pop();
        node.inp = [a]; real = true; node.exit = 'throw'; terminated = true;
        break;
      }
      case 'End': {
        real = true; node.exit = 'end'; terminated = true;
        break;
      }
      case 'GetTime': {
        finishReal([], [T]);
        break;
      }
      case 'With': {
        const o = pop();
        node.inp = [o]; real = true;
        node.scopeEnd = ins.next + ins.num!;
        st.scopes.push(ins.next + ins.num!);
        break;
      }
      case 'Try': {
        // Explore try body, catch and finally as successors of a real marker node.
        const t = ins.tryInfo!;
        real = true;
        node.scopeEnd = ins.next + t.trySize + t.catchSize + t.finallySize;
        const tryStart = ins.next;
        succStates.push(next(cloneState(st), tryStart));
        if (t.hasCatch && t.catchSize) {
          const cs = cloneState(st);
          if (!t.catchInRegister) { /* catch variable defined by the VM */ }
          succStates.push(next(cs, tryStart + t.trySize));
        }
        if (t.hasFinally && t.finallySize) succStates.push(next(cloneState(st), tryStart + t.trySize + t.catchSize));
        warn(`Try block at ${pc}`);
        terminated = true;
        break;
      }
      default: {
        if (BINARY_OPS.has(n)) {
          const [a, b] = popN(2);
          if (isC(a) && isC(b)) finishFold([a, b], [C(evalBinary(n, a.v, b.v))]);
          else {
            // for..in loop test: (enum element) == null
            let out: AVal = T;
            if (n === 'Equals2' && ((a.k === 'e' && isC(b) && b.v === null) || (b.k === 'e' && isC(a) && a.v === null))) {
              out = { k: 't', tag: 'enumEnd' };
            }
            finishReal([a, b], [out]);
          }
          break;
        }
        if (UNARY_OPS.has(n)) {
          const a = pop();
          if (isC(a)) finishFold([a], [C(evalUnary(n, a.v))]);
          else {
            let out: AVal = T;
            if (n === 'Not' && a.k === 't' && a.tag) out = { k: 't', tag: a.tag === 'enumEnd' ? 'enumNotEnd' : 'enumEnd' };
            finishReal([a], [out]);
          }
          break;
        }
        const fx = STACK_FIXED[n];
        if (fx) {
          const inp = popN(fx[0]);
          const out: AVal[] = [];
          for (let i = 0; i < fx[1]; i++) out.push(T);
          finishReal(inp, out);
          break;
        }
        node.folded = false; node.exit = 'abort';
        warn(`unsupported opcode ${n} at ${pc}`);
        terminated = true;
      }
    }

    // The enumeration marker is consumed lazily: popping it yields a real value and keeps it on the stack.
    // (Handled here by re-pushing when a real op popped an 'e' that is not part of a termination test.)
    fixEnumPops(node, s);

    if (underflow) {
      node.note = (node.note ? node.note + ' ' : '') + 'stack-underflow(undefined)';
      warn(`stack underflow at ${pc} (${n})`);
    }
    node.folded = !real && !node.exit;
    if (node.exit) continue;
    if (!terminated) succStates.push(next(st, ins.next));
    if (s.length > 2000) {
      node.exit = 'abort'; node.folded = false; warn(`stack overflow guard at ${pc}`);
      continue;
    }
    for (let i = succStates.length - 1; i >= 0; i--) work.push([succStates[i], id, i]);
    node.succ = new Array(succStates.length).fill(-1);
  }

  if (widenings) warnings.push(`${widenings} join(s) widened`);
  return { entry, nodes, pools, functions, warnings, obfVars, outside };
}

/**
 * When a real instruction consumes the for..in marker 'e' as an ordinary operand (StoreRegister r0 / Equals2 with
 * null / Pop in a `break` drain loop), the marker must stay on the stack below (it is an unbounded sequence).
 */
function fixEnumPops(node: PNode, s: AVal[]): void {
  const n = node.ins.name;
  const idx = node.inp.findIndex(a => a.k === 'e');
  if (idx < 0) return;
  if (n === 'StoreRegister' || n === 'PushDuplicate') return; // value copied, marker still in place via outputs
  if (n === 'Enumerate' || n === 'Enumerate2') return;
  // Consumed one element: re-insert the marker below the outputs.
  const outs = node.out.length;
  s.splice(s.length - outs, 0, node.inp[idx]);
}

/** Fixed stack effects for real (non-folded) opcodes not handled explicitly. */
const STACK_FIXED: Record<string, readonly [number, number]> = {
  NextFrame: [0, 0], PreviousFrame: [0, 0], Play: [0, 0], Stop: [0, 0], ToggleQuality: [0, 0], StopSounds: [0, 0],
  GotoFrame: [0, 0], GetURL: [0, 0], SetTarget: [0, 0], GoToLabel: [0, 0],
  StringExtract: [3, 1], MBStringExtract: [3, 1], SetTarget2: [1, 0], GetProperty: [2, 1], SetProperty: [3, 0],
  CloneSprite: [3, 0], RemoveSprite: [1, 0], Trace: [1, 0], EndDrag: [0, 0], RandomNumber: [1, 1],
  GetURL2: [2, 0], Call: [1, 0], GotoFrame2: [1, 0], WaitForFrame: [0, 0], WaitForFrame2: [1, 0],
  Delete: [2, 1], Delete2: [1, 1], TargetPath: [1, 1], GetMember: [2, 1], SetMember: [3, 0],
  InstanceOf: [2, 1], CastOp: [2, 1], Extends: [2, 0],
};
