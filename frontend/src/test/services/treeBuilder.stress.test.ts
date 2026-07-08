import { describe, it, expect } from 'vitest';
import { buildAdjacency, findMultiParents } from '../../services/graphBuilder';
import { buildTree } from '../../services/treeBuilder';
import { rel } from '../fixtures/relations';
import type { WorkItem, WorkItemRelation } from '../../types';

const HIER_FWD = 'System.LinkTypes.Hierarchy-Forward';
const HIER_REV = 'System.LinkTypes.Hierarchy-Reverse';
const RELATED = 'System.LinkTypes.Related';
const COVERED_FWD = 'Elisra.CoveredBy-Forward';
const COVERED_REV = 'Elisra.CoveredBy-Reverse';

function item(id: number): WorkItem {
  return { id, type: 'Task', title: `Item ${id}`, state: 'Active', teamProject: 'P', effort: 0 };
}

function itemsById(ids: number[]): Record<number, WorkItem> {
  return Object.fromEntries(ids.map(id => [id, item(id)]));
}

// Link-type combos crossed against every DAG shape below.
const COMBOS: Array<{ name: string; selectedRels: string[] }> = [
  { name: 'Hierarchy-Forward only', selectedRels: [HIER_FWD] },
  { name: 'Hierarchy-Forward + Hierarchy-Reverse (reciprocal spine)', selectedRels: [HIER_FWD, HIER_REV] },
  { name: 'Related only (symmetric)', selectedRels: [RELATED] },
  { name: 'Hierarchy-Forward + Related (mixed)', selectedRels: [HIER_FWD, RELATED] },
  { name: 'custom directional pair (Elisra.CoveredBy)', selectedRels: [COVERED_FWD, COVERED_REV] },
];

describe('stress: link-type combos x DAG shapes', () => {
  describe.each(COMBOS)('$name', ({ selectedRels }) => {
    const primaryFwd = selectedRels.find(r => r.endsWith('-Forward')) ?? selectedRels[0];
    const reverseOf = (fwd: string) => fwd.replace(/-Forward$/, '-Reverse');
    const usesReciprocal = selectedRels.includes(reverseOf(primaryFwd));

    it('1. linear chain: no cycle, no multi-parent', () => {
      const relations = [rel(1, 2, primaryFwd), rel(2, 3, primaryFwd)];
      if (usesReciprocal) relations.push(rel(2, 1, reverseOf(primaryFwd)), rel(3, 2, reverseOf(primaryFwd)));
      const adjacency = buildAdjacency(relations, selectedRels);
      const multiParents = findMultiParents(adjacency);
      const node = buildTree(1, adjacency, itemsById([1, 2, 3]), 'Closed', new Set(), undefined, multiParents);
      expect(node!.cutCycles).toBeUndefined();
      expect(node!.children[0].cutCycles).toBeUndefined();
      expect(multiParents.size).toBe(0);
    });

    it('2. diamond: shared child is multi-parent, not a cycle', () => {
      // A(1) -> D(4), B(2)? not needed; use A(1)->C(3), A2(2)->C(3)
      const relations = [rel(1, 3, primaryFwd), rel(2, 3, primaryFwd)];
      const adjacency = buildAdjacency(relations, selectedRels);
      const multiParents = findMultiParents(adjacency);
      const nodeA = buildTree(1, adjacency, itemsById([1, 2, 3]), 'Closed', new Set(), undefined, multiParents);
      const nodeB = buildTree(2, adjacency, itemsById([1, 2, 3]), 'Closed', new Set(), undefined, multiParents);
      expect(nodeA!.children[0].cutCycles).toBeUndefined();
      expect(nodeB!.children[0].cutCycles).toBeUndefined();
      if (!RELATED_ONLY(selectedRels)) {
        expect(multiParents.get(3)?.slice().sort()).toEqual([1, 2]);
        expect(nodeA!.children[0].multiParents?.slice().sort()).toEqual([1, 2]);
      } else {
        // Related is symmetric — never counted as a spine multi-parent.
        expect(multiParents.size).toBe(0);
      }
    });

    it('3. immediate reciprocal / symmetric back-edge: no spurious cycle chip', () => {
      const relations = [rel(1, 2, primaryFwd)];
      if (usesReciprocal || RELATED_ONLY(selectedRels)) {
        relations.push(rel(2, 1, usesReciprocal ? reverseOf(primaryFwd) : primaryFwd));
      }
      const adjacency = buildAdjacency(relations, selectedRels);
      const node = buildTree(1, adjacency, itemsById([1, 2]), 'Closed');
      expect(node!.children[0].cutCycles).toBeUndefined();
    });

    it('5. deep directional cycle A->B->C->A is flagged with full path', () => {
      const relations = [rel(1, 2, primaryFwd), rel(2, 3, primaryFwd), rel(3, 1, primaryFwd)];
      const adjacency = buildAdjacency(relations, selectedRels);
      const node = buildTree(1, adjacency, itemsById([1, 2, 3]), 'Closed');
      const node3 = node!.children[0].children[0];
      if (RELATED_ONLY(selectedRels)) {
        // Every edge is symmetric — no genuine cycle by the confirmed rule.
        expect(node3.cutCycles).toBeUndefined();
      } else {
        expect(node3.cutCycles).toEqual([{ target: 1, via: primaryFwd, path: [1, 2, 3, 1] }]);
      }
    });
  });
});

function RELATED_ONLY(selectedRels: string[]): boolean {
  return selectedRels.length === 1 && selectedRels[0] === RELATED;
}

describe('stress: mixed and combined shapes', () => {
  it('6. deep cycle with one symmetric leg is suppressed (pinned semantics)', () => {
    // A(1)->B(2)->C(3) primary spine; C(3)->A(1) via Related (symmetric) — suppressed by rule.
    const selectedRels = [HIER_FWD, RELATED];
    const relations = [rel(1, 2, HIER_FWD), rel(2, 3, HIER_FWD), rel(3, 1, RELATED)];
    const adjacency = buildAdjacency(relations, selectedRels);
    const node = buildTree(1, adjacency, itemsById([1, 2, 3]), 'Closed');
    const node3 = node!.children[0].children[0];
    expect(node3.cutCycles).toBeUndefined();
  });

  it('7. multi-parent diamond feeding into an independent cycle', () => {
    // US01(1)->Task01(3), US03(2)->Task01(3) [diamond]; Task01(3)->Bug01(4)->US01(1) [cycle through 1]
    const selectedRels = [HIER_FWD];
    const relations = [rel(1, 3, HIER_FWD), rel(2, 3, HIER_FWD), rel(3, 4, HIER_FWD), rel(4, 1, HIER_FWD)];
    const adjacency = buildAdjacency(relations, selectedRels);
    const multiParents = findMultiParents(adjacency);
    expect(multiParents.get(3)?.slice().sort()).toEqual([1, 2]);

    const nodeA = buildTree(1, adjacency, itemsById([1, 2, 3, 4]), 'Closed', new Set(), undefined, multiParents);
    const task01 = nodeA!.children[0];
    const bug01 = task01.children[0];
    expect(task01.multiParents?.slice().sort()).toEqual([1, 2]);
    expect(bug01.cutCycles).toEqual([{ target: 1, via: HIER_FWD, path: [1, 3, 4, 1] }]);
  });
});

// ─── Generated wide+deep DAG perf/correctness smoke ────────────────────────

// Deterministic seeded PRNG (mulberry32) — no Math.random(), so injected cycle/diamond
// counts are reproducible across runs.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('stress: generated wide+deep DAG', () => {
  it('8. ~500 nodes, branching 3-4, depth ~8, seeded injected cycles/diamonds — bounded time, correct counts', () => {
    const rand = mulberry32(42);
    const nodeCount = 500;
    const relations: WorkItemRelation[] = [];

    // Build a tree via BFS assignment: each new node attaches to a random existing node
    // (branching factor 3-4), producing a wide+deep DAG rooted at 0.
    const parentOf: number[] = [-1];
    for (let id = 1; id < nodeCount; id++) {
      const maxParentIdx = Math.max(0, id - 1);
      const parent = Math.floor(rand() * maxParentIdx * 0.9 + 0); // bias toward earlier (shallower) nodes
      const p = Math.min(parent, maxParentIdx);
      parentOf.push(p);
      relations.push(rel(p, id, HIER_FWD));
    }

    // Inject a handful of deterministic deep cycles: pick a descendant and link it back
    // to one of its ancestors (closing a genuine directional loop).
    const injectedCycles = 5;
    for (let i = 0; i < injectedCycles; i++) {
      const child = 50 + i * 80; // spread across the tree, deterministic
      if (child >= nodeCount) continue;
      let ancestor = parentOf[child];
      // walk up a couple levels for variety
      if (parentOf[ancestor] !== -1) ancestor = parentOf[ancestor];
      relations.push(rel(child, ancestor, HIER_FWD));
    }

    // Inject a handful of deterministic diamonds: an extra spine parent for some node.
    const injectedDiamonds = 5;
    const diamondChildren: number[] = [];
    for (let i = 0; i < injectedDiamonds; i++) {
      const child = 30 + i * 90;
      if (child >= nodeCount) continue;
      const extraParent = (child + 7) % nodeCount;
      if (extraParent === child || parentOf[child] === extraParent) continue;
      relations.push(rel(extraParent, child, HIER_FWD));
      diamondChildren.push(child);
    }

    const ids = Array.from({ length: nodeCount }, (_, i) => i);
    const adjacency = buildAdjacency(relations, [HIER_FWD]);
    const multiParents = findMultiParents(adjacency);

    const start = performance.now();
    const root = buildTree(0, adjacency, itemsById(ids), 'Closed', new Set(), undefined, multiParents);
    const elapsedMs = performance.now() - start;

    expect(root).not.toBeNull();
    expect(elapsedMs).toBeLessThan(500);

    // Count cutCycles across the whole built tree.
    let cutCycleCount = 0;
    const stack = [root!];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (n.cutCycles) cutCycleCount += n.cutCycles.length;
      for (const c of n.children) stack.push(c);
    }
    // Diamond edges can incidentally also close a cycle (if the extra parent turns out to be
    // a descendant), so the upper bound allows for that overlap rather than assuming
    // cycles and diamonds are fully independent in this randomized construction.
    expect(cutCycleCount).toBeGreaterThan(0);
    expect(cutCycleCount).toBeLessThanOrEqual(injectedCycles + injectedDiamonds);

    for (const child of diamondChildren) {
      expect(multiParents.has(child)).toBe(true);
    }
  });
});
