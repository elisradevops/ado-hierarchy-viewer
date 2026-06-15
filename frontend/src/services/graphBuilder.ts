import type { WorkItemRelation, AdjacencyMap, Direction } from '../types';

export function buildAdjacency(
  relations: ReadonlyArray<WorkItemRelation>,
  direction: Direction,
): AdjacencyMap {
  const adjacency: AdjacencyMap = new Map();

  for (const relation of relations) {
    const { source, target } = relation;
    if (!source || !target) continue;
    if (!Number.isInteger(source.id) || !Number.isInteger(target.id)) continue;

    const parentId = direction === 'forward' ? source.id : target.id;
    const childId = direction === 'forward' ? target.id : source.id;

    if (parentId === childId) continue; // drop self-loops

    if (!adjacency.has(parentId)) adjacency.set(parentId, new Set());
    adjacency.get(parentId)!.add(childId);
  }

  return adjacency;
}
