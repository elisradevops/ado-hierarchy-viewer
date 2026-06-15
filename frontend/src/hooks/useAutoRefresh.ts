import { useEffect, useRef } from 'react';
import { useUiPrefsStore } from '../state/uiPrefsStore';

export function useAutoRefresh(onRefresh: () => void): void {
  const autoRefreshMs = useUiPrefsStore(s => s.autoRefreshMs);
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh; // always up-to-date without re-registering interval

  useEffect(() => {
    if (!autoRefreshMs) return;

    const id = setInterval(() => {
      if (document.hidden) return; // pause when tab not visible
      callbackRef.current();
    }, autoRefreshMs);

    return () => clearInterval(id);
  }, [autoRefreshMs]);
}
