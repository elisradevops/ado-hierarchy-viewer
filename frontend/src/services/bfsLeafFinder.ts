import type { AdjacencyMap } from '../types';

export function collectLeaves(rootId: number, adjacency: AdjacencyMap): Set<number> {
  const leaves = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (visited.has(current)) continue;
    visited.add(current);

    const children = adjacency.get(current);
    if (!children || children.size === 0) {
      leaves.add(current);
    } else {
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }
  }

  return leaves;
}

export function isLeaf(id: number, adjacency: AdjacencyMap): boolean {
  const children = adjacency.get(id);
  return !children || children.size === 0;
}
