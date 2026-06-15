import { describe, it, expect } from 'vitest';
import { buildHierarchy } from '../../services/pipeline';
import type { BuildHierarchyInput } from '../../types';
import {
  rel,
  item,
  LINEAR_RELATIONS,
  LINEAR_ITEMS,
  MULTI_ROOT_RELATIONS,
  MULTI_ROOT_ITEMS,
  ORPHAN_ITEMS,
  ORPHAN_RELATIONS,
  REVERSE_RELATIONS,
  REVERSE_ITEMS,
  SELF_LINK_RELATIONS,
  SELF_LINK_ITEMS,
} from '../fixtures/relations';

function makeInput(overrides: Partial<BuildHierarchyInput> = {}): BuildHierarchyInput {
  return {
    relations: [],
    items: [],
    direction: 'forward',
    closedState: 'Closed',
    ...overrides,
  };
}

describe('buildHierarchy', () => {
  describe('empty input', () => {
    it('returns {roots:[], orphanIds:[]} for empty input', () => {
      const result = buildHierarchy(makeInput());
      expect(result.roots).toEqual([]);
      expect(result.orphanIds).toEqual([]);
    });
  });

  describe('forward direction', () => {
    it('builds correct roots for linear chain', () => {
      const result = buildHierarchy(makeInput({
        relations: LINEAR_RELATIONS,
        items: LINEAR_ITEMS,
        direction: 'forward',
      }));
      expect(result.roots).toHaveLength(1);
      expect(result.roots[0].id).toBe(1);
    });

    it('root contains correct child chain', () => {
      const result = buildHierarchy(makeInput({
        relations: LINEAR_RELATIONS,
        items: LINEAR_ITEMS,
        direction: 'forward',
      }));
      expect(result.roots[0].children[0].id).toBe(2);
      expect(result.roots[0].children[0].children[0].id).toBe(3);
    });
  });

  describe('multiple roots', () => {
    it('roots array length matches number of root nodes', () => {
      const result = buildHierarchy(makeInput({
        relations: MULTI_ROOT_RELATIONS,
        items: MULTI_ROOT_ITEMS,
        direction: 'forward',
      }));
      expect(result.roots).toHaveLength(2);
    });

    it('roots are sorted ascending by id', () => {
      const result = buildHierarchy(makeInput({
        relations: MULTI_ROOT_RELATIONS,
        items: MULTI_ROOT_ITEMS,
        direction: 'forward',
      }));
      const ids = result.roots.map(r => r.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });
  });

  describe('reverse direction', () => {
    it('inverts parent/child vs forward', () => {
      // REVERSE_RELATIONS: rel(2, 1) — source=2, target=1
      // forward: 2→1 (2 is parent, 1 is child)
      // reverse: 1→2 (1 is parent, 2 is child)
      const forwardResult = buildHierarchy(makeInput({
        relations: REVERSE_RELATIONS,
        items: REVERSE_ITEMS,
        direction: 'forward',
      }));
      const reverseResult = buildHierarchy(makeInput({
        relations: REVERSE_RELATIONS,
        items: REVERSE_ITEMS,
        direction: 'reverse',
      }));
      // In forward: root is 2, child is 1
      expect(forwardResult.roots[0].id).toBe(2);
      expect(forwardResult.roots[0].children[0].id).toBe(1);
      // In reverse: root is 1, child is 2
      expect(reverseResult.roots[0].id).toBe(1);
      expect(reverseResult.roots[0].children[0].id).toBe(2);
    });
  });

  describe('orphans', () => {
    it('orphanIds contains ids in items but unreachable from any root', () => {
      const result = buildHierarchy(makeInput({
        relations: ORPHAN_RELATIONS,
        items: ORPHAN_ITEMS,
        direction: 'forward',
      }));
      expect(result.orphanIds).toContain(99);
      expect(result.orphanIds).not.toContain(1);
      expect(result.orphanIds).not.toContain(2);
    });

    it('no orphans when all items are reachable', () => {
      const result = buildHierarchy(makeInput({
        relations: LINEAR_RELATIONS,
        items: LINEAR_ITEMS,
        direction: 'forward',
      }));
      expect(result.orphanIds).toEqual([]);
    });
  });

  describe('self-link only', () => {
    it('self-link only: self-link is dropped, item becomes isolated', () => {
      const result = buildHierarchy(makeInput({
        relations: SELF_LINK_RELATIONS,
        items: SELF_LINK_ITEMS,
        direction: 'forward',
      }));
      // Self-link is dropped → no edges → no roots from adjacency
      // Item 1 has no relations → it's an orphan
      // roots should be empty (no adjacency entries at all)
      expect(result.roots).toEqual([]);
      expect(result.orphanIds).toContain(1);
    });
  });

  describe('isolated items', () => {
    it('items with no relations become orphans', () => {
      const result = buildHierarchy(makeInput({
        relations: [],
        items: [item(5), item(6)],
        direction: 'forward',
      }));
      expect(result.roots).toEqual([]);
      expect(result.orphanIds).toContain(5);
      expect(result.orphanIds).toContain(6);
    });
  });

  describe('diamond graph', () => {
    // Diamond: 1→2→4 and 1→3→4 (node 4 reachable via two paths)
    it('diamond graph: node reachable via two paths appears in both branches', () => {
      const diamondRelations = [
        rel(1, 2), rel(1, 3), rel(2, 4), rel(3, 4),
      ];
      const diamondItems = [item(1), item(2), item(3), item(4, { state: 'Closed' })];
      const result = buildHierarchy({
        relations: diamondRelations,
        items: diamondItems,
        direction: 'forward',
        closedState: 'Closed',
      });
      // Document current behavior: node 4 appears under both node 2 and node 3
      const root = result.roots[0];
      expect(root.id).toBe(1);
      // Both children (2 and 3) should have node 4 as a child
      const child2 = root.children.find(c => c.id === 2)!;
      const child3 = root.children.find(c => c.id === 3)!;
      expect(child2.children[0].id).toBe(4);
      expect(child3.children[0].id).toBe(4);
      // progressPct for root: 4 is closed, appears under both branches
      // (behavior document: may be > 100% effective if counted twice — test what actually happens)
      expect(root.progressPct).toBeGreaterThanOrEqual(0);
      expect(root.progressPct).toBeLessThanOrEqual(100);
    });
  });

  describe('effort and progress propagation', () => {
    it('effortTotal accumulates through the tree', () => {
      const result = buildHierarchy(makeInput({
        relations: LINEAR_RELATIONS,
        items: LINEAR_ITEMS,
        direction: 'forward',
      }));
      // Item 1=10, 2=5, 3=3: root effortTotal = 18
      expect(result.roots[0].effortTotal).toBe(18);
    });

    it('progressPct for root with 1 closed leaf of 1 total = 100', () => {
      const result = buildHierarchy(makeInput({
        relations: [rel(1, 2)],
        items: [item(1), item(2, { state: 'Closed', effort: 5 })],
        direction: 'forward',
        closedState: 'Closed',
      }));
      expect(result.roots[0].progressPct).toBe(100);
    });
  });
});
