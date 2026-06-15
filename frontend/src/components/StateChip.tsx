import React from 'react';
import { Chip, alpha } from '@mui/material';
import { getStateDotColor } from '../theme/stateDot';
import { useWorkItemMetaStore } from '../state/workItemMetaStore';

interface StateChipProps {
  state: string;
}

export const StateChip = React.memo(function StateChip({ state }: StateChipProps): React.ReactElement {
  const apiStateColors = useWorkItemMetaStore(s => s.stateColors);
  const color = apiStateColors[state.toLowerCase()] ?? getStateDotColor(state);
  return (
    <Chip
      label={state}
      size="small"
      sx={{
        backgroundColor: alpha(color, 0.12),
        color,
        borderColor: alpha(color, 0.35),
        border: '1px solid',
        fontWeight: 500,
        fontSize: '0.7rem',
        height: 20,
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
});
