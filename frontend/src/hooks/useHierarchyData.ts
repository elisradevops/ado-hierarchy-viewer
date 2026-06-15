import { useCallback, useRef } from 'react';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useConnectionStore } from '../state/connectionStore';
import { useConfigStore } from '../state/configStore';
import { fetchHierarchy } from '../api/hierarchyApi';
import { runHierarchyPipeline } from '../workers/workerClient';
import type { AuthCtx } from '../types';

export function useHierarchyData(): {
  fetch: () => void;
  loading: boolean;
  error: string | null;
} {
  const isFetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const { setResult, setLoading, setError, loading, error } = useHierarchyStore();
  const { orgUrl, credential } = useConnectionStore();
  const { config } = useConfigStore();

  const fetch = useCallback((): void => {
    // Cancel any in-flight prior request
    if (abortRef.current) {
      cancelledRef.current = true;
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    cancelledRef.current = false;
    isFetchingRef.current = true;

    setLoading(true);
    setError(null);

    const ctx: AuthCtx = { orgUrl, credential };

    void (async () => {
      try {
        // Fetch raw ADO data via BFF
        const { workItemRelations, workItems } = await fetchHierarchy(config, ctx, signal);

        if (cancelledRef.current) return; // stale-response guard

        // Run graph/tree algorithm (web worker if large)
        const result = await runHierarchyPipeline(
          {
            relations: workItemRelations,
            items: workItems,
            direction: config.direction,
            closedState: config.closedState,
          },
          signal
        );

        if (cancelledRef.current) return;
        setResult(result);
      } catch (err) {
        if (cancelledRef.current) return;
        const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted');
        if (!isAbort) {
          setError(err instanceof Error ? err.message : 'Failed to load hierarchy');
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
        isFetchingRef.current = false;
      }
    })();
  }, [orgUrl, credential, config, setResult, setLoading, setError]);

  return { fetch, loading, error };
}
