import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { HierarchyToolbar } from '../../components/HierarchyToolbar';

const toggleCol = vi.fn();

// uiPrefsStore is called both as useUiPrefsStore() (whole store) and, in other
// components, with a selector — support both call shapes.
vi.mock('../../state/uiPrefsStore', () => ({
  useUiPrefsStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      filter: { text: '', types: [], states: [] },
      setFilter: vi.fn(),
      autoRefreshMs: 0,
      setAutoRefreshMs: vi.fn(),
      density: 'comfortable',
      setDensity: vi.fn(),
      hiddenCols: [],
      toggleCol,
      resetCols: vi.fn(),
      showOnlyMatches: false,
      toggleShowOnlyMatches: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../state/hierarchyStore', () => ({
  useHierarchyStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      rowsById: {
        1: { type: 'Bug', state: 'Closed' },
      },
      usedQueryId: 'q-1',
      matchedIds: null,
      queryColumns: [
        { referenceName: 'Custom.RiskLevel', name: 'Risk Level' },
        { referenceName: 'Custom.Effort', name: 'Effort' },
      ],
    };
    return selector(state);
  }),
}));

vi.mock('../../state/configStore', () => ({
  useConfigStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { config: { effortField: 'Custom.Effort' } };
    return selector(state);
  }),
}));

function renderToolbar() {
  render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <HierarchyToolbar
        rows={[]}
        totalRows={0}
        onRefresh={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
      />
    </ThemeProvider>
  );
}

describe('HierarchyToolbar — Columns menu (dynamic query columns)', () => {
  it('lists the query\'s own custom columns under a "Query columns" section, excluding the effort field', async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /columns/i }));

    expect(screen.getByText('Query columns')).toBeInTheDocument();
    expect(screen.getByText('Risk Level')).toBeInTheDocument();
    // Custom.Effort matches the configured effortField and must be excluded — its value
    // is already shown via Progress/Time, not a second dynamic column.
    expect(screen.queryByText('Effort')).not.toBeInTheDocument();
  });

  it('toggling a dynamic column menu item calls toggleCol with its prefixed key', async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /columns/i }));
    await userEvent.click(screen.getByText('Risk Level'));
    expect(toggleCol).toHaveBeenCalledWith('x:Custom.RiskLevel');
  });

  it('passes current hierarchy facets into the legend', async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /legend/i }));

    expect(screen.getByText('Work item types in this view (1)')).toBeInTheDocument();
    expect(screen.getByText('States in this view (1)')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
