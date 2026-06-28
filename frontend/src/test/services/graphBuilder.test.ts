import { describe, it, expect } from 'vitest';
import { buildAdjacency } from '../../services/graphBuilder';
import type { AdjacencyEdge } from '../../types';
import { rel } from '../fixtures/relations';

// Helper: extract sorted childIds from AdjacencyEdge[] for structural assertions
function childIds(edges: AdjacencyEdge[] | undefined): number[] {
  return (edges ?? []).map(e => e.childId).sort((a, b) => a - b);
}

describe('buildAdjacency', () => {
  describe('forward (default: no -Reverse suffix)', () => {
    it('builds source→target edges', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(2, 3)]);
      expect(childIds(adjacency.get(1))).toEqual([2]);
      expect(childIds(adjacency.get(2))).toEqual([3]);
    });

    it('returns a Map<number, AdjacencyEdge[]>', () => {
      const adjacency = buildAdjacency([rel(1, 2)]);
      expect(adjacency).toBeInstanceOf(Map);
      expect(Array.isArray(adjacency.get(1))).toBe(true);
    });

    it('multiple children from same parent', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(1, 3)]);
      expect(childIds(adjacency.get(1))).toEqual([2, 3]);
    });
  });

  describe('per-edge orientation via rel suffix', () => {
    it('-Reverse suffix: no flip — edge goes source→target as-is', () => {
      // No normalization flip in new graphBuilder — edges go exactly as ADO returns them.
      // rel(source=1, target=2, Reverse) → parent=1, childId=2, rel=Reverse
      const adjacency = buildAdjacency([rel(1, 2, 'System.LinkTypes.Hierarchy-Reverse')]);
      expect(childIds(adjacency.get(1))).toEqual([2]);
      expect(adjacency.has(2)).toBe(false);
    });

    it('-Forward suffix keeps source→target', () => {
      const adjacency = buildAdjacency([rel(1, 2, 'System.LinkTypes.Hierarchy-Forward')]);
      expect(childIds(adjacency.get(1))).toEqual([2]);
    });

    it('rel === null defaults to source→target', () => {
      const nullRel = { rel: null, source: { id: 1 }, target: { id: 2 } };
      const adjacency = buildAdjacency([nullRel]);
      expect(childIds(adjacency.get(1))).toEqual([2]);
    });

    it('Related (no suffix) keeps source→target', () => {
      const adjacency = buildAdjacency([rel(1, 2, 'System.LinkTypes.Related')]);
      expect(childIds(adjacency.get(1))).toEqual([2]);
    });

    it('-Reverse without forward counterpart is primary (isRef=false)', () => {
      const adjacency = buildAdjacency(
        [rel(1, 2, 'System.LinkTypes.Hierarchy-Reverse')],
        ['System.LinkTypes.Hierarchy-Reverse'],
      );
      const edges = adjacency.get(1) ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].isRef).toBe(false);
    });

    it('-Reverse with forward counterpart also selected is tagged isRef=true', () => {
      const adjacency = buildAdjacency(
        [rel(1, 2, 'System.LinkTypes.Hierarchy-Reverse')],
        ['System.LinkTypes.Hierarchy-Forward', 'System.LinkTypes.Hierarchy-Reverse'],
      );
      const edges = adjacency.get(1) ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].isRef).toBe(true);
    });
  });

  describe('self-loops', () => {
    it('drops self-loop A→A', () => {
      const adjacency = buildAdjacency([rel(1, 1)]);
      const children = adjacency.get(1);
      expect(children === undefined || children.length === 0).toBe(true);
    });
  });

  describe('null filtering', () => {
    it('filters out relation with null source', () => {
      const adjacency = buildAdjacency([rel(null, 2)]);
      expect(adjacency.size).toBe(0);
    });

    it('filters out relation with null target', () => {
      const adjacency = buildAdjacency([rel(1, null)]);
      expect(adjacency.size).toBe(0);
    });

    it('filters out relation with both null', () => {
      const adjacency = buildAdjacency([rel(null, null)]);
      expect(adjacency.size).toBe(0);
    });
  });

  describe('non-integer id filtering', () => {
    it('filters out non-integer source id', () => {
      const badRel = { rel: 'foo', source: { id: 1.5 }, target: { id: 2 } };
      const adjacency = buildAdjacency([badRel]);
      expect(adjacency.size).toBe(0);
    });

    it('filters out non-integer target id', () => {
      const badRel = { rel: 'foo', source: { id: 1 }, target: { id: NaN } };
      const adjacency = buildAdjacency([badRel]);
      expect(adjacency.size).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('same edge appears twice → children array has one entry', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(1, 2)]);
      expect(adjacency.get(1)?.length).toBe(1);
      expect(childIds(adjacency.get(1))).toEqual([2]);
    });
  });

  describe('empty input', () => {
    it('returns empty map for empty relations', () => {
      const adjacency = buildAdjacency([]);
      expect(adjacency.size).toBe(0);
    });
  });
});
