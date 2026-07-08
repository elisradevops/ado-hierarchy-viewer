import { describe, it, expect } from 'vitest';
import { buildTree } from '../../services/treeBuilder';
import type { AdjacencyMap, WorkItem } from '../../types';
import {
  LINEAR_ITEMS,
  NULL_EFFORT_ITEMS,
  PROGRESS_ITEMS,
  PROGRESS_CASE_ITEMS,
  MISSING_ITEM_ITEMS,
} from '../fixtures/relations';

function makeAdjacency(entries: [number, number[]][]): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const [parent, children] of entries) {
    map.set(parent, children.map(childId => ({ childId, rel: 'System.LinkTypes.Hierarchy-Forward', isRef: false })));
  }
  return map;
}

function makeItemsById(items: WorkItem[]): Record<number, WorkItem> {
  return Object.fromEntries(items.map(i => [i.id, i]));
}

describe('buildTree', () => {
  describe('simple tree structure', () => {
    it('builds correct node structure for a chain', () => {
      // 1→2→3
      const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');

      expect(node).not.toBeNull();
      expect(node!.id).toBe(1);
      expect(node!.type).toBe('Task');
      expect(node!.title).toBe('Item 1');
      expect(node!.children).toHaveLength(1);
      expect(node!.children[0].id).toBe(2);
      expect(node!.children[0].children).toHaveLength(1);
      expect(node!.children[0].children[0].id).toBe(3);
    });

    it('leaf node has empty children array', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].children).toEqual([]);
    });
  });

  describe('effort', () => {
    it('null effort → 0 in TreeNode.effort', () => {
      const adjacency = makeAdjacency([[1, [2, 3]]]);
      const itemsById = makeItemsById(NULL_EFFORT_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.effort).toBe(0);
      expect(node!.children[0].effort).toBe(0);
    });

    it('effortTotal = own effort + sum of all descendant efforts', () => {
      // 1(effort=10) → 2(effort=5) → 3(effort=3)
      const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      // effortTotal of node 3 = 3; node 2 = 5+3=8; node 1 = 10+8=18
      expect(node!.children[0].children[0].effortTotal).toBe(3);
      expect(node!.children[0].effortTotal).toBe(8);
      expect(node!.effortTotal).toBe(18);
    });

    it('effortTotal with null efforts treated as 0', () => {
      // 1(null)→2(null),3(null): effortTotal = 0
      const adjacency = makeAdjacency([[1, [2, 3]]]);
      const itemsById = makeItemsById(NULL_EFFORT_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.effortTotal).toBe(0);
    });
  });

  describe('progressPct', () => {
    it('1 of 2 leaves closed → progressPct = 50', () => {
      // 1→2(Closed), 1→3(Active)
      const adjacency = makeAdjacency([[1, [2, 3]]]);
      const itemsById = makeItemsById(PROGRESS_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(50);
    });

    it('all leaves open → progressPct = 0', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Active', teamProject: 'P', effort: 5 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(0);
    });

    it('all leaves closed → progressPct = 100', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Closed', teamProject: 'P', effort: 5 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(100);
    });

    it('single leaf that is closed → progressPct = 100', () => {
      const adjacency = makeAdjacency([]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Closed', teamProject: 'P', effort: 5 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(100);
    });

    it('single leaf that is open → progressPct = 0', () => {
      const adjacency = makeAdjacency([]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 5 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(0);
    });

    it('progressPct is case-insensitive: closedState="closed" matches state="CLOSED"', () => {
      // 1→2(CLOSED)
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById(PROGRESS_CASE_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'closed');
      expect(node!.progressPct).toBe(100);
    });

    it('rounds to 2 decimal places', () => {
      // 2 of 3 leaves closed → 66.666... → 66.67
      const adjacency = makeAdjacency([[1, [2, 3, 4]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Closed', teamProject: 'P', effort: 1 },
        { id: 3, type: 'Task', title: 'Item 3', state: 'Closed', teamProject: 'P', effort: 1 },
        { id: 4, type: 'Task', title: 'Item 4', state: 'Active', teamProject: 'P', effort: 1 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.progressPct).toBe(66.67);
    });
  });

  describe('cycle guard', () => {
    it('cycle: tree builds without stack overflow', () => {
      // 1→2→3→1 (cycle)
      const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [1]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 3, type: 'Task', title: 'Item 3', state: 'Active', teamProject: 'P', effort: 0 },
      ]);
      expect(() => buildTree(1, adjacency, itemsById, 'Closed')).not.toThrow();
    });

    it('cycle: builds a finite tree (cycle is cut)', () => {
      const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [1]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 3, type: 'Task', title: 'Item 3', state: 'Active', teamProject: 'P', effort: 0 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node).not.toBeNull();
      // Node 3 tries to go back to 1, which is in the visited set for that branch → null child
      // So node 3 should have no children
      expect(node!.children[0].children[0].children).toEqual([]);
    });

    it('cycle: records the cut edge in cutCycles on the node that would have looped', () => {
      // 1→2→3→1 (cycle) — node 3's edge back to 1 is dropped and recorded
      const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [1]]]);
      const itemsById = makeItemsById([
        { id: 1, type: 'Task', title: 'Item 1', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 2, type: 'Task', title: 'Item 2', state: 'Active', teamProject: 'P', effort: 0 },
        { id: 3, type: 'Task', title: 'Item 3', state: 'Active', teamProject: 'P', effort: 0 },
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      const node3 = node!.children[0].children[0];
      expect(node3.cutCycles).toEqual([
        { target: 1, via: 'System.LinkTypes.Hierarchy-Forward', path: [1, 2, 3, 1] },
      ]);
      // Nodes that never hit a cycle have no cutCycles at all
      expect(node!.cutCycles).toBeUndefined();
      expect(node!.children[0].cutCycles).toBeUndefined();
    });
  });

  describe('missing items', () => {
    it('missing item (id not in itemsById) → placeholder node', () => {
      const adjacency = makeAdjacency([[1, [999]]]);
      const itemsById = makeItemsById(MISSING_ITEM_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node).not.toBeNull();
      const placeholder = node!.children[0];
      expect(placeholder.id).toBe(999);
      expect(placeholder.title).toBe('(missing #999)');
      expect(placeholder.type).toBe('Unknown');
      expect(placeholder.state).toBe('Unknown');
      expect(placeholder.effort).toBe(0);
    });
  });

  describe('null return cases', () => {
    it('returns null when rootId already in visited (cycle guard at root)', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const visited = new Set([1]);
      const node = buildTree(1, adjacency, itemsById, 'Closed', visited);
      expect(node).toBeNull();
    });
  });

  describe('isQueryMatch stamping', () => {
    it('stamps isQueryMatch true for ids present in matchedIds', () => {
      const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const matchedIds = new Set([1, 3]);
      const node = buildTree(1, adjacency, itemsById, 'Closed', new Set(), matchedIds);

      expect(node!.isQueryMatch).toBe(true);
      expect(node!.children[0].isQueryMatch).toBe(false); // id 2 not in matchedIds
      expect(node!.children[0].children[0].isQueryMatch).toBe(true);
    });

    it('leaves isQueryMatch undefined when matchedIds is not provided', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById(LINEAR_ITEMS);
      const node = buildTree(1, adjacency, itemsById, 'Closed');

      expect(node!.isQueryMatch).toBeUndefined();
      expect(node!.children[0].isQueryMatch).toBeUndefined();
    });
  });

  describe('originalEstimateTotal rollup', () => {
    function estimateItem(id: number, originalEstimate: number | null): WorkItem {
      return {
        id,
        type: 'Task',
        title: `Item ${id}`,
        state: 'Active',
        teamProject: 'Proj',
        effort: null,
        originalEstimate,
      };
    }

    it('leaf node: originalEstimateTotal equals its own estimate', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([estimateItem(1, 5), estimateItem(2, 8)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].originalEstimateTotal).toBe(8);
    });

    it('parent node: originalEstimateTotal = own + sum of descendants', () => {
      // 1(estimate=10) -> 2(estimate=5) -> 3(estimate=3)
      const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
      const itemsById = makeItemsById([estimateItem(1, 10), estimateItem(2, 5), estimateItem(3, 3)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].children[0].originalEstimateTotal).toBe(3);
      expect(node!.children[0].originalEstimateTotal).toBe(8);
      expect(node!.originalEstimateTotal).toBe(18);
    });

    it('null/missing originalEstimate is treated as 0', () => {
      const adjacency = makeAdjacency([[1, [2, 3]]]);
      const itemsById = makeItemsById([estimateItem(1, null), estimateItem(2, null), estimateItem(3, 7)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].originalEstimateTotal).toBe(0);
      expect(node!.children[1].originalEstimateTotal).toBe(7);
      expect(node!.originalEstimateTotal).toBe(7);
    });
  });

  describe('overdueCount rollup', () => {
    function timeItem(id: number, originalEstimate: number | null, completedWork: number | null): WorkItem {
      return {
        id,
        type: 'Task',
        title: `Item ${id}`,
        state: 'Active',
        teamProject: 'Proj',
        effort: null,
        originalEstimate,
        completedWork,
      };
    }

    it('a leaf whose own completedWork exceeds its own estimate contributes 1', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([timeItem(1, null, null), timeItem(2, 5, 10)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].overdueCount).toBe(1);
    });

    it('a leaf under its own estimate contributes 0', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([timeItem(1, null, null), timeItem(2, 10, 5)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].overdueCount).toBe(0);
    });

    it('regression: an over-budget child stays flagged at the parent even when a sibling finishing early nets the rollup to zero', () => {
      // Reproduces the reported case: "Prepare STD" (est 10, completed 5 -> 5h under) and
      // "Update SRD/STD/SVD" (est 5, completed 10 -> +5h over) roll up to a parent whose
      // net completedWorkTotal(15) === originalEstimateTotal(15) — net-sum math alone would
      // call that "done", silently hiding the individually-overdue child.
      const adjacency = makeAdjacency([[1, [2, 3]]]);
      const itemsById = makeItemsById([
        timeItem(1, null, null),
        timeItem(2, 10, 5),  // under by 5h
        timeItem(3, 5, 10),  // over by 5h
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');

      expect(node!.completedWorkTotal).toBe(15);
      expect(node!.originalEstimateTotal).toBe(15); // net looks exactly on-budget
      expect(node!.overdueCount).toBe(1); // ...but the count still catches it
    });

    it('sums overdueCount across multiple overdue descendants at any depth', () => {
      // 1 -> 2 (over) -> 3 (over)
      const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
      const itemsById = makeItemsById([
        timeItem(1, null, null),
        timeItem(2, 5, 10),
        timeItem(3, 5, 10),
      ]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].children[0].overdueCount).toBe(1);
      expect(node!.children[0].overdueCount).toBe(2);
      expect(node!.overdueCount).toBe(2);
    });

    it('no estimate set -> never counted as overdue regardless of completedWork', () => {
      const adjacency = makeAdjacency([[1, [2]]]);
      const itemsById = makeItemsById([timeItem(1, null, null), timeItem(2, null, 100)]);
      const node = buildTree(1, adjacency, itemsById, 'Closed');
      expect(node!.children[0].overdueCount).toBe(0);
      expect(node!.overdueCount).toBe(0);
    });
  });
});
