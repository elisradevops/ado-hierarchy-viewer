import React, { useState, useId, useMemo } from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  Popover,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import type { PaperProps } from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import type { FilterState } from '../state/uiPrefsStore';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import { useConnectionStore } from '../state/connectionStore';
import { TYPE_COLORS, TYPE_ICON_IDS, TYPE_DOT_FALLBACK } from './TreeRow';
import { getStateDotColor } from '../theme/stateDot';
import { InfoTip } from './InfoTip';
import { HELP } from '../constants/helpText';

// ─── sx constants ────────────────────────────────────────────────
const POPOVER_PAPER_PROPS: PaperProps = {
  sx: {
    p: 2,
    minWidth: 240,
    maxHeight: 440,
    overflowY: 'auto',
  },
};

const SECTION_TITLE_SX = {
  fontWeight: 600,
  mb: 0.5,
  fontSize: '0.78rem',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
} as const;

const SECTION_SX = { mb: 1.5 } as const;

const CLEAR_BTN_SX = {
  mt: 1,
} as const;

const FORM_CONTROL_LABEL_SX = {
  '& .MuiFormControlLabel-label': { fontSize: '0.85rem' },
} as const;

const MATCH_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
} as const;

const LABEL_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
} as const;

const DOT_SX = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
} as const;

// ─── Props ───────────────────────────────────────────────────────
export interface FilterMenuProps {
  availableTypes: string[];
  availableStates: string[];
  filter: Pick<FilterState, 'types' | 'states'>;
  setFilter: (partial: Partial<Pick<FilterState, 'types' | 'states'>>) => void;
  /** Show/hide the "Show only query matches" section — hidden when no query seeded the tree. */
  matchesAvailable: boolean;
  showOnlyMatches: boolean;
  onToggleShowOnlyMatches: () => void;
}

export function FilterMenu({
  availableTypes,
  availableStates,
  filter,
  setFilter,
  matchesAvailable,
  showOnlyMatches,
  onToggleShowOnlyMatches,
}: FilterMenuProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const buttonId = useId();
  const popoverId = useId();

  const orgUrl = useConnectionStore(s => s.orgUrl);
  const apiTypeColors = useWorkItemMetaStore(s => s.typeColors);
  const apiStateColors = useWorkItemMetaStore(s => s.stateColors);
  const rawTypeIconUrls = useWorkItemMetaStore(s => s.typeIconUrls);

  // Same fallback-icon-URL pattern used elsewhere (TreeRow/HierarchyTreeTable): build
  // ADO's own icon URL from orgUrl + known icon ids; API-fetched URLs take precedence.
  const typeIconUrlMap = useMemo(() => {
    if (!orgUrl) return rawTypeIconUrls;
    const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const fallbacks: Record<string, string> = {};
    for (const [type, iconId] of Object.entries(TYPE_ICON_IDS)) {
      fallbacks[type] = `${base}_apis/wit/workitemicons/${iconId}?api-version=7.1`;
    }
    return { ...fallbacks, ...rawTypeIconUrls };
  }, [orgUrl, rawTypeIconUrls]);

  const typeColorOf = (type: string): string => apiTypeColors[type] ?? TYPE_COLORS[type] ?? TYPE_DOT_FALLBACK;
  const stateColorOf = (state: string): string => apiStateColors[state.toLowerCase()] ?? getStateDotColor(state);

  const open = Boolean(anchorEl);
  // Match mode counts toward the badge too — it's an active filter from the user's
  // perspective even though it's stored as a separate boolean, not in filter.types/states.
  const activeCount = filter.types.length + filter.states.length + (showOnlyMatches ? 1 : 0);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>): void => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = (): void => {
    setAnchorEl(null);
  };

  const handleTypeToggle = (type: string): void => {
    const next = filter.types.includes(type)
      ? filter.types.filter(t => t !== type)
      : [...filter.types, type];
    setFilter({ types: next });
  };

  const handleStateToggle = (state: string): void => {
    const next = filter.states.includes(state)
      ? filter.states.filter(s => s !== state)
      : [...filter.states, state];
    setFilter({ states: next });
  };

  const handleClearAll = (): void => {
    setFilter({ types: [], states: [] });
  };

  return (
    <>
      <Tooltip title="Filter by type, state, or query match">
        <IconButton
          id={buttonId}
          size="small"
          onClick={handleOpen}
          aria-controls={open ? popoverId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <Badge badgeContent={activeCount > 0 ? activeCount : undefined} color="primary">
            <FilterAltIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        id={popoverId}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: POPOVER_PAPER_PROPS }}
      >
        {availableTypes.length > 0 && (
          <Box sx={SECTION_SX}>
            <Typography sx={SECTION_TITLE_SX}>Types in this view ({availableTypes.length})</Typography>
            <FormGroup>
              {availableTypes.map(type => {
                const color = typeColorOf(type);
                const iconUrl = typeIconUrlMap[type];
                return (
                  <FormControlLabel
                    key={type}
                    sx={FORM_CONTROL_LABEL_SX}
                    control={
                      <Checkbox
                        size="small"
                        checked={filter.types.includes(type)}
                        onChange={() => handleTypeToggle(type)}
                      />
                    }
                    label={
                      <Box sx={LABEL_ROW_SX}>
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
                          <Box sx={{ ...DOT_SX, bgcolor: color }} />
                        )}
                        {type}
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </Box>
        )}

        {availableTypes.length > 0 && availableStates.length > 0 && (
          <Divider sx={{ mb: 1.5 }} />
        )}

        {availableStates.length > 0 && (
          <Box sx={SECTION_SX}>
            <Typography sx={SECTION_TITLE_SX}>States in this view ({availableStates.length})</Typography>
            <FormGroup>
              {availableStates.map(state => (
                <FormControlLabel
                  key={state}
                  sx={FORM_CONTROL_LABEL_SX}
                  control={
                    <Checkbox
                      size="small"
                      checked={filter.states.includes(state)}
                      onChange={() => handleStateToggle(state)}
                    />
                  }
                  label={
                    <Box sx={LABEL_ROW_SX}>
                      <Box sx={{ ...DOT_SX, bgcolor: stateColorOf(state) }} />
                      {state}
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </Box>
        )}

        {matchesAvailable && (
          <>
            {(availableTypes.length > 0 || availableStates.length > 0) && (
              <Divider sx={{ mb: 1.5 }} />
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, width: '100%' }}>
              <FormControlLabel
                sx={{ ...FORM_CONTROL_LABEL_SX, ...MATCH_ROW_SX, flexGrow: 1, ml: 0 }}
                labelPlacement="start"
                control={<Switch size="small" checked={showOnlyMatches} onChange={onToggleShowOnlyMatches} />}
                label="Show only query matches"
              />
              <InfoTip text={HELP.showOnlyMatches} ariaLabel="About Show only query matches" />
            </Box>
          </>
        )}

        {activeCount > 0 && (
          <Button
            size="small"
            variant="text"
            color="error"
            sx={CLEAR_BTN_SX}
            onClick={handleClearAll}
          >
            Clear all
          </Button>
        )}
      </Popover>
    </>
  );
}
