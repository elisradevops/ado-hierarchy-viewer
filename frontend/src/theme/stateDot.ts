import { STATE_DOT_COLORS, STATE_DOT_FALLBACK_COLOR } from '../constants/stateColors';

export function getStateDotColor(state: string): string {
  const lower = state.toLowerCase();
  return STATE_DOT_COLORS[lower as keyof typeof STATE_DOT_COLORS] ?? STATE_DOT_FALLBACK_COLOR;
}
