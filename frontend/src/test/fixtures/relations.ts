import type { WorkItemRelation, WorkItem } from '../../types';

// Helper to make a relation
export function rel(
  sourceId: number | null,
  targetId: number | null,
  relName = 'System.LinkTypes.Hierarchy-Forward',
): WorkItemRelation {
  return {
    rel: relName,
    source: sourceId !== null ? { id: sourceId } : null,
    target: targetId !== null ? { id: targetId } : null,
  };
}

// Helper to make a WorkItem
export function item(id: number, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    type: 'Task',
    title: `Item ${id}`,
    state: 'Active',
    teamProject: 'TestProject',
    effort: null,
    ...overrides,
  };
}

// Simple linear chain: 1 → 2 → 3
export const LINEAR_RELATIONS = [rel(1, 2), rel(2, 3)];
export const LINEAR_ITEMS = [
  item(1, { effort: 10 }),
  item(2, { effort: 5 }),
  item(3, { effort: 3, state: 'Closed' }),
];

// Cycle: A(1)→B(2)→C(3)→A(1)
export const CYCLE_RELATIONS = [rel(1, 2), rel(2, 3), rel(3, 1)];
export const CYCLE_ITEMS = [item(1), item(2), item(3)];

// Self-link: 1→1
export const SELF_LINK_RELATIONS = [rel(1, 1)];
export const SELF_LINK_ITEMS = [item(1)];

// Multiple roots: two disconnected trees
// Tree A: 10→11, 10→12
// Tree B: 20→21
export const MULTI_ROOT_RELATIONS = [rel(10, 11), rel(10, 12), rel(20, 21)];
export const MULTI_ROOT_ITEMS = [item(10), item(11), item(12), item(20), item(21)];

// Orphan: item 99 has no relations
export const ORPHAN_ITEMS = [item(1), item(2), item(99)];
export const ORPHAN_RELATIONS = [rel(1, 2)];

// Missing item: relation references id 999 which is not in items
export const MISSING_ITEM_RELATIONS = [rel(1, 999)];
export const MISSING_ITEM_ITEMS = [item(1)];

// Null effort items
export const NULL_EFFORT_RELATIONS = [rel(1, 2), rel(1, 3)];
export const NULL_EFFORT_ITEMS = [
  item(1, { effort: null }),
  item(2, { effort: null, state: 'Closed' }),
  item(3, { effort: null }),
];

// Progress: mixed closed/open leaves
// Root(1) → child(2) [Closed], child(3) [Active]
export const PROGRESS_RELATIONS = [rel(1, 2), rel(1, 3)];
export const PROGRESS_ITEMS = [
  item(1, { effort: 0 }),
  item(2, { state: 'Closed', effort: 5 }),
  item(3, { state: 'Active', effort: 3 }),
];

// Progress case-insensitive: closedState='closed' matches state='CLOSED'
export const PROGRESS_CASE_RELATIONS = [rel(1, 2)];
export const PROGRESS_CASE_ITEMS = [item(1), item(2, { state: 'CLOSED', effort: 10 })];

// Reverse direction: 2→1 (target is parent in reverse mode)
export const REVERSE_RELATIONS = [rel(2, 1)];
export const REVERSE_ITEMS = [item(1), item(2)];
