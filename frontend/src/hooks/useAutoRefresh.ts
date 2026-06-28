import { useEffect, useRef } from 'react';
import { useUiPrefsStore } from '../state/uiPrefsStore';

// L8: minimum guard — prevent accidental sub-second polling if value is ever set programmatically
const MIN_AUTO_REFRESH_MS = 5_000;

export function useAutoRefresh(onRefresh: () => void): void {
  const autoRefreshMs = useUiPrefsStore(s => s.autoRefreshMs);
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh; // always up-to-date without re-registering interval

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs < MIN_AUTO_REFRESH_MS) return;

    const id = setInterval(() => {
      if (document.hidden) return; // pause when tab not visible
      callbackRef.current();
    }, autoRefreshMs);

    return () => clearInterval(id);
  }, [autoRefreshMs]);
}
