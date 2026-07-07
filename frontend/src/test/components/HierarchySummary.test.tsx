import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { HierarchySummary } from '../../components/HierarchySummary';
import type { SummaryStats } from '../../selectors/summaryStats';

function makeStats(overrides: Partial<SummaryStats> = {}): SummaryStats {
  return {
    totalItems: 10,
    overallProgressPct: 50,
    totalEffort: 0,
    completedLeaves: 5,
    totalLeaves: 10,
    byType: { Bug: 3, Task: 7 },
    byState: { Active: 6, Closed: 4 },
    ...overrides,
  };
}

function renderSummary(overrides: Partial<SummaryStats> = {}) {
  return render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <HierarchySummary stats={makeStats(overrides)} />
    </ThemeProvider>
  );
}

describe('HierarchySummary — read-only stat chips', () => {
  it('renders type and state chips as plain stats (no click handler)', () => {
    renderSummary();
    const bugChip = screen.getByText('Bug 3').closest('.MuiChip-root') as HTMLElement;
    // MUI Chip only renders a clickable role="button" when onClick is passed.
    expect(bugChip).not.toHaveAttribute('role', 'button');
  });

  it('does not render a "Clear filters" control — filtering lives in the toolbar now', () => {
    renderSummary();
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('renders the effort stat and progress summary', () => {
    renderSummary({ totalEffort: 42 });
    expect(screen.getByText('42h effort')).toBeInTheDocument();
    expect(screen.getByText('10 items')).toBeInTheDocument();
  });
});
