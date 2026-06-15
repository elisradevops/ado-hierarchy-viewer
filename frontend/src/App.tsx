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
import { cookies } from './utils/storage';
import { useHierarchyStore } from './state/hierarchyStore';
import { useHierarchyData } from './hooks/useHierarchyData';
import { useUrlState } from './hooks/useUrlState';
import { useAutoRefresh } from './hooks/useAutoRefresh';

const MAIN_SX = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } as const;

export default function App(): React.ReactElement {
  const { ready, sdk } = useAdoContext();
  const status = useConnectionStore(s => s.status);
  const connectStandalone = useConnectionStore(s => s.connectStandalone);

  // Restore standalone session from cookies on startup
  useEffect(() => {
    if (status === 'idle') {
      const savedUrl = cookies.get('orgUrl');
      const savedPat = cookies.get('pat');
      if (savedUrl && savedPat) {
        connectStandalone(savedUrl, savedPat);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { fetch, loading, error } = useHierarchyData();
  const rootIds = useHierarchyStore(s => s.rootIds);
  const lastFetchedAt = useHierarchyStore(s => s.lastFetchedAt);
  useUrlState();
  useAutoRefresh(fetch);

  // Notify ADO extension shell that app has loaded
  useEffect(() => {
    if (ready && status === 'connected' && sdk) {
      try {
        (sdk as { notifyLoadSucceeded: () => void }).notifyLoadSucceeded();
      } catch { /* not in ADO context */ }
    }
  }, [ready, status, sdk]);

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
      <AppLayout onRun={fetch}>
        <Box sx={MAIN_SX}>
          {loading && <Loading />}
          {!loading && error && <ErrorState message={error} onRetry={fetch} />}
          {!loading && !error && lastFetchedAt === null && <WelcomeState />}
          {!loading && !error && lastFetchedAt !== null && rootIds.length === 0 && <EmptyState />}
          {!loading && !error && rootIds.length > 0 && <HierarchyTreeTable onRefresh={fetch} />}
        </Box>
      </AppLayout>
    </ConnectionGate>
  );
}
