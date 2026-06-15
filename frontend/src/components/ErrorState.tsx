import React from 'react';
import { Alert, Box, Button } from '@mui/material';

const CONTAINER_SX = { p: 3 } as const;

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.ReactElement {
  const isAuth = message.includes('401') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('auth');

  return (
    <Box sx={CONTAINER_SX}>
      <Alert
        severity="error"
        action={
          onRetry && !isAuth ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {isAuth
          ? 'Authentication failed. Please check your credentials and reconnect.'
          : message}
      </Alert>
      {isAuth && onRetry && (
        <Button variant="outlined" onClick={onRetry} sx={{ mt: 2 }}>
          Reconnect
        </Button>
      )}
    </Box>
  );
}
