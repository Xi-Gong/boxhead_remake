/**
 * Generic control-flow-graph utilities over dense node indices 0..n-1:
 * reverse post-order, dominators / post-dominators (Cooper-Harvey-Kennedy), back edges, natural loops, Graphviz.
 */

export interface Graph {
  n: number;
  succ: number[][];
  pred: number[][];
  entry: number;
}

export function makeGraph(n: number, entry: number, edges: Iterable<[number, number]>): Graph {
  const succ: number[][] = Array.from({ length: n }, () => []);
  const pred: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    succ[a].push(b);
    pred[b].push(a);
  }
  return { n, succ, pred, entry };
}

/** Reverse post-order of nodes reachable from `entry` (iterative DFS; successor order preserved). */
export function reversePostOrder(succ: number[][], entry: number): number[] {
  const n = succ.length;
  const state = new Uint8Array(n);
  const post: number[] = [];
  const stack: Array<[number, number]> = [[entry, 0]];
  state[entry] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const [v, i] = top;
    if (i < succ[v].length) {
      top[1]++;
      const w = succ[v][i];
      if (!state[w]) { state[w] = 1; stack.push([w, 0]); }
    } else {
      post.push(v);
      stack.pop();
    }
  }
  return post.reverse();
}

/**
 * Immediate dominators. Returns idom[] with idom[entry] = entry and -1 for unreachable nodes.
 * `succ`/`pred` may describe the reversed graph (for post-dominators).
 */
export function dominators(succ: number[][], pred: number[][], entry: number): number[] {
  const n = succ.length;
  const rpo = reversePostOrder(succ, entry);
  const order = new Int32Array(n).fill(-1);
  rpo.forEach((v, i) => { order[v] = i; });
  const idom = new Array<number>(n).fill(-1);
  idom[entry] = entry;
  const intersect = (a: number, b: number): number => {
    while (a !== b) {
      while (order[a] > order[b]) a = idom[a];
      while (order[b] > order[a]) b = idom[b];
    }
    return a;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of rpo) {
      if (v === entry) continue;
      let nd = -1;
      for (const p of pred[v]) {
        if (idom[p] === -1 || order[p] < 0) continue;
        nd = nd === -1 ? p : intersect(p, nd);
      }
      if (nd !== -1 && idom[v] !== nd) { idom[v] = nd; changed = true; }
    }
  }
  return idom;
}

export function dominates(idom: number[], a: number, b: number): boolean {
  // does a dominate b?
  let x = b;
  for (let guard = 0; guard < 1e6; guard++) {
    if (x === a) return true;
    const p = idom[x];
    if (p === -1 || p === x) return x === a;
    x = p;
  }
  return false;
}

/**
 * Post-dominators via a virtual exit node `n` connected from every exit (node without successors) and, to keep
 * infinite loops well-defined, from every node of a strongly connected region without exits.
 * Returns ipdom[] of length n where `n` (the virtual exit) means "no real post-dominator".
 */
export function postDominators(g: Graph): number[] {
  const n = g.n;
  const rsucc: number[][] = Array.from({ length: n + 1 }, () => []);
  const rpred: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let v = 0; v < n; v++) {
    for (const w of g.succ[v]) { rsucc[w].push(v); rpred[v].push(w); }
    if (g.succ[v].length === 0) { rsucc[n].push(v); rpred[v].push(n); }
  }
  // Nodes that cannot reach an exit (infinite loops): connect them to the virtual exit as well.
  const reach = new Uint8Array(n + 1);
  const st = [n];
  reach[n] = 1;
  while (st.length) {
    const v = st.pop()!;
    for (const w of rsucc[v]) if (!reach[w]) { reach[w] = 1; st.push(w); }
  }
  for (let v = 0; v < n; v++) {
    if (!reach[v]) {
      rsucc[n].push(v); rpred[v].push(n);
      // propagate reachability
      const s2 = [v]; reach[v] = 1;
      while (s2.length) {
        const x = s2.pop()!;
        for (const w of rsucc[x]) if (!reach[w]) { reach[w] = 1; s2.push(w); }
      }
    }
  }
  const ipdom = dominators(rsucc, rpred, n);
  return ipdom.slice(0, n);
}

export interface Loop {
  header: number;
  /** Nodes of the natural loop (header included). */
  body: Set<number>;
  /** Sources of back edges into the header. */
  latches: number[];
  /** Successors outside the loop. */
  exits: number[];
}

/** Back edges u->h where h dominates u. */
export function backEdges(g: Graph, idom: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let u = 0; u < g.n; u++) {
    if (idom[u] === -1) continue;
    for (const h of g.succ[u]) if (dominates(idom, h, u)) out.push([u, h]);
  }
  return out;
}

/** Retreating edges that are not back edges (irreducible flow), detected with a DFS. */
export function retreatingNonBackEdges(g: Graph, idom: number[]): Array<[number, number]> {
  const rpo = reversePostOrder(g.succ, g.entry);
  const order = new Int32Array(g.n).fill(-1);
  rpo.forEach((v, i) => { order[v] = i; });
  const out: Array<[number, number]> = [];
  for (const u of rpo) {
    for (const h of g.succ[u]) {
      if (order[h] >= 0 && order[h] <= order[u] && !dominates(idom, h, u)) out.push([u, h]);
    }
  }
  return out;
}

/** Natural loops, merged per header, sorted outer-first (by body size, descending). */
export function naturalLoops(g: Graph, idom: number[]): Loop[] {
  const byHeader = new Map<number, Loop>();
  for (const [u, h] of backEdges(g, idom)) {
    let L = byHeader.get(h);
    if (!L) { L = { header: h, body: new Set([h]), latches: [], exits: [] }; byHeader.set(h, L); }
    L.latches.push(u);
    const st = [u];
    while (st.length) {
      const v = st.pop()!;
      if (L.body.has(v)) continue;
      L.body.add(v);
      for (const p of g.pred[v]) if (idom[p] !== -1) st.push(p);
    }
  }
  for (const L of byHeader.values()) {
    const ex = new Set<number>();
    for (const v of L.body) for (const w of g.succ[v]) if (!L.body.has(w)) ex.add(w);
    L.exits = [...ex].sort((a, b) => a - b);
  }
  return [...byHeader.values()].sort((a, b) => b.body.size - a.body.size);
}

/** Graphviz rendering. `label(i)` gives node text; `edgeLabel(a, b, k)` optional. */
export function toDot(
  g: Graph, name: string, label: (i: number) => string,
  edgeLabel?: (a: number, b: number, k: number) => string | undefined,
): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\l');
  const lines = [`digraph "${esc(name)}" {`, '  node [shape=box fontname="Consolas" fontsize=9];'];
  for (let i = 0; i < g.n; i++) lines.push(`  n${i} [label="${esc(label(i))}\\l"];`);
  for (let a = 0; a < g.n; a++) {
    g.succ[a].forEach((b, k) => {
      const l = edgeLabel?.(a, b, k);
      lines.push(`  n${a} -> n${b}${l ? ` [label="${esc(l)}"]` : ''};`);
    });
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}
