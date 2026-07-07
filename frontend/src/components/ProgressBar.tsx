import React from 'react';
import { Box, Typography } from '@mui/material';
import { safeToFixed } from '../utils/numberGuards';

// Overdue is a distinct semantic state (work exceeds estimate) — not on the
// green/navy/amber progress scale, so it gets its own reserved color.
const OVERDUE_COLOR = '#B91C1C';
const UNDER_ESTIMATE_COLOR = '#15803d';

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
  /** Rolled-up Microsoft.VSTS.Scheduling.OriginalEstimate; 0/undefined = no estimate baseline. */
  estimate?: number;
  /** Count of descendants whose own completedWork exceeded their own estimate. Unlike the
   *  completed/estimate sums above, this can't be netted against a sibling finishing early —
   *  it always wins over the net-based label so a single overdue item never gets hidden by
   *  rollup cancellation (see TreeNode.overdueCount / treeBuilder.ts). */
  overdueCount?: number;
}

// Hybrid model: when an OriginalEstimate baseline exists, progress is measured
// against it (so work can run "over" 100% — overdue) and completing under the
// estimate is called out explicitly. With no estimate, falls back to a plain
// burn-down split of completed vs remaining (can never be "overdue" by
// construction — there is nothing to be over).
export const TimeProgressBar = React.memo(function TimeProgressBar({ completed, remaining, estimate, overdueCount }: TimeProgressBarProps): React.ReactElement {
  const safeCompleted = Number.isFinite(completed) && completed > 0 ? completed : 0;
  const safeRemaining = Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
  const safeEstimate = Number.isFinite(estimate) && (estimate as number) > 0 ? (estimate as number) : 0;
  const safeOverdueCount = Number.isFinite(overdueCount) && (overdueCount as number) > 0 ? (overdueCount as number) : 0;

  const hasEstimate = safeEstimate > 0;
  const baseline = hasEstimate ? safeEstimate : safeCompleted + safeRemaining;
  const rawPct = baseline > 0 ? (safeCompleted / baseline) * 100 : 0;
  // This node's own net deviation (for a leaf, this IS "is this item itself overdue" — its
  // completed/estimate are its own values, not a rollup). Checked before overdueCount so a
  // leaf that's individually over always gets its own precise "+Xh over", not the generic
  // count message (overdueCount includes the node's own contribution too).
  const isOverdue = hasEstimate && safeCompleted > safeEstimate;
  const clamped = Math.min(100, Math.max(0, rawPct));

  let label: string;
  let textColor: string;
  let barColor: string;
  if (isOverdue) {
    label = `+${safeToFixed(safeCompleted - safeEstimate, 1)}h over`;
    textColor = OVERDUE_COLOR;
    barColor = OVERDUE_COLOR;
  } else if (safeOverdueCount > 0) {
    // This node itself isn't net-over, but a descendant is — the classic masking case
    // (e.g. one child 5h under + another 5h over nets this row to "done"). Surfaces the
    // count only when the node's own number wouldn't have shown a problem.
    label = safeOverdueCount === 1 ? '1 item over budget' : `${safeOverdueCount} items over budget`;
    textColor = OVERDUE_COLOR;
    barColor = OVERDUE_COLOR;
  } else if (safeRemaining > 0) {
    label = `${safeToFixed(safeRemaining, 1)}h left`;
    textColor = getProgressTextColor(clamped);
    barColor = getBarColor(clamped);
  } else if (hasEstimate && safeCompleted < safeEstimate) {
    label = `${safeToFixed(safeEstimate - safeCompleted, 1)}h under`;
    textColor = UNDER_ESTIMATE_COLOR;
    barColor = UNDER_ESTIMATE_COLOR;
  } else if (baseline > 0) {
    label = 'done';
    textColor = getProgressTextColor(clamped);
    barColor = getBarColor(clamped);
  } else {
    label = '—';
    textColor = getProgressTextColor(0);
    barColor = getBarColor(0);
  }

  return (
    <Box sx={PROGRESS_CONTAINER_SX}>
      <Box sx={PROGRESS_HEADER_SX}>
        <Typography sx={{ ...PROGRESS_COUNT_SX, color: textColor, fontWeight: 600 }}>{label}</Typography>
      </Box>
      <Box sx={PROGRESS_BAR_TRACK_SX}>
        {/* Dynamic width + color — computed values, exception to no-inline rule */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${(safeOverdueCount > 0 || isOverdue) ? 100 : clamped}%`, bgcolor: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </Box>
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
