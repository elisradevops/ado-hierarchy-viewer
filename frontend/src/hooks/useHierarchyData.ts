import { useCallback, useEffect, useRef } from 'react';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useConnectionStore } from '../state/connectionStore';
import { useConfigStore } from '../state/configStore';
import { fetchHierarchy } from '../api/hierarchyApi';
import { fetchHierarchyDirect } from '../api/adoDirect';
import { runHierarchyPipeline } from '../workers/workerClient';
import type { AuthCtx } from '../types';

export function useHierarchyData(): {
  loadHierarchy: () => void;
  loading: boolean;
  error: string | null;
} {
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  // N6: abort in-flight request on unmount so the store is not written after teardown
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const { setResult, setLoading, setError, setUsedRelationTypes, setUsedQueryId, setMatchedIds, loading, error } = useHierarchyStore();
  const { orgUrl, credential, mode } = useConnectionStore();
  const { config } = useConfigStore();

  const loadHierarchy = useCallback((): void => {
    if (!orgUrl || !credential || !config.teamProject || !config.queryId) return;

    // Cancel any in-flight prior request — signal.aborted on the OLD controller
    // becomes the per-call stale guard (closure-captured, never reset by a new call).
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const myGeneration = ++generationRef.current;

    setLoading(true);
    setError(null);

    const ctx: AuthCtx = { orgUrl, credential };

    void (async () => {
      try {
        // Fetch raw ADO data — direct in extension mode, via BFF in standalone
        const { workItemRelations, workItems, rootIds, matchedIds, missingIdReasons } = mode === 'extension'
          ? await fetchHierarchyDirect(config, orgUrl, credential, signal)
          : await fetchHierarchy(config, ctx, signal);

        if (signal.aborted) return; // stale-response guard — reads per-call closure signal

        // Extract unique non-null relation types actually present in the result
        const usedRels = [...new Set(workItemRelations.map(r => r.rel).filter((r): r is string => !!r))];
        setUsedRelationTypes(usedRels);
        setUsedQueryId(config.queryId ?? '');
        setMatchedIds(matchedIds ?? null);

        // Run graph/tree algorithm (web worker if large)
        const result = await runHierarchyPipeline(
          {
            relations: workItemRelations,
            items: workItems,
            closedState: config.closedState,
            rootIds,
            selectedRels: config.relationTypes,
            matchedIds,
            missingIdReasons,
          },
          signal
        );

        if (signal.aborted) return;
        setResult(result);
      } catch (err) {
        if (signal.aborted) return;
        const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted');
        if (!isAbort) {
          // Prefer the BFF error body message over axios's generic "Request failed with status code 4xx"
          const bffMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
          setError(bffMessage ?? (err instanceof Error ? err.message : 'Failed to load hierarchy'));
        }
      } finally {
        // generation guard: only clear loading for the latest call.
        // signal.aborted alone is wrong — it's true on unmount too, leaving loading stuck.
        if (generationRef.current === myGeneration) setLoading(false);
      }
    })();
  }, [orgUrl, credential, config, mode, setResult, setLoading, setError, setUsedRelationTypes, setUsedQueryId, setMatchedIds]);

  return { loadHierarchy, loading, error };
}
