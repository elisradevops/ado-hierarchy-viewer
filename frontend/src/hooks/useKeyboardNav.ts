import { useCallback, useRef } from 'react';
import type React from 'react';

/** Minimal per-row shape needed for directional tree navigation (mirrors FlatRow). */
export interface KeyboardNavRow {
  id: number;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentId: number | null;
}

export interface KeyboardNavConfig {
  rows: KeyboardNavRow[];
  activeIndex: number;
  onSetActive: (index: number) => void;
  onToggleExpand: (index: number) => void;
  onOpenItem: (index: number) => void;
}

export function useKeyboardNav(config: KeyboardNavConfig): {
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  const configRef = useRef(config);
  configRef.current = config;

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { rows, activeIndex, onSetActive, onToggleExpand, onOpenItem } = configRef.current;
    const rowCount = rows.length;
    const row = rows[activeIndex];

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (activeIndex > 0) onSetActive(activeIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (activeIndex < rowCount - 1) onSetActive(activeIndex + 1);
        break;
      case 'ArrowLeft': {
        // Expanded parent -> collapse it. Otherwise -> jump to its own parent
        // (standard tree-widget behavior; matters most on deep/degenerate trees
        // where "collapse" alone leaves the user stranded far from the root).
        e.preventDefault();
        if (!row) break;
        if (row.hasChildren && row.isExpanded) {
          onToggleExpand(activeIndex);
        } else if (row.parentId !== null) {
          const parentIndex = rows.findIndex(r => r.id === row.parentId);
          if (parentIndex !== -1) onSetActive(parentIndex);
        }
        break;
      }
      case 'ArrowRight': {
        // Collapsed parent -> expand it. Already-expanded parent -> move into
        // its first child (mirrors native OS tree-view / ARIA APG tree pattern).
        e.preventDefault();
        if (!row) break;
        if (row.hasChildren && !row.isExpanded) {
          onToggleExpand(activeIndex);
        } else if (row.hasChildren && row.isExpanded) {
          const childIndex = activeIndex + 1;
          const child = rows[childIndex];
          if (child && child.parentId === row.id) onSetActive(childIndex);
        }
        break;
      }
      case 'Enter':
        e.preventDefault();
        onOpenItem(activeIndex);
        break;
      case 'Home':
        e.preventDefault();
        onSetActive(0);
        break;
      case 'End':
        e.preventDefault();
        onSetActive(rowCount - 1);
        break;
    }
  }, []);

  return { onKeyDown };
}
