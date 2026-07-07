import React, { useMemo } from 'react';
import { Box, Chip, Typography, alpha } from '@mui/material';
import type { SummaryStats } from '../selectors/summaryStats';
import { getStateDotColor } from '../theme/stateDot';
import { TYPE_COLORS } from './TreeRow';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';

interface HierarchySummaryProps {
  stats: SummaryStats;
  onFilterByType?: (type: string) => void;
  onFilterByState?: (state: string) => void;
}

// Vertical sidebar layout
const STRIP_SX = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 1.5,
  px: 2,
  py: 1.5,
} as const;

const SECTION_LABEL_SX = {
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'text.disabled',
  pb: 0.25,
} as const;

const STAT_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
} as const;

const STAT_LABEL_SX = {
  fontSize: '0.75rem',
  color: 'text.secondary',
} as const;

const STAT_VALUE_SX = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'text.primary',
  fontVariantNumeric: 'tabular-nums',
} as const;

const BAR_TRACK_SX = {
  flex: 1,
  height: 5,
  borderRadius: 3,
  bgcolor: 'rgba(15,23,42,0.07)',
  overflow: 'hidden',
  position: 'relative' as const,
} as const;

const CHIP_WRAP_SX = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 0.5,
} as const;

function buildTypeChipSx(color: string) {
  return {
    fontSize: '0.65rem',
    height: 18,
    cursor: 'pointer',
    backgroundColor: alpha(color, 0.1),
    color,
    border: `1px solid ${alpha(color, 0.25)}`,
    '& .MuiChip-label': { px: '6px', fontWeight: 600 },
    '&:hover': { backgroundColor: alpha(color, 0.18) },
  };
}

function buildStateChipSx(color: string) {
  return {
    fontSize: '0.65rem',
    height: 18,
    cursor: 'pointer',
    backgroundColor: alpha(color, 0.1),
    color,
    border: `1px solid ${alpha(color, 0.25)}`,
    '& .MuiChip-label': { px: '6px' },
    '&:hover': { backgroundColor: alpha(color, 0.18) },
  };
}

function getProgressColor(value: number): string {
  if (value >= 80) return '#15803d';
  if (value >= 40) return '#1B458F';
  if (value > 0)   return '#f59e0b';
  return 'rgba(15,23,42,0.2)';
}

export const HierarchySummary = React.memo(function HierarchySummary({
  stats,
  onFilterByType,
  onFilterByState,
}: HierarchySummaryProps): React.ReactElement {
  const { totalItems, overallProgressPct, totalEffort, completedLeaves, totalLeaves, byType, byState } = stats;
  const apiTypeColors = useWorkItemMetaStore(s => s.typeColors);
  const apiStateColors = useWorkItemMetaStore(s => s.stateColors);
  const progressPct = Number.isFinite(overallProgressPct) ? overallProgressPct : 0;
  const clamped = Math.min(100, Math.max(0, progressPct));

  const typeChipSxMap = useMemo(
    () => Object.fromEntries(
      Object.keys(byType).map(type => {
        const color = apiTypeColors[type] ?? TYPE_COLORS[type] ?? '#94A3B8';
        return [type, buildTypeChipSx(color)];
      })
    ),
    [byType, apiTypeColors]
  );

  const stateChipSxMap = useMemo(
    () => Object.fromEntries(
      Object.entries(byState).map(([state]) => {
        const color = apiStateColors[state.toLowerCase()] ?? getStateDotColor(state);
        return [state, buildStateChipSx(color)];
      })
    ),
    [byState, apiStateColors]
  );

  return (
    <Box sx={STRIP_SX}>
      <Typography sx={SECTION_LABEL_SX}>Summary</Typography>

      {/* Count + Effort row */}
      <Box sx={STAT_ROW_SX}>
        <Typography sx={STAT_LABEL_SX}>{totalItems} items</Typography>
        {totalEffort > 0 && (
          <Typography sx={STAT_LABEL_SX}>{totalEffort} pts</Typography>
        )}
      </Box>

      {/* Progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={BAR_TRACK_SX}>
          {/* Dynamic — computed value exception */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${clamped}%`, bgcolor: getProgressColor(clamped), borderRadius: 3 }} />
        </Box>
        <Typography sx={STAT_VALUE_SX}>{completedLeaves}/{totalLeaves} · {progressPct.toFixed(0)}%</Typography>
      </Box>

      {/* Types */}
      {Object.keys(byType).length > 0 && (
        <Box>
          <Box sx={CHIP_WRAP_SX}>
            {Object.entries(byType).map(([type, count]) => (
                <Chip
                  key={type}
                  label={`${type} ${count}`}
                  size="small"
                  sx={typeChipSxMap[type]}
                  onClick={onFilterByType ? () => onFilterByType(type) : undefined}
                />
            ))}
          </Box>
        </Box>
      )}

      {/* States */}
      {Object.keys(byState).length > 0 && (
        <Box sx={CHIP_WRAP_SX}>
          {Object.entries(byState).map(([state, count]) => (
              <Chip
                key={state}
                label={`${state} ${count}`}
                size="small"
                sx={stateChipSxMap[state]}
                onClick={onFilterByState ? () => onFilterByState(state) : undefined}
              />
          ))}
        </Box>
      )}
    </Box>
  );
});
