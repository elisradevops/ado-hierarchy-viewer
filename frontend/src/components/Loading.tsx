import React from 'react';
import { Box, Skeleton } from '@mui/material';

const CONTAINER_SX = { p: 2 } as const;

interface LoadingProps {
  rows?: number;
}

export function Loading({ rows = 8 }: LoadingProps): React.ReactElement {
  return (
    <Box sx={CONTAINER_SX}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="text" height={48} sx={{ mb: 0.5 }} />
      ))}
    </Box>
  );
}
