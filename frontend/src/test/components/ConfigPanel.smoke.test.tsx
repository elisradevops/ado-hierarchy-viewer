import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { ConfigPanel } from '../../components/ConfigPanel';

// Mock Zustand stores and API
vi.mock('../../state/configStore', () => ({
  useConfigStore: () => ({
    config: {
      tfsUrl: '',
      teamProject: '',
      relationType: 'System.LinkTypes.Hierarchy-Forward',
      direction: 'forward',
      closedState: 'Closed',
      effortField: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
    },
    setConfig: vi.fn(),
  }),
}));

vi.mock('../../state/connectionStore', () => ({
  useConnectionStore: () => ({ orgUrl: '', credential: '', status: 'idle' }),
}));

vi.mock('../../api/hierarchyApi', () => ({
  fetchRelationTypes: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
}));

describe('ConfigPanel', () => {
  it('renders Closed as default closed state', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigPanel onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByDisplayValue('Closed')).toBeInTheDocument();
  });

  it('renders OriginalEstimate as default effort field', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ConfigPanel onRun={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByDisplayValue('Microsoft.VSTS.Scheduling.OriginalEstimate')).toBeInTheDocument();
  });
});
