import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box, Paper, TableSortLabel } from '@mui/material';
import { TreeRow, TYPE_ICON_IDS } from './TreeRow';
import { buildWorkItemUrl } from '../utils/adoUrlUtils';
import { HierarchyToolbar } from './HierarchyToolbar';
import { EmptyState } from './EmptyState';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useConnectionStore } from '../state/connectionStore';
import { useConfigStore } from '../state/configStore';
import { useUiPrefsStore } from '../state/uiPrefsStore';
import { useExpandCollapse } from '../hooks/useExpandCollapse';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { flattenTree } from '../selectors/flattenTree';
import { filterRows } from '../selectors/filterRows';
import { sortRows, type SortCol } from '../selectors/sortRows';
import { ROW_HEIGHT } from '../constants/ui';
import { COLUMN_DEFS, buildGridCols, buildMinTableWidth, type ColumnDef } from '../constants/columns';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import type { FlatRow } from '../types';

// Header uses the same gridCols as every data row — guarantees pixel-exact column alignment.
const HEADER_ROW_BASE_SX = {
  display: 'grid',
  alignItems: 'center',
  borderBottom: '2px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  flexShrink: 0,
} as const;

const HEADER_CELL_SX = {
  userSelect: 'none' as const,
  px: 1.5,
  py: 1,
  fontSize: '0.695rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
  '& .MuiTableSortLabel-root': { color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' },
  '& .MuiTableSortLabel-root.Mui-active': { color: 'primary.main' },
} as const;

// MIN_TABLE_WIDTH is now computed dynamically per visibleColumns — see useMemo below

// Resize handle — absolute, right-edge of each header cell
const RESIZE_HANDLE_SX = {
  position: 'absolute',
  right: 0,
  top: 0,
  height: '100%',
  width: '6px',
  cursor: 'col-resize',
  zIndex: 1,
  '&:hover': { bgcolor: 'primary.main', opacity: 0.4 },
} as const;

// Outer: clips vertically, enables horizontal scroll
const SCROLL_OUTER_SX = { flexGrow: 1, overflowX: 'auto', overflowY: 'hidden' } as const;
// Inner: enforces minimum table width so columns never collapse below readable size
const SCROLL_INNER_SX = { height: '100%', display: 'flex', flexDirection: 'column' as const };
const BODY_WRAPPER_SX = { flexGrow: 1, overflow: 'hidden' } as const;
// Virtuoso's default scroller sets overflowY:auto but leaves overflowX unset.
// Per CSS spec, setting one overflow axis non-visible promotes the other from 'visible'→'auto',
// which creates a spurious second horizontal scrollbar inside SCROLL_OUTER.
// Hide it here — SCROLL_OUTER is the sole horizontal scroll surface.
const VIRTUOSO_SCROLLER_STYLE = { height: '100%', overflowX: 'hidden' as const };

function VirtuosoEmptyPlaceholder({ context }: { context?: { hasFilter: boolean } }): React.ReactElement {
  return <EmptyState hasSearchFilter={context?.hasFilter ?? false} />;
}

interface HierarchyTreeTableProps {
  onRefresh: () => void;
}

export function HierarchyTreeTable({ onRefresh }: HierarchyTreeTableProps): React.ReactElement {
  const rootIds = useHierarchyStore(s => s.rootIds);
  const rowsById = useHierarchyStore(s => s.rowsById);
  const totalRows = useHierarchyStore(s => s.rowCount);
  const { expandedIds, toggle, expandAll, collapseAll } = useExpandCollapse();
  const { sort, filter, setSort, density, hiddenCols, colWidths, setColWidth, showOnlyMatches } = useUiPrefsStore();
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const teamProject = useConfigStore(s => s.config.teamProject);
  const apiTypeColors = useWorkItemMetaStore(s => s.typeColors);
  const rawApiTypeIconUrls = useWorkItemMetaStore(s => s.typeIconUrls);
  const fieldsByType = useWorkItemMetaStore(s => s.fieldsByType);

  // Build fallback icon URLs from orgUrl + ADO icon IDs; API-fetched URLs take precedence
  const apiTypeIconUrls = useMemo(() => {
    if (!orgUrl) return rawApiTypeIconUrls;
    const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const fallbacks: Record<string, string> = {};
    for (const [type, iconId] of Object.entries(TYPE_ICON_IDS)) {
      fallbacks[type] = `${base}_apis/wit/workitemicons/${iconId}?api-version=7.1`;
    }
    return { ...fallbacks, ...rawApiTypeIconUrls };
  }, [orgUrl, rawApiTypeIconUrls]);

  // P2: derive a stable string key from present types so visibleColumns does not
  // recompute on every re-fetch when the WIT type set has not changed.
  // P3: effortField removed — it was a dead dep (never read in the factory body).
  const presentTypesKey = useMemo(
    () => [...new Set(Object.values(rowsById).map(n => n.type))].sort().join(','),
    [rowsById]
  );

  const visibleColumns = useMemo((): ColumnDef[] => {
    // Collect present WIT types from the stable key
    const presentTypes = new Set<string>(presentTypesKey ? presentTypesKey.split(',') : []);
    // Union of all supported fields across present types
    const supportedFields = new Set<string>();
    if (Object.keys(fieldsByType).length > 0) {
      for (const type of presentTypes) {
        for (const f of (fieldsByType[type] ?? [])) supportedFields.add(f);
      }
    }
    return COLUMN_DEFS.filter(col => {
      if (col.always) return true;
      // User hid this column explicitly — never show unless it's always-visible
      if (hiddenCols.includes(col.key)) return false;
      if (!col.field) return true;                        // computed columns (effort, progress) always show
      if (Object.keys(fieldsByType).length === 0) return true; // meta not loaded — show all (fallback)
      return supportedFields.has(col.field);
    });
  }, [presentTypesKey, fieldsByType, hiddenCols]);

  const gridCols = useMemo(() => buildGridCols(visibleColumns, colWidths), [visibleColumns, colWidths]);
  const minTableWidth = useMemo(() => buildMinTableWidth(visibleColumns, 200, colWidths), [visibleColumns, colWidths]);
  // P4: stable sx object — avoids new object on every render
  const scrollInnerSx = useMemo(() => ({ ...SCROLL_INNER_SX, minWidth: minTableWidth }), [minTableWidth]);

  const headerRowSx = useMemo(
    () => ({ ...HEADER_ROW_BASE_SX, gridTemplateColumns: gridCols }),
    [gridCols]
  );

  const [activeId, setActiveId] = useState<number | null>(null);
  // P1: ref mirrors activeId so renderRow does not need it as a dep — prevents
  // full virtual list re-render on every row click.
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  const roots = useMemo(
    () => rootIds.map(id => rowsById[id]).filter(Boolean),
    [rootIds, rowsById]
  );

  const visibleRows: FlatRow[] = useMemo(() => {
    const flat = flattenTree(roots, expandedIds);
    const filtered = filterRows(flat, { ...filter, matchesOnly: showOnlyMatches });
    return sortRows(filtered, sort.col as SortCol, sort.dir);
  }, [roots, expandedIds, filter, showOnlyMatches, sort]);

  // #4: memoize O(N) findIndex so it only runs when visibleRows or activeId changes
  const activeIndex = useMemo(
    () => (activeId !== null ? visibleRows.findIndex(r => r.node.id === activeId) : -1),
    [visibleRows, activeId]
  );

  // #5: stable callbacks so React.memo on TreeRow actually skips re-renders
  const handleToggle = useCallback((id: number): void => toggle(id), [toggle]);
  const handleActivate = useCallback((id: number): void => setActiveId(id), []);

  // Column resize: pointer-drag on the header resize handle
  const rafRef = useRef<number | null>(null);
  const onResizeStart = useCallback((key: string, startX: number, startWidth: number) => {
    const onMove = (e: PointerEvent): void => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setColWidth(key, startWidth + (e.clientX - startX));
      });
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [setColWidth]);

  const { onKeyDown } = useKeyboardNav({
    rowCount: visibleRows.length,
    activeIndex,
    onSetActive: (idx) => setActiveId(visibleRows[idx]?.node.id ?? null),
    onToggleExpand: (idx) => { const row = visibleRows[idx]; if (row) toggle(row.node.id); },
    onOpenItem: (idx) => {
      const row = visibleRows[idx];
      if (row) window.open(buildWorkItemUrl(orgUrl, teamProject, row.node.id), '_blank', 'noopener');
    },
  });

  const handleColSort = (col: SortCol): void => {
    setSort({ col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' });
  };

  const hasFilter = !!(filter.text || filter.types.length || filter.states.length);

  const virtuosoComponents = useMemo(() => ({
    EmptyPlaceholder: VirtuosoEmptyPlaceholder,
  }), []);

  // M9+P1: stable itemContent — activeIdRef.current read at render time, not captured in closure,
  // so row activation does not invalidate the renderer and re-render all visible rows.
  const renderRow = useCallback((_idx: number, row: FlatRow) => (
    <TreeRow
      row={row}
      orgUrl={orgUrl}
      teamProject={teamProject}
      isActive={row.node.id === activeIdRef.current}
      density={density}
      onToggle={handleToggle}
      onActivate={handleActivate}
      apiTypeColors={apiTypeColors}
      apiTypeIconUrls={apiTypeIconUrls}
      visibleColumns={visibleColumns}
      gridCols={gridCols}
    />
  ), [orgUrl, teamProject, density, handleToggle, handleActivate, apiTypeColors, apiTypeIconUrls, visibleColumns, gridCols]);

  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <HierarchyToolbar
        rows={visibleRows}
        totalRows={totalRows}
        onRefresh={onRefresh}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      {/* Horizontal scroll zone — toolbar stays fixed above, header+body scroll together */}
      <Box sx={SCROLL_OUTER_SX}>
        <Box sx={scrollInnerSx}>
          {/* Grid header */}
          <Box sx={headerRowSx}>
            {visibleColumns.map(col => (
              <Box
                key={col.key}
                sx={{ ...HEADER_CELL_SX, textAlign: col.align ?? 'left', position: 'relative' }}
              >
                <TableSortLabel
                  active={sort.col === col.key}
                  direction={sort.col === col.key ? sort.dir : 'asc'}
                  onClick={() => handleColSort(col.key as SortCol)}
                >
                  {col.label}
                </TableSortLabel>
                <Box
                  sx={RESIZE_HANDLE_SX}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const cell = e.currentTarget.parentElement;
                    const startWidth = cell ? cell.getBoundingClientRect().width : (colWidths[col.key] ?? 120);
                    onResizeStart(col.key, e.clientX, startWidth);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
              </Box>
            ))}
          </Box>

          {/* Virtual body — each row rendered by TreeRow using the same gridCols */}
          <Box sx={BODY_WRAPPER_SX} onKeyDown={onKeyDown}>
            <Virtuoso
              data={visibleRows}
              itemContent={renderRow}
              components={virtuosoComponents}
              context={{ hasFilter }}
              style={VIRTUOSO_SCROLLER_STYLE}
              defaultItemHeight={ROW_HEIGHT[density]}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
