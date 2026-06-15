import React from 'react';
import { Box, Typography } from '@mui/material';
import { safeToFixed } from '../utils/numberGuards';

const CONTAINER_SX = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 90 } as const;

const BAR_TRACK_SX = {
  flexGrow: 1,
  height: 5,
  borderRadius: 3,
  bgcolor: 'rgba(15,23,42,0.07)',
  overflow: 'hidden',
  position: 'relative' as const,
} as const;

const LABEL_SX = {
  whiteSpace: 'nowrap' as const,
  minWidth: 36,
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
  color: 'text.secondary',
  textAlign: 'right' as const,
} as const;

function getBarColor(value: number): string {
  if (value >= 80) return '#15803d';   // green
  if (value >= 40) return '#1B458F';   // primary navy
  if (value > 0)   return '#f59e0b';   // amber
  return 'rgba(15,23,42,0.15)';        // empty
}

interface ProgressBarProps {
  value: number; // 0–100
}

export const ProgressBar = React.memo(function ProgressBar({ value }: ProgressBarProps): React.ReactElement {
  const display = safeToFixed(value, 1);
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const barColor = getBarColor(clamped);

  return (
    <Box sx={CONTAINER_SX}>
      <Box sx={BAR_TRACK_SX}>
        {/* Dynamic width + color — computed values, exception to no-inline rule */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${clamped}%`, bgcolor: barColor, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </Box>
      <Typography sx={LABEL_SX}>
        {display}%
      </Typography>
    </Box>
  );
});
