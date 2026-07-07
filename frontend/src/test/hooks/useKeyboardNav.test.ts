import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardNav, type KeyboardNavRow } from '../../hooks/useKeyboardNav';

// Tree shape:
// 0: root (expanded, children: 1)
//   1: child (collapsed, children: 2)
//     2: grandchild — only visible once node 1 is expanded (not modeled here; each
//        test constructs the flat `rows` it needs for that scenario)
function makeRows(overrides: Partial<KeyboardNavRow>[]): KeyboardNavRow[] {
  return overrides.map((o, i) => ({
    id: i,
    depth: 0,
    hasChildren: false,
    isExpanded: false,
    parentId: null,
    ...o,
  }));
}

function fireKey(onKeyDown: (e: any) => void, key: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const preventDefault = vi.fn();
  onKeyDown({ key, preventDefault });
  return preventDefault;
}

describe('useKeyboardNav — directional Left/Right', () => {
  it('ArrowRight on a collapsed parent expands it (does not move active row)', () => {
    const rows = makeRows([{ id: 0, hasChildren: true, isExpanded: false, parentId: null }]);
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 0, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowRight');
    expect(onToggleExpand).toHaveBeenCalledWith(0);
    expect(onSetActive).not.toHaveBeenCalled();
  });

  it('ArrowRight on an already-expanded parent moves active to its first child', () => {
    const rows: KeyboardNavRow[] = [
      { id: 0, depth: 0, hasChildren: true, isExpanded: true, parentId: null },
      { id: 1, depth: 1, hasChildren: false, isExpanded: false, parentId: 0 },
    ];
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 0, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowRight');
    expect(onSetActive).toHaveBeenCalledWith(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('ArrowRight on a leaf row (no children) does nothing', () => {
    const rows = makeRows([{ id: 0, hasChildren: false }]);
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 0, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowRight');
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(onSetActive).not.toHaveBeenCalled();
  });

  it('ArrowLeft on an expanded parent collapses it (does not move active row)', () => {
    const rows = makeRows([{ id: 0, hasChildren: true, isExpanded: true, parentId: null }]);
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 0, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowLeft');
    expect(onToggleExpand).toHaveBeenCalledWith(0);
    expect(onSetActive).not.toHaveBeenCalled();
  });

  it('ArrowLeft on a collapsed/leaf child moves active to its parent', () => {
    const rows: KeyboardNavRow[] = [
      { id: 0, depth: 0, hasChildren: true, isExpanded: true, parentId: null },
      { id: 1, depth: 1, hasChildren: false, isExpanded: false, parentId: 0 },
    ];
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 1, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowLeft');
    expect(onSetActive).toHaveBeenCalledWith(0);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('ArrowLeft on a root leaf row (no parent) does nothing', () => {
    const rows = makeRows([{ id: 0, hasChildren: false, parentId: null }]);
    const onToggleExpand = vi.fn();
    const onSetActive = vi.fn();
    const { result } = renderHook(() => useKeyboardNav({
      rows, activeIndex: 0, onSetActive, onToggleExpand, onOpenItem: vi.fn(),
    }));

    fireKey(result.current.onKeyDown, 'ArrowLeft');
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(onSetActive).not.toHaveBeenCalled();
  });
});
