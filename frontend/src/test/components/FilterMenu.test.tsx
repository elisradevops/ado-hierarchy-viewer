import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { LIGHT_COMFORTABLE } from '../../theme/theme';
import { FilterMenu } from '../../components/FilterMenu';

function renderMenu(overrides: Partial<React.ComponentProps<typeof FilterMenu>> = {}) {
  const setFilter = vi.fn();
  const onToggleShowOnlyMatches = vi.fn();
  const props: React.ComponentProps<typeof FilterMenu> = {
    availableTypes: ['Bug', 'Task'],
    availableStates: ['Active', 'Closed'],
    filter: { types: [], states: [] },
    setFilter,
    matchesAvailable: true,
    showOnlyMatches: false,
    onToggleShowOnlyMatches,
    ...overrides,
  };
  render(
    <ThemeProvider theme={LIGHT_COMFORTABLE}>
      <FilterMenu {...props} />
    </ThemeProvider>
  );
  return { setFilter, onToggleShowOnlyMatches };
}

describe('FilterMenu', () => {
  it('opens a popover with Work Item Types, States, and a query-match switch, separated by dividers', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));

    expect(screen.getByText('Available Work Item Types')).toBeInTheDocument();
    expect(screen.getByText('Available States')).toBeInTheDocument();
    expect(screen.getByText('Show only query matches')).toBeInTheDocument();
    const popover = screen.getByRole('presentation');
    expect(within(popover).getAllByRole('separator')).toHaveLength(2);
  });

  it('toggling a type checkbox calls setFilter with the type added', async () => {
    const { setFilter } = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bug' }));
    expect(setFilter).toHaveBeenCalledWith({ types: ['Bug'] });
  });

  it('toggling an already-active state checkbox removes it', async () => {
    const { setFilter } = renderMenu({ filter: { types: [], states: ['Active'] } });
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(setFilter).toHaveBeenCalledWith({ states: [] });
  });

  it('the query-match switch calls onToggleShowOnlyMatches and is hidden when matches are unavailable', async () => {
    const { onToggleShowOnlyMatches } = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    await userEvent.click(screen.getByRole('switch', { name: 'Show only query matches' }));
    expect(onToggleShowOnlyMatches).toHaveBeenCalledTimes(1);
  });

  it('hides the query-match section when matchesAvailable is false', async () => {
    renderMenu({ matchesAvailable: false });
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    expect(screen.queryByText('Show only query matches')).not.toBeInTheDocument();
  });

  it('shows a badge with the combined active count (types + states + match toggle)', () => {
    renderMenu({ filter: { types: ['Bug'], states: ['Active'] }, showOnlyMatches: true });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('"Clear all" resets types and states but is only shown when something is active', async () => {
    const { setFilter } = renderMenu({ filter: { types: ['Bug'], states: [] } });
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(setFilter).toHaveBeenCalledWith({ types: [], states: [] });
  });

  it('does not show "Clear all" when nothing is active', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /filter by type, state, or query match/i }));
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });
});
