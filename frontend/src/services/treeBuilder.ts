import type { AdjacencyMap, TreeNode, WorkItem } from '../types';

const PLACEHOLDER_TYPE  = 'Unknown';
const PLACEHOLDER_STATE = 'Unknown';

function makePlaceholder(id: number): WorkItem {
  return { id, type: PLACEHOLDER_TYPE, title: `(missing #${id})`, state: PLACEHOLDER_STATE, teamProject: '', effort: null, assignedTo: undefined, areaPath: undefined, iterationPath: undefined, priority: undefined, tags: undefined, storyPoints: undefined, remainingWork: undefined, originalEstimate: undefined, completedWork: null };
}

// Intermediate build node — tree structure only, no rollup fields yet
interface BuildNode {
  id: number;
  item: WorkItem;
  linkRel?: string;
  isRef?: boolean;
  linkOrigin?: 'query' | 'link';
  isQueryMatch?: boolean;
  children: BuildNode[];
}

export function buildTree(
  rootId: number,
  adjacency: AdjacencyMap,
  itemsById: Record<number, WorkItem>,
  closedState: string,
  _visited: Set<number> = new Set(),
  matchedIds?: Set<number>,
): TreeNode | null {
  if (_visited.has(rootId)) return null; // cycle guard at root (used by tests)

  const rootBuild: BuildNode = {
    id: rootId,
    item: itemsById[rootId] ?? makePlaceholder(rootId),
    isQueryMatch: matchedIds?.has(rootId),
    children: [],
  };

  // Phase 1: Iterative DFS with a single mutable ancestor Set — O(D) memory.
  // Each id is added when we descend into a node and removed when its subtree
  // is fully processed (frame popped). Diamond graphs are handled correctly:
  // when branch A finishes, the shared node C is removed from `path`, so branch
  // B sees C as unvisited and creates its own BuildNode under B, preserving the
  // per-branch semantics of the previous Set-clone BFS.
  const path = new Set(_visited);
  path.add(rootId);

  interface Frame { node: BuildNode; edgeIdx: number; }
  const stack: Frame[] = [{ node: rootBuild, edgeIdx: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const { node } = frame;

    if (node.isRef) {
      // ref nodes are leaf references — do not expand their children
      stack.pop();
      path.delete(node.id);
      continue;
    }

    const edges = adjacency.get(node.id);
    if (!edges || frame.edgeIdx >= edges.length) {
      // All children of this node are processed — ascend
      stack.pop();
      path.delete(node.id);
      continue;
    }

    const edge = edges[frame.edgeIdx++];
    if (path.has(edge.childId)) continue; // cycle on this branch

    const childBuild: BuildNode = {
      id: edge.childId,
      item: itemsById[edge.childId] ?? makePlaceholder(edge.childId),
      linkRel: edge.rel,
      isRef: edge.isRef,
      linkOrigin: edge.origin,
      isQueryMatch: matchedIds?.has(edge.childId),
      children: [],
    };
    node.children.push(childBuild);
    path.add(edge.childId);
    stack.push({ node: childBuild, edgeIdx: 0 });
  }

  // Phase 2: Iterative post-order rollup — computes effort, effortTotal,
  // progress, and time rollups bottom-up without recursion (stack-safe at
  // any depth). Produces TreeNode directly; no InternalNode or stripInternal
  // needed.
  const buildOrder: BuildNode[] = [];
  const traversal: BuildNode[] = [rootBuild];
  while (traversal.length > 0) {
    const n = traversal.pop()!;
    buildOrder.push(n);
    for (const c of n.children) traversal.push(c);
  }
  buildOrder.reverse(); // children before parents

  interface LeafAcc { totalLeaves: number; closedLeaves: number; effortTotal: number; completedWorkTotal: number; remainingWorkTotal: number; }
  const nodeAcc = new Map<BuildNode, LeafAcc>();
  const builtNodes = new Map<BuildNode, TreeNode>();
  const lower = closedState.toLowerCase();

  for (const n of buildOrder) {
    const item = n.item;
    const effort = typeof item.effort === 'number' && Number.isFinite(item.effort) ? item.effort : 0;
    const ownCompleted = typeof item.completedWork === 'number' && Number.isFinite(item.completedWork) ? item.completedWork : 0;
    const ownRemaining = typeof item.remainingWork === 'number' && Number.isFinite(item.remainingWork) ? item.remainingWork : 0;

    const nonRefChildren = n.children.filter(c => !c.isRef);

    let totalLeaves = 0;
    let closedLeaves = 0;
    let effortTotal = effort;
    let completedWorkTotal = ownCompleted;
    let remainingWorkTotal = ownRemaining;

    if (nonRefChildren.length === 0) {
      // Leaf node (or only ref children)
      totalLeaves = 1;
      if (item.state.toLowerCase() === lower) closedLeaves = 1;
    } else {
      for (const child of nonRefChildren) {
        const ca = nodeAcc.get(child)!;
        totalLeaves += ca.totalLeaves;
        closedLeaves += ca.closedLeaves;
        effortTotal += ca.effortTotal;
        completedWorkTotal += ca.completedWorkTotal;
        remainingWorkTotal += ca.remainingWorkTotal;
      }
    }

    const progressPct = totalLeaves > 0
      ? Math.round((closedLeaves / totalLeaves) * 100 * 100) / 100
      : 0;

    const treeNode: TreeNode = {
      id: n.id,
      type: item.type,
      title: item.title,
      state: item.state,
      effort,
      effortTotal,
      progressPct,
      closedLeaves,
      totalLeaves,
      completedWorkTotal,
      remainingWorkTotal,
      children: n.children.map(c => builtNodes.get(c)!),
      assignedTo: item.assignedTo,
      areaPath: item.areaPath,
      iterationPath: item.iterationPath,
      priority: item.priority,
      tags: item.tags,
      storyPoints: item.storyPoints,
      remainingWork: item.remainingWork,
      originalEstimate: item.originalEstimate,
      completedWork: item.completedWork,
      linkRel: n.linkRel,
      isRef: n.isRef,
      linkOrigin: n.linkOrigin,
      isQueryMatch: n.isQueryMatch,
    };

    nodeAcc.set(n, { effortTotal, completedWorkTotal, remainingWorkTotal, totalLeaves, closedLeaves });
    builtNodes.set(n, treeNode);
  }

  return builtNodes.get(rootBuild) ?? null;
}
