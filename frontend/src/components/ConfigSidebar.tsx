import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Autocomplete, Box, Button, CircularProgress,
  Divider, IconButton, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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
import { SEED_LINK_TYPES } from '../domain/adoLinkTypes';
import { computeSummaryStats } from '../selectors/summaryStats';
import { HierarchySummary } from './HierarchySummary';
import { deriveOrgName } from '../utils/adoUrlUtils';
import { cookies } from '../utils/storage';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import type { AuthCtx } from '../types';

// ─── Layout constants ───────────────────────────────────────────
const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 64;

// ─── Module-level sx constants ──────────────────────────────────
const SIDEBAR_STATIC_SX = {
  bgcolor: '#F4F6F9',
  borderRight: '1px solid',
  borderColor: 'divider',
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  flexShrink: 0,
  transition: 'width 0.2s ease',
  boxShadow: '2px 0 8px rgba(15,23,42,0.06)',
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

const DIR_CAPTION_SX = { mt: 0.5, fontSize: '0.7rem', color: 'text.disabled' } as const;

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
  const { config, setConfig } = useConfigStore();

  // ── Connection ──
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const credential = useConnectionStore(s => s.credential);
  const status = useConnectionStore(s => s.status);
  const mode = useConnectionStore(s => s.mode);
  const disconnectStore = useConnectionStore(s => s.disconnect);

  // ── Work item type metadata (colors + icons) ──
  const setMeta = useWorkItemMetaStore(s => s.setMeta);

  // ── Hierarchy ──
  const rootIds = useHierarchyStore(s => s.rootIds);
  const rowsById = useHierarchyStore(s => s.rowsById);
  const clearHierarchy = useHierarchyStore(s => s.clear);

  // ── Local state ──
  const [projects, setProjects] = useState<string[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeOption[]>(
    SEED_LINK_TYPES.map(lt => ({ referenceName: lt.referenceName, displayName: lt.displayName }))
  );
  const [loadingMeta, setLoadingMeta] = useState(false);

  // ── Derived ──
  const orgName = orgUrl ? deriveOrgName(orgUrl) : '';
  const activeLinkType = linkTypes.find(lt => lt.referenceName === config.relationType) ?? null;
  const stats = useMemo(() => computeSummaryStats(rootIds, rowsById), [rootIds, rowsById]);

  // Load work item type metadata (colors + icons) when project is set and connected.
  // Fires again if project changes. Errors silently degrade to hardcoded colors.
  useEffect(() => {
    if (status !== 'connected' || !config.teamProject) return;
    let cancelled = false;
    const ctx: AuthCtx = { orgUrl, credential, mode };
    fetchWorkItemTypeMeta(config.teamProject, ctx)
      .then(meta => { if (!cancelled) setMeta(meta); })
      .catch(() => { /* non-fatal — hardcoded fallbacks remain active */ });
    return () => { cancelled = true; };
  }, [status, orgUrl, credential, mode, config.teamProject, setMeta]);

  // Load projects + relation types when connected
  useEffect(() => {
    if (status !== 'connected') return;
    let cancelled = false;
    const ctx: AuthCtx = { orgUrl, credential, mode };
    setLoadingMeta(true);

    Promise.all([
      fetchProjects(ctx).catch(() => [] as Array<{ id: string; name: string }>),
      fetchRelationTypes(ctx).catch(() => []),
    ]).then(([proj, rel]) => {
      if (cancelled) return;
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
    cookies.remove('orgUrl');
    cookies.remove('pat');
    disconnectStore();
    clearHierarchy();
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

  return (
    <Box sx={{ ...SIDEBAR_STATIC_SX, width: currentWidth, minWidth: currentWidth }}>

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
            {sidebarCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Section 2: Config fields ── */}
      {!sidebarCollapsed ? (
        <Box sx={FIELDS_SX}>
          <Typography sx={SECTION_LABEL_SX}>Query</Typography>
          {/* Team Project */}
          <Autocomplete
            freeSolo
            options={projects}
            value={config.teamProject}
            onChange={(_e, val) => {
              if (typeof val === 'string') setConfig({ teamProject: val });
            }}
            onInputChange={(_e, value) => setConfig({ teamProject: value })}
            loading={loadingMeta}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Team Project"
                required
                helperText="Select or type your ADO team project"
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

          {/* Link Type */}
          <Autocomplete
            options={linkTypes}
            value={activeLinkType}
            getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.displayName}
            isOptionEqualToValue={(opt, val) => opt.referenceName === val.referenceName}
            onChange={(_e, val) => {
              if (val === null) { setConfig({ relationType: '' }); return; }
              if (typeof val !== 'string') setConfig({ relationType: val.referenceName });
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Link Type"
                helperText="Link relationship type to traverse"
              />
            )}
          />

          {/* Direction */}
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Direction
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={config.direction}
              onChange={(_e, val) => { if (val) setConfig({ direction: val }); }}
              size="small"
              fullWidth
            >
              <ToggleButton value="forward">
                <ArrowForwardIcon fontSize="small" sx={{ mr: 0.5 }} />
                Forward
              </ToggleButton>
              <ToggleButton value="reverse">
                <ArrowBackIcon fontSize="small" sx={{ mr: 0.5 }} />
                Reverse
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={DIR_CAPTION_SX}>
              Forward: source → target&nbsp;&nbsp;Reverse: target → source
            </Typography>
          </Box>

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
            disabled={!config.teamProject || !config.relationType}
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
                disabled={!config.teamProject || !config.relationType}
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

      {/* ── Section 4: Connection footer ── */}
      {status === 'connected' && (
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
