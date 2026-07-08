import React from 'react';
import { Box, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

const CONTAINER_SX = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
  px: 4,
  userSelect: 'none' as const,
} as const;

const ICON_WRAP_SX = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  bgcolor: 'rgba(27,69,143,0.07)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  mb: 1,
} as const;

const ICON_SX = { fontSize: 36, color: 'primary.main', opacity: 0.6 } as const;

const TITLE_SX = { fontWeight: 600, color: 'text.secondary', textAlign: 'center' as const } as const;

const BODY_SX = {
  color: 'text.disabled',
  textAlign: 'center' as const,
  maxWidth: 320,
  lineHeight: 1.6,
  fontSize: '0.85rem',
} as const;

const STEP_ROW_SX = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 0.75,
  mt: 1,
  alignItems: 'flex-start' as const,
} as const;

const STEP_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  fontSize: '0.8rem',
  color: 'text.disabled',
} as const;

const NUM_SX = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  bgcolor: 'rgba(27,69,143,0.09)',
  color: 'primary.main',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.72rem',
  fontWeight: 700,
  flexShrink: 0,
} as const;

export function WelcomeState(): React.ReactElement {
  return (
    <Box sx={CONTAINER_SX}>
      <Box sx={ICON_WRAP_SX}>
        <AccountTreeIcon sx={ICON_SX} />
      </Box>
      <Typography variant="h6" sx={TITLE_SX}>
        Visualize your work item hierarchy
      </Typography>
      <Typography sx={BODY_SX}>
        Connect to Azure DevOps and explore linked work items as an interactive tree.
      </Typography>
      <Box sx={STEP_ROW_SX}>
        {[
          'Select a Team Project in the sidebar',
          'Pick a Source Query — required, it\'s the tree\'s baseline',
          'Add Link Types to extend the tree further (optional)',
          'Click Load Hierarchy',
        ].map((step, i) => (
          <Box key={i} sx={STEP_SX}>
            <Box sx={NUM_SX}>{i + 1}</Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>{step}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
