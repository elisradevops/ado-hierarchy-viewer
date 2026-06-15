// Theme is now managed by AppThemeProvider.
// This file is kept for backward compatibility during transition.
export { theme } from './AppThemeProvider';

// Legacy named exports used by tests — aliased to the single shared theme.
import { theme } from './AppThemeProvider';
export const LIGHT_COMFORTABLE = theme;
export const LIGHT_COMPACT     = theme;
export const DARK_COMFORTABLE  = theme;
export const DARK_COMPACT      = theme;
export function getTheme(_mode: string, _density: string) { return theme; }
