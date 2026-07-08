import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { LegendPopover } from '../../components/LegendPopover';
import { LEGEND_GROUPS } from '../../constants/helpText';

describe('LegendPopover', () => {
  it('opens on click and renders every legend group with all its items', async () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <LegendPopover />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /legend/i }));

    expect(screen.getByText('Legend')).toBeInTheDocument();
    for (const group of LEGEND_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByText(item.label)).toBeInTheDocument();
      }
    }
  });
});
