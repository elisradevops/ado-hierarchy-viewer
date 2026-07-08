import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete, Box, Button, CircularProgress,
  Divider, IconButton, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import LogoutIcon from '@mui/icons-material/Logout';
import { useConfigStore } from '../state/configStore';
import { useConnectionStore } from '../state/connectionStore';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useUiPrefsStore } from '../state/uiPrefsStore';
import { fetchRelationTypes, fetchProjects, fetchWorkItemTypeMeta } from '../api/hierarchyApi';
import { fetchRelationTypesDirect, fetchProjectsDirect, fetchWorkItemTypeMetaDirect } from '../api/adoDirect';
import { QuerySelector } from './QuerySelector';
import { InfoTip } from './InfoTip';

import { computeSummaryStats } from '../selectors/summaryStats';
import { HierarchySummary } from './HierarchySummary';
import { deriveOrgName } from '../utils/adoUrlUtils';
import { storage } from '../utils/storage';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import { HELP } from '../constants/helpText';
import type { AuthCtx } from '../types';

// ─── Layout constants ───────────────────────────────────────────
const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 64;

// ─── Module-level sx constants ──────────────────────────────────
const SIDEBAR_STATIC_SX = {
  bgcolor: '#F4F6F9',
  borderLeft: '1px solid',
  borderColor: 'divider',
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  flexShrink: 0,
  transition: 'width 0.2s ease',
  boxShadow: '-2px 0 8px rgba(15,23,42,0.06)',
} as const;

// Primary navy header — visible even when collapsed
const BRAND_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  px: 2,
  py: 1.5,
  gap: 1,
  minHeight: 56,
  bgcolor: 'primary.main',
  flexShrink: 0,
} as const;

const BRAND_ROW_COLLAPSED_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  px: 1,
  py: 1.5,
  minHeight: 56,
  bgcolor: 'primary.main',
  flexShrink: 0,
} as const;

const BRAND_TEXT_SX = {
  fontWeight: 700,
  flexGrow: 1,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: '#ffffff',
  fontSize: '0.875rem',
  letterSpacing: '-0.01em',
} as const;

const BRAND_ICON_SX = { color: 'rgba(255,255,255,0.9)' } as const;
const BRAND_TOGGLE_SX = { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' } } as const;

const SECTION_LABEL_SX = {
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'text.disabled',
  px: 2,
  pt: 1.5,
  pb: 0.5,
} as const;

const FIELDS_SX = {
  px: 2,
  py: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  overflowY: 'auto' as const,
  flexGrow: 1,
  minHeight: 0,
} as const;

// Sits outside the scrollable FIELDS_SX region — stays visible even when the sidebar
// is too short to show all fields without scrolling (e.g. ADO extension hub panel).
const ACTION_BAR_SX = {
  px: 2,
  py: 1.5,
  flexShrink: 0,
  borderTop: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

const FOOTER_SX = {
  px: 2,
  py: 1.5,
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  borderTop: '1px solid',
  borderColor: 'divider',
  minHeight: 52,
  bgcolor: 'background.paper',
} as const;

const FOOTER_COLLAPSED_SX = {
  px: 1,
  py: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderTop: '1px solid',
  borderColor: 'divider',
  minHeight: 52,
  bgcolor: 'background.paper',
} as const;

const ORG_NAME_SX = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  flexGrow: 1,
  fontSize: '0.78rem',
  color: 'text.secondary',
} as const;

// Helper-text row: caption + InfoTip on one line, gap pushes the icon to the end.
// Kept out of the field's endAdornment slot — that slot is absolutely positioned by
// MUI (Autocomplete especially) and breaks when multi-line chips or extra children push it.
const HELPER_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 0.5,
} as const;

const COLLAPSED_ICON_AREA_SX = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  py: 2,
  flexGrow: 1,
} as const;

// ─── Types ───────────────────────────────────────────────────────
interface LinkTypeOption {
  referenceName: string;
  displayName: string;
}

interface ConfigSidebarProps {
  onRun: () => void;
}

export function ConfigSidebar({ onRun }: ConfigSidebarProps): React.ReactElement {
  // ── UI prefs ──
  const sidebarCollapsed = useUiPrefsStore(s => s.sidebarCollapsed);
  const toggleSidebar = useUiPrefsStore(s => s.toggleSidebar);

  // ── Config ──
  const { config, setConfig, resetConfig } = useConfigStore();

  // ── Connection ──
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const credential = useConnectionStore(s => s.credential);
  const status = useConnectionStore(s => s.status);
  const mode = useConnectionStore(s => s.mode);
  const disconnectStore = useConnectionStore(s => s.disconnect);

  // ── Work item type metadata (colors + icons) — populates the shared store that
  // HierarchySummary/TreeRow read from directly; no longer consumed in this component. ──
  const setMeta = useWorkItemMetaStore(s => s.setMeta);
  const clearMeta = useWorkItemMetaStore(s => s.clear);

  // ── Hierarchy ──
  const rootIds = useHierarchyStore(s => s.rootIds);
  const rowsById = useHierarchyStore(s => s.rowsById);
  const clearHierarchy = useHierarchyStore(s => s.clear);

  // ── Local state ──
  const [projects, setProjects] = useState<string[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [querySelectorOpen, setQuerySelectorOpen] = useState(false);
  const [queryName, setQueryName] = useState<string>('');

  // ── Derived ──
  const orgName = orgUrl ? deriveOrgName(orgUrl) : '';
  const stats = useMemo(() => computeSummaryStats(rootIds, rowsById), [rootIds, rowsById]);

  // Load work item type metadata (colors + icons) when project is set and connected.
  // Fires again if project changes. Errors silently degrade to hardcoded colors.
  useEffect(() => {
    if (status !== 'connected' || !config.teamProject) return;
    let cancelled = false;
    const ctx: AuthCtx = { orgUrl, credential };
    (mode === 'extension'
      ? fetchWorkItemTypeMetaDirect(orgUrl, credential, config.teamProject)
      : fetchWorkItemTypeMeta(config.teamProject, ctx))
      .then(meta => { if (!cancelled) setMeta(meta); })
      .catch(() => { /* non-fatal — hardcoded fallbacks remain active */ });
    return () => { cancelled = true; };
  }, [status, orgUrl, credential, config.teamProject, mode, setMeta]);

  // Load projects + relation types when connected
  useEffect(() => {
    if (status !== 'connected') return;
    let cancelled = false;
    const ctx: AuthCtx = { orgUrl, credential };
    setLoadingMeta(true);
    setMetaError(null);

    let fetchErrMsg: string | null = null;
    const extractMsg = (err: unknown, fallback: string): string =>
      (err as { response?: { data?: { error?: string } } }).response?.data?.error
      ?? (err instanceof Error ? err.message : null)
      ?? fallback;

    Promise.all([
      (mode === 'extension'
        ? fetchProjectsDirect(orgUrl, credential)
        : fetchProjects(ctx)
      ).catch((err: unknown) => {
        fetchErrMsg = extractMsg(err, 'Failed to load projects');
        return [] as Array<{ id: string; name: string }>;
      }),
      (mode === 'extension'
        ? fetchRelationTypesDirect(orgUrl, credential)
        : fetchRelationTypes(ctx)
      ).catch((err: unknown) => {
        if (!fetchErrMsg) fetchErrMsg = extractMsg(err, 'Failed to load link types');
        return [];
      }),
    ]).then(([proj, rel]) => {
      if (cancelled) return;
      const relTyped = rel as Array<{ referenceName: string; name: string }>;
      if (fetchErrMsg) {
        setMetaError(fetchErrMsg);
      } else if (relTyped.length === 0) {
        setMetaError('No link types were returned by Azure DevOps for this project — check permissions, or reload the page.');
      }
      setProjects((proj as Array<{ id: string; name: string }>).map(p => p.name));
      setLinkTypes(relTyped.map(r => ({
        referenceName: r.referenceName,
        displayName: r.name,
      })));
    }).finally(() => { if (!cancelled) setLoadingMeta(false); });

    return () => { cancelled = true; };
  }, [status, orgUrl, credential, mode]);

  const handleDisconnect = (): void => {
    storage.session.remove('orgUrl');
    storage.session.remove('pat');
    disconnectStore();
    clearHierarchy();
    resetConfig();
    clearMeta();
  };

  const currentWidth = sidebarCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  // L2: memoize so spread doesn't create a new object on every render
  const sidebarSx = useMemo(
    () => ({ ...SIDEBAR_STATIC_SX, width: currentWidth, minWidth: currentWidth }),
    [currentWidth]
  );

  // L1: hoist from inline options prop to satisfy react-hooks/rules-of-hooks and avoid recreation
  const sortedLinkTypes = useMemo(() => {
    const family = (ref: string) =>
      ref.split('.').pop()?.replace(/-Forward$|-Reverse$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') ?? ref;
    return [...linkTypes].sort((a, b) => family(a.referenceName).localeCompare(family(b.referenceName)));
  }, [linkTypes]);

  return (
    <Box sx={sidebarSx}>

      {/* ── Section 1: Brand header (primary bg — always visible) ── */}
      <Box sx={sidebarCollapsed ? BRAND_ROW_COLLAPSED_SX : BRAND_ROW_SX}>
        <AccountTreeIcon fontSize="small" sx={BRAND_ICON_SX} />
        {!sidebarCollapsed && (
          <Typography variant="subtitle2" sx={BRAND_TEXT_SX}>
            Hierarchy Viewer
          </Typography>
        )}
        <Tooltip title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton
            size="small"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{ ...BRAND_TOGGLE_SX, ...(sidebarCollapsed ? {} : { ml: 'auto' }) }}
          >
            {sidebarCollapsed ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Section 2: Config fields ── */}
      {!sidebarCollapsed ? (
        <Box sx={FIELDS_SX}>
          {metaError && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setMetaError(null)}>
              {metaError}
            </Alert>
          )}
          <Typography sx={SECTION_LABEL_SX}>Query</Typography>
          {/* Team Project */}
          <Autocomplete
            freeSolo
            disabled={mode === 'extension'}
            options={projects}
            value={config.teamProject}
            onChange={(_e, val) => {
              if (typeof val === 'string') setConfig({ teamProject: val });
            }}
            onInputChange={(_e, value) => { if (mode !== 'extension') setConfig({ teamProject: value }); }}
            loading={loadingMeta}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Team Project"
                required
                helperText={
                  <Box component="span" sx={HELPER_ROW_SX}>
                    <span>{mode === 'extension' ? 'Auto-selected from ADO context' : 'Select or type your ADO team project'}</span>
                    <InfoTip title="Team Project" text={HELP.teamProject} ariaLabel="About Team Project" />
                  </Box>
                }
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingMeta ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          {/* Source Query — click to browse ADO query tree */}
          <TextField
            fullWidth
            label="Source Query"
            value={queryName || (config.queryId ? `ID: ${config.queryId}` : '')}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: config.queryId ? (
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(e) => { e.stopPropagation(); setConfig({ queryId: '' }); setQueryName(''); }}
                    aria-label="Clear query"
                  >
                    <Typography sx={{ fontSize: '0.75rem', lineHeight: 1 }}>✕</Typography>
                  </IconButton>
                ) : undefined,
              },
            }}
            placeholder="Click to browse or paste a query ID…"
            helperText={
              <Box component="span" sx={HELPER_ROW_SX}>
                <span>{config.queryId ? 'Seeds the hierarchy from saved query results.' : 'Required: the query is the baseline of the hierarchy.'}</span>
                <InfoTip title="Source Query" text={HELP.sourceQuery} ariaLabel="About Source Query" />
              </Box>
            }
            size="small"
            onClick={() => { if (config.teamProject) setQuerySelectorOpen(true); }}
            sx={{ cursor: config.teamProject ? 'pointer' : 'default' }}
          />
          <QuerySelector
            open={querySelectorOpen}
            orgUrl={orgUrl}
            teamProject={config.teamProject}
            credential={credential}
            mode={mode}
            selectedId={config.queryId ?? ''}
            onSelect={(id, name) => { setConfig({ queryId: id }); setQueryName(name); }}
            onClose={() => setQuerySelectorOpen(false)}
          />

          {/* Link Types */}
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={sortedLinkTypes}
            value={linkTypes.filter(lt => config.relationTypes.includes(lt.referenceName))}
            getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.displayName}
            isOptionEqualToValue={(opt, val) => opt.referenceName === val.referenceName}
            groupBy={(opt) => {
              const ref = typeof opt === 'string' ? opt : opt.referenceName;
              return ref.split('.').pop()?.replace(/-Forward$|-Reverse$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') ?? ref;
            }}
            onChange={(_e, val) => {
              setConfig({ relationTypes: val.map(v => typeof v === 'string' ? v : v.referenceName) });
            }}
            renderOption={(props, option) => {
              const ref = typeof option === 'string' ? option : option.referenceName;
              const label = typeof option === 'string' ? option : option.displayName;
              const dir = ref.endsWith('-Forward') ? '↓' : ref.endsWith('-Reverse') ? '↑' : '↔';
              const { key, ...liProps } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
              return (
                <Box key={key} component="li" {...liProps} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', flexShrink: 0, width: 14, textAlign: 'center' }}>{dir}</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', flexGrow: 1 }}>{label}</Typography>
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Link Types"
                helperText={
                  <Box component="span" sx={HELPER_ROW_SX}>
                    <span>Optional: extend the query&rsquo;s tree by following these link types outward.</span>
                    <InfoTip title="Link Types" text={HELP.linkTypes} ariaLabel="About Link Types" />
                  </Box>
                }
              />
            )}
          />

        </Box>
      ) : (
        /* Collapsed: show icon hints */
        <Box sx={COLLAPSED_ICON_AREA_SX}>
          <Tooltip title="Team Project" placement="right">
            <Box sx={{ color: 'text.disabled', display: 'flex' }}>
              <AccountTreeIcon fontSize="small" />
            </Box>
          </Tooltip>
          <Tooltip title="Load Hierarchy" placement="right">
            <span>
              <IconButton
                size="small"
                onClick={onRun}
                disabled={!config.teamProject || !config.queryId}
                color="primary"
              >
                <ChevronRightIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      {/* ── Section 2b: Load Hierarchy action bar — pinned outside the scrollable
           fields region so it stays reachable when the sidebar is short (e.g. ADO
           extension hub with limited panel height) ── */}
      {!sidebarCollapsed && (
        <Box sx={ACTION_BAR_SX}>
          <Button
            variant="contained"
            fullWidth
            onClick={onRun}
            disabled={!config.teamProject || !config.queryId}
          >
            Load Hierarchy
          </Button>
        </Box>
      )}

      {/* ── Section 3: Summary stats ── */}
      {!sidebarCollapsed && stats.totalItems > 0 && (
        <>
          <Divider />
          <HierarchySummary stats={stats} />
        </>
      )}

      <Divider />

      {/* ── Section 4: Connection footer — hidden in extension mode (SDK owns auth) ── */}
      {status === 'connected' && mode !== 'extension' && (
        sidebarCollapsed ? (
          <Box sx={FOOTER_COLLAPSED_SX}>
            <Tooltip title={orgUrl ? `Disconnect from ${orgUrl}` : 'Disconnect'}>
              <IconButton size="small" onClick={handleDisconnect} aria-label="Disconnect">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box sx={FOOTER_SX}>
            <CheckCircleIcon fontSize="small" color="success" />
            <Typography sx={ORG_NAME_SX}>{orgName || orgUrl}</Typography>
            <Tooltip title={orgUrl ? `Disconnect from ${orgUrl}` : 'Disconnect'}>
              <IconButton size="small" onClick={handleDisconnect} aria-label="Disconnect">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )
      )}
    </Box>
  );
}
