import React, { useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box, Paper, TableSortLabel } from '@mui/material';
import { TreeRow } from './TreeRow';
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
import { ROW_HEIGHT, GRID_COLS } from '../constants/ui';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import type { FlatRow } from '../types';

const COLUMNS: Array<{ key: SortCol; label: string; align?: 'right' }> = [
  { key: 'title',       label: 'Title' },
  { key: 'type',        label: 'Type' },
  { key: 'state',       label: 'State' },
  { key: 'progressPct', label: 'Progress' },
  { key: 'effort',      label: 'Effort',       align: 'right' },
  { key: 'effortTotal', label: 'Total Effort', align: 'right' },
];

// Header uses the same GRID_COLS as every data row — guarantees pixel-exact column alignment.
const HEADER_ROW_SX = {
  display: 'grid',
  gridTemplateColumns: GRID_COLS,
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

const BODY_WRAPPER_SX = { flexGrow: 1, overflow: 'hidden' } as const;

interface HierarchyTreeTableProps {
  onRefresh: () => void;
}

export function HierarchyTreeTable({ onRefresh }: HierarchyTreeTableProps): React.ReactElement {
  const rootIds = useHierarchyStore(s => s.rootIds);
  const rowsById = useHierarchyStore(s => s.rowsById);
  const totalRows = useHierarchyStore(s => Object.keys(s.rowsById).length);
  const { expandedIds, toggle, expandAll, collapseAll } = useExpandCollapse();
  const { sort, filter, setSort, density } = useUiPrefsStore();
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const teamProject = useConfigStore(s => s.config.teamProject);
  const apiTypeColors = useWorkItemMetaStore(s => s.typeColors);
  const apiTypeIconUrls = useWorkItemMetaStore(s => s.typeIconUrls);

  const [activeId, setActiveId] = useState<number | null>(null);

  const roots = useMemo(
    () => rootIds.map(id => rowsById[id]).filter(Boolean),
    [rootIds, rowsById]
  );

  const visibleRows: FlatRow[] = useMemo(() => {
    const flat = flattenTree(roots, expandedIds);
    const filtered = filterRows(flat, filter);
    return sortRows(filtered, sort.col as SortCol, sort.dir);
  }, [roots, expandedIds, filter, sort]);

  const activeIndex = activeId !== null
    ? visibleRows.findIndex(r => r.node.id === activeId)
    : -1;

  const handleToggle = (id: number): void => toggle(id);
  const handleActivate = (id: number): void => setActiveId(id);

  const { onKeyDown } = useKeyboardNav({
    rowCount: visibleRows.length,
    activeIndex,
    onSetActive: (idx) => setActiveId(visibleRows[idx]?.node.id ?? null),
    onToggleExpand: (idx) => { const row = visibleRows[idx]; if (row) toggle(row.node.id); },
    onOpenItem: (idx) => {
      const row = visibleRows[idx];
      if (row) window.open(`${orgUrl}/_workitems/edit/${row.node.id}`, '_blank', 'noopener');
    },
  });

  const handleColSort = (col: SortCol): void => {
    setSort({ col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' });
  };

  const hasFilter = !!(filter.text || filter.types.length || filter.states.length);

  const virtuosoComponents = useMemo(() => ({
    EmptyPlaceholder: (): React.ReactElement => (
      <EmptyState hasSearchFilter={hasFilter} />
    ),
  }), [hasFilter]);

  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <HierarchyToolbar
        rows={visibleRows}
        totalRows={totalRows}
        onRefresh={onRefresh}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      {/* Grid header — identical template to every data row */}
      <Box sx={HEADER_ROW_SX}>
        {COLUMNS.map(col => (
          <Box
            key={col.key}
            sx={{ ...HEADER_CELL_SX, textAlign: col.align ?? 'left' }}
          >
            <TableSortLabel
              active={sort.col === col.key}
              direction={sort.col === col.key ? sort.dir : 'asc'}
              onClick={() => handleColSort(col.key)}
            >
              {col.label}
            </TableSortLabel>
          </Box>
        ))}
      </Box>

      {/* Virtual body — each row rendered by TreeRow using the same GRID_COLS */}
      <Box sx={BODY_WRAPPER_SX} onKeyDown={onKeyDown}>
        <Virtuoso
          data={visibleRows}
          itemContent={(_idx, row) => (
            <TreeRow
              row={row}
              orgUrl={orgUrl}
              teamProject={teamProject}
              isActive={row.node.id === activeId}
              density={density}
              onToggle={handleToggle}
              onActivate={handleActivate}
              apiTypeColors={apiTypeColors}
              apiTypeIconUrls={apiTypeIconUrls}
            />
          )}
          components={virtuosoComponents}
          style={{ height: '100%' }}
          defaultItemHeight={ROW_HEIGHT[density]}
        />
      </Box>
    </Paper>
  );
}
