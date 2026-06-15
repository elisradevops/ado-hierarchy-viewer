import { describe, it, expect } from 'vitest';
import { collectLeaves, isLeaf } from '../../services/bfsLeafFinder';
import type { AdjacencyMap } from '../../types';

function makeAdjacency(entries: [number, number[]][]): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const [parent, children] of entries) {
    map.set(parent, new Set(children));
  }
  return map;
}

describe('isLeaf', () => {
  it('leaf is node with no children', () => {
    const adjacency = makeAdjacency([[1, [2]]]);
    expect(isLeaf(2, adjacency)).toBe(true);
  });

  it('non-leaf has children', () => {
    const adjacency = makeAdjacency([[1, [2]]]);
    expect(isLeaf(1, adjacency)).toBe(false);
  });

  it('node not in adjacency is a leaf', () => {
    const adjacency = makeAdjacency([[1, [2]]]);
    expect(isLeaf(99, adjacency)).toBe(true);
  });

  it('node with empty children set is a leaf', () => {
    const adjacency = makeAdjacency([[1, []]]);
    expect(isLeaf(1, adjacency)).toBe(true);
  });
});

describe('collectLeaves', () => {
  it('single node with no children is a leaf', () => {
    const adjacency = makeAdjacency([[1, []]]);
    expect(collectLeaves(1, adjacency)).toEqual(new Set([1]));
  });

  it('leaf is at the bottom of a chain', () => {
    // 1→2→3: leaf is 3
    const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
    expect(collectLeaves(1, adjacency)).toEqual(new Set([3]));
  });

  it('multi-level tree: finds all leaves', () => {
    // 1→2, 1→3; 2→4, 2→5; leaves are 3,4,5
    const adjacency = makeAdjacency([[1, [2, 3]], [2, [4, 5]]]);
    expect(collectLeaves(1, adjacency)).toEqual(new Set([3, 4, 5]));
  });

  it('BFS finds all leaves in multi-root subtree', () => {
    // 10→11, 10→12; 20→21; from root 10: leaves are 11,12
    const adjacency = makeAdjacency([[10, [11, 12]], [20, [21]]]);
    expect(collectLeaves(10, adjacency)).toEqual(new Set([11, 12]));
  });

  it('cycle does NOT cause infinite loop (terminates)', () => {
    // 1→2→3→1 (cycle)
    const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [1]]]);
    // Should terminate without throwing or hanging
    const leaves = collectLeaves(1, adjacency);
    // In a cycle there are no true leaves — all nodes have children
    // collectLeaves should return empty set (no node without children)
    expect(leaves).toBeInstanceOf(Set);
    expect(leaves.size).toBe(0);
  });

  it('deep chain: leaf is at bottom', () => {
    // 1→2→3→4→5
    const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [4]], [4, [5]]]);
    expect(collectLeaves(1, adjacency)).toEqual(new Set([5]));
  });

  it('root not in adjacency is itself a leaf', () => {
    const adjacency = makeAdjacency([[1, [2]]]);
    // Node 2 is not a key in adjacency → it's a leaf
    expect(collectLeaves(2, adjacency)).toEqual(new Set([2]));
  });
});
