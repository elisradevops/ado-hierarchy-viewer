import type { FlatRow } from '../types';

const EMPTY_ANCESTORS: ReadonlySet<number> = new Set();

export type SortCol = 'id' | 'type' | 'title' | 'state' | 'progressPct'
  | 'assignedTo' | 'areaPath' | 'iterationPath' | 'storyPoints' | 'remainingWork'
  | 'originalEstimate' | 'completedWork' | 'priority' | 'tags';

function compareValue(a: FlatRow, b: FlatRow, col: SortCol, dir: 'asc' | 'desc'): number {
  const mult = dir === 'asc' ? 1 : -1;
  const an = a.node;
  const bn = b.node;

  switch (col) {
    case 'id':              return mult * (an.id - bn.id);
    case 'type':            return mult * an.type.localeCompare(bn.type);
    case 'title':           return mult * an.title.localeCompare(bn.title);
    case 'state':           return mult * an.state.localeCompare(bn.state);
    case 'progressPct':     return mult * (an.progressPct - bn.progressPct);
    case 'assignedTo':      return mult * (an.assignedTo ?? '').localeCompare(bn.assignedTo ?? '');
    case 'areaPath':        return mult * (an.areaPath ?? '').localeCompare(bn.areaPath ?? '');
    case 'iterationPath':   return mult * (an.iterationPath ?? '').localeCompare(bn.iterationPath ?? '');
    case 'tags':            return mult * (an.tags ?? '').localeCompare(bn.tags ?? '');
    case 'storyPoints':     return mult * ((an.storyPoints ?? 0) - (bn.storyPoints ?? 0));
    case 'remainingWork':   return mult * ((an.remainingWork ?? 0) - (bn.remainingWork ?? 0));
    case 'originalEstimate':return mult * ((an.originalEstimate ?? 0) - (bn.originalEstimate ?? 0));
    case 'completedWork':   return mult * ((an.completedWork ?? 0) - (bn.completedWork ?? 0));
    case 'priority':        return mult * ((an.priority ?? 0) - (bn.priority ?? 0));
    default: return 0;
  }
}

export function sortRows(rows: FlatRow[], col: SortCol, dir: 'asc' | 'desc'): FlatRow[] {
  if (rows.length === 0) return rows;

  // Group siblings by parent
  const byParent = new Map<number | null, FlatRow[]>();
  for (const row of rows) {
    const key = row.parentId;
    const group = byParent.get(key);
    if (group) {
      group.push(row);
    } else {
      byParent.set(key, [row]);
    }
  }

  // Sort each sibling group
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => compareValue(a, b, col, dir));
  }

  // Reconstruct via iterative DFS — avoids call-stack overflow on deep trees.
  // Each stack entry carries its own ancestor path: treeBuilder allows the same work
  // item to appear as multiple FlatRows (diamond/multi-parent DAGs), keyed only by
  // node.id with no per-instance identity. Two branch-copies of a bidirectionally
  // linked pair (X under Y in one branch, Y under X in another) collapse into a cycle
  // when reconstructed purely from parentId/node.id — without this per-path guard the
  // loop pushes the same ids forever until `result` exceeds the max array length.
  const result: FlatRow[] = [];
  const stack: Array<{ row: FlatRow; ancestors: ReadonlySet<number> }> = [];
  const roots = byParent.get(null) ?? [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ row: roots[i], ancestors: EMPTY_ANCESTORS });
  while (stack.length > 0) {
    const { row, ancestors } = stack.pop()!;
    result.push(row);
    if (row.hasChildren) {
      const kids = byParent.get(row.node.id) ?? [];
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(row.node.id);
      for (let i = kids.length - 1; i >= 0; i--) {
        if (nextAncestors.has(kids[i].node.id)) continue; // cross-branch cycle — drop, don't revisit
        stack.push({ row: kids[i], ancestors: nextAncestors });
      }
    }
  }
  return result;
}
