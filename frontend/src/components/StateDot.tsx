import React from 'react';
import { getStateDotColor } from '../theme/stateDot';

const DOT_SX = {
  display: 'inline-block',
  borderRadius: '50%',
  width: 10,
  height: 10,
  flexShrink: 0,
} as const;

interface StateDotProps {
  state: string;
}

export const StateDot = React.memo(function StateDot({ state }: StateDotProps): React.ReactElement {
  const color = getStateDotColor(state);
  // Dynamic color is the one exception to the no-inline-styles rule
  return <span style={{ ...DOT_SX, backgroundColor: color }} aria-label={state} />;
});
