import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { TimeProgressBar } from '../../components/ProgressBar';

function renderTime(props: { completed: number; remaining: number; estimate?: number; overdueCount?: number }) {
  return render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <TimeProgressBar {...props} />
    </ThemeProvider>
  );
}

describe('TimeProgressBar', () => {
  it('estimate baseline: completed exceeds estimate → shows overdue label', () => {
    renderTime({ completed: 12, remaining: 0, estimate: 10 });
    expect(screen.getByText('+2.0h over')).toBeInTheDocument();
  });

  it('estimate baseline: closed under estimate with no remaining → shows under label', () => {
    renderTime({ completed: 6, remaining: 0, estimate: 10 });
    expect(screen.getByText('4.0h under')).toBeInTheDocument();
  });

  it('estimate baseline: remaining work still present → shows "left" label, not overdue', () => {
    renderTime({ completed: 4, remaining: 6, estimate: 10 });
    expect(screen.getByText('6.0h left')).toBeInTheDocument();
  });

  it('no estimate: falls back to burn-down split of completed vs remaining', () => {
    renderTime({ completed: 3, remaining: 7 });
    expect(screen.getByText('7.0h left')).toBeInTheDocument();
  });

  it('no estimate, nothing completed or remaining → shows placeholder', () => {
    renderTime({ completed: 0, remaining: 0 });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('negative remaining is clamped to 0, never renders a negative label', () => {
    renderTime({ completed: 5, remaining: -3 });
    expect(screen.queryByText(/-3h left/)).not.toBeInTheDocument();
    // completed>0 with remaining clamped to 0 and no estimate baseline reads as "done",
    // not a negative-hours label.
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('non-finite inputs are guarded to 0', () => {
    renderTime({ completed: Number.NaN, remaining: Number.POSITIVE_INFINITY });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  describe('overdueCount — always wins over the net-sum label (Option 1: ignore net, always report the count)', () => {
    it('regression: overdueCount>0 shows "N item(s) over budget" even when net sum looks like "done"', () => {
      // Net looks exactly on-budget (completed === estimate) — without overdueCount this
      // would render "done", hiding the fact that a sibling was individually over.
      renderTime({ completed: 15, remaining: 0, estimate: 15, overdueCount: 1 });
      expect(screen.getByText('1 item over budget')).toBeInTheDocument();
      expect(screen.queryByText('done')).not.toBeInTheDocument();
    });

    it('pluralizes for more than one overdue descendant', () => {
      renderTime({ completed: 15, remaining: 0, estimate: 15, overdueCount: 2 });
      expect(screen.getByText('2 items over budget')).toBeInTheDocument();
    });

    it('overdueCount also wins over a "left" or "under" label, not just "done"', () => {
      renderTime({ completed: 4, remaining: 6, estimate: 20, overdueCount: 1 });
      expect(screen.getByText('1 item over budget')).toBeInTheDocument();
      expect(screen.queryByText(/left/)).not.toBeInTheDocument();
    });

    it('overdueCount=0 (default/absent) falls through to the existing net-based labels unchanged', () => {
      renderTime({ completed: 12, remaining: 0, estimate: 10, overdueCount: 0 });
      expect(screen.getByText('+2.0h over')).toBeInTheDocument();
    });

    it('regression: a leaf that is ITSELF the overdue item shows its own precise "+Xh over", not the generic count', () => {
      // The overdue leaf's own overdueCount includes its own contribution (1), but since
      // its own net completed>estimate is also true, it must show its own number, not
      // "1 item over budget" — that generic message is reserved for a node whose own net
      // isn't over but a descendant's is (the masking case).
      renderTime({ completed: 10, remaining: 0, estimate: 5, overdueCount: 1 });
      expect(screen.getByText('+5.0h over')).toBeInTheDocument();
      expect(screen.queryByText('1 item over budget')).not.toBeInTheDocument();
    });
  });
});
