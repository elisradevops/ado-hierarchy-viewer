import { describe, it, expect } from 'vitest';
import { sortRows } from '../../selectors/sortRows';
import type { FlatRow, TreeNode } from '../../types';

function makeNode(id: number, overrides: Partial<TreeNode> = {}): Omit<TreeNode, 'children'> {
  return {
    id,
    type: 'Task',
    title: `Item ${id}`,
    state: 'Active',
    effort: 0,
    effortTotal: 0,
    progressPct: 0,
    closedLeaves: 0,
    totalLeaves: 0,
    completedWorkTotal: 0,
    remainingWorkTotal: 0,
    originalEstimateTotal: 0,
    overdueCount: 0,
    ...overrides,
  };
}

function makeRow(
  id: number,
  depth: number,
  hasChildren: boolean,
  parentId: number | null,
  overrides: Partial<TreeNode> = {}
): FlatRow {
  return {
    node: makeNode(id, overrides),
    depth,
    hasChildren,
    isExpanded: true,
    parentId,
  };
}

describe('sortRows — cycle safety', () => {
  it('does not infinite-loop when two branch-copies of a bidirectionally linked pair form a cycle by id', () => {
    // Simulates: item 1 and item 2 are linked in both directions via different link
    // types (e.g. one filter branch shows 1 -> 2, another shows 2 -> 1). Flattened by
    // parentId/node.id alone, this looks like a cycle even though it's two legitimate
    // branch instances.
    const rows: FlatRow[] = [
      makeRow(1, 0, true, null),   // root: 1 has child 2
      makeRow(2, 1, true, 1),      // 1 -> 2, and 2 also (elsewhere) has child 1
      makeRow(2, 0, true, null),   // root: 2 has child 1 (second branch)
      makeRow(1, 1, true, 2),      // 2 -> 1
    ];

    const result = sortRows(rows, 'id', 'asc');

    // Must terminate and return a finite result — the old implementation pushed
    // forever here until Array.push threw RangeError: Invalid array length.
    expect(result.length).toBe(rows.length);
    expect(result.every(r => rows.includes(r))).toBe(true);
  });

  it('preserves legitimate diamonds (same id under two different parents, no cycle)', () => {
    // Tree: root 1 -> 2, root 1 -> 3; both 2 and 3 have child 4 (diamond, not a cycle).
    const rows: FlatRow[] = [
      makeRow(1, 0, true, null),
      makeRow(2, 1, true, 1),
      makeRow(3, 1, true, 1),
      makeRow(4, 2, false, 2),
      makeRow(4, 2, false, 3),
    ];

    const result = sortRows(rows, 'id', 'asc');

    expect(result.length).toBe(rows.length);
    // Both diamond branches under 4 must survive.
    const fours = result.filter(r => r.node.id === 4);
    expect(fours).toHaveLength(2);
    expect(fours.map(r => r.parentId).sort()).toEqual([2, 3]);
  });
});
