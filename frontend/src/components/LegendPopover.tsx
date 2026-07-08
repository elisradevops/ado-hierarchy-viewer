import React, { useId, useState } from 'react';
import { Box, Divider, IconButton, Popover, Tooltip, Typography, alpha } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { LEGEND_GROUPS } from '../constants/helpText';

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
const LABEL_SX = { fontSize: '0.78rem', color: 'text.primary' } as const;

export function LegendPopover(): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const open = Boolean(anchorEl);

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
          {LEGEND_GROUPS.map((group, i) => (
            <Box key={group.title} sx={{ mb: i < LEGEND_GROUPS.length - 1 ? 1.5 : 0 }}>
              <Typography sx={GROUP_TITLE_SX}>{group.title}</Typography>
              {group.items.map(item => (
                <Box key={item.label} sx={ITEM_ROW_SX} title={item.description || undefined}>
                  <Box sx={{ ...DOT_SX, bgcolor: item.color, border: `1px solid ${alpha(item.color, 0.4)}` }} />
                  <Typography sx={LABEL_SX}>{item.label}</Typography>
                </Box>
              ))}
              {i < LEGEND_GROUPS.length - 1 && <Divider sx={{ mt: 1 }} />}
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
