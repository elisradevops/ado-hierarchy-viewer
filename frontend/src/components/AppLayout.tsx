import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { ConfigSidebar } from './ConfigSidebar';
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport';
import { useUiPrefsStore } from '../state/uiPrefsStore';

// ─── sx constants ───────────────────────────────────────────────
const ROOT_SX = {
  display: 'flex',
  flexDirection: 'row',
  height: '100vh',
  overflow: 'hidden',
} as const;

const MAIN_SX = {
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  bgcolor: 'background.default',
} as const;

interface AppLayoutProps {
  children: React.ReactNode;
  onRun: () => void;
}

export function AppLayout({ children, onRun }: AppLayoutProps): React.ReactElement {
  const isNarrow = useIsNarrowViewport();
  const setSidebarCollapsed = useUiPrefsStore(s => s.setSidebarCollapsed);
  const setDensity = useUiPrefsStore(s => s.setDensity);

  // Auto-collapse + compact once on crossing into a narrow viewport (e.g. a small
  // ADO extension hub panel) so the table isn't reduced to a sliver. One-shot per
  // crossing — does not fight a user who re-expands the sidebar while still narrow,
  // and does not force anything back on widening (that's the user's call).
  const wasNarrowRef = useRef(false);
  useEffect(() => {
    if (isNarrow && !wasNarrowRef.current) {
      setSidebarCollapsed(true);
      setDensity('compact');
    }
    wasNarrowRef.current = isNarrow;
  }, [isNarrow, setSidebarCollapsed, setDensity]);

  return (
    <Box sx={ROOT_SX}>
      <Box sx={MAIN_SX}>
        {children}
      </Box>
      <ConfigSidebar onRun={onRun} />
    </Box>
  );
}
