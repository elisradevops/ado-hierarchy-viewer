import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useConnectionStore } from '../state/connectionStore';
import { LoginForm } from './LoginForm';
import { ErrorState } from './ErrorState';

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
  const error = useConnectionStore(s => s.error);

  if (status === 'connected') {
    return <>{children}</>;
  }

  if (mode === 'extension') {
    // useAuthRecovery sets status 'error' when a token refresh (after 401) fails —
    // without this branch the app would spin forever instead of prompting a reload.
    if (status === 'error') {
      return <ErrorState message={error ?? 'Azure DevOps session expired.'} onRetry={() => window.location.reload()} />;
    }
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
