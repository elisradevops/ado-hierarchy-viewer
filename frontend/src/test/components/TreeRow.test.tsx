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
    const rowEl = container.querySelector('[tabindex="0"]');
    expect(rowEl).not.toHaveStyle({ opacity: '0.55' });
  });

  it('never dims a matching row either', () => {
    useHierarchyStore.setState({ usedQueryId: 'q-1', matchedIds: [1] });
    const { container } = renderRow(makeRow({ id: 1, isQueryMatch: true }));
    const rowEl = container.querySelector('[tabindex="0"]');
    expect(rowEl).not.toHaveStyle({ opacity: '0.55' });
  });

  it('never dims when no query is active', () => {
    useHierarchyStore.setState({ usedQueryId: '', matchedIds: null });
    const { container } = renderRow(makeRow({ isQueryMatch: false }));
    const rowEl = container.querySelector('[tabindex="0"]');
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
