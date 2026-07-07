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

// ─── Progress cell (dominant %, secondary count + bar) ─────────────────────
// Percentage is the primary scan target — bold, color-coded, on its own line
// above a thin confirmatory bar and a muted leaf count.
const PROGRESS_CONTAINER_SX = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
  minWidth: 90,
  width: '100%',
} as const;

const PROGRESS_HEADER_SX = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 1,
} as const;

const PROGRESS_PCT_SX = {
  fontWeight: 600,
  fontSize: '0.74rem',
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
} as const;

const PROGRESS_COUNT_SX = {
  fontSize: '0.66rem',
  fontVariantNumeric: 'tabular-nums',
  color: 'text.disabled',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
} as const;

const PROGRESS_BAR_TRACK_SX = {
  height: 3,
  borderRadius: 2,
  bgcolor: 'rgba(15,23,42,0.07)',
  overflow: 'hidden',
  position: 'relative' as const,
} as const;

function getBarColor(value: number): string {
  if (value >= 80) return '#15803d';   // green
  if (value >= 40) return '#1B458F';   // primary navy
  if (value > 0)   return '#f59e0b';   // amber
  return 'rgba(15,23,42,0.15)';        // empty (bar fill — intentionally near-invisible)
}

// The 0% bar fill color is deliberately near-invisible against the track; reused as text
// color it would be illegible, so the percentage number gets a distinct, still-muted shade.
function getProgressTextColor(value: number): string {
  return value > 0 ? getBarColor(value) : 'rgba(15,23,42,0.35)';
}

interface ProgressBarProps {
  value: number; // 0–100
  closedLeaves?: number;
  totalLeaves?: number;
}

interface TimeProgressBarProps {
  completed: number;
  remaining: number;
}

export const TimeProgressBar = React.memo(function TimeProgressBar({ completed, remaining }: TimeProgressBarProps): React.ReactElement {
  const total = (Number.isFinite(completed) ? completed : 0) + (Number.isFinite(remaining) ? remaining : 0);
  const pct = total > 0 ? Math.min(100, ((Number.isFinite(completed) ? completed : 0) / total) * 100) : 0;
  const barColor = getBarColor(pct);
  const label = total > 0 ? `${Number.isFinite(remaining) ? remaining : 0}h left` : '—';
  return (
    <Box sx={CONTAINER_SX}>
      <Box sx={BAR_TRACK_SX}>
        <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, bgcolor: barColor, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </Box>
      <Typography sx={LABEL_SX}>{label}</Typography>
    </Box>
  );
});

export const ProgressBar = React.memo(function ProgressBar({ value, closedLeaves, totalLeaves }: ProgressBarProps): React.ReactElement {
  const display = safeToFixed(value, 1);
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const barColor = getBarColor(clamped);
  const textColor = getProgressTextColor(clamped);
  const hasCounts = Number.isFinite(closedLeaves) && Number.isFinite(totalLeaves);

  return (
    <Box sx={PROGRESS_CONTAINER_SX}>
      <Box sx={PROGRESS_HEADER_SX}>
        <Typography sx={{ ...PROGRESS_PCT_SX, color: textColor }}>{display}%</Typography>
        {hasCounts && (
          <Typography sx={PROGRESS_COUNT_SX}>{closedLeaves}/{totalLeaves}</Typography>
        )}
      </Box>
      <Box sx={PROGRESS_BAR_TRACK_SX}>
        {/* Dynamic width + color — computed values, exception to no-inline rule */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${clamped}%`, bgcolor: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </Box>
    </Box>
  );
});
