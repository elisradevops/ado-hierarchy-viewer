import { create } from 'zustand';
import type { TreeNode, BuildHierarchyResult } from '../types';

interface HierarchyStore {
  rootIds: number[];
  rowsById: Record<number, TreeNode>;
  rowCount: number;
  orphanIds: number[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  usedRelationTypes: string[];

  setResult: (result: BuildHierarchyResult) => void;
  setUsedRelationTypes: (types: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useHierarchyStore = create<HierarchyStore>((set) => ({
  rootIds: [],
  rowsById: {},
  rowCount: 0,
  orphanIds: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
  usedRelationTypes: [],

  setResult: (result) => {
    // Build Record<number, TreeNode> for O(1) lookup — iterative DFS, stack-safe at any depth
    const rowsById: Record<number, TreeNode> = {};
    const indexStack: TreeNode[] = [...result.roots];
    while (indexStack.length > 0) {
      const node = indexStack.pop()!;
      rowsById[node.id] = node;
      for (const child of node.children) indexStack.push(child);
    }

    set({
      rootIds: result.roots.map(r => r.id),
      rowsById,
      rowCount: Object.keys(rowsById).length,
      orphanIds: result.orphanIds,
      loading: false,
      error: null,
      lastFetchedAt: Date.now(),
    });
  },

  setUsedRelationTypes: (types) => set({ usedRelationTypes: types }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clear: () => set({ rootIds: [], rowsById: {}, rowCount: 0, orphanIds: [], loading: false, error: null, lastFetchedAt: null, usedRelationTypes: [] }),
}));
