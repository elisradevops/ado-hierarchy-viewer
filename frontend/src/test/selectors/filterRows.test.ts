import { describe, it, expect } from 'vitest';
import { filterRows } from '../../selectors/filterRows';
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

describe('filterRows — matchesOnly', () => {
  it('returns all rows unchanged when matchesOnly is false and no other criteria set', () => {
    const rows = [makeRow(1, 0, false, null, { isQueryMatch: false })];
    const result = filterRows(rows, { text: '', types: [], states: [] });
    expect(result).toEqual(rows);
  });

  it('keeps only matching rows plus their ancestor chain', () => {
    // Tree: 1 (root, no match) -> 2 (match) ; 1 -> 3 (no match)
    const rows: FlatRow[] = [
      makeRow(1, 0, true, null, { isQueryMatch: false }),
      makeRow(2, 1, false, 1, { isQueryMatch: true }),
      makeRow(3, 1, false, 1, { isQueryMatch: false }),
    ];

    const result = filterRows(rows, { text: '', types: [], states: [], matchesOnly: true });

    expect(result.map(r => r.node.id)).toEqual([1, 2]); // ancestor 1 retained, node 3 dropped
  });

  it('drops everything when no row matches', () => {
    const rows: FlatRow[] = [
      makeRow(1, 0, false, null, { isQueryMatch: false }),
      makeRow(2, 0, false, null, { isQueryMatch: false }),
    ];
    const result = filterRows(rows, { text: '', types: [], states: [], matchesOnly: true });
    expect(result).toEqual([]);
  });

  it('treats undefined isQueryMatch as non-match', () => {
    const rows: FlatRow[] = [makeRow(1, 0, false, null, {})]; // isQueryMatch left undefined
    const result = filterRows(rows, { text: '', types: [], states: [], matchesOnly: true });
    expect(result).toEqual([]);
  });

  it('combines with text filter — row must satisfy both', () => {
    const rows: FlatRow[] = [
      makeRow(1, 0, true, null, { isQueryMatch: true, title: 'Root' } as Partial<TreeNode>),
      makeRow(2, 1, false, 1, { isQueryMatch: true, title: 'Alpha' } as Partial<TreeNode>),
      makeRow(3, 1, false, 1, { isQueryMatch: true, title: 'Beta' } as Partial<TreeNode>),
    ];
    const result = filterRows(rows, { text: 'Alpha', types: [], states: [], matchesOnly: true });
    // Only node 2 satisfies both text and matchesOnly; node 1 retained as its ancestor
    expect(result.map(r => r.node.id)).toEqual([1, 2]);
  });

  it('keeps multiple matches under the same ancestor without duplicating it', () => {
    const rows: FlatRow[] = [
      makeRow(1, 0, true, null, { isQueryMatch: false }),
      makeRow(2, 1, false, 1, { isQueryMatch: true }),
      makeRow(3, 1, false, 1, { isQueryMatch: true }),
    ];
    const result = filterRows(rows, { text: '', types: [], states: [], matchesOnly: true });
    expect(result.map(r => r.node.id)).toEqual([1, 2, 3]);
  });
});
