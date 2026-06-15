import { create } from 'zustand';
import type { TreeNode, BuildHierarchyResult } from '../types';

interface HierarchyStore {
  rootIds: number[];
  rowsById: Record<number, TreeNode>;
  orphanIds: number[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  setResult: (result: BuildHierarchyResult) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useHierarchyStore = create<HierarchyStore>((set) => ({
  rootIds: [],
  rowsById: {},
  orphanIds: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  setResult: (result) => {
    // Build Record<number, TreeNode> for O(1) lookup per CLAUDE.md
    const rowsById: Record<number, TreeNode> = {};
    function indexNode(node: TreeNode): void {
      rowsById[node.id] = node;
      for (const child of node.children) indexNode(child);
    }
    for (const root of result.roots) indexNode(root);

    set({
      rootIds: result.roots.map(r => r.id),
      rowsById,
      orphanIds: result.orphanIds,
      loading: false,
      error: null,
      lastFetchedAt: Date.now(),
    });
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clear: () => set({ rootIds: [], rowsById: {}, orphanIds: [], loading: false, error: null, lastFetchedAt: null }),
}));
