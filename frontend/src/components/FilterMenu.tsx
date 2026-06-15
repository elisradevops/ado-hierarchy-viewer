import React, { useState, useId } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import type { PaperProps } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import type { FilterState } from '../state/uiPrefsStore';

// ─── sx constants ────────────────────────────────────────────────
const POPOVER_PAPER_PROPS: PaperProps = {
  sx: {
    p: 2,
    minWidth: 220,
    maxHeight: 400,
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

const CLEAR_BTN_SX = {
  mt: 1,
} as const;

const FORM_CONTROL_LABEL_SX = {
  '& .MuiFormControlLabel-label': { fontSize: '0.85rem' },
} as const;

// ─── Props ───────────────────────────────────────────────────────
export interface FilterMenuProps {
  availableTypes: string[];
  availableStates: string[];
  filter: Pick<FilterState, 'types' | 'states'>;
  setFilter: (partial: Partial<Pick<FilterState, 'types' | 'states'>>) => void;
}

export function FilterMenu({
  availableTypes,
  availableStates,
  filter,
  setFilter,
}: FilterMenuProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const buttonId = useId();
  const popoverId = useId();

  const open = Boolean(anchorEl);
  const activeCount = filter.types.length + filter.states.length;

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
      <Tooltip title="Filter by type or state">
        <IconButton
          id={buttonId}
          size="small"
          onClick={handleOpen}
          aria-controls={open ? popoverId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <Badge badgeContent={activeCount > 0 ? activeCount : undefined} color="primary">
            <FilterListIcon fontSize="small" />
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
          <Box>
            <Typography sx={SECTION_TITLE_SX}>Types</Typography>
            <FormGroup>
              {availableTypes.map(type => (
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
                  label={type}
                />
              ))}
            </FormGroup>
          </Box>
        )}

        {availableTypes.length > 0 && availableStates.length > 0 && (
          <Divider sx={{ my: 1 }} />
        )}

        {availableStates.length > 0 && (
          <Box>
            <Typography sx={SECTION_TITLE_SX}>States</Typography>
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
                  label={state}
                />
              ))}
            </FormGroup>
          </Box>
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
