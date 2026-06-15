import React from 'react';
import { Box, Link, Typography, alpha } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { StateChip } from './StateChip';
import { ProgressBar } from './ProgressBar';
import { buildWorkItemUrl } from '../utils/adoUrlUtils';
import type { FlatRow } from '../types';
import type { Density } from '../state/uiPrefsStore';
import { GRID_COLS } from '../constants/ui';

const INDENT_PX = 20;

const CHEVRON_SX = { fontSize: 18, cursor: 'pointer', flexShrink: 0, color: 'text.disabled' } as const;
const SPACER_SX = { display: 'inline-block', flexShrink: 0 } as const;

// Title inner container: flex row, clips overflow so long titles never push sibling grid columns
const TITLE_INNER_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  minWidth: 0,
  overflow: 'hidden',
} as const;

export const TYPE_COLORS: Record<string, string> = {
  Epic: '#8B5CF6',
  Feature: '#3B82F6',
  'User Story': '#0EA5E9',
  Story: '#0EA5E9',
  Task: '#64748B',
  Bug: '#EF4444',
  'Test Case': '#F97316',
  Issue: '#F59E0B',
  Requirement: '#6366F1',
  'Change Request': '#EC4899',
};
const TYPE_DOT_FALLBACK = '#94A3B8';

function buildTypeBadgeSx(color: string) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '0.68rem',
    fontWeight: 600,
    lineHeight: 1,
    px: '6px',
    py: '3px',
    borderRadius: '999px',
    whiteSpace: 'nowrap' as const,
    backgroundColor: alpha(color, 0.1),
    color,
    border: `1px solid ${alpha(color, 0.25)}`,
  };
}

const TYPE_BADGE_SX_MAP: Record<string, ReturnType<typeof buildTypeBadgeSx>> = Object.fromEntries(
  Object.entries(TYPE_COLORS).map(([type, color]) => [type, buildTypeBadgeSx(color)])
);
const TYPE_BADGE_FALLBACK_SX = buildTypeBadgeSx(TYPE_DOT_FALLBACK);

const TYPE_DOT_SX = {
  display: 'inline-block',
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
} as const;

const ID_SX = {
  fontSize: '0.68rem',
  fontFamily: 'ui-monospace, "JetBrains Mono", "Fira Code", monospace',
  color: 'text.disabled',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
  letterSpacing: '-0.01em',
} as const;

const TITLE_LEAF_SX = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontSize: '0.8125rem',
  lineHeight: 1.4,
  color: 'text.primary',
  minWidth: 0,
  fontWeight: 400,
} as const;

// Parent rows (hasChildren) get stronger weight for hierarchy scanning
const TITLE_PARENT_SX = { ...TITLE_LEAF_SX, fontWeight: 600 } as const;

// ─── Row sx ─────────────────────────────────────────────────────────────────
// Row is a CSS Grid div — same GRID_COLS as header guarantees column alignment.
// Active/inactive use separate stable objects so React.memo sees no churn.
const ROW_BASE_SX = {
  display: 'grid',
  gridTemplateColumns: GRID_COLS,
  alignItems: 'center',
  cursor: 'pointer',
  borderBottom: '1px solid',
  borderColor: 'divider',
  '&:focus-visible': { outline: '2px solid #1B458F', outlineOffset: -2, position: 'relative' as const, zIndex: 1 },
} as const;

const ROW_ACTIVE_SX = {
  ...ROW_BASE_SX,
  bgcolor: 'rgba(27,69,143,0.08)',
  '&:hover': { bgcolor: 'rgba(27,69,143,0.12)' },
} as const;

const ROW_INACTIVE_SX = {
  ...ROW_BASE_SX,
  '&:hover': { bgcolor: 'rgba(27,69,143,0.04)' },
} as const;

// ─── Cell sx ────────────────────────────────────────────────────────────────
// Pre-computed per density — stable references, no per-render allocation.
const CELL_BASE_SX = {
  px: 1.5,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
} as const;

const EFFORT_BASE_SX = { ...CELL_BASE_SX, justifyContent: 'flex-end' } as const;

const CELL_SX_MAP: Record<Density, typeof CELL_BASE_SX & { py: number }> = {
  comfortable: { ...CELL_BASE_SX, py: 0.75 },
  compact:     { ...CELL_BASE_SX, py: 0.25 },
};

const EFFORT_SX_MAP: Record<Density, typeof EFFORT_BASE_SX & { py: number }> = {
  comfortable: { ...EFFORT_BASE_SX, py: 0.75 },
  compact:     { ...EFFORT_BASE_SX, py: 0.25 },
};

// ─── Text sx ────────────────────────────────────────────────────────────────
const MUTED_SX = { fontSize: '0.8125rem', color: 'text.disabled' } as const;
const NUMERIC_MUTED_SX = { ...MUTED_SX, fontVariantNumeric: 'tabular-nums' } as const;
const NUMERIC_VALUE_SX = { ...NUMERIC_MUTED_SX, color: 'text.primary' } as const;

// ─── Props ──────────────────────────────────────────────────────────────────
interface TreeRowProps {
  row: FlatRow;
  orgUrl: string;
  teamProject: string;
  isActive: boolean;
  density: Density;
  onToggle: (id: number) => void;
  onActivate: (id: number) => void;
  /** API-fetched type colors — keyed by type name, value is '#hexcolor'. Falls back to TYPE_COLORS. */
  apiTypeColors?: Record<string, string>;
  /** API-fetched icon URLs — keyed by type name. Rendered as small img; hides on load error. */
  apiTypeIconUrls?: Record<string, string>;
}

export const TreeRow = React.memo(function TreeRow({
  row,
  orgUrl,
  teamProject,
  isActive,
  density,
  onToggle,
  onActivate,
  apiTypeColors,
  apiTypeIconUrls,
}: TreeRowProps): React.ReactElement {
  const { node, depth, hasChildren, isExpanded } = row;
  // API color takes precedence; fall back to hardcoded palette
  const typeColor = apiTypeColors?.[node.type] ?? TYPE_COLORS[node.type] ?? TYPE_DOT_FALLBACK;
  const typeBadgeSx = apiTypeColors?.[node.type]
    ? buildTypeBadgeSx(typeColor)
    : (TYPE_BADGE_SX_MAP[node.type] ?? TYPE_BADGE_FALLBACK_SX);
  const dotColor = typeColor;
  const iconUrl = apiTypeIconUrls?.[node.type];
  const cellSx = CELL_SX_MAP[density];
  const effortSx = EFFORT_SX_MAP[density];

  const handleToggle = (): void => { onToggle(node.id); };
  const handleActivate = (): void => { onActivate(node.id); };

  const workItemUrl = buildWorkItemUrl(orgUrl, teamProject, node.id);

  return (
    <Box tabIndex={0} onClick={handleActivate} sx={isActive ? ROW_ACTIVE_SX : ROW_INACTIVE_SX}>

      {/* Title cell — indent + chevron + dot + id + title, all clipped inside this column */}
      <Box sx={cellSx}>
        <Box sx={TITLE_INNER_SX}>
          {/* Depth guide line — computed per row, exception to no-inline rule */}
          <Box
            sx={{
              ...SPACER_SX,
              width: depth * INDENT_PX,
              ...(depth > 0 && {
                borderLeft: '2px solid',
                borderColor: `rgba(27,69,143,${Math.min(0.07 + depth * 0.04, 0.2)})`,
              }),
            }}
          />
          {hasChildren ? (
            isExpanded
              ? <ExpandMoreIcon sx={CHEVRON_SX} onClick={(e) => { e.stopPropagation(); handleToggle(); }} />
              : <ChevronRightIcon sx={CHEVRON_SX} onClick={(e) => { e.stopPropagation(); handleToggle(); }} />
          ) : (
            <Box sx={{ ...SPACER_SX, width: 18 }} />
          )}
          <Box component="span" sx={{ ...TYPE_DOT_SX, backgroundColor: dotColor }} />
          <Link
            href={workItemUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            underline="none"
            sx={ID_SX}
          >
            #{node.id}
          </Link>
          <Typography component="span" sx={hasChildren ? TITLE_PARENT_SX : TITLE_LEAF_SX}>
            {node.title}
          </Typography>
        </Box>
      </Box>

      {/* Type cell — icon shown when API URL available, hidden on load error */}
      <Box sx={cellSx}>
        <Box component="span" sx={typeBadgeSx}>
          {iconUrl && (
            <Box
              component="img"
              src={iconUrl}
              alt=""
              aria-hidden="true"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
              sx={{ width: 12, height: 12, mr: '4px', flexShrink: 0, display: 'inline-block' }}
            />
          )}
          {node.type}
        </Box>
      </Box>

      {/* State cell */}
      <Box sx={cellSx}>
        {node.state
          ? <StateChip state={node.state} />
          : <Typography sx={MUTED_SX}>—</Typography>}
      </Box>

      {/* Progress cell */}
      <Box sx={cellSx}>
        <ProgressBar value={node.progressPct} />
      </Box>

      {/* Effort cell */}
      <Box sx={effortSx}>
        <Typography sx={node.effort ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>
          {node.effort || '—'}
        </Typography>
      </Box>

      {/* Total Effort cell */}
      <Box sx={effortSx}>
        <Typography sx={node.effortTotal ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>
          {node.effortTotal || '—'}
        </Typography>
      </Box>
    </Box>
  );
});
