import React, { useId, useState } from 'react';
import { Box, Divider, IconButton, Popover, Tooltip, Typography, alpha } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LoopIcon from '@mui/icons-material/Loop';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockIcon from '@mui/icons-material/Lock';
import { LEGEND_GROUPS } from '../constants/helpText';
import { useConnectionStore } from '../state/connectionStore';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';
import { TYPE_COLORS, TYPE_DOT_FALLBACK, TYPE_ICON_IDS } from './TreeRow';
import { getStateDotColor } from '../theme/stateDot';

// ─── sx constants ────────────────────────────────────────────────
const POPOVER_BOX_SX = { p: 2, minWidth: 260, maxHeight: 480, overflowY: 'auto' } as const;
const HEADING_SX = { fontWeight: 700, mb: 1, fontSize: '0.85rem' } as const;
const GROUP_TITLE_SX = {
  fontWeight: 600,
  fontSize: '0.72rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'text.secondary',
  mb: 0.5,
} as const;
const ITEM_ROW_SX = { display: 'flex', alignItems: 'center', gap: 1, py: 0.4 } as const;
const DOT_SX = { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 } as const;
const ICON_SX = { fontSize: 14, flexShrink: 0 } as const;
const TYPE_ICON_SX = { width: 14, height: 14, flexShrink: 0 } as const;
const LABEL_SX = { fontSize: '0.78rem', color: 'text.primary' } as const;

interface LegendPopoverProps {
  availableTypes: string[];
  availableStates: string[];
}

const WARNING_ICON_BY_LABEL = {
  Cycle: LoopIcon,
  'Duplicate link': WarningAmberIcon,
  'No access': LockIcon,
} as const;

function fallbackTypeIconUrl(orgUrl: string | null, type: string): string | undefined {
  const iconId = TYPE_ICON_IDS[type];
  if (!orgUrl || !iconId) return undefined;
  const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
  return `${base}_apis/wit/workitemicons/${iconId}?api-version=7.1`;
}

export function LegendPopover({ availableTypes, availableStates }: LegendPopoverProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const open = Boolean(anchorEl);
  const orgUrl = useConnectionStore(s => s.orgUrl);
  const apiTypeColors = useWorkItemMetaStore(s => s.typeColors);
  const apiTypeIconUrls = useWorkItemMetaStore(s => s.typeIconUrls);
  const apiStateColors = useWorkItemMetaStore(s => s.stateColors);

  const typeColorOf = (type: string): string => apiTypeColors[type] ?? TYPE_COLORS[type] ?? TYPE_DOT_FALLBACK;
  const typeIconOf = (type: string): string | undefined => apiTypeIconUrls[type] ?? fallbackTypeIconUrl(orgUrl, type);
  const stateColorOf = (state: string): string => apiStateColors[state.toLowerCase()] ?? getStateDotColor(state);
  const referenceGroups = LEGEND_GROUPS.filter(group => group.title === 'Relationship types' || group.title === 'Warning indicators');

  return (
    <>
      <Tooltip title="Legend — what the chips and colors mean">
        <IconButton
          size="small"
          aria-controls={open ? popoverId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        id={popoverId}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={POPOVER_BOX_SX}>
          <Typography sx={HEADING_SX}>Legend</Typography>
          {(availableTypes.length > 0 || availableStates.length > 0) && (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={GROUP_TITLE_SX}>Current view</Typography>
              {availableTypes.length > 0 && (
                <>
                  <Typography sx={{ ...GROUP_TITLE_SX, mt: 1 }}>Work item types in this view ({availableTypes.length})</Typography>
                  {availableTypes.map(type => {
                    const iconUrl = typeIconOf(type);
                    const color = typeColorOf(type);
                    return (
                      <Box key={type} sx={ITEM_ROW_SX}>
                        {iconUrl ? (
                          <Box
                            component="img"
                            src={iconUrl}
                            alt=""
                            aria-hidden="true"
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                            sx={TYPE_ICON_SX}
                          />
                        ) : (
                          <Box sx={{ ...DOT_SX, bgcolor: color, border: `1px solid ${alpha(color, 0.4)}` }} />
                        )}
                        <Typography sx={LABEL_SX}>{type}</Typography>
                      </Box>
                    );
                  })}
                </>
              )}
              {availableStates.length > 0 && (
                <>
                  <Typography sx={{ ...GROUP_TITLE_SX, mt: 1 }}>States in this view ({availableStates.length})</Typography>
                  {availableStates.map(state => {
                    const color = stateColorOf(state);
                    return (
                      <Box key={state} sx={ITEM_ROW_SX}>
                        <Box sx={{ ...DOT_SX, bgcolor: color, border: `1px solid ${alpha(color, 0.4)}` }} />
                        <Typography sx={LABEL_SX}>{state}</Typography>
                      </Box>
                    );
                  })}
                </>
              )}
              <Divider sx={{ mt: 1 }} />
            </Box>
          )}
          {referenceGroups.map((group, i) => (
            <Box key={group.title} sx={{ mb: i < referenceGroups.length - 1 ? 1.5 : 0 }}>
              <Typography sx={GROUP_TITLE_SX}>{group.title}</Typography>
              {group.items.map(item => (
                <Box key={item.label} sx={ITEM_ROW_SX} title={item.description || undefined}>
                  {group.title === 'Warning indicators' && WARNING_ICON_BY_LABEL[item.label as keyof typeof WARNING_ICON_BY_LABEL] ? (
                    React.createElement(WARNING_ICON_BY_LABEL[item.label as keyof typeof WARNING_ICON_BY_LABEL], {
                      sx: { ...ICON_SX, color: item.color },
                      'aria-hidden': 'true',
                    })
                  ) : (
                    <Box sx={{ ...DOT_SX, bgcolor: item.color, border: `1px solid ${alpha(item.color, 0.4)}` }} />
                  )}
                  <Typography sx={LABEL_SX}>{item.label}</Typography>
                </Box>
              ))}
              {i < referenceGroups.length - 1 && <Divider sx={{ mt: 1 }} />}
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
