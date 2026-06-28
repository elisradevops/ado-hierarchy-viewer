import { useCallback, useRef } from 'react';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useConnectionStore } from '../state/connectionStore';
import { useConfigStore } from '../state/configStore';
import { fetchHierarchy } from '../api/hierarchyApi';
import { runHierarchyPipeline } from '../workers/workerClient';
import type { AuthCtx } from '../types';

export function useHierarchyData(): {
  loadHierarchy: () => void;
  loading: boolean;
  error: string | null;
} {
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const { setResult, setLoading, setError, setUsedRelationTypes, loading, error } = useHierarchyStore();
  const { orgUrl, credential } = useConnectionStore();
  const { config } = useConfigStore();

  const loadHierarchy = useCallback((): void => {
    if (!orgUrl || !credential || !config.teamProject || (config.relationTypes.length === 0 && !config.queryId)) return;

    // Cancel any in-flight prior request
    if (abortRef.current) {
      cancelledRef.current = true;
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    cancelledRef.current = false;

    setLoading(true);
    setError(null);

    const ctx: AuthCtx = { orgUrl, credential };

    void (async () => {
      try {
        // Fetch raw ADO data via BFF
        const { workItemRelations, workItems, rootIds } = await fetchHierarchy(config, ctx, signal);

        if (cancelledRef.current) return; // stale-response guard

        // Extract unique non-null relation types actually present in the result
        const usedRels = [...new Set(workItemRelations.map(r => r.rel).filter((r): r is string => !!r))];
        setUsedRelationTypes(usedRels);

        // Run graph/tree algorithm (web worker if large)
        const result = await runHierarchyPipeline(
          {
            relations: workItemRelations,
            items: workItems,
            closedState: config.closedState,
            rootIds,
            selectedRels: config.relationTypes,
          },
          signal
        );

        if (cancelledRef.current) return;
        setResult(result);
      } catch (err) {
        if (cancelledRef.current) return;
        const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted');
        if (!isAbort) {
          // Prefer the BFF error body message over axios's generic "Request failed with status code 4xx"
          const bffMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
          setError(bffMessage ?? (err instanceof Error ? err.message : 'Failed to load hierarchy'));
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
  }, [orgUrl, credential, config, setResult, setLoading, setError, setUsedRelationTypes]);

  return { loadHierarchy, loading, error };
}
