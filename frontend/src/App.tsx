import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAdoContext } from './hooks/useAdoContext';
import { ConnectionGate } from './components/ConnectionGate';
import { AppLayout } from './components/AppLayout';
import { HierarchyTreeTable } from './components/HierarchyTreeTable';
import { Loading } from './components/Loading';
import { ErrorState } from './components/ErrorState';
import { EmptyState } from './components/EmptyState';
import { WelcomeState } from './components/WelcomeState';
import { useConnectionStore } from './state/connectionStore';
import { storage } from './utils/storage';
import { httpClient } from './api/httpClient';
import { buildAuthHeaders } from './api/authHeaders';
import { useHierarchyStore } from './state/hierarchyStore';
import { useHierarchyData } from './hooks/useHierarchyData';
import { useUrlState } from './hooks/useUrlState';
import { useAutoRefresh } from './hooks/useAutoRefresh';

const MAIN_SX = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } as const;

export default function App(): React.ReactElement {
  const { ready, sdk } = useAdoContext();
  const status = useConnectionStore(s => s.status);
  const connectStandalone = useConnectionStore(s => s.connectStandalone);

  // Restore standalone session from sessionStorage on startup
  useEffect(() => {
    if (status !== 'idle') return;
    const savedUrl = storage.session.get('orgUrl');
    const savedPat = storage.session.get('pat');
    if (!savedUrl || !savedPat) return;

    let cancelled = false;

    const probe = async () => {
      try {
        await httpClient.get('/health', { headers: buildAuthHeaders(savedUrl, savedPat) });
        if (!cancelled) {
          connectStandalone(savedUrl, savedPat);
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as { response?: { status?: number } }).response?.status;
          // Only clear stored credentials on explicit auth failures (401/403).
          // Transient network errors (no status) keep credentials so the user
          // doesn't have to re-enter them after a BFF restart.
          if (status === 401 || status === 403) {
            storage.session.remove('orgUrl');
            storage.session.remove('pat');
          }
        }
      }
    };

    void probe();

    return () => { cancelled = true; };
  }, [status, connectStandalone]);
  const { loadHierarchy, loading, error } = useHierarchyData();
  const rootIds = useHierarchyStore(s => s.rootIds);
  const lastFetchedAt = useHierarchyStore(s => s.lastFetchedAt);
  useUrlState();
  useAutoRefresh(loadHierarchy);

  // Notify ADO extension shell that app has loaded. Fires once the app itself is
  // ready to render SOMETHING (welcome/error/tree) — not gated on a successful
  // connection, since a rendered ErrorState is still a completed load from the
  // host's perspective. Genuine unrecoverable init failures instead call
  // requestLoadFailed (see useAdoContext) so the host spinner never hangs.
  useEffect(() => {
    if (ready && sdk) {
      try {
        (sdk as { notifyLoadSucceeded: () => void }).notifyLoadSucceeded();
      } catch { /* not in ADO context */ }
    }
  }, [ready, sdk]);

  if (!ready) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 2, bgcolor: 'background.default' }}>
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">Initializing ADO Hierarchy Viewer…</Typography>
      </Box>
    );
  }

  return (
    <ConnectionGate>
      <AppLayout onRun={loadHierarchy}>
        <Box sx={MAIN_SX}>
          {loading && <Loading />}
          {!loading && error && <ErrorState message={error} onRetry={loadHierarchy} />}
          {!loading && !error && lastFetchedAt === null && <WelcomeState />}
          {!loading && !error && lastFetchedAt !== null && rootIds.length === 0 && <EmptyState />}
          {!loading && !error && rootIds.length > 0 && <HierarchyTreeTable onRefresh={loadHierarchy} />}
        </Box>
      </AppLayout>
    </ConnectionGate>
  );
}
