import { describe, it, expect } from 'vitest';
import { buildAdjacency } from '../../services/graphBuilder';
import { rel } from '../fixtures/relations';

describe('buildAdjacency', () => {
  describe('forward direction', () => {
    it('builds source→target edges', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(2, 3)], 'forward');
      expect(adjacency.get(1)).toEqual(new Set([2]));
      expect(adjacency.get(2)).toEqual(new Set([3]));
    });

    it('returns a Map<number, Set<number>>', () => {
      const adjacency = buildAdjacency([rel(1, 2)], 'forward');
      expect(adjacency).toBeInstanceOf(Map);
      expect(adjacency.get(1)).toBeInstanceOf(Set);
    });

    it('multiple children from same parent', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(1, 3)], 'forward');
      expect(adjacency.get(1)).toEqual(new Set([2, 3]));
    });
  });

  describe('reverse direction', () => {
    it('builds target→source edges (inverts direction)', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(2, 3)], 'reverse');
      // In reverse: target is parent, source is child
      expect(adjacency.get(2)).toEqual(new Set([1]));
      expect(adjacency.get(3)).toEqual(new Set([2]));
    });
  });

  describe('self-loops', () => {
    it('drops self-loop A→A', () => {
      const adjacency = buildAdjacency([rel(1, 1)], 'forward');
      // key should not exist, or exist with empty set
      const children = adjacency.get(1);
      expect(children === undefined || children.size === 0).toBe(true);
    });
  });

  describe('null filtering', () => {
    it('filters out relation with null source', () => {
      const adjacency = buildAdjacency([rel(null, 2)], 'forward');
      expect(adjacency.size).toBe(0);
    });

    it('filters out relation with null target', () => {
      const adjacency = buildAdjacency([rel(1, null)], 'forward');
      expect(adjacency.size).toBe(0);
    });

    it('filters out relation with both null', () => {
      const adjacency = buildAdjacency([rel(null, null)], 'forward');
      expect(adjacency.size).toBe(0);
    });
  });

  describe('non-integer id filtering', () => {
    it('filters out non-integer source id', () => {
      const badRel = { rel: 'foo', source: { id: 1.5 }, target: { id: 2 } };
      const adjacency = buildAdjacency([badRel], 'forward');
      expect(adjacency.size).toBe(0);
    });

    it('filters out non-integer target id', () => {
      const badRel = { rel: 'foo', source: { id: 1 }, target: { id: NaN } };
      const adjacency = buildAdjacency([badRel], 'forward');
      expect(adjacency.size).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('same edge appears twice → children Set has one entry', () => {
      const adjacency = buildAdjacency([rel(1, 2), rel(1, 2)], 'forward');
      expect(adjacency.get(1)?.size).toBe(1);
      expect(adjacency.get(1)).toEqual(new Set([2]));
    });
  });

  describe('empty input', () => {
    it('returns empty map for empty relations', () => {
      const adjacency = buildAdjacency([], 'forward');
      expect(adjacency.size).toBe(0);
    });
  });
});
