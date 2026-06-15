import type { BuildHierarchyInput, BuildHierarchyResult, TreeNode, WorkItem } from '../types';
import { buildAdjacency } from './graphBuilder';
import { findRoots } from './rootDetector';
import { buildTree } from './treeBuilder';

export function buildHierarchy(input: BuildHierarchyInput): BuildHierarchyResult {
  const { relations, items, direction, closedState } = input;

  const itemsById: Record<number, WorkItem> = Object.fromEntries(
    items.map(item => [item.id, item]),
  );

  const adjacency = buildAdjacency(relations, direction);
  const rootIds = findRoots(adjacency);

  const roots = rootIds
    .map(id => buildTree(id, adjacency, itemsById, closedState))
    .filter((node): node is TreeNode => node !== null);

  // Collect all reachable ids (from tree traversal)
  const reachable = new Set<number>();

  // Iterative DFS to mark all reachable nodes (avoids stack overflow on deep trees)
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    reachable.add(node.id);
    for (const child of node.children) stack.push(child);
  }

  // Also mark root ids themselves (in case buildTree returned null for some, still reachable from graph)
  for (const rootId of rootIds) reachable.add(rootId);

  const orphanIds = items.filter(item => !reachable.has(item.id)).map(item => item.id);

  return { roots, orphanIds };
}
