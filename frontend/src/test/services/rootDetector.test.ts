import { describe, it, expect } from 'vitest';
import { findRoots } from '../../services/rootDetector';
import type { AdjacencyMap } from '../../types';

function makeAdjacency(entries: [number, number[]][]): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const [parent, children] of entries) {
    map.set(parent, new Set(children));
  }
  return map;
}

describe('findRoots', () => {
  it('simple chain: only root (not a child anywhere) returned', () => {
    // 1→2→3: only 1 is root
    const adjacency = makeAdjacency([[1, [2]], [2, [3]]]);
    expect(findRoots(adjacency)).toEqual([1]);
  });

  it('multi-root: both roots returned', () => {
    // Tree A: 10→11,12; Tree B: 20→21
    const adjacency = makeAdjacency([[10, [11, 12]], [20, [21]]]);
    expect(findRoots(adjacency)).toEqual([10, 20]);
  });

  it('returns roots sorted ascending', () => {
    // 30→31, 5→6 — roots are 30 and 5, sorted: [5, 30]
    const adjacency = makeAdjacency([[30, [31]], [5, [6]]]);
    expect(findRoots(adjacency)).toEqual([5, 30]);
  });

  it('all nodes are children (circular graph): returns []', () => {
    // 1→2, 2→3, 3→1: every node is a child of another
    const adjacency = makeAdjacency([[1, [2]], [2, [3]], [3, [1]]]);
    expect(findRoots(adjacency)).toEqual([]);
  });

  it('empty adjacency: returns []', () => {
    expect(findRoots(new Map())).toEqual([]);
  });

  it('single node with no children: it is its own root', () => {
    const adjacency = makeAdjacency([[1, []]]);
    expect(findRoots(adjacency)).toEqual([1]);
  });

  it('node appears only as child, not as parent key: not a root', () => {
    // 1→2, only 1 is a key; 2 only appears as child
    const adjacency = makeAdjacency([[1, [2]]]);
    const roots = findRoots(adjacency);
    expect(roots).toContain(1);
    expect(roots).not.toContain(2);
  });
});
