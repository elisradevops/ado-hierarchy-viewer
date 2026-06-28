import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { ConfigSidebar } from '../../components/ConfigSidebar';

// Mock Zustand stores and API
vi.mock('../../state/configStore', () => ({
  useConfigStore: () => ({
    config: {
      tfsUrl: '',
      teamProject: '',
      relationTypes: ['System.LinkTypes.Hierarchy-Forward'],
      closedState: 'Closed',
      effortField: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
    },
    setConfig: vi.fn(),
  }),
}));

vi.mock('../../state/connectionStore', () => ({
  useConnectionStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { orgUrl: '', credential: '', status: 'idle', disconnect: vi.fn() };
    return selector(state);
  }),
}));

vi.mock('../../state/hierarchyStore', () => ({
  useHierarchyStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { rootIds: [], rowsById: {}, lastFetchedAt: null, clear: vi.fn() };
    return selector(state);
  }),
}));

vi.mock('../../state/uiPrefsStore', () => ({
  useUiPrefsStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      sidebarCollapsed: false,
      toggleSidebar: vi.fn(),
      filter: { text: '', types: [], states: [] },
      setFilter: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../api/hierarchyApi', () => ({
  fetchRelationTypes: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
}));

describe('ConfigSidebar', () => {
  it('renders brand name when expanded', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigSidebar onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByText('Hierarchy Viewer')).toBeInTheDocument();
  });

  it('renders Closed as default closed state', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigSidebar onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByDisplayValue('Closed')).toBeInTheDocument();
  });

  it('renders OriginalEstimate as default effort field', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigSidebar onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByDisplayValue('Microsoft.VSTS.Scheduling.OriginalEstimate')).toBeInTheDocument();
  });

  it('renders Load Hierarchy button', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigSidebar onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByText('Load Hierarchy')).toBeInTheDocument();
  });

  it('renders collapse toggle button', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigSidebar onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
  });
});
