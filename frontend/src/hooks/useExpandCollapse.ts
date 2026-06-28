import { useCallback } from 'react';
import { useUiPrefsStore } from '../state/uiPrefsStore';
import { useHierarchyStore } from '../state/hierarchyStore';

export function useExpandCollapse(): {
  expandedIds: Record<number, true>;
  toggle: (id: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
} {
  const expandedIds = useUiPrefsStore(s => s.expandedIds);
  const toggleExpanded = useUiPrefsStore(s => s.toggleExpanded);
  const expandAllStore = useUiPrefsStore(s => s.expandAll);
  const collapseAllStore = useUiPrefsStore(s => s.collapseAll);
  const rowsById = useHierarchyStore(s => s.rowsById);

  const expandAll = useCallback(() => {
    expandAllStore(Object.keys(rowsById).map(Number).filter(Number.isFinite));
  }, [expandAllStore, rowsById]);

  return {
    expandedIds,
    toggle: toggleExpanded,
    expandAll,
    collapseAll: collapseAllStore,
  };
}
