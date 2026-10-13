/**
 * generated/reports/hotspots.md — every ffdec decompile artifact in assets/projects/boxhead4/**.as with the TRUE code
 * recovered from bytecode (tools/avm1 pseudo-decompiler), located by aligning ffdec's method text with ours.
 *
 * Artifact kinds detected in the ffdec text:
 *   LOOP      `while(true)` / `while(0 < n)` — for-loops whose counter register ffdec constant-propagated away
 *   NUM       bare numeric statement (`7120;`) — a register store (often `_locN_ = getTimer()`) folded by ffdec
 *   STR       bare string statement (`"";`) — a register store of a string literal
 *   SS        `§§push` / `§§pop` — stack values ffdec could not place
 *   LIT       numeric / boolean literal in the ffdec line that never occurs in the bytecode of that method
 *             (a register or a getTimer() result replaced by a constant, e.g. `7786 - this.mTimeSlice`)
 *   REG0      `0.prototype`, `0.Name = function` — register r1/r2 replaced by 0 in a class prologue
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { UnitResult, FunctionInfo } from './unit.ts';
import { renderTree } from './decompile.ts';
import { HOTSPOT_NOTES, HOTSPOT_GENERAL } from './hotspotNotes.ts';

export interface HotspotUnit {
  file: string;
  unit: UnitResult;
}

export interface AsMethod {
  name: string;
  isStatic: boolean;
  accessor: 'get' | 'set' | null;
  /** 0-based line indices: definition line, first and last line of the body (inside braces). */
  defLine: number;
  bodyFrom: number;
  bodyTo: number;
}

type Kind = 'LOOP' | 'NUM' | 'STR' | 'BOOL' | 'SS' | 'LIT' | 'REG0' | 'DIFF' | 'CTRL';

/** Comparison form for DIFF detection (cosmetic differences removed). */
function strictCmp(s: string): string {
  return norm(s).replace(/!==/g, '!=').replace(/===/g, '==').replace(/\\'/g, "'").replace(/^returnundefined$/, 'return')
    .replace(/\^4294967295/g, '^-1')
    .replace(/^else/, '').replace(/^if/, '');
}

interface Artifact { line: number; kinds: Set<Kind>; detail: string[] }

interface Cluster {
  from: number;
  to: number;
  kinds: Set<Kind>;
  details: string[];
}

function listAs(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.as')) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Positions of `function` keywords and brace depth there; strings and comments skipped. */
function scanBraces(lines: string[]): { depthAtLineStart: number[]; fnAt: Array<{ line: number; col: number; depth: number }>; closeOf: Map<string, [number, number]> } {
  const depthAtLineStart: number[] = [];
  const fnAt: Array<{ line: number; col: number; depth: number }> = [];
  const opens: Array<[number, number]> = [];
  const closeOf = new Map<string, [number, number]>();
  let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    depthAtLineStart.push(depth);
    const s = lines[li];
    let inStr: string | null = null;
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (inStr) {
        if (ch === '\\') { c++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === '/' && s[c + 1] === '/') break;
      if (ch === '{') { opens.push([li, c]); depth++; continue; }
      if (ch === '}') {
        depth--;
        const o = opens.pop();
        if (o) closeOf.set(`${o[0]}:${o[1]}`, [li, c]);
        continue;
      }
      if (s.startsWith('function', c) && !/[\w$]/.test(s[c - 1] ?? ' ') && !/[\w$]/.test(s[c + 8] ?? ' ')) {
        fnAt.push({ line: li, col: c, depth });
      }
    }
  }
  return { depthAtLineStart, fnAt, closeOf };
}

export function parseMethods(lines: string[]): AsMethod[] {
  const { fnAt, closeOf } = scanBraces(lines);
  const methods: AsMethod[] = [];
  for (const f of fnAt) {
    if (f.depth !== 1) continue;
    const s = lines[f.line];
    let name: string | null = null;
    let isStatic = false;
    let accessor: 'get' | 'set' | null = null;
    const m1 = /^\s*(static\s+)?function\s+(?:(get|set)\s+)?([\w$]+)\s*\(/.exec(s);
    if (m1) { isStatic = !!m1[1]; accessor = (m1[2] as 'get' | 'set') ?? null; name = m1[3]; }
    else {
      const m2 = /([\w$]+)\s*=\s*function\b/.exec(s.slice(0, f.col + 8));
      if (m2) {
        name = m2[1];
        isStatic = /(^|[^\w$.])\d+\.[\w$]+\s*=\s*function/.test(s) || /^\s*[\w$.]+\.[A-Z][\w$]*\s*=\s*function/.test(s) && !/_loc\d+_/.test(s);
      }
    }
    if (!name) continue;
    // body: first '{' at or after the definition
    let open: [number, number] | null = null;
    for (let li = f.line; li < Math.min(lines.length, f.line + 3) && !open; li++) {
      const from = li === f.line ? f.col : 0;
      const idx = lines[li].indexOf('{', from);
      if (idx >= 0) open = [li, idx];
    }
    if (!open) continue;
    const close = closeOf.get(`${open[0]}:${open[1]}`);
    if (!close) continue;
    methods.push({ name, isStatic, accessor, defLine: f.line, bodyFrom: open[0] + 1, bodyTo: close[0] - 1 });
  }
  return methods;
}

export function findFunction(u: UnitResult, cls: string, m: AsMethod): FunctionInfo | undefined {
  const short = cls.split('.').pop()!;
  const names: string[] = [];
  if (m.accessor) names.push(`${cls}.prototype.__${m.accessor}__${m.name}`, `${cls}.__${m.accessor}__${m.name}`);
  if (m.name === short) names.push(cls);
  if (m.isStatic) names.push(`${cls}.${m.name}`, `${cls}.prototype.${m.name}`);
  else names.push(`${cls}.prototype.${m.name}`, `${cls}.${m.name}`);
  for (const n of names) {
    const f = u.functions.find(x => x.name === n);
    if (f) return f;
  }
  return undefined;
}

/** Normalised line for alignment. */
export function norm(s: string): string {
  let t = s.replace(/\s+\/\/ (@\d+|init @\d+.*)$/, '');
  t = t.replace(/^\s*var\s+/, '').trim();
  t = t.replace(/^return undefined;$/, 'return;');
  t = t.replace(/^(\+\+|--)([\w$.[\]]+);$/, (_m, op, x) => `${x} = ${x} ${op[0]} 1;`);
  t = t.replace(/^([\w$.[\]]+)(\+\+|--);$/, (_m, x, op) => `${x} = ${x} ${op[0]} 1;`);
  t = t.replace(/^([\w$.[\]]+)\s*([+\-*/|&%])=\s*(.*);$/, (_m, x, op, y) => `${x} = ${x} ${op} ${y};`);
  t = t.replace(/[\s(){};]/g, '');
  return t;
}

/** Loose normalisation: literals, registers and getTimer() are wildcards; a bare number matches `_locN_ = x`. */
function looseNorm(s: string): string {
  let t = norm(s).replace(/"(?:[^"\\]|\\.)*"/g, '#').replace(/getTimer/g, '#').replace(/_loc\d+_/g, '#')
    .replace(/(?<![\w$])-?\d+(\.\d+)?(e[+-]?\d+)?/g, '#').replace(/\btrue\b|\bfalse\b/g, '#');
  if (/^#+$/.test(t)) t = '#=#';
  return t;
}

/** LCS alignment of normalised lines: returns map ffdecIndex -> ourIndex. */
function align(a: string[], b: string[], f: (s: string) => string = norm): Map<number, number> {
  const n = a.length, m = b.length;
  const map = new Map<number, number>();
  if (!n || !m || n * m > 4e6) return map;
  const A = a.map(f), Bn = b.map(f);
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] && A[i] === Bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] && A[i] === Bn[j]) { map.set(i, j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

function literalsOf(text: string): { nums: Set<string>; bools: Set<string> } {
  const nums = new Set<string>();
  const bools = new Set<string>();
  const noStr = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/ (@\d+|init @.*)$/gm, '')
    .replace(/(?<![\d.])[A-Za-z_$][\w$]*/g, w => (w === 'true' || w === 'false' ? w : 'ID'));
  for (const m of noStr.matchAll(/(?<![\w$.])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w$])/g)) {
    const n = Number(m[0]);
    nums.add(String(n));
    // AVM1 bit operators work on int32: 4294967295 in the bytecode is the -1 ffdec prints
    if (Number.isInteger(n) && Math.abs(n) <= 4294967295) nums.add(String(n | 0));
  }
  if (/\+\+|--/.test(noStr)) nums.add('1');
  for (const m of noStr.matchAll(/\b(true|false)\b/g)) bools.add(m[1]);
  return { nums, bools };
}

function detect(lines: string[], m: AsMethod, ourLines: string[], map: Map<number, number>): Artifact[] {
  const arts: Artifact[] = [];
  const methodLits = literalsOf(ourLines.join('\n'));
  // literals of the bytecode statements aligned with ffdec line i (window between the neighbouring anchors)
  const windowLits = (fi: number) => {
    if (!map.size) return methodLits;
    let p = -1, q = ourLines.length;
    for (let x = fi - 1; x >= 0; x--) if (map.has(x)) { p = map.get(x)!; break; }
    for (let x = fi + 1; x <= m.bodyTo - m.bodyFrom; x++) if (map.has(x)) { q = map.get(x)!; break; }
    if (map.has(fi)) { p = Math.min(p, map.get(fi)! - 1); q = Math.max(q, map.get(fi)! + 1); }
    return literalsOf(ourLines.slice(Math.max(0, p), Math.min(ourLines.length, q + 1)).join('\n'));
  };
  for (let i = m.bodyFrom; i <= m.bodyTo; i++) {
    const oursLits = windowLits(i - m.bodyFrom);
    const s = lines[i];
    const kinds = new Set<Kind>();
    const detail: string[] = [];
    if (/\bwhile\(true\)/.test(s) || /\bwhile\(-?[\d.]+ *(<|<=|>|>=)/.test(s)) kinds.add('LOOP');
    // `0;` + `while(cond)`: a for-loop whose counter (and part of the condition) ffdec dropped
    if (/^\s*while\(/.test(s) && i > m.bodyFrom && /^\s*-?\d[\d.]*;\s*$/.test(lines[i - 1])) kinds.add('LOOP');
    if (/^\s*-?\d[\d.]*(e[+-]?\d+)?;\s*$/.test(s)) kinds.add('NUM');
    if (/^\s*"(?:[^"\\]|\\.)*";\s*$/.test(s)) kinds.add('STR');
    if (/^\s*(true|false|undefined|null);\s*$/.test(s)) kinds.add('BOOL');
    if (s.includes('§§')) kinds.add('SS');
    if (/(^|[^\w$.\d])\d+\.(?!\d)[A-Za-z_$]/.test(s)) kinds.add('REG0');
    if (!kinds.has('NUM') && !/^\s*(function|static function)/.test(s)) {
      const l = literalsOf(s);
      // window check for distinctive literals; common small constants and booleans only if absent from the method
      const inM = (x: string) => methodLits.nums.has(x) || methodLits.nums.has(String(-Number(x)));
      const inW = (x: string) => oursLits.nums.has(x) || oursLits.nums.has(String(-Number(x)));
      const small = (x: string) => ['0', '1', '2', '-1', '0.5', '10', '100'].includes(x);
      const missing = [...l.nums].filter(x => !inM(x) || (!inW(x) && !small(x)));
      const missingB = [...l.bools].filter(x => !methodLits.bools.has(x));
      if (missing.length || missingB.length) { kinds.add('LIT'); detail.push(`literal ${[...missing, ...missingB].join(', ')} not in bytecode`); }
    }
    if (kinds.size) arts.push({ line: i, kinds, detail });
  }
  return arts;
}

function clusterize(lines: string[], arts: Artifact[], m: AsMethod): Cluster[] {
  const { closeOf } = scanBraces(lines);
  const cl: Cluster[] = [];
  for (const a of arts) {
    let from = a.line, to = a.line;
    if (a.kinds.has('LOOP')) {
      // extend over the loop block and its neighbouring bare-number init / increment lines
      const open = lines[a.line + 1]?.indexOf('{') ?? -1;
      if (open >= 0) {
        const close = closeOf.get(`${a.line + 1}:${open}`);
        if (close) to = Math.max(to, close[0]);
      }
      if (from - 1 >= m.bodyFrom && /^\s*-?\d[\d.]*;\s*$|^\s*var _loc\d+_ = /.test(lines[from - 1])) from--;
      if (to + 1 <= m.bodyTo && /^\s*-?\d[\d.]*;\s*$/.test(lines[to + 1])) to++;
    }
    cl.push({ from, to, kinds: new Set(a.kinds), details: [...a.detail] });
  }
  cl.sort((x, y) => x.from - y.from);
  const merged: Cluster[] = [];
  for (const c of cl) {
    const last = merged[merged.length - 1];
    if (last && c.from <= last.to + 1) {
      last.to = Math.max(last.to, c.to);
      c.kinds.forEach(k => last.kinds.add(k));
      last.details.push(...c.details);
    } else merged.push(c);
  }
  return merged;
}

/** Per line: inside a `switch` block (by indentation). */
function inSwitch(lines: string[]): boolean[] {
  const out: boolean[] = [];
  const stack: number[] = [];
  for (const s of lines) {
    const ind = s.length - s.trimStart().length;
    while (stack.length && /^\s*\}/.test(s) && ind <= stack[stack.length - 1]) { stack.pop(); }
    out.push(stack.length > 0);
    if (/^\s*switch\s*\(/.test(s)) stack.push(ind);
  }
  return out;
}

/** Render a function with the bodies of the functions it defines inlined after the defining statement (like ffdec). */
export function renderWithNested(u: UnitResult, fi: FunctionInfo, depth = 0): string[] {
  const lines = renderTree(fi.dec.tree, fi.ctx, '  ');
  if (depth > 8) return lines;
  const nested = u.functions.filter(g => g.parent === fi.name);
  for (const g of nested) {
    const idx = lines.findIndex(l => l.includes(`@${g.offset};`) || l.includes(`@${g.offset})`) || l.includes(`@${g.offset},`) || l.includes(`@${g.offset} `));
    const body = [`  // ---- function ${g.name} @${g.offset} {`, ...renderWithNested(u, g, depth + 1).map(l => '  ' + l), '  // ---- }'];
    if (idx >= 0) lines.splice(idx + 1, 0, ...body);
    else lines.push(...body);
  }
  return lines;
}

export interface HotspotStats {
  file: string; found: number; resolved: number; unresolved: number; methodsMissing: string[];
  /** Explained class-prologue artifact lines. */
  prologue?: number;
}

/** Explanation of an artifact line in a class prologue (top-level script), or null. */
function prologueArtifact(s: string, cls: string): string | null {
  const t = s.trim();
  if (/^§§pop\(\);$/.test(t)) {
    return 'no-op: `Pop` on an empty stack after the `if (!_global.Pkg) _global.Pkg = new Object();` package guard (compiler idiom) — ignore';
  }
  let m = /^§§push\((.*)\.addProperty\("([\w$]+)",(.*),0\)\);$/.exec(t);
  if (m) {
    return `\`addProperty("${m[2]}", getter, function () {})\`: the \`0\` is an anonymous EMPTY function (DefineFunction, body size 0) — ` +
      `getter-only property whose assignments are silently ignored. Port as \`get ${m[2]}()\` + no-op \`set ${m[2]}(v) {}\` (a missing setter would throw in strict TS)`;
  }
  m = /^§§push\((.*)\.addProperty\("([\w$]+)",/.exec(t);
  if (m) return `\`addProperty("${m[2]}", getter, setter)\` statement (result unused)`;
  if (/^§§push\(ASSetPropFlags\(/.test(t)) {
    return '`ASSetPropFlags(Class.prototype, null, 1)` statement: hides prototype members from for..in (result unused)';
  }
  if (/^§§push\(/.test(t)) return 'plain statement (call result left on the AVM1 stack, never used)';
  if (t.includes('§§')) return 'stack artifact — see the top-level script in the disasm file';
  m = /(?:^|[^\w$.\d])0\.([\w$]+)\s*=\s*function\b/.exec(t);
  if (m) return `STATIC method \`${cls}.${m[1]}\` (register r1 = the class constructor printed as \`0\`)`;
  m = /(?:^|[^\w$.\d])0\.([\w$]+)\s*=/.exec(t);
  if (m) return `STATIC member \`${cls}.${m[1]}\` (register r1 = the class constructor printed as \`0\`)`;
  if (/=\s*0\.prototype;$/.test(t)) return `\`_loc2_ = ${cls}.prototype\` (register r1 printed as \`0\`)`;
  m = /^([\w$.]+)\s*=\s*0;$/.exec(t);
  if (m && cls.endsWith(m[1].replace(/^_global\./, ''))) return `\`${m[1]} = <constructor function>\` (register r1 printed as \`0\`; the constructor is listed in the disasm file)`;
  m = /^\}\.([\w$]+)\s*=\s*(function\b)?/.exec(t);
  if (m) {
    return m[2] ? `STATIC method \`${cls}.${m[1]}\` (ffdec re-printed the constructor function in place of register r1)`
      : `STATIC member \`${cls}.${m[1]}\` (ffdec re-printed the constructor function in place of register r1)`;
  }
  if (/^-?\d[\d.]*;$/.test(t)) return 'lost register store — see the top-level script in the disasm file';
  return null;
}

export function buildHotspots(as2Dir: string, units: HotspotUnit[]): { markdown: string; stats: HotspotStats[] } {
  const byClass = new Map<string, HotspotUnit>();
  for (const u of units) if (u.unit.classPath) byClass.set(u.unit.classPath, u);
  const body: string[] = [];
  const stats: HotspotStats[] = [];
  let total = 0, totalResolved = 0, totalPrologue = 0;
  const kindCount = new Map<Kind, number>();
  for (const path of listAs(as2Dir)) {
    const rel = relative(as2Dir, path).replace(/\\/g, '/');
    const cls = rel.replace(/\.as$/, '').replace(/\//g, '.');
    const hu = byClass.get(cls);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const methods = parseMethods(lines);
    const st: HotspotStats = { file: rel, found: 0, resolved: 0, unresolved: 0, methodsMissing: [] };
    const section: string[] = [];
    const noted = new Set<string>();
    for (const m of methods) {
      const fi = hu ? findFunction(hu.unit, cls, m) : undefined;
      if (!fi) { st.methodsMissing.push(m.name); }
      const ourLines = fi && hu ? renderWithNested(hu.unit, fi) : [];
      const ff = lines.slice(m.bodyFrom, m.bodyTo + 1);
      const map = align(ff, ourLines, looseNorm);
      const arts = detect(lines, m, ourLines, map);
      // DIFF: statements that align (same shape) but differ in literals / registers from the bytecode
      if (fi) {
        const have = new Set(arts.map(a => a.line));
        for (const [fiIdx, oj] of map) {
          const li = m.bodyFrom + fiIdx;
          if (have.has(li)) continue;
          const a = strictCmp(ff[fiIdx]), b = strictCmp(ourLines[oj]);
          // register-number-only differences are alignment noise, not artifacts
          if (a && a !== b && a.replace(/_loc\d+_/g, '#') !== b.replace(/_loc\d+_/g, '#')) {
            arts.push({ line: li, kinds: new Set<Kind>(['DIFF']), detail: [] });
          }
        }
        // CTRL (a): a plain `return;` the bytecode has inside a block that ffdec does not show (outside switches)
        const isRet = (s: string) => /^\s*return;/.test(s.replace(/\s+\/\/ @\d+$/, ''));
        const inv = new Map<number, number>();
        for (const [fiIdx, oj] of map) inv.set(oj, fiIdx);
        const ffAt = (oj: number): number => {
          for (let x = oj; x >= 0; x--) if (inv.has(x)) return inv.get(x)!;
          return 0;
        };
        const ourSw = inSwitch(ourLines), ffSw = inSwitch(ff);
        // ffdec's explicit trailing `return undefined;` corresponds to our dropped implicit return
        const ffLast = ff.length - 1;
        const ffRets = ff.filter((s, i) => !ffSw[i] && /^\s*return( undefined)?;/.test(s) &&
          !(i === ffLast && /^ {8}return( undefined)?;\s*$/.test(s))).length;
        const ourRets = ourLines.filter((s, i) => !ourSw[i] && isRet(s)).length;
        if (ourRets > ffRets) {
          for (let oj = 0; oj < ourLines.length; oj++) {
            if (!isRet(ourLines[oj]) || ourSw[oj] || inv.has(oj) || /\/\/ ----/.test(ourLines[oj])) continue;
            const li = m.bodyFrom + Math.min(ffAt(oj) + 1, ff.length - 1);
            if (have.has(li)) continue;
            have.add(li);
            arts.push({ line: li, kinds: new Set<Kind>(['CTRL']), detail: [`bytecode returns here (\`${ourLines[oj].trim()}\`) — ffdec lost this \`return\`, so its following code wrongly runs on this path`] });
          }
        }
        // CTRL (b): dead code after an unconditional continue/break/return in ffdec's text = ffdec mis-structured
        for (let fiIdx = 0; fiIdx + 1 < ff.length; fiIdx++) {
          const s = ff[fiIdx], nx = ff[fiIdx + 1];
          if (!/^\s*(continue;|break;|return\b[^;]*;)\s*$/.test(s)) continue;
          const ind = s.length - s.trimStart().length, ind2 = nx.length - nx.trimStart().length;
          if (ind2 !== ind || /^\s*(\}|case\b|default\b)/.test(nx)) continue;
          const li = m.bodyFrom + fiIdx;
          if (have.has(li)) continue;
          have.add(li);
          arts.push({ line: li, kinds: new Set<Kind>(['CTRL']), detail: [`ffdec shows dead code after \`${s.trim()}\` — the bytecode structure differs`] });
        }
        arts.sort((x, y) => x.line - y.line);
      }
      if (!arts.length) continue;
      const clusters = clusterize(lines, arts, m);
      for (const c of clusters) {
        total++; st.found++;
        c.kinds.forEach(k => kindCount.set(k, (kindCount.get(k) ?? 0) + 1));
        const a = c.from - m.bodyFrom, b = c.to - m.bodyFrom;
        let p = -1, q = ourLines.length;
        const inner: number[] = [];
        for (let i = a; i <= b; i++) if (map.has(i)) inner.push(map.get(i)!);
        if (inner.length === b - a + 1 && !c.kinds.has('LOOP')) {
          // every artifact line has a counterpart: show exactly those statements
          p = Math.min(...inner) - 1; q = Math.max(...inner) + 1;
        } else {
          for (let i = a - 1; i >= 0; i--) if (map.has(i)) { p = map.get(i)!; break; }
          for (let i = b + 1; i < ff.length; i++) if (map.has(i)) { q = map.get(i)!; break; }
        }
        let region = ourLines.slice(p + 1, q);
        let truncated = false;
        if (region.length > 70) { region = region.slice(0, 70); truncated = true; }
        const regionText = region.join('\n');
        const note = HOTSPOT_NOTES[`${rel}:${m.name}`];
        let ok = !!fi && region.length > 0;
        if (ok && c.kinds.has('LOOP') && !/\b(for|while) \(/.test(regionText)) ok = false;
        if (!ok && note && fi) ok = true; // hand-verified
        if (ok) { st.resolved++; totalResolved++; } else st.unresolved++;
        const offs = [...regionText.matchAll(/@(\d+)/g)].map(x => Number(x[1]));
        const kinds = [...c.kinds].join('+');
        section.push(`#### ${rel}:${c.from + 1}${c.to > c.from ? '-' + (c.to + 1) : ''} — \`${m.name}\` — ${kinds}${ok ? '' : ' — **CHECK MANUALLY**'}`);
        section.push('');
        if (note && !noted.has(m.name)) { noted.add(m.name); section.push(`> ${note.replace(/\n/g, '\n> ')}`, ''); }
        else if (note) section.push(`> (see the verified note on the first cluster of \`${m.name}\`)`, '');
        if (c.details.length) section.push(`_${[...new Set(c.details)].join('; ')}_`, '');
        section.push('ffdec:', '```as');
        for (let i = c.from; i <= c.to; i++) section.push(`${String(i + 1).padStart(4)}| ${lines[i]}`);
        section.push('```');
        if (fi && hu) {
          section.push(`recovered from bytecode — \`generated/disasm/${hu.file}\`, \`${fi.name}\` @${fi.offset}` +
            (offs.length ? ` (statements @${Math.min(...offs)}..@${Math.max(...offs)})` : '') + ':', '```as');
          section.push(...region.map(l => l.replace(/^ {2}/, '')));
          if (truncated) section.push('// … (truncated; see the disasm file)');
          section.push('```', '');
        } else {
          section.push(`recovered: _method not found in disasm (${hu ? hu.file : 'class not found'})_`, '');
        }
      }
    }
    // Class-prologue (top-level) artifacts of files ffdec could not turn into `class` syntax.
    const inMethod = new Uint8Array(lines.length);
    for (const m of methods) for (let i = m.bodyFrom; i <= m.bodyTo && i < lines.length; i++) inMethod[i] = 1;
    const pro: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (inMethod[i]) continue;
      const s = lines[i];
      const why = prologueArtifact(s, cls);
      if (!why) continue;
      pro.push(`| ${i + 1} | \`${s.trim().replace(/\|/g, '\\|').slice(0, 110)}\` | ${why} |`);
    }
    if (pro.length) {
      st.prologue = pro.length;
      totalPrologue += pro.length;
      section.push(`#### ${rel} — class prologue (top-level script) — ${pro.length} line(s)`, '',
        `Recovered top-level script: \`generated/disasm/${hu ? hu.file : '?'}\` (section "top-level script").`, '',
        '| line | ffdec | true meaning |', '|---|---|---|', ...pro, '');
    }
    if (st.found || pro.length) {
      body.push(`### ${rel}  (${st.found} artifact cluster(s), ${st.resolved} resolved${st.unresolved ? `, ${st.unresolved} to check` : ''}` +
        `${pro.length ? `; ${pro.length} prologue line(s)` : ''})`, '');
      body.push(...section);
    }
    stats.push(st);
  }
  const head: string[] = [
    '# Decompile artifact hotspots (ffdec → bytecode truth)', '',
    'Generated by `node tools/disasm.ts` (lane B1). For every artifact in `assets/projects/boxhead4/**/*.as` this lists the',
    'ffdec text (file:line) and the TRUE statements recovered from the AVM1 bytecode by the deobfuscating',
    'disassembler, with absolute SWF offsets. Tag ported lines with `// [BC] generated/disasm/<file> @<offset>`.', '',
    '**Reading the recovered code**: `_locN_` = register N (same numbering as ffdec), parameters by name, `this`/`_global`',
    'preloaded registers by name. `X = X + 1` is `X++`. A `for (a; b; c)` header shows the offsets of init/test/increment.',
    '`switch` and `for..in` are reconstructed. `§nextKey(enum@N)` = next for..in key. `§stackN_bM` = a value carried on the',
    'AVM1 stack across a join (rare). Statements are in bytecode order; ffdec\'s `var` declarations are not reproduced.', '',
    '**Artifact kinds**: LOOP = `while(true)`/`while(0 < n)` (lost for-loop counter: ffdec propagated the counter',
    'register as a constant, so `[0]`, `[32][255]`, `1;` etc. inside are counter reads/increments); NUM = bare number',
    'statement (a lost register store — often `_locN_ = getTimer()`); STR = bare string statement (lost register store of',
    'a string); SS = `§§push/§§pop`; LIT = literal in the ffdec line that does not occur in the method bytecode (a register',
    'or `getTimer()` replaced by its decompile-time value, e.g. `7786 - this.mTimeSlice`); REG0 = class-prologue register',
    'replaced by `0` (`0.Name = function` is a STATIC member, `_loc2_.Name` a prototype member); BOOL = bare',
    '`true;`/`false;` (lost boolean register store); DIFF = the aligned bytecode statement differs from ffdec\'s line in a',
    'literal/register (constant-propagation artifact); CTRL = ffdec lost or misplaced a `return`, or shows dead code',
    'after `continue`/`break`/`return` (control flow differs — always read the recovered code). "Resolved" = recovered',
    'statements were located for the cluster (loops: a recovered `for`/`while`); hand-verified ones carry a `>` note.', '',
    `**Totals**: ${total} artifact clusters in ${stats.filter(s => s.found).length} files; ${totalResolved} resolved automatically, ` +
    `${total - totalResolved} flagged **CHECK MANUALLY** (region found but pattern not confirmed). ` +
    `By kind (a cluster can have several): ${[...kindCount.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}. ` +
    `Plus ${totalPrologue} explained class-prologue lines (\`§§pop()\` guards, \`§§push(addProperty…)\`, \`0.X = function\` statics) ` +
    'in the files ffdec left as raw scripts.', '',
    '**General porting notes** (apply everywhere, verified in bytecode):',
    '- Getter-only properties: the AS2 compiler registers `addProperty(name, getter, function () {})` — an EMPTY setter.',
    '  Assignments are silently ignored in Flash; in a strict-mode TS class a missing setter throws. Add a no-op setter.',
    '- `ASSetPropFlags(Class.prototype, null, 1)` ends every class prologue: prototype members are not enumerable by for..in.',
    '- Every `getTimer()` call site is listed in `generated/reports/gettimer.md` (40 sites).',
    '- `_loc0_` (register 0) is the compiler temp for `switch` discriminants, chained assignments (`a.x = b.y = v`) and',
    '  `++obj.prop` pre-increments; the recovered code shows it explicitly.',
    ...HOTSPOT_GENERAL.map(s => `- ${s}`), '',
    '**Most important semantic fixes** (ffdec text would change gameplay): `CThing_Creature.State_BulletHit` (lost',
    '`return`), `CThing_Creature.ProcessAffects` (Explosion branch), `CThing_Collection.GetClosestPlayer` and',
    '`CWorld.Spawn_ValidPosition_Close/Far` (running min/max, not constants), `CMap_Cell.Nav_Update` (5 BFS layers per',
    'call), `CThing_Creature_Player.RandomPickup` (cumulative chances) / `InitWeapons` (`mKeyID = (i+1) % 10`),',
    '`CThing_Weapon_Shotgun.Fire` (pellet loop + `i >= 1` flag), `CDrawPrimitive_XSI_DI.LoadAnimation` (`seq[f] != f`),',
    'every `getTimer()`. Hand-verified notes are quoted (`>`) under the clusters.', '',
    '| file | clusters | resolved | check | prologue lines | methods not matched |', '|---|---|---|---|---|---|',
    ...stats.filter(s => s.found || s.methodsMissing.length || s.prologue).map(s =>
      `| ${s.file} | ${s.found} | ${s.resolved} | ${s.unresolved} | ${s.prologue ?? 0} | ${s.methodsMissing.join(', ')} |`),
    '',
  ];
  return { markdown: head.join('\n') + '\n' + body.join('\n') + '\n', stats };
}
