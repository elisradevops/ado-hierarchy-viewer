import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { LegendPopover } from '../../components/LegendPopover';

describe('LegendPopover', () => {
  it('opens on click and prioritizes current-view types and states', async () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <LegendPopover availableTypes={['Bug', 'Task']} availableStates={['Closed', 'Removed']} />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /legend/i }));

    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Current view')).toBeInTheDocument();
    expect(screen.getByText('Work item types in this view (2)')).toBeInTheDocument();
    expect(screen.getByText('States in this view (2)')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
  });

  it('keeps relationship and warning reference sections available', async () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <LegendPopover availableTypes={[]} availableStates={[]} />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /legend/i }));

    expect(screen.getByText('Relationship types')).toBeInTheDocument();
    expect(screen.getByText('Warning indicators')).toBeInTheDocument();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
    expect(screen.getByText('Duplicate link')).toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
  });
});
