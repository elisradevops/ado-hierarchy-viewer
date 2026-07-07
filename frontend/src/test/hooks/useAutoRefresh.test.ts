import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useUiPrefsStore } from '../../state/uiPrefsStore';

const AUTO_REFRESH_MS = 10_000; // above MIN_AUTO_REFRESH_MS (5s)

describe('useAutoRefresh — enabled gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiPrefsStore.getState().setAutoRefreshMs(AUTO_REFRESH_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
    useUiPrefsStore.getState().setAutoRefreshMs(0);
  });

  it('does not fire onRefresh on interval when enabled is false', () => {
    const onRefresh = vi.fn();
    renderHook(() => useAutoRefresh(onRefresh, false));

    act(() => { vi.advanceTimersByTime(AUTO_REFRESH_MS * 3); });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('fires onRefresh on interval when enabled is true', () => {
    const onRefresh = vi.fn();
    renderHook(() => useAutoRefresh(onRefresh, true));

    act(() => { vi.advanceTimersByTime(AUTO_REFRESH_MS); });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('stops firing once enabled flips to false (e.g. source query cleared mid-run)', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useAutoRefresh(onRefresh, enabled),
      { initialProps: { enabled: true } }
    );

    act(() => { vi.advanceTimersByTime(AUTO_REFRESH_MS); });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    act(() => { vi.advanceTimersByTime(AUTO_REFRESH_MS * 3); });

    expect(onRefresh).toHaveBeenCalledTimes(1); // no further calls after disabling
  });
});
