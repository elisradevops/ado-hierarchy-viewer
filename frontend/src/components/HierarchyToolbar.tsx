import React, { useRef, useState, useMemo } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, InputAdornment,
  ListItemIcon, Menu, MenuItem, Snackbar, TextField, Tooltip, Typography,
} from '@mui/material';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import ClearIcon from '@mui/icons-material/Clear';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DensitySmallIcon from '@mui/icons-material/DensitySmall';
import DensityMediumIcon from '@mui/icons-material/DensityMedium';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUiPrefsStore } from '../state/uiPrefsStore';
import { COLUMN_DEFS } from '../constants/columns';
import { useHierarchyStore } from '../state/hierarchyStore';
import { AUTO_REFRESH_OPTIONS } from '../constants/ui';
import { downloadCsv, flatRowsToCsv } from '../utils/exportCsv';
import { copyToClipboard, flatRowsToTsv } from '../utils/clipboard';
import { getFacetValues } from '../selectors/facetValues';
import { FilterMenu } from './FilterMenu';
import type { FlatRow } from '../types';

// ─── sx constants ────────────────────────────────────────────────
const TOOLBAR_SX = {
  display: 'flex',
  alignItems: 'center',
  px: 1.5,
  py: 0.75,
  gap: 0.5,
  borderBottom: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  flexWrap: 'wrap',
} as const;

const COUNT_SX = {
  whiteSpace: 'nowrap',
  color: 'text.secondary',
  fontSize: '0.78rem',
  minWidth: 60,
} as const;

const SEARCH_SX = { width: 180, flexShrink: 0 } as const;

const DIVIDER_SX = { mx: 0.5, height: 24, alignSelf: 'center' } as const;

const AR_BUTTON_BASE_SX = {
  textTransform: 'none',
  fontSize: '0.78rem',
  px: 0.75,
  py: 0.25,
  minWidth: 0,
  whiteSpace: 'nowrap',
} as const;

const AR_BUTTON_ACTIVE_SX = {
  ...AR_BUTTON_BASE_SX,
  color: 'primary.main',
} as const;

const AR_BUTTON_INACTIVE_SX = {
  ...AR_BUTTON_BASE_SX,
  color: 'text.secondary',
} as const;

interface HierarchyToolbarProps {
  rows: FlatRow[];
  totalRows: number;
  onRefresh: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function HierarchyToolbar({
  rows,
  totalRows,
  onRefresh,
  onExpandAll,
  onCollapseAll,
}: HierarchyToolbarProps): React.ReactElement {
  const { filter, setFilter, autoRefreshMs, setAutoRefreshMs, density, setDensity, hiddenCols, toggleCol, resetCols, showOnlyMatches, toggleShowOnlyMatches } = useUiPrefsStore();
  const rowsById = useHierarchyStore(s => s.rowsById);
  const usedQueryId = useHierarchyStore(s => s.usedQueryId);
  const matchedIds = useHierarchyStore(s => s.matchedIds);
  const matchesUnavailable = !usedQueryId || matchedIds === null;
  const facets = useMemo(() => getFacetValues(rowsById), [rowsById]);
  const [localText, setLocalText] = useState(filter.text);
  const debouncedText = useDebouncedValue(localText);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [arAnchor, setArAnchor] = useState<HTMLElement | null>(null);
  const [colAnchor, setColAnchor] = useState<HTMLElement | null>(null);

  // Non-always columns — drives the Columns menu
  const toggleableColumns = useMemo(() => COLUMN_DEFS.filter(c => !c.always), []);

  const currentArOpt = AUTO_REFRESH_OPTIONS.find(o => o.value === autoRefreshMs) ?? AUTO_REFRESH_OPTIONS[0];
  const arActive = autoRefreshMs > 0;

  React.useEffect(() => {
    setFilter({ text: debouncedText });
  }, [debouncedText, setFilter]);

  const isCopyingRef = useRef(false);
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async (): Promise<void> => {
    if (isCopyingRef.current) return;
    isCopyingRef.current = true;
    setIsCopying(true);
    try {
      await copyToClipboard(flatRowsToTsv(rows));
      setCopySuccess(true);
    } catch { setCopyError(true); } finally {
      isCopyingRef.current = false;
      setIsCopying(false);
    }
  };

  const handleExport = (): void => {
    downloadCsv(flatRowsToCsv(rows), 'hierarchy.csv');
  };

  const isFiltered = rows.length !== totalRows;
  const countLabel = isFiltered
    ? `${rows.length} of ${totalRows}`
    : `${totalRows}`;

  return (
    <Box sx={TOOLBAR_SX}>
      {/* Segment 1: Search */}
      <TextField
        size="small"
        placeholder="Search…"
        value={localText}
        onChange={e => setLocalText(e.target.value)}
        sx={SEARCH_SX}
        slotProps={{
          input: {
            endAdornment: localText ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setLocalText('')} edge="end">
                  <ClearIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      {/* Filter menu */}
      <FilterMenu
        availableTypes={facets.types}
        availableStates={facets.states}
        filter={filter}
        setFilter={setFilter}
      />

      {/* Active filter chips */}
      {filter.types.map(t => (
        <Chip
          key={t}
          label={t}
          size="small"
          onDelete={() => setFilter({ types: filter.types.filter(x => x !== t) })}
        />
      ))}
      {filter.states.map(s => (
        <Chip
          key={s}
          label={s}
          size="small"
          color="primary"
          variant="outlined"
          onDelete={() => setFilter({ states: filter.states.filter(x => x !== s) })}
        />
      ))}

      <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

      {/* Segment 2: Result count */}
      <Typography variant="caption" sx={COUNT_SX}>
        {totalRows > 0 ? countLabel : '—'}
      </Typography>

      <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

      {/* Segment 3: Expand/Collapse */}
      <Tooltip title="Expand all">
        <IconButton size="small" onClick={onExpandAll}><UnfoldMoreIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Collapse all">
        <IconButton size="small" onClick={onCollapseAll}><UnfoldLessIcon fontSize="small" /></IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

      {/* Segment 4: Refresh + auto-refresh */}
      <Tooltip title="Refresh now">
        <IconButton size="small" onClick={onRefresh}><RefreshIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={currentArOpt.tooltipLabel} disableHoverListener={Boolean(arAnchor)}>
        <Button
          size="small"
          onClick={e => setArAnchor(e.currentTarget)}
          startIcon={
            <AutorenewIcon sx={{ fontSize: '14px !important', color: arActive ? 'primary.main' : 'text.disabled' }} />
          }
          endIcon={<KeyboardArrowDownIcon sx={{ fontSize: '14px !important' }} />}
          sx={arActive ? AR_BUTTON_ACTIVE_SX : AR_BUTTON_INACTIVE_SX}
        >
          {`Auto-refresh: ${currentArOpt.label}`}
        </Button>
      </Tooltip>
      <Menu
        anchorEl={arAnchor}
        open={Boolean(arAnchor)}
        onClose={() => setArAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Typography variant="caption" sx={{ px: 2, pt: 0.75, pb: 0.25, display: 'block', fontWeight: 600, color: 'text.secondary' }}>
          Auto-refresh
        </Typography>
        <Divider sx={{ mb: 0.5 }} />
        {AUTO_REFRESH_OPTIONS.map(opt => (
          <MenuItem
            key={opt.value}
            dense
            selected={opt.value === autoRefreshMs}
            onClick={() => { setAutoRefreshMs(opt.value); setArAnchor(null); }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {opt.value === autoRefreshMs ? <CheckIcon fontSize="small" color="primary" /> : null}
            </ListItemIcon>
            {opt.menuLabel}
          </MenuItem>
        ))}
      </Menu>

      <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

      {!matchesUnavailable && (
        <>
          <Tooltip title={showOnlyMatches ? 'Showing only query matches — click to show full tree' : 'Show only query matches (dims ADO-added ancestor/sibling scaffolding)'}>
            <IconButton size="small" onClick={toggleShowOnlyMatches}>
              <FilterAltIcon fontSize="small" sx={{ color: showOnlyMatches ? 'primary.main' : 'text.disabled' }} />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />
        </>
      )}

      {/* Segment 5: Export + density */}
      <Tooltip title="Export CSV">
        <IconButton size="small" onClick={handleExport}><DownloadIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Copy to clipboard">
        <IconButton size="small" onClick={() => { void handleCopy(); }} disabled={isCopying}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Print">
        <IconButton size="small" onClick={() => window.print()}><PrintIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={`Density: ${density}`}>
        <IconButton size="small" onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}>
          {density === 'compact' ? <DensitySmallIcon fontSize="small" /> : <DensityMediumIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Columns" disableHoverListener={Boolean(colAnchor)}>
        <IconButton size="small" onClick={e => setColAnchor(e.currentTarget)}>
          <ViewColumnIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={colAnchor}
        open={Boolean(colAnchor)}
        onClose={() => setColAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Typography variant="caption" sx={{ px: 2, pt: 0.75, pb: 0.25, display: 'block', fontWeight: 600, color: 'text.secondary' }}>
          Columns
        </Typography>
        <Divider sx={{ mb: 0.5 }} />
        {toggleableColumns.map(col => {
          const visible = !hiddenCols.includes(col.key);
          return (
            <MenuItem key={col.key} dense onClick={() => toggleCol(col.key)}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                {visible
                  ? <CheckBoxIcon fontSize="small" color="primary" />
                  : <CheckBoxOutlineBlankIcon fontSize="small" />
                }
              </ListItemIcon>
              {col.label}
            </MenuItem>
          );
        })}
        <Divider sx={{ mt: 0.5 }} />
        <MenuItem dense onClick={() => { resetCols(); setColAnchor(null); }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <RestartAltIcon fontSize="small" />
          </ListItemIcon>
          Reset to defaults
        </MenuItem>
      </Menu>

      {/* Copy success snackbar */}
      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert onClose={() => setCopySuccess(false)} severity="success" sx={{ width: '100%' }}>
          Copied to clipboard
        </Alert>
      </Snackbar>
      {/* Copy error snackbar */}
      <Snackbar
        open={copyError}
        autoHideDuration={3000}
        onClose={() => setCopyError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert onClose={() => setCopyError(false)} severity="error" sx={{ width: '100%' }}>
          Copy failed — check browser clipboard permissions
        </Alert>
      </Snackbar>
    </Box>
  );
}
