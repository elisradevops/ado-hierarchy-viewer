import type { AdjacencyMap, TreeNode, WorkItem } from '../types';

const PLACEHOLDER_TYPE  = 'Unknown';
const PLACEHOLDER_STATE = 'Unknown';

function makePlaceholder(id: number): WorkItem {
  return { id, type: PLACEHOLDER_TYPE, title: `(missing #${id})`, state: PLACEHOLDER_STATE, teamProject: '', effort: null };
}

// Internal type carries leaf counts for bottom-up accumulation
interface InternalNode extends TreeNode {
  _totalLeaves: number;
  _closedLeaves: number;
}

function buildInternal(
  rootId: number,
  adjacency: AdjacencyMap,
  itemsById: Record<number, WorkItem>,
  closedState: string,
  ancestorIds: Set<number>,   // per-path set to detect cycles on the current branch
): InternalNode | null {
  if (ancestorIds.has(rootId)) return null; // cycle on this branch

  const pathVisited = new Set(ancestorIds);
  pathVisited.add(rootId);

  const item = itemsById[rootId] ?? makePlaceholder(rootId);
  const effort = typeof item.effort === 'number' && Number.isFinite(item.effort)
    ? item.effort
    : 0;

  const childIds = adjacency.get(rootId);
  const children: InternalNode[] = [];

  if (childIds && childIds.size > 0) {
    for (const childId of childIds) {
      const childNode = buildInternal(childId, adjacency, itemsById, closedState, pathVisited);
      if (childNode !== null) children.push(childNode);
    }
  }

  // Bottom-up leaf accumulation — no extra BFS needed
  let totalLeaves = 0;
  let closedLeaves = 0;
  const lower = closedState.toLowerCase();

  if (children.length === 0) {
    // This node is a leaf
    totalLeaves = 1;
    if (item.state.toLowerCase() === lower) closedLeaves = 1;
  } else {
    for (const child of children) {
      totalLeaves += child._totalLeaves;
      closedLeaves += child._closedLeaves;
    }
  }

  const effortTotal = effort + children.reduce((sum, c) => sum + c.effortTotal, 0);
  const progressPct = totalLeaves > 0
    ? Math.round((closedLeaves / totalLeaves) * 100 * 100) / 100
    : 0;

  const node: InternalNode = {
    id: rootId,
    type: item.type,
    title: item.title,
    state: item.state,
    effort,
    effortTotal,
    progressPct,
    children: children as TreeNode[],
    _totalLeaves: totalLeaves,
    _closedLeaves: closedLeaves,
  };

  return node;
}

function stripInternal(node: InternalNode): TreeNode {
  const { _totalLeaves: _t, _closedLeaves: _c, children, ...rest } = node;
  void _t; void _c;
  return { ...rest, children: children.map(c => stripInternal(c as InternalNode)) };
}

export function buildTree(
  rootId: number,
  adjacency: AdjacencyMap,
  itemsById: Record<number, WorkItem>,
  closedState: string,
  _visited: Set<number> = new Set(),
): TreeNode | null {
  const result = buildInternal(rootId, adjacency, itemsById, closedState, _visited);
  if (result === null) return null;
  return stripInternal(result);
}
