import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { LegendPopover } from '../../components/LegendPopover';

// LegendPopover is always-controlled — a thin wrapper stands in for the single
// anchor/open state HierarchyToolbar owns in production (see its legendAnchor).
function Harness({ availableTypes, availableStates }: { availableTypes: string[]; availableStates: string[] }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <LegendPopover
      availableTypes={availableTypes}
      availableStates={availableStates}
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onOpen={setAnchorEl}
      onClose={() => setAnchorEl(null)}
    />
  );
}

describe('LegendPopover', () => {
  it('opens on click and prioritizes current-view types and states', async () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <Harness availableTypes={['Bug', 'Task']} availableStates={['Closed', 'Removed']} />
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
        <Harness availableTypes={[]} availableStates={[]} />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /legend/i }));

    expect(screen.getByText('Relationship types')).toBeInTheDocument();
    expect(screen.getByText('Warning indicators')).toBeInTheDocument();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
    expect(screen.getByText('Duplicate link')).toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
  });

  it('narrow-mode-style usage: hideTrigger skips the internal button but the controlled popover still opens', async () => {
    function NarrowHarness() {
      const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
      return (
        <>
          <button onClick={(e) => setAnchorEl(e.currentTarget)}>External trigger</button>
          <LegendPopover
            hideTrigger
            availableTypes={[]}
            availableStates={[]}
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onOpen={setAnchorEl}
            onClose={() => setAnchorEl(null)}
          />
        </>
      );
    }
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <NarrowHarness />
      </ThemeProvider>
    );

    expect(screen.queryByRole('button', { name: /legend/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /external trigger/i }));
    expect(screen.getByText('Legend')).toBeInTheDocument();
  });
});
