import { useEffect, useRef } from 'react';
import { useUiPrefsStore } from '../state/uiPrefsStore';

// L8: minimum guard — prevent accidental sub-second polling if value is ever set programmatically
const MIN_AUTO_REFRESH_MS = 5_000;

/**
 * @param enabled Whether a refresh can actually do anything right now (e.g. a query is
 * selected). `loadHierarchy` itself guards on this too, but gating the interval here as
 * well means auto-refresh stops cleanly instead of silently polling into a no-op every
 * tick — e.g. after the user clears the source query while auto-refresh was running.
 */
export function useAutoRefresh(onRefresh: () => void, enabled: boolean): void {
  const autoRefreshMs = useUiPrefsStore(s => s.autoRefreshMs);
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh; // always up-to-date without re-registering interval

  useEffect(() => {
    if (!enabled || !autoRefreshMs || autoRefreshMs < MIN_AUTO_REFRESH_MS) return;

    const id = setInterval(() => {
      if (document.hidden) return; // pause when tab not visible
      callbackRef.current();
    }, autoRefreshMs);

    return () => clearInterval(id);
  }, [autoRefreshMs, enabled]);
}
