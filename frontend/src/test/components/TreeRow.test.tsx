import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { TreeRow } from '../../components/TreeRow';
import { useHierarchyStore } from '../../state/hierarchyStore';
import type { FlatRow, TreeNode } from '../../types';

function makeRow(overrides: Partial<TreeNode> = {}): FlatRow {
  const node: Omit<TreeNode, 'children'> = {
    id: 1,
    type: 'Task',
    title: 'Sample item',
    state: 'Active',
    effort: 0,
    effortTotal: 0,
    progressPct: 0,
    closedLeaves: 0,
    totalLeaves: 0,
    completedWorkTotal: 0,
    remainingWorkTotal: 0,
    originalEstimateTotal: 0,
    overdueCount: 0,
    ...overrides,
  };
  return { node, depth: 0, hasChildren: false, isExpanded: false, parentId: null };
}

const VISIBLE_COLUMNS = [{ key: 'title', label: 'Title', width: 'minmax(0, 1fr)' }];

function renderRow(row: FlatRow) {
  return render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <TreeRow
        row={row}
        orgUrl="https://dev.azure.com/testorg"
        teamProject="Proj"
        isActive={false}
        density="comfortable"
        onToggle={() => {}}
        onActivate={() => {}}
        visibleColumns={VISIBLE_COLUMNS}
        gridCols="minmax(0, 1fr)"
      />
    </ThemeProvider>
  );
}

describe('TreeRow — no row dimming regardless of query-match state', () => {
  afterEach(() => {
    useHierarchyStore.getState().clear();
  });

  it('never dims, even for a non-matching row under an active strict-mode query', () => {
    useHierarchyStore.setState({ usedQueryId: 'q-1', matchedIds: [2, 3] });
    const { container } = renderRow(makeRow({ id: 1, isQueryMatch: false }));
    const rowEl = container.querySelector('[role="treeitem"]');
    expect(rowEl).not.toHaveStyle({ opacity: '0.55' });
  });

  it('never dims a matching row either', () => {
    useHierarchyStore.setState({ usedQueryId: 'q-1', matchedIds: [1] });
    const { container } = renderRow(makeRow({ id: 1, isQueryMatch: true }));
    const rowEl = container.querySelector('[role="treeitem"]');
    expect(rowEl).not.toHaveStyle({ opacity: '0.55' });
  });

  it('never dims when no query is active', () => {
    useHierarchyStore.setState({ usedQueryId: '', matchedIds: null });
    const { container } = renderRow(makeRow({ isQueryMatch: false }));
    const rowEl = container.querySelector('[role="treeitem"]');
    expect(rowEl).not.toHaveStyle({ opacity: '0.55' });
  });
});

describe('TreeRow — relationship chip icons', () => {
  afterEach(() => {
    useHierarchyStore.getState().clear();
  });

  it('renders a Link icon for a query-native relationship (no active query)', () => {
    useHierarchyStore.setState({ usedQueryId: '', matchedIds: null });
    const { container } = renderRow(makeRow({ linkRel: 'System.LinkTypes.Hierarchy-Forward' }));
    expect(container.querySelector('[data-testid="LinkIcon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="TravelExploreIcon"]')).not.toBeInTheDocument();
  });

  it('renders a TravelExplore icon for a link-type-discovered node once a query is active', () => {
    useHierarchyStore.setState({ usedQueryId: 'q-1', matchedIds: [1] });
    const { container } = renderRow(makeRow({ linkRel: 'Elisra.Affects-Forward', linkOrigin: 'link' }));
    expect(container.querySelector('[data-testid="TravelExploreIcon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="LinkIcon"]')).not.toBeInTheDocument();
  });

  it('renders no chip for a root row (no linkRel)', () => {
    const { container } = renderRow(makeRow({ linkRel: undefined }));
    expect(container.querySelector('[data-testid="LinkIcon"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="TravelExploreIcon"]')).not.toBeInTheDocument();
  });
});

describe('TreeRow — accessibility', () => {
  it('renders role=treeitem with tabIndex=-1 (container owns keyboard focus, not the row)', () => {
    const { container } = renderRow(makeRow());
    const rowEl = container.querySelector('[role="treeitem"]');
    expect(rowEl).toHaveAttribute('tabindex', '-1');
  });

  it('sets aria-level from depth + 1', () => {
    const row = makeRow();
    row.depth = 3;
    const { container } = render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <TreeRow
          row={row}
          orgUrl="https://dev.azure.com/testorg"
          teamProject="Proj"
          isActive={false}
          density="comfortable"
          onToggle={() => {}}
          onActivate={() => {}}
          visibleColumns={VISIBLE_COLUMNS}
          gridCols="minmax(0, 1fr)"
        />
      </ThemeProvider>
    );
    expect(container.querySelector('[role="treeitem"]')).toHaveAttribute('aria-level', '4');
  });

  it('sets aria-expanded only when the row has non-ref children', () => {
    const { container: withChildren } = render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <TreeRow
          row={{ node: makeRow().node, depth: 0, hasChildren: true, isExpanded: true, parentId: null }}
          orgUrl="https://dev.azure.com/testorg"
          teamProject="Proj"
          isActive={false}
          density="comfortable"
          onToggle={() => {}}
          onActivate={() => {}}
          visibleColumns={VISIBLE_COLUMNS}
          gridCols="minmax(0, 1fr)"
        />
      </ThemeProvider>
    );
    expect(withChildren.querySelector('[role="treeitem"]')).toHaveAttribute('aria-expanded', 'true');

    const { container: leaf } = renderRow(makeRow());
    expect(leaf.querySelector('[role="treeitem"]')).not.toHaveAttribute('aria-expanded');
  });

  it('sets aria-selected to reflect isActive', () => {
    const row = makeRow();
    const { container } = render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <TreeRow
          row={row}
          orgUrl="https://dev.azure.com/testorg"
          teamProject="Proj"
          isActive={true}
          density="comfortable"
          onToggle={() => {}}
          onActivate={() => {}}
          visibleColumns={VISIBLE_COLUMNS}
          gridCols="minmax(0, 1fr)"
        />
      </ThemeProvider>
    );
    expect(container.querySelector('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('exposes a stable dom id keyed by node id for aria-activedescendant', () => {
    const { container } = renderRow(makeRow({ id: 42 }));
    expect(container.querySelector('#tree-row-42')).toBeInTheDocument();
  });
});

describe('TreeRow — indent cap', () => {
  it('caps indent width so it does not grow unbounded past MAX_INDENT_LEVELS', () => {
    const atCap = makeRow();
    const beyondCap = makeRow();
    const { container: atCapContainer } = render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <TreeRow
          row={{ node: atCap.node, depth: 8, hasChildren: false, isExpanded: false, parentId: null }}
          orgUrl="https://dev.azure.com/testorg"
          teamProject="Proj"
          isActive={false}
          density="comfortable"
          onToggle={() => {}}
          onActivate={() => {}}
          visibleColumns={VISIBLE_COLUMNS}
          gridCols="minmax(0, 1fr)"
        />
      </ThemeProvider>
    );
    const { container: beyondCapContainer } = render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <TreeRow
          row={{ node: beyondCap.node, depth: 40, hasChildren: false, isExpanded: false, parentId: null }}
          orgUrl="https://dev.azure.com/testorg"
          teamProject="Proj"
          isActive={false}
          density="comfortable"
          onToggle={() => {}}
          onActivate={() => {}}
          visibleColumns={VISIBLE_COLUMNS}
          gridCols="minmax(0, 1fr)"
        />
      </ThemeProvider>
    );
    // depth 8 (the cap, MAX_INDENT_LEVELS) and depth 40 must render the identical
    // indent width — otherwise a sufficiently deep tree keeps consuming the
    // elastic Title column indefinitely. Width is set via sx (an emotion class,
    // not an inline style), so read it through getComputedStyle.
    const atCapEl = atCapContainer.querySelector('[role="treeitem"] > div > div > div') as HTMLElement;
    const beyondCapEl = beyondCapContainer.querySelector('[role="treeitem"] > div > div > div') as HTMLElement;
    const atCapWidth = getComputedStyle(atCapEl).width;
    const beyondCapWidth = getComputedStyle(beyondCapEl).width;
    expect(atCapWidth).toBe('160px'); // MAX_INDENT_LEVELS(8) * INDENT_PX(20)
    expect(beyondCapWidth).toBe(atCapWidth);
  });
});

describe('TreeRow — cut-cycle indicator', () => {
  it('renders a cycle icon + tooltip when cutCycles is present', () => {
    const { container } = renderRow(makeRow({ cutCycles: [1] }));
    expect(container.querySelector('[data-testid="LoopIcon"]')).toBeInTheDocument();
    const chip = container.querySelector('[data-testid="LoopIcon"]')?.closest('span');
    expect(chip).toHaveAttribute('title', 'Cyclic link to #1 not shown (would loop back)');
  });

  it('pluralizes the tooltip when multiple cycles were cut', () => {
    const { container } = renderRow(makeRow({ cutCycles: [1, 5] }));
    const chip = container.querySelector('[data-testid="LoopIcon"]')?.closest('span');
    expect(chip).toHaveAttribute('title', 'Cyclic links to #1, #5 not shown (would loop back)');
  });

  it('renders no cycle icon when cutCycles is absent', () => {
    const { container } = renderRow(makeRow());
    expect(container.querySelector('[data-testid="LoopIcon"]')).not.toBeInTheDocument();
  });

  it('renders no cycle icon when cutCycles is an empty array', () => {
    const { container } = renderRow(makeRow({ cutCycles: [] }));
    expect(container.querySelector('[data-testid="LoopIcon"]')).not.toBeInTheDocument();
  });
});
