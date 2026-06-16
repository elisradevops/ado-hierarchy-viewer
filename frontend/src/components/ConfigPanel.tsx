import React, { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Autocomplete, Box, Button, CircularProgress,
  Grid, TextField, ToggleButton, ToggleButtonGroup,
  Typography, Chip, IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useConfigStore } from '../state/configStore';
import { useConnectionStore } from '../state/connectionStore';
import { useHierarchyStore } from '../state/hierarchyStore';
import { fetchRelationTypes, fetchProjects } from '../api/hierarchyApi';
import { SEED_LINK_TYPES } from '../domain/adoLinkTypes';
import type { AuthCtx } from '../types';

// ─── Module-level sx constants ───────────────────────────────────
const PANEL_SX = {
  px: 2, pt: 2, pb: 1.5,
  borderBottom: 1, borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

const SUMMARY_SX = {
  display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
  px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper',
} as const;

const DIR_CAPTION_SX = { mt: 0.5 } as const;

interface LinkTypeOption {
  referenceName: string;
  displayName: string;
}

interface ConfigPanelProps {
  onRun: () => void;
}

export function ConfigPanel({ onRun }: ConfigPanelProps): React.ReactElement {
  const { config, setConfig } = useConfigStore();
  const { orgUrl, credential, status, mode } = useConnectionStore();
  const lastFetchedAt = useHierarchyStore(s => s.lastFetchedAt);

  const [projects, setProjects] = useState<string[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeOption[]>(
    SEED_LINK_TYPES.map(lt => ({ referenceName: lt.referenceName, displayName: lt.displayName }))
  );
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Auto-collapse after first successful load
  useEffect(() => {
    if (lastFetchedAt !== null) setExpanded(false);
  }, [lastFetchedAt]);

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

  const handleRun = (): void => { onRun(); };

  const activeLinkType = linkTypes.find(lt => lt.referenceName === config.relationType) ?? null;

  // Collapsed summary bar
  if (!expanded) {
    return (
      <Box sx={SUMMARY_SX}>
        <Typography variant="caption" color="text.secondary">Project:</Typography>
        <Chip label={config.teamProject || '—'} size="small" color="primary" variant="outlined" />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Link type:</Typography>
        <Chip label={activeLinkType?.displayName ?? config.relationType} size="small" variant="outlined" />
        <Chip
          label={config.direction === 'forward' ? 'Forward →' : '← Reverse'}
          size="small"
          variant="outlined"
        />
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={() => setExpanded(true)} aria-label="Edit configuration">
          <EditIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={PANEL_SX}>
      <Grid container spacing={2}>
        {/* Project */}
        <Grid size={12}>
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
        </Grid>

        {/* Link Type + Direction */}
        <Grid size={{ xs: 12, sm: 8 }}>
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
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
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
        </Grid>

        {/* Advanced Options */}
        <Grid size={12}>
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Closed State"
                    value={config.closedState}
                    onChange={e => setConfig({ closedState: e.target.value })}
                    helperText="State considered 'done' for progress % (default: Closed)"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Effort Field"
                    value={config.effortField}
                    onChange={e => setConfig({ effortField: e.target.value })}
                    helperText="ADO field name for effort values"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Run button */}
        <Grid size={12}>
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleRun}
            disabled={!config.teamProject || !config.relationType}
          >
            Load Hierarchy
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
