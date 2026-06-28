import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert,
  Autocomplete, Box, Button, Chip, CircularProgress,
  Divider, IconButton, TextField,
  Tooltip, Typography, alpha,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import LogoutIcon from '@mui/icons-material/Logout';
import { useConfigStore } from '../state/configStore';
import { useConnectionStore } from '../state/connectionStore';
import { useHierarchyStore } from '../state/hierarchyStore';
import { useUiPrefsStore } from '../state/uiPrefsStore';
import { fetchRelationTypes, fetchProjects, fetchWorkItemTypeMeta } from '../api/hierarchyApi';
import { fetchRelationTypesDirect, fetchProjectsDirect, fetchWorkItemTypeMetaDirect } from '../api/adoDirect';
import { QuerySelector } from './QuerySelector';

import { computeSummaryStats } from '../selectors/summaryStats';
import { HierarchySummary } from './HierarchySummary';
import { deriveOrgName } from '../utils/adoUrlUtils';
import { storage } from '../utils/storage';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import { TYPE_ICON_IDS, TYPE_COLORS } from './TreeRow';
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
  const filter = useUiPrefsStore(s => s.filter);
  const setFilter = useUiPrefsStore(s => s.setFilter);

  // ── Config ──
  const { config, setConfig, resetConfig } = useConfigStore();

  // ── Connection ──
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const credential = useConnectionStore(s => s.credential);
  const status = useConnectionStore(s => s.status);
  const mode = useConnectionStore(s => s.mode);
  const disconnectStore = useConnectionStore(s => s.disconnect);

  // ── Work item type metadata (colors + icons) ──
  const setMeta = useWorkItemMetaStore(s => s.setMeta);
  const typeColors = useWorkItemMetaStore(s => s.typeColors);
  const rawTypeIconUrls = useWorkItemMetaStore(s => s.typeIconUrls);
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
  const availableWitTypes = useMemo(() => Object.keys(typeColors).sort(), [typeColors]);
  const iconUrlMap = useMemo(() => {
    if (!orgUrl) return rawTypeIconUrls;
    const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const fallbacks: Record<string, string> = {};
    for (const [type, iconId] of Object.entries(TYPE_ICON_IDS)) {
      fallbacks[type] = `${base}_apis/wit/workitemicons/${iconId}?api-version=7.1`;
    }
    return { ...fallbacks, ...rawTypeIconUrls };
  }, [orgUrl, rawTypeIconUrls]);

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
      if (fetchErrMsg) setMetaError(fetchErrMsg);
      setProjects((proj as Array<{ id: string; name: string }>).map(p => p.name));
      if ((rel as Array<{ referenceName: string; name: string }>).length > 0) {
        setLinkTypes((rel as Array<{ referenceName: string; name: string }>).map(r => ({
          referenceName: r.referenceName,
          displayName: r.name,
        })));
      }
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

  const handleFilterByType = (type: string): void => {
    const already = filter.types.includes(type);
    setFilter({ types: already ? filter.types.filter(t => t !== type) : [...filter.types, type] });
  };

  const handleFilterByState = (state: string): void => {
    const already = filter.states.includes(state);
    setFilter({ states: already ? filter.states.filter(s => s !== state) : [...filter.states, state] });
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
                helperText={mode === 'extension' ? 'Auto-selected from ADO context' : 'Select or type your ADO team project'}
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
            helperText={config.queryId ? 'Seeds the hierarchy from saved query results.' : 'Optional: pick a saved query to seed top-level items.'}
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
                helperText="Which link relationships to follow when building the tree."
              />
            )}
          />

          {/* Work Item Types */}
          <Autocomplete
            multiple
            options={availableWitTypes}
            value={filter.types}
            onChange={(_e, val) => setFilter({ types: val })}
            disableCloseOnSelect
            renderOption={(props, option) => {
              const color = typeColors[option] ?? TYPE_COLORS[option] ?? '#8A8886';
              const iconUrl = iconUrlMap[option];
              const { key, ...liProps } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
              return (
                <Box key={key} component="li" {...liProps} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5 }}>
                  {iconUrl ? (
                    <Box
                      component="img"
                      src={iconUrl}
                      alt=""
                      aria-hidden="true"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                      sx={{ width: 14, height: 14, flexShrink: 0 }}
                    />
                  ) : (
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                  )}
                  <Typography sx={{ fontSize: '0.8125rem' }}>{option}</Typography>
                </Box>
              );
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const color = typeColors[option] ?? TYPE_COLORS[option] ?? '#8A8886';
                const iconUrl = iconUrlMap[option];
                const { key, ...tagProps } = getTagProps({ index });
                return (
                  <Chip
                    key={key}
                    {...tagProps}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {iconUrl && (
                          <Box
                            component="img"
                            src={iconUrl}
                            alt=""
                            aria-hidden="true"
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                            sx={{ width: 11, height: 11, flexShrink: 0 }}
                          />
                        )}
                        {option}
                      </Box>
                    }
                    size="small"
                    sx={{
                      bgcolor: alpha(color, 0.12),
                      color,
                      border: `1px solid ${alpha(color, 0.3)}`,
                      fontWeight: 500,
                      fontSize: '0.7rem',
                      height: 20,
                    }}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Work Item Types"
                helperText="Leave empty to show all types"
              />
            )}
          />

          {/* Advanced Options */}
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Closed State"
                  value={config.closedState}
                  onChange={e => setConfig({ closedState: e.target.value })}
                  helperText="State considered 'done' for progress % (default: Closed)"
                />
                <TextField
                  fullWidth
                  label="Effort Field"
                  value={config.effortField}
                  onChange={e => setConfig({ effortField: e.target.value })}
                  helperText="ADO field name for effort values"
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Load Hierarchy button */}
          <Button
            variant="contained"
            fullWidth
            onClick={onRun}
            disabled={!config.teamProject || (config.relationTypes.length === 0 && !config.queryId)}
            sx={{ mt: 0.5 }}
          >
            Load Hierarchy
          </Button>
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
                disabled={!config.teamProject || (config.relationTypes.length === 0 && !config.queryId)}
                color="primary"
              >
                <ChevronRightIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      {/* ── Section 3: Summary stats ── */}
      {!sidebarCollapsed && stats.totalItems > 0 && (
        <>
          <Divider />
          <HierarchySummary
            stats={stats}
            onFilterByType={handleFilterByType}
            onFilterByState={handleFilterByState}
          />
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
