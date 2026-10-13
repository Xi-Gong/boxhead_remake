/**
 * Disassemble + pseudo-decompile one action unit (DoAction / DoInitAction / button or clip action) together with all
 * functions it defines (recursively), name the functions from the code that installs them, and render listings.
 */
import { explore, type ExploreResult, type FoundFunction } from './explore.ts';
import { decompile, renderTree, type DecompiledUnit, type SNode } from './decompile.ts';
import { type Expr, type Stmt, type RenderCtx, render, renderStmt, someExpr, stmtExprs } from './expr.ts';
import { describeFunction2Flags, quote } from './opcodes.ts';

export interface FunctionInfo {
  /** Offset of the DefineFunction(2) instruction. */
  offset: number;
  bodyStart: number;
  bodyEnd: number;
  /** Display name, e.g. "CMain.prototype.ProcessFrames" (without the `_global.` prefix). */
  name: string;
  kind: 'DefineFunction' | 'DefineFunction2';
  params: Array<{ register: number; name: string }>;
  registerCount: number;
  flags: number;
  preloaded: Array<string | undefined>;
  explored: ExploreResult;
  dec: DecompiledUnit;
  parent: string;
  ctx: RenderCtx;
}

export interface UnitResult {
  start: number;
  end: number;
  explored: ExploreResult;
  dec: DecompiledUnit;
  functions: FunctionInfo[];
  /** Class path defined by this unit (`_global.A.B = function` → "A.B"), if any. */
  classPath: string | null;
  /** registerClass(linkage, path) pairs executed by this unit. */
  registerClass: Array<[string, string]>;
  ctx: RenderCtx;
}

/** Register naming for a function: params / preloaded names, `_locN_` otherwise (same scheme as ffdec). */
function makeCtx(fnNames: Map<number, string>, regNames?: Array<string | undefined>, localPrefix = '_loc'): RenderCtx {
  return {
    regName: n => regNames?.[n] ?? (localPrefix === '_loc' ? `_loc${n}_` : `r${n}`),
    fnName: off => {
      const nm = fnNames.get(off);
      return nm ? `function /*${nm}*/ @${off}` : `function@${off}`;
    },
  };
}

function* allStmts(tree: SNode[]): Generator<Stmt> {
  for (const n of tree) {
    if (n.k === 'stmt') yield n.s;
    else if (n.k === 'if') { yield* allStmts(n.then); if (n.else) yield* allStmts(n.else); }
    else if (n.k === 'while') {
      if (n.forInit) yield n.forInit;
      yield* allStmts(n.body);
      if (n.forIncr) yield n.forIncr;
    } else if (n.k === 'forin') yield* allStmts(n.body);
  }
}

/** Register names of the function whose statements are being scanned for naming (null at top level). */
let namingCtx: RenderCtx | null = null;

/** Resolve a naming expression (registers aliased to their last assignment in straight-line code). */
function nameText(e: Expr, alias: Map<number, Expr>, fnNames: Map<number, string>, depth = 0): string {
  const rc = namingCtx ?? undefined;
  if (depth > 20) return render(e, rc);
  switch (e.t) {
    case 'fn': return fnNames.get(e.off) ?? `function@${e.off}`;
    case 'reg': {
      const a = alias.get(e.n);
      if (a && (a.t === 'fn' || a.t === 'mem' || a.t === 'var' || a.t === 'reg' || a.t === 'assign')) return nameText(a, alias, fnNames, depth + 1);
      return namingCtx ? namingCtx.regName(e.n) : `r${e.n}`;
    }
    case 'var': return e.name;
    case 'mem':
      if (e.p.t === 'lit' && typeof e.p.v === 'string') return `${nameText(e.o, alias, fnNames, depth + 1)}.${e.p.v}`;
      return `${nameText(e.o, alias, fnNames, depth + 1)}[${render(e.p, rc)}]`;
    case 'assign': return nameText(e.v, alias, fnNames, depth + 1);
    default: return render(e, rc);
  }
}

function fnOf(e: Expr, alias: Map<number, Expr>, depth = 0): number | null {
  if (depth > 20) return null;
  if (e.t === 'fn') return e.off;
  if (e.t === 'reg') { const a = alias.get(e.n); return a ? fnOf(a, alias, depth + 1) : null; }
  if (e.t === 'assign') return fnOf(e.v, alias, depth + 1);
  return null;
}

/** Name functions installed by the statements of a unit; returns registerClass calls found. */
function nameFunctions(tree: SNode[], fnNames: Map<number, string>, prefix: string, thisAlias?: string): Array<[string, string]> {
  const alias = new Map<number, Expr>();
  const reg: Array<[string, string]> = [];
  const strip = (s: string) => s.replace(/^_global\./, '');
  for (const s of allStmts(tree)) {
    if (s.k === 'assign') {
      if (s.target.t === 'reg') {
        alias.set(s.target.n, s.v);
        const f = fnOf(s.v, alias);
        if (f !== null && !fnNames.has(f)) fnNames.set(f, `${prefix}${strip(nameText(s.target, new Map(), fnNames))}`);
      } else if (s.target.t === 'mem' || s.target.t === 'var') {
        const f = fnOf(s.v, alias);
        if (f !== null) {
          let nm = strip(nameText(s.target, alias, fnNames));
          if (thisAlias) nm = nm.replace(/^this\./, `${thisAlias}.`);
          if (!fnNames.has(f) || /^function@/.test(fnNames.get(f)!) || fnNames.get(f)!.startsWith(prefix + 'r')) fnNames.set(f, `${prefix}${nm}`);
        }
      }
    }
    // Object.registerClass("Linkage", Path)
    for (const e of stmtExprs(s)) {
      someExpr(e, x => {
        if (x.t === 'call' && x.f.t === 'mem' && x.f.p.t === 'lit' && x.f.p.v === 'registerClass' && x.args.length === 2) {
          const a0 = x.args[0];
          if (a0.t === 'lit' && typeof a0.v === 'string') reg.push([a0.v, strip(nameText(x.args[1], alias, fnNames))]);
        }
        return false;
      });
    }
  }
  return reg;
}

export interface UnitOptions {
  start: number;
  end: number;
  maxNodes?: number;
  /** Also analyze the functions defined by the unit (default true). */
  functions?: boolean;
}

export function analyzeUnit(buf: Uint8Array, opts: UnitOptions): UnitResult {
  const explored = explore(buf, { start: opts.start, end: opts.end, mode: 'script', maxNodes: opts.maxNodes });
  const dec = decompile(explored);
  const fnNames = new Map<number, string>();
  const registerClass = nameFunctions(dec.tree, fnNames, '');
  const ctx = makeCtx(fnNames, undefined, 'r');
  // class path: first `_global.X.Y = function` that is not a prototype member
  let classPath: string | null = null;
  {
    const alias = new Map<number, Expr>();
    for (const s of allStmts(dec.tree)) {
      if (s.k !== 'assign') continue;
      if (s.target.t === 'reg') { alias.set(s.target.n, s.v); continue; }
      if (s.target.t !== 'mem' && s.target.t !== 'var') continue;
      const f = fnOf(s.v, alias);
      if (f === null) continue;
      const full = nameText(s.target, alias, new Map());
      if (full.includes('prototype') || /^(this|r\d+)\b/.test(full)) continue;
      if (!full.includes('.')) continue; // classes are `_global.X` or `Pkg.X`; `onRelease = function` is not a class
      classPath = full.replace(/^_global\./, '');
      break;
    }
  }
  const functions: FunctionInfo[] = [];
  const queue: Array<{ f: FoundFunction; parent: ExploreResult; parentName: string }> =
    opts.functions === false ? [] : explored.functions.map(f => ({ f, parent: explored, parentName: '' }));
  while (queue.length) {
    const { f, parent, parentName } = queue.shift()!;
    const defNode = parent.nodes[f.nodeId];
    const pool = defNode.pool >= 0 ? parent.pools[defNode.pool] : null;
    const ex = explore(buf, { start: f.bodyStart, end: f.bodyEnd, mode: 'function', pool, maxNodes: opts.maxNodes });
    const d = decompile(ex);
    const info = f.ins.fn!;
    const regNames: Array<string | undefined> = [];
    if (f.ins.name === 'DefineFunction2') {
      (info.preloaded ?? []).forEach((n, i) => { if (n) regNames[i] = n; });
      for (const p of info.params) if (p.register) regNames[p.register] = p.name;
    }
    let name = fnNames.get(f.offset) ?? (parentName ? `${parentName}/function@${f.offset}` : `function@${f.offset}`);
    if (info.name && !fnNames.has(f.offset)) name = parentName ? `${parentName}/${info.name}` : info.name;
    fnNames.set(f.offset, name);
    const fi: FunctionInfo = {
      offset: f.offset, bodyStart: f.bodyStart, bodyEnd: f.bodyEnd, name,
      kind: f.ins.name as FunctionInfo['kind'], params: info.params, registerCount: info.registerCount ?? 0,
      flags: info.flags ?? 0, preloaded: info.preloaded ?? [], explored: ex, dec: d, parent: parentName,
      ctx: makeCtx(fnNames, f.ins.name === 'DefineFunction2' ? regNames : undefined, f.ins.name === 'DefineFunction2' ? '_loc' : 'r'),
    };
    functions.push(fi);
    // name nested functions from this body's statements
    const nested = new Map<number, string>();
    for (const g of ex.functions) nested.set(g.offset, '');
    const local = new Map<number, string>();
    namingCtx = fi.ctx;
    try { nameFunctions(d.tree, local, `${name}/`); } finally { namingCtx = null; }
    for (const [k, v] of local) if (nested.has(k) && !fnNames.has(k)) fnNames.set(k, v);
    for (const g of ex.functions) queue.push({ f: g, parent: ex, parentName: name });
  }
  functions.sort((a, b) => a.offset - b.offset);
  return { start: opts.start, end: opts.end, explored, dec, functions, classPath, registerClass, ctx };
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering

export interface RenderOptions {
  /** Include the clean instruction listing after each pseudo-code body. */
  instructions?: boolean;
}

function fnSignature(f: FunctionInfo): string {
  const ps = f.params.map(p => (p.register ? `${p.name} /*r${p.register}*/` : p.name)).join(', ');
  return `function ${f.name}(${ps})`;
}

/** Clean (deobfuscated) instruction listing of a unit and all its functions, grouped by basic block. */
export function renderListing(u: UnitResult, title: string): string {
  const L: string[] = [
    `; ${title}`,
    '; Clean AVM1 instruction listing: junk / opaque-predicate / dispatcher instructions are folded away',
    '; ("(n folded)"); ⟨…⟩ shows each operand: a literal when it is a (folded) constant, · when it comes from real code.',
    '; Offsets are absolute in the decompressed SWF.', '',
    `; ===== top-level script @${u.start}`,
    ...u.dec.listing,
  ];
  for (const f of u.functions) {
    L.push('', `; ===== ${fnSignature(f)}  @${f.offset} body ${f.bodyStart}..${f.bodyEnd}`, ...f.dec.listing);
  }
  return L.join('\n') + '\n';
}

const LEGEND = [
  '// Legend: pseudo-code recovered from the deobfuscated bytecode. `// @N` = absolute SWF offset of the instruction that',
  '// performs the statement (use it in `// [BC] <file> @N`). `_locN_` = register N (ffdec numbering), params by name.',
  '// for-headers show `init @ test @ incr @`. Raw instructions: generated/disasm/asm/<same name>.',
];

export function renderUnit(u: UnitResult, title: string, sourceDesc: string, opts: RenderOptions = {}): string {
  const L: string[] = [];
  L.push(`// ${title}`);
  L.push(`// ${sourceDesc}`);
  L.push(...LEGEND);
  L.push(`// entry @${u.start}  (offsets are absolute in the decompressed SWF; [BC] refs use them)`);
  if (u.classPath) L.push(`// class ${u.classPath}`);
  if (u.registerClass.length) for (const [k, v] of u.registerClass) L.push(`// Object.registerClass(${quote(k)}, ${v})`);
  const ex = u.explored;
  const real = ex.nodes.filter(n => !n.folded).length;
  L.push(`// deobfuscation: ${ex.nodes.length} states explored, ${real} real / ${ex.nodes.length - real} folded (junk/opaque); ` +
    `obfuscator vars: ${[...ex.obfVars].map(quote).join(' ') || '-'}; states outside the tag: ${ex.outside}`);
  const warns = [...ex.warnings.filter(w => !/stack underflow|widened/.test(w)), ...u.dec.warnings];
  if (warns.length) L.push(`// notes: ${warns.slice(0, 12).join(' | ')}`);
  L.push('');
  L.push('// ===== top-level script =====');
  L.push(...renderTree(u.dec.tree, u.ctx));
  if (opts.instructions) {
    L.push('');
    L.push('// ----- clean instruction listing (junk folded) -----');
    L.push(...u.dec.listing.map(s => '//' + s));
  }
  for (const f of u.functions) {
    L.push('');
    L.push('// ' + '='.repeat(100));
    L.push(`// ${fnSignature(f)}`);
    const flags = f.kind === 'DefineFunction2'
      ? `regs=${f.registerCount} flags=[${describeFunction2Flags(f.flags)}] preload=[${f.preloaded.map((p, i) => (p ? `r${i}:${p}` : '')).filter(Boolean).join(' ')}]`
      : 'DefineFunction (v1, no registers)';
    L.push(`// @${f.offset} body ${f.bodyStart}..${f.bodyEnd} ${flags}`);
    const fw = [...f.explored.warnings.filter(w => !/widened/.test(w)), ...f.dec.warnings];
    if (fw.length) L.push(`// notes: ${fw.slice(0, 12).join(' | ')}`);
    L.push(`${fnSignature(f)} {`);
    L.push(...renderTree(f.dec.tree, f.ctx));
    L.push('}');
    if (opts.instructions) {
      L.push('// ----- instructions -----');
      L.push(...f.dec.listing.map(s => '//' + s));
    }
  }
  return L.join('\n') + '\n';
}

export { renderStmt };
