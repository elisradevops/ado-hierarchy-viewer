// Theme is now managed by AppThemeProvider.
// This file is kept for backward compatibility during transition.
export { theme } from './AppThemeProvider';

// Named export used by tests.
import { theme } from './AppThemeProvider';
export const LIGHT_COMFORTABLE = theme;
