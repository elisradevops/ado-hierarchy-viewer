import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { InfoTip } from '../../components/InfoTip';

function renderTip(overrides: Partial<React.ComponentProps<typeof InfoTip>> = {}) {
  const props: React.ComponentProps<typeof InfoTip> = {
    text: 'Explains the thing.',
    ...overrides,
  };
  render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <InfoTip {...props} />
    </ThemeProvider>
  );
}

describe('InfoTip', () => {
  it('is closed by default and opens on click, showing the description', async () => {
    renderTip({ ariaLabel: 'About Widget' });
    expect(screen.queryByText('Explains the thing.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'About Widget' }));
    expect(screen.getByText('Explains the thing.')).toBeInTheDocument();
  });

  it('shows the optional title above the description', async () => {
    renderTip({ title: 'Widget', ariaLabel: 'About Widget' });
    await userEvent.click(screen.getByRole('button', { name: 'About Widget' }));
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Explains the thing.')).toBeInTheDocument();
  });
});
