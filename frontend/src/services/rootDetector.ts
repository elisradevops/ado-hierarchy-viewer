import type { AdjacencyMap } from '../types';

export function findRoots(adjacency: AdjacencyMap): number[] {
  const allNodes = new Set<number>();
  const childNodes = new Set<number>();

  for (const [parentId, edges] of adjacency) {
    allNodes.add(parentId);
    for (const edge of edges) {
      allNodes.add(edge.childId);
      childNodes.add(edge.childId);
    }
  }

  const roots: number[] = [];
  for (const nodeId of allNodes) {
    if (!childNodes.has(nodeId)) {
      roots.push(nodeId);
    }
  }

  return roots.sort((a, b) => a - b);
}
