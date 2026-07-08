import React, { useMemo } from 'react';
import { Box, Link, Typography, alpha } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import LoopIcon from '@mui/icons-material/Loop';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockIcon from '@mui/icons-material/Lock';
import { StateChip } from './StateChip';
import { ProgressBar, TimeProgressBar } from './ProgressBar';
import { buildWorkItemUrl } from '../utils/adoUrlUtils';
import {
  relDisplayName, relChipLabel, relFamilyColor,
  DISCOVERED_REL_COLOR, CUT_CYCLE_COLOR, MULTI_PARENT_COLOR, RESTRICTED_COLOR,
} from '../domain/legendMeta';
import { useHierarchyStore } from '../state/hierarchyStore';
import { formatFieldValue } from '../utils/formatFieldValue';
import { looksLikeHtml } from '../utils/htmlFieldText';
import { HtmlFieldCell } from './HtmlFieldCell';
import type { FlatRow } from '../types';
import type { Density } from '../state/uiPrefsStore';
import { DYNAMIC_COL_PREFIX, type ColumnDef } from '../constants/columns';

const INDENT_PX = 20;
const INDENT_PX_NARROW = 12;
// Deep/degenerate trees (edge case: 20+ levels) must not shrink the elastic Title
// column to nothing. Cap the indent at a fixed number of visual levels — nodes
// beyond the cap still render at their real aria-level, just without further
// horizontal offset.
const MAX_INDENT_LEVELS = 8;

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
  // ADO official default process template colors
  Epic:                    '#773B93',
  Feature:                 '#773B93',
  'User Story':            '#009CCC',
  Story:                   '#009CCC',
  'Product Backlog Item':  '#009CCC',
  Requirement:             '#009CCC',
  Task:                    '#F2CB1D',
  Bug:                     '#CC293D',
  'Test Case':             '#004B50',
  'Test Plan':             '#004B50',
  'Test Suite':            '#004B50',
  Issue:                   '#E06C00',
  Impediment:              '#E06C00',
  'Change Request':        '#E06C00',
  Review:                  '#E06C00',
  Risk:                    '#E06C00',
};
export const TYPE_DOT_FALLBACK = '#8A8886'; // ADO neutral grey

/** ADO Server icon IDs — used to build fallback URLs when API metadata not yet loaded.
 *  URL format: {orgUrl}/_apis/wit/workitemicons/{iconId}?api-version=7.1 */
export const TYPE_ICON_IDS: Record<string, string> = {
  Epic:                    'icon_crown',
  Feature:                 'icon_trophy',
  'User Story':            'icon_chat_bubble',
  Story:                   'icon_chat_bubble',
  'Product Backlog Item':  'icon_list',
  Requirement:             'icon_list',
  Task:                    'icon_clipboard_issue',
  Bug:                     'icon_insect',
  'Test Case':             'icon_test_beaker',
  'Test Plan':             'icon_test_plan',
  'Test Suite':            'icon_test_suite',
  Issue:                   'icon_flame',
  Impediment:              'icon_traffic_cone',
  'Change Request':        'icon_review',
  Review:                  'icon_review',
  Risk:                    'icon_warning',
};

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

// ─── Link-rel chip helpers ──────────────────────────────────────────────────
// (colors + label helpers live in ../domain/legendMeta.ts — shared with LegendPopover)

const REL_CHIP_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  fontSize: '0.58rem',
  fontWeight: 600,
  lineHeight: 1,
  px: '4px',
  py: '2px',
  borderRadius: '4px',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
} as const;

const REL_CHIP_ICON_SX = { fontSize: '10px' } as const;

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
// Row is a CSS Grid div — gridCols prop is applied dynamically per render.
// Active/inactive use separate stable base objects so spread cost is minimal.
const ROW_BASE_SX = {
  display: 'grid',
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
  visibleColumns: ColumnDef[];
  gridCols: string;
  /** Narrow-viewport mode: smaller indent step so the tree stays usable in a small ADO hub panel. */
  isNarrow?: boolean;
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
  visibleColumns,
  gridCols,
  isNarrow,
}: TreeRowProps): React.ReactElement {
  const { node, depth, hasChildren, isExpanded } = row;
  // API color takes precedence; fall back to hardcoded palette
  const typeColor = apiTypeColors?.[node.type] ?? TYPE_COLORS[node.type] ?? TYPE_DOT_FALLBACK;
  const typeBadgeSx = useMemo(
    () => apiTypeColors?.[node.type]
      ? buildTypeBadgeSx(typeColor)
      : (TYPE_BADGE_SX_MAP[node.type] ?? TYPE_BADGE_FALLBACK_SX),
    [node.type, apiTypeColors, typeColor]
  );
  const dotColor = typeColor;
  const iconUrl = apiTypeIconUrls?.[node.type];
  const cellSx = CELL_SX_MAP[density];
  const effortSx = EFFORT_SX_MAP[density];


  const workItemUrl = buildWorkItemUrl(orgUrl, teamProject, node.id);

  const indentSx = useMemo(() => {
    const indentStep = isNarrow ? INDENT_PX_NARROW : INDENT_PX;
    const effectiveDepth = Math.min(depth, MAX_INDENT_LEVELS);
    const width = effectiveDepth * indentStep;
    if (effectiveDepth === 0) return { ...SPACER_SX, width: 0 };
    // Per-level guide rails (one vertical line per ancestor, up to the cap) so lineage
    // stays traceable at depth 20+ instead of a single flat border.
    const railOpacity = Math.min(0.08 + effectiveDepth * 0.015, 0.2);
    return {
      ...SPACER_SX,
      width,
      backgroundImage: `repeating-linear-gradient(to right, rgba(27,69,143,${railOpacity}) 0, rgba(27,69,143,${railOpacity}) 2px, transparent 2px, transparent ${indentStep}px)`,
    };
  }, [depth, isNarrow]);

  // Relationship chip origin (below) still needs to know whether a query is active —
  // rows are no longer dimmed for non-matches (the "Show only matches" toolbar toggle
  // is the sole way to distinguish/filter them now — full legibility everywhere else).
  const usedQueryId = useHierarchyStore(s => s.usedQueryId);

  const rowSx = useMemo(
    () => (isActive
      ? { ...ROW_ACTIVE_SX, gridTemplateColumns: gridCols }
      : { ...ROW_INACTIVE_SX, gridTemplateColumns: gridCols }),
    [isActive, gridCols]
  );

  // Relationship chip: shown on every row that has a parent (linkRel present), so users can
  // always see how a node relates to its parent — not just for non-primary/discovered nodes.
  // Amber "discovered" tint flags nodes reached only via recursive link-type expansion
  // (scaffolding beyond the source query's own results), once a query defines that baseline.
  const showRelChip = !!node.linkRel;
  const isDiscoveredRel = !!usedQueryId && node.linkOrigin === 'link';
  const relColor = node.linkRel ? (isDiscoveredRel ? DISCOVERED_REL_COLOR : relFamilyColor(node.linkRel)) : '';
  const relLabel = node.linkRel ? relChipLabel(node.linkRel) : '';
  const relTitle = node.linkRel ? relDisplayName(node.linkRel) : undefined;

  // Cut-cycle indicator: a directional-spine link on this node pointed back to an ancestor
  // already on this branch, so treeBuilder dropped it to avoid infinite recursion. Reciprocal
  // (isRef) and symmetric (e.g. Related) back-edges are NOT genuine cycles and never appear
  // here (see TreeNode.cutCycles / services/treeBuilder.ts).
  const cutCycles = node.cutCycles;
  const hasCutCycles = !!cutCycles && cutCycles.length > 0;
  const cutCycleTitle = hasCutCycles
    ? cutCycles!
        .map(c => `Cycle via ${relDisplayName(c.via)}: ${c.path.map(id => `#${id}`).join(' → ')}`)
        .join('\n')
    : undefined;

  // Multi-parent indicator: this node's id is a directional-spine child under 2+ distinct
  // parents (a diamond / mis-link), not a cycle (see graphBuilder.findMultiParents).
  const multiParents = node.multiParents;
  const hasMultiParents = !!multiParents && multiParents.length > 1;
  const multiParentTitle = hasMultiParents
    ? `Work item #${node.id} already exists under another parent: ${multiParents!.map(id => `#${id}`).join(', ')}`
    : undefined;

  // Restricted placeholder: this linked id never resolved because the current token has
  // no access to it (distinguished from a deleted/unexplained placeholder — see
  // TreeNode.placeholderReason / treeBuilder.makePlaceholder).
  const isRestricted = node.placeholderReason === 'restricted';

  const expandable = hasChildren && !node.isRef;

  return (
    <Box
      id={`tree-row-${node.id}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? isExpanded : undefined}
      aria-selected={isActive}
      tabIndex={-1}
      onClick={() => onActivate(node.id)}
      sx={rowSx}
    >
      {visibleColumns.map(col => {
        switch (col.key) {
          case 'title':
            return (
              <Box key="title" sx={cellSx}>
                <Box sx={TITLE_INNER_SX}>
                  <Box sx={indentSx} />
                  {expandable ? (
                    isExpanded
                      ? <ExpandMoreIcon sx={CHEVRON_SX} role="button" tabIndex={-1} aria-label="Collapse" onClick={(e) => { e.stopPropagation(); onToggle(node.id); }} />
                      : <ChevronRightIcon sx={CHEVRON_SX} role="button" tabIndex={-1} aria-label="Expand" onClick={(e) => { e.stopPropagation(); onToggle(node.id); }} />
                  ) : (
                    <Box sx={{ ...SPACER_SX, width: 18 }} />
                  )}
                  <Box component="span" sx={{ ...TYPE_DOT_SX, backgroundColor: dotColor }} />
                  {showRelChip && (
                    <Box
                      component="span"
                      sx={{ ...REL_CHIP_SX, bgcolor: alpha(relColor, 0.1), color: relColor, border: `1px solid ${alpha(relColor, 0.25)}` }}
                      title={isDiscoveredRel ? `${relTitle} — found via recursive link-type expansion, not the source query` : relTitle}
                    >
                      {isDiscoveredRel
                        ? <TravelExploreIcon sx={REL_CHIP_ICON_SX} />
                        : <LinkIcon sx={REL_CHIP_ICON_SX} />}
                      {node.isRef ? '↑ ' : ''}{relLabel}
                    </Box>
                  )}
                  <Link href={workItemUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} underline="none" sx={ID_SX}>
                    #{node.id}
                  </Link>
                  <Link href={workItemUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} underline="hover" color="inherit" sx={hasChildren ? TITLE_PARENT_SX : TITLE_LEAF_SX} title={node.title}>
                    {node.title}
                  </Link>
                  {hasCutCycles && (
                    <Box
                      component="span"
                      sx={{ ...REL_CHIP_SX, bgcolor: alpha(CUT_CYCLE_COLOR, 0.1), color: CUT_CYCLE_COLOR, border: `1px solid ${alpha(CUT_CYCLE_COLOR, 0.25)}` }}
                      title={cutCycleTitle}
                    >
                      <LoopIcon sx={REL_CHIP_ICON_SX} />
                      cycle
                    </Box>
                  )}
                  {hasMultiParents && (
                    <Box
                      component="span"
                      sx={{ ...REL_CHIP_SX, bgcolor: alpha(MULTI_PARENT_COLOR, 0.1), color: MULTI_PARENT_COLOR, border: `1px solid ${alpha(MULTI_PARENT_COLOR, 0.25)}` }}
                      title={multiParentTitle}
                    >
                      <WarningAmberIcon sx={REL_CHIP_ICON_SX} />
                      duplicate link
                    </Box>
                  )}
                  {isRestricted && (
                    <Box
                      component="span"
                      sx={{ ...REL_CHIP_SX, bgcolor: alpha(RESTRICTED_COLOR, 0.1), color: RESTRICTED_COLOR, border: `1px solid ${alpha(RESTRICTED_COLOR, 0.25)}` }}
                      title={`No access to #${node.id} with the current token/PAT`}
                    >
                      <LockIcon sx={REL_CHIP_ICON_SX} />
                      no access
                    </Box>
                  )}
                </Box>
              </Box>
            );
          case 'type':
            return (
              <Box key="type" sx={cellSx}>
                <Box component="span" sx={typeBadgeSx}>
                  {iconUrl && (
                    <Box component="img" src={iconUrl} alt="" aria-hidden="true"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      sx={{ width: 12, height: 12, mr: '4px', flexShrink: 0, display: 'inline-block' }}
                    />
                  )}
                  {node.type}
                </Box>
              </Box>
            );
          case 'state':
            return (
              <Box key="state" sx={cellSx}>
                {node.state ? <StateChip state={node.state} /> : <Typography sx={MUTED_SX}>—</Typography>}
              </Box>
            );
          case 'assignedTo':
            return (
              <Box key="assignedTo" sx={cellSx}>
                <Typography sx={node.assignedTo ? TITLE_LEAF_SX : MUTED_SX} noWrap>{node.assignedTo ?? '—'}</Typography>
              </Box>
            );
          case 'areaPath':
            return (
              <Box key="areaPath" sx={cellSx}>
                <Typography sx={node.areaPath ? TITLE_LEAF_SX : MUTED_SX} noWrap title={node.areaPath}>{node.areaPath ?? '—'}</Typography>
              </Box>
            );
          case 'iterationPath': {
            const itPath = node.iterationPath;
            const itDisplay = itPath
              ? (() => { const parts = itPath.split('\\'); return parts.length > 2 ? `…\\${parts.slice(-2).join('\\')}` : itPath; })()
              : null;
            return (
              <Box key="iterationPath" sx={cellSx}>
                <Typography sx={itPath ? TITLE_LEAF_SX : MUTED_SX} noWrap title={itPath ?? undefined}>{itDisplay ?? '—'}</Typography>
              </Box>
            );
          }
          case 'storyPoints':
            return (
              <Box key="storyPoints" sx={effortSx}>
                <Typography sx={node.storyPoints != null ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>{node.storyPoints ?? '—'}</Typography>
              </Box>
            );
          case 'remainingWork':
            return (
              <Box key="remainingWork" sx={effortSx}>
                <Typography sx={node.remainingWork != null ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>{node.remainingWork ?? '—'}</Typography>
              </Box>
            );
          case 'originalEstimate':
            return (
              <Box key="originalEstimate" sx={effortSx}>
                <Typography sx={node.originalEstimate != null ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>{node.originalEstimate ?? '—'}</Typography>
              </Box>
            );
          case 'priority':
            return (
              <Box key="priority" sx={effortSx}>
                <Typography sx={node.priority != null ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>{node.priority ?? '—'}</Typography>
              </Box>
            );
          case 'tags':
            return (
              <Box key="tags" sx={cellSx}>
                <Typography sx={node.tags ? TITLE_LEAF_SX : MUTED_SX} noWrap title={node.tags}>{node.tags ?? '—'}</Typography>
              </Box>
            );
          case 'progressPct':
            return (
              <Box key="progressPct" sx={cellSx}>
                <ProgressBar value={node.progressPct} closedLeaves={node.closedLeaves} totalLeaves={node.totalLeaves} />
              </Box>
            );
          case 'completedWork':
            return (
              <Box key="completedWork" sx={effortSx}>
                <Typography sx={node.completedWork != null ? NUMERIC_VALUE_SX : NUMERIC_MUTED_SX}>{node.completedWork ?? '—'}</Typography>
              </Box>
            );
          case 'time': {
            const hasTimeData = (node.completedWorkTotal > 0 || node.remainingWorkTotal > 0 || node.originalEstimateTotal > 0);
            return (
              <Box key="time" sx={cellSx}>
                {hasTimeData
                  ? <TimeProgressBar completed={node.completedWorkTotal} remaining={node.remainingWorkTotal} estimate={node.originalEstimateTotal} overdueCount={node.overdueCount} />
                  : <Typography sx={NUMERIC_MUTED_SX}>—</Typography>
                }
              </Box>
            );
          }
          default: {
            // Dynamic query column (see constants/columns.ts buildDynamicColumns) — key
            // carries the ADO field reference name after the DYNAMIC_COL_PREFIX.
            if (!col.key.startsWith(DYNAMIC_COL_PREFIX)) return null;
            const refName = col.key.slice(DYNAMIC_COL_PREFIX.length);
            const raw = node.extraFields?.[refName];
            if (typeof raw === 'string' && looksLikeHtml(raw)) {
              return (
                <Box key={col.key} sx={cellSx}>
                  <HtmlFieldCell label={col.label} rawValue={raw} />
                </Box>
              );
            }
            return (
              <Box key={col.key} sx={cellSx}>
                <Typography sx={raw != null ? TITLE_LEAF_SX : MUTED_SX} noWrap>{formatFieldValue(raw)}</Typography>
              </Box>
            );
          }
        }
      })}
    </Box>
  );
});
