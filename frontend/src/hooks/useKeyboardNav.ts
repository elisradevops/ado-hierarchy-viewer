import { useCallback, useRef } from 'react';
import type React from 'react';

export interface KeyboardNavConfig {
  rowCount: number;
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
    const { rowCount, activeIndex, onSetActive, onToggleExpand, onOpenItem } = configRef.current;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (activeIndex > 0) onSetActive(activeIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (activeIndex < rowCount - 1) onSetActive(activeIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onToggleExpand(activeIndex); // collapse
        break;
      case 'ArrowRight':
        e.preventDefault();
        onToggleExpand(activeIndex); // expand
        break;
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
