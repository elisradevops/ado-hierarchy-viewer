import type { WorkItemRelation, AdjacencyMap, AdjacencyEdge } from '../types';

/**
 * Determine which rels are "primary spine" (forward direction or only-selected-direction)
 * vs "ref" (opposite direction whose forward counterpart is also selected).
 *
 * Rules:
 * - If a Forward type is selected, it's primary.
 * - If a Reverse type is selected AND its Forward counterpart is also selected → it's a ref.
 * - If a Reverse type is selected WITHOUT its Forward counterpart → it's primary (true reverse).
 * - Non-directional types (no -Forward/-Reverse suffix) are always primary.
 */
function buildRefSet(selectedRels: ReadonlyArray<string>): Set<string> {
  const selected = new Set(selectedRels);
  const refs = new Set<string>();
  for (const rel of selected) {
    if (rel.endsWith('-Reverse')) {
      const forwardCounterpart = rel.replace(/-Reverse$/, '-Forward');
      if (selected.has(forwardCounterpart)) {
        refs.add(rel);
      }
    }
  }
  return refs;
}

export function buildAdjacency(
  relations: ReadonlyArray<WorkItemRelation>,
  selectedRels?: ReadonlyArray<string>,
): AdjacencyMap {
  const adjacency: AdjacencyMap = new Map();
  const refRels = selectedRels ? buildRefSet(selectedRels) : new Set<string>();

  // Dedup guard: "parentId-childId-rel" prevents duplicate edges
  const seen = new Set<string>();

  for (const relation of relations) {
    const { source, target, rel, origin } = relation;
    if (!source || !target) continue;
    if (!Number.isInteger(source.id) || !Number.isInteger(target.id)) continue;

    // No normalization flip — edges go as ADO returns them:
    // Forward: source=parent, target=child (top-down)
    // Reverse: source=child, target=parent (bottom-up when used as primary)
    const parentId = source.id;
    const childId = target.id;

    if (parentId === childId) continue; // drop self-loops

    // Dedup guard: "parentId-childId-rel" prevents duplicate edges. Note: query-vs-link
    // origin precedence for the *same* pair is already resolved upstream (BFF / adoDirect
    // merge query relations over link relations before this ever runs).
    const edgeKey = `${parentId}-${childId}-${rel ?? ''}`;
    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);

    const isRef = rel ? refRels.has(rel) : false;

    const edge: AdjacencyEdge = { childId, rel: rel ?? 'unknown', isRef, origin: origin ?? 'link' };

    if (!adjacency.has(parentId)) adjacency.set(parentId, []);
    adjacency.get(parentId)!.push(edge);
  }

  return adjacency;
}
