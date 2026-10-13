/**
 * Self-check of the pseudo-decompiler: every real side-effecting instruction of a function must be represented in
 * the rendered output. Statements carry the offset of the instruction that produced them (`// @offset`); a few
 * instructions are legitimately merged into another statement (chained assignments, `x++`, r0 temporaries), so
 * those are accepted when the statement text still contains the assigned target.
 */
import type { ExploreResult } from './explore.ts';
import type { SNode } from './decompile.ts';
import { renderTree } from './decompile.ts';
import type { RenderCtx } from './expr.ts';

export interface SelfCheckResult {
  checked: number;
  missing: Array<{ offset: number; op: string }>;
}

const EFFECT_OPS = new Set(['SetMember', 'SetVariable', 'DefineLocal', 'Return', 'Throw', 'Trace', 'SetProperty']);

export function selfCheck(res: ExploreResult, tree: SNode[], ctx: RenderCtx): SelfCheckResult {
  const text = renderTree(tree, ctx).join('\n') + '\n';
  const offs = new Set<number>();
  for (const m of text.matchAll(/@(\d+)/g)) offs.add(Number(m[1]));
  const seen = new Set<number>();
  const missing: Array<{ offset: number; op: string }> = [];
  let checked = 0;
  // reachable nodes only
  const reach = new Set<number>();
  const st = res.entry >= 0 ? [res.entry] : [];
  while (st.length) {
    const v = st.pop()!;
    if (reach.has(v)) continue;
    reach.add(v);
    for (const s of res.nodes[v].succ) if (s >= 0) st.push(s);
  }
  for (const id of reach) {
    const n = res.nodes[id];
    if (n.folded || !EFFECT_OPS.has(n.ins.name) || seen.has(n.pc)) continue;
    seen.add(n.pc);
    checked++;
    if (offs.has(n.pc)) continue;
    // merged forms: chained assignment / post-increment / inlined assignment expression keep the target text
    if (n.ins.name === 'SetMember' || n.ins.name === 'SetVariable' || n.ins.name === 'DefineLocal') {
      const name = n.inp[n.ins.name === 'SetMember' ? 1 : 0];
      if (name && name.k === 'c' && typeof name.v === 'string' && (text.includes(`.${name.v} = `) || text.includes(`${name.v}++`) ||
        text.includes(`${name.v}--`) || text.includes(`${name.v} = `) || text.includes(`["${name.v}"] = `))) continue;
      if (name && name.k !== 'c') continue; // computed member names: cannot check textually
    }
    if (n.ins.name === 'Return' && (/\breturn\b/.test(text) || (n.inp[0]?.k === 'c' && n.inp[0].v === undefined))) {
      // returns duplicated from a shared exit carry the shared offset; a bare `return;` ending the body is implicit
      continue;
    }
    if ((n.ins.name === 'DefineLocal' || n.ins.name === 'SetVariable') && n.inp[1]?.k === 'e') continue; // for (k in o)
    if ((n.ins.name === 'DefineLocal' || n.ins.name === 'SetVariable') && n.inp[0]?.k === 'c' &&
      new RegExp(`for \\(${String(n.inp[0].v).replace(/[^\w$]/g, '')} in `).test(text)) continue;
    missing.push({ offset: n.pc, op: n.ins.name });
  }
  return { checked, missing };
}
