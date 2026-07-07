import { describe, it, expect } from 'vitest';
import { flattenTree } from '../../selectors/flattenTree';
import { filterRows } from '../../selectors/filterRows';
import type { TreeNode } from '../../types';

function makeNode(id: number, overrides: Partial<TreeNode> = {}): TreeNode {
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
    children: [],
    ...overrides,
  };
}

// 1 (User Story, collapsed)
//   2 (Task)
//   3 (Bug)
function makeCollapsedTreeWithNestedBug(): TreeNode[] {
  const bug = makeNode(3, { type: 'Bug', title: 'Nested bug' });
  const task = makeNode(2, { type: 'Task' });
  const story = makeNode(1, { type: 'User Story', children: [task, bug] });
  return [story];
}

describe('flattenTree — default (respects expandedIds)', () => {
  it('does not walk into a collapsed node\'s children', () => {
    const roots = makeCollapsedTreeWithNestedBug();
    const rows = flattenTree(roots, {}); // nothing expanded
    expect(rows.map(r => r.node.id)).toEqual([1]);
  });

  it('walks into an expanded node\'s children', () => {
    const roots = makeCollapsedTreeWithNestedBug();
    const rows = flattenTree(roots, { 1: true });
    expect(rows.map(r => r.node.id).sort()).toEqual([1, 2, 3]);
  });
});

describe('flattenTree — forceExpandAll', () => {
  it('walks every node regardless of expandedIds', () => {
    const roots = makeCollapsedTreeWithNestedBug();
    const rows = flattenTree(roots, {}, true); // nothing expanded, but forced
    expect(rows.map(r => r.node.id).sort()).toEqual([1, 2, 3]);
  });

  it('reports isExpanded=true for every branch node when forced', () => {
    const roots = makeCollapsedTreeWithNestedBug();
    const rows = flattenTree(roots, {}, true);
    const story = rows.find(r => r.node.id === 1)!;
    expect(story.isExpanded).toBe(true);
  });
});

describe('regression: filtering must find matches nested under a collapsed ancestor', () => {
  it('a Bug filter finds a bug nested under a fully collapsed User Story', () => {
    const roots = makeCollapsedTreeWithNestedBug();
    const expandedIds = {}; // everything collapsed, as in the reported scenario

    // Old, broken behavior: default flatten only ever sees the root — filterRows
    // can't rescue a row it was never given.
    const collapsedFlat = flattenTree(roots, expandedIds);
    const brokenResult = filterRows(collapsedFlat, { text: '', types: ['Bug'], states: [] });
    expect(brokenResult.map(r => r.node.id)).toEqual([]); // reproduces the reported bug

    // Fixed behavior: force a full-tree flatten when a filter is active, then let
    // filterRows prune back to matches + their ancestors.
    const fullFlat = flattenTree(roots, expandedIds, true);
    const fixedResult = filterRows(fullFlat, { text: '', types: ['Bug'], states: [] });
    expect(fixedResult.map(r => r.node.id).sort()).toEqual([1, 3]); // story (ancestor) + bug (match)
    expect(fixedResult.find(r => r.node.id === 2)).toBeUndefined(); // sibling Task correctly excluded
  });
});
