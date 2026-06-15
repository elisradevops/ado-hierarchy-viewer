import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useConnectionStore } from '../state/connectionStore';
import { LoginForm } from './LoginForm';

const LOADING_SX = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 2,
} as const;

interface ConnectionGateProps {
  children: React.ReactNode;
}

export function ConnectionGate({ children }: ConnectionGateProps): React.ReactElement {
  const status = useConnectionStore(s => s.status);
  const mode = useConnectionStore(s => s.mode);

  if (status === 'connected') {
    return <>{children}</>;
  }

  if (mode === 'extension') {
    // Extension mode: connecting is automatic via SDK — show loading indicator
    return (
      <Box sx={LOADING_SX}>
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">Connecting to Azure DevOps…</Typography>
      </Box>
    );
  }

  return <LoginForm />;
}
