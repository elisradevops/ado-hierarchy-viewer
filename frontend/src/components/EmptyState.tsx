import React from 'react';
import { Box, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

const CONTAINER_SX = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  py: 10,
  color: 'text.secondary',
} as const;
const ICON_SX = { fontSize: 72, mb: 2, opacity: 0.3, color: 'text.disabled' } as const;
const HEADING_SX = { fontWeight: 600, color: 'text.secondary' } as const;
const BODY_SX = { color: 'text.disabled' } as const;

interface EmptyStateProps {
  orphanIds?: number[];
  hasSearchFilter?: boolean;
}

export function EmptyState({ orphanIds = [], hasSearchFilter = false }: EmptyStateProps): React.ReactElement {
  return (
    <Box sx={CONTAINER_SX}>
      <InboxIcon sx={ICON_SX} />
      <Typography variant="h6" sx={HEADING_SX}>
        {hasSearchFilter ? 'No results match your filter' : 'No work items found'}
      </Typography>
      {orphanIds.length > 0 && !hasSearchFilter && (
        <Typography variant="body2" sx={{ mt: 1, ...BODY_SX }}>
          {orphanIds.length} unreachable item{orphanIds.length !== 1 ? 's' : ''} found (no hierarchy links)
        </Typography>
      )}
    </Box>
  );
}
