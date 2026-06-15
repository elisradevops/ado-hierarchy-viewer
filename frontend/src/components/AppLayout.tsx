import React from 'react';
import { Box } from '@mui/material';
import { ConfigSidebar } from './ConfigSidebar';

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
  return (
    <Box sx={ROOT_SX}>
      <ConfigSidebar onRun={onRun} />
      <Box sx={MAIN_SX}>
        {children}
      </Box>
    </Box>
  );
}
