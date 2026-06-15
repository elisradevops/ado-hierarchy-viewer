import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { ProgressBar } from '../../components/ProgressBar';
import { StateDot } from '../../components/StateDot';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';

describe('ProgressBar', () => {
  it('renders progress value', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ProgressBar value={66.7} />
      </ThemeProvider>
    );
    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('handles 0', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ProgressBar value={0} />
      </ThemeProvider>
    );
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('handles 100', () => {
    render(
      <ThemeProvider theme={LIGHT_COMFORTABLE}>
        <ProgressBar value={100} />
      </ThemeProvider>
    );
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});

describe('StateDot', () => {
  it('renders correct color for Active state', () => {
    const { container } = render(<StateDot state="Active" />);
    const dot = container.querySelector('span');
    expect(dot).toHaveStyle({ backgroundColor: '#2563eb' });
  });

  it('renders correct color for Closed state', () => {
    const { container } = render(<StateDot state="Closed" />);
    const dot = container.querySelector('span');
    expect(dot).toHaveStyle({ backgroundColor: '#339933' });
  });

  it('case-insensitive: CLOSED matches closed color', () => {
    const { container } = render(<StateDot state="CLOSED" />);
    const dot = container.querySelector('span');
    expect(dot).toHaveStyle({ backgroundColor: '#339933' });
  });
});

describe('EmptyState', () => {
  it('renders no work items message', () => {
    render(<EmptyState />);
    expect(screen.getByText(/No work items found/i)).toBeInTheDocument();
  });

  it('shows orphan count when present', () => {
    render(<EmptyState orphanIds={[1, 2, 3]} />);
    expect(screen.getByText(/3 unreachable/i)).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows retry button for non-auth errors', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Server error" onRetry={onRetry} />);
    expect(screen.getByText(/Retry/i)).toBeInTheDocument();
  });

  it('shows reconnect for auth errors', () => {
    render(<ErrorState message="401 Unauthorized" onRetry={() => {}} />);
    expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
  });
});
