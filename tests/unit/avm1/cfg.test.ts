import { describe, expect, it } from 'vitest';
import { makeGraph, dominators, postDominators, naturalLoops, backEdges, reversePostOrder, toDot } from '../../../tools/avm1/cfg.ts';

describe('CFG utilities', () => {
  // 0 -> 1 -> 2 -> 1 (loop), 1 -> 3, 3 -> 4, 0 -> 4
  const g = makeGraph(5, 0, [[0, 1], [1, 2], [2, 1], [1, 3], [3, 4], [0, 4]]);

  it('reverse post-order starts at the entry', () => {
    const rpo = reversePostOrder(g.succ, 0);
    expect(rpo[0]).toBe(0);
    expect(new Set(rpo).size).toBe(5);
  });

  it('dominators and post-dominators', () => {
    const idom = dominators(g.succ, g.pred, 0);
    expect(idom).toEqual([0, 0, 1, 1, 0]);
    const ipdom = postDominators(g);
    expect(ipdom[1]).toBe(3);
    expect(ipdom[0]).toBe(4);
    expect(ipdom[4]).toBe(5); // virtual exit
  });

  it('back edges and natural loops', () => {
    const idom = dominators(g.succ, g.pred, 0);
    expect(backEdges(g, idom)).toEqual([[2, 1]]);
    const loops = naturalLoops(g, idom);
    expect(loops).toHaveLength(1);
    expect([...loops[0].body].sort()).toEqual([1, 2]);
    expect(loops[0].exits).toEqual([3]);
  });

  it('renders Graphviz', () => {
    const dot = toDot(g, 'g', i => `n${i}`, (a, _b, k) => (a === 1 ? (k ? 'F' : 'T') : undefined));
    expect(dot).toContain('n1 -> n2 [label="T"]');
    expect(dot.trim().endsWith('}')).toBe(true);
  });
});
