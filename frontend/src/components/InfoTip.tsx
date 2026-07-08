import React, { useId, useState } from 'react';
import { Box, IconButton, Popover, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

// ─── sx constants ────────────────────────────────────────────────
const ICON_BTN_SX = { p: 0.25, color: 'text.disabled' } as const;
const POPOVER_BOX_SX = { p: 1.5, maxWidth: 280 } as const;
const TITLE_SX = { fontWeight: 600, mb: 0.5, fontSize: '0.8rem' } as const;
const TEXT_SX = { fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.5 } as const;

export interface InfoTipProps {
  /** Optional bold heading shown above the description. */
  title?: string;
  /** The explanation text. */
  text: string;
  /** Accessible label for the icon button — defaults to a generic "More info". */
  ariaLabel?: string;
}

/**
 * Small click-to-open info icon + popover. Click-based (not hover-only) so it
 * works on touch — unlike the Tooltip-only help scattered through this app.
 * Mirrors the anchorEl/Popover pattern already used by FilterMenu.
 */
export function InfoTip({ title, text, ariaLabel }: InfoTipProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        sx={ICON_BTN_SX}
        aria-label={ariaLabel ?? 'More info'}
        aria-controls={open ? popoverId : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
      >
        <HelpOutlineIcon sx={{ fontSize: 15 }} />
      </IconButton>
      <Popover
        id={popoverId}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={POPOVER_BOX_SX}>
          {title && <Typography sx={TITLE_SX}>{title}</Typography>}
          <Typography sx={TEXT_SX}>{text}</Typography>
        </Box>
      </Popover>
    </>
  );
}
