import React, { useMemo } from 'react';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import type { Theme, Shadows } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useAdoTheme, type ThemeMode } from '../hooks/useAdoTheme';

// ─── Design tokens ───────────────────────────────────────────────
// Brand + semantic colors stay fixed across light/dark — only surfaces/text invert.
const PRIMARY   = '#1B458F';
const P_LIGHT   = '#3B60C0';
const P_DARK    = '#102951';
const SUCCESS   = '#15803d';
const DANGER    = '#D1434B';
const INFO      = '#2563eb';
const RADIUS    = 10;
const RADIUS_SM = 6;
const SHADOW_LIGHT = '0px 6px 20px rgba(15,23,42,0.12)';
const SHADOW_DARK  = '0px 6px 20px rgba(0,0,0,0.45)';

interface Tokens {
  bg: string;
  surface: string;
  textPri: string;
  textSec: string;
  shadow: string;
  elevation1: string;
}

const LIGHT_TOKENS: Tokens = {
  bg: '#f8fafc',
  surface: '#ffffff',
  textPri: '#0f172a',
  textSec: '#334155',
  shadow: SHADOW_LIGHT,
  elevation1: '0px 1px 3px rgba(15,23,42,0.08)',
};

const DARK_TOKENS: Tokens = {
  bg: '#0f172a',
  surface: '#1e293b',
  textPri: '#f1f5f9',
  textSec: '#cbd5e1',
  shadow: SHADOW_DARK,
  elevation1: '0px 1px 3px rgba(0,0,0,0.35)',
};

function buildTheme(mode: ThemeMode): Theme {
  const t = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;

  return createTheme({
    palette: {
      mode,
      primary: { main: PRIMARY, light: P_LIGHT, dark: P_DARK, contrastText: '#ffffff' },
      background: { default: t.bg, paper: t.surface },
      text: { primary: t.textPri, secondary: t.textSec },
      success: { main: SUCCESS },
      error: { main: DANGER },
      info: { main: INFO },
      divider: alpha(t.textPri, 0.08),
    },
    typography: {
      fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
      fontSize: 14,
      h6: { fontWeight: 700, lineHeight: 1.3 },
      subtitle1: { fontWeight: 600, fontSize: '0.9375rem' },
      subtitle2: { fontWeight: 600 },
      body2: { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem', lineHeight: 1.4 },
      button: { fontWeight: 600, letterSpacing: '0.01em' },
    },
    shape: { borderRadius: RADIUS },
    shadows: [
      'none',
      t.elevation1,
      t.shadow,
      ...Array<string>(22).fill(t.shadow),
    ] as Shadows,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: t.bg },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, borderRadius: RADIUS_SM, padding: '6px 16px' },
          sizeLarge: { padding: '10px 24px', fontSize: '1rem' },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: RADIUS_SM },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: RADIUS_SM },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { borderRadius: RADIUS_SM, boxShadow: t.shadow },
          listbox: { fontSize: '0.8125rem' },
          option: { fontSize: '0.8125rem' },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          elevation1: { boxShadow: t.elevation1 },
          elevation2: { boxShadow: mode === 'dark' ? '0px 2px 8px rgba(0,0,0,0.4)' : '0px 2px 8px rgba(15,23,42,0.10)' },
          elevation3: { boxShadow: t.shadow },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.04) },
            '&.Mui-selected': { backgroundColor: alpha(PRIMARY, 0.08) },
            '&.Mui-selected:hover': { backgroundColor: alpha(PRIMARY, 0.12) },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600,
            color: t.textSec,
            backgroundColor: t.bg,
            borderBottom: `2px solid ${alpha(t.textPri, 0.08)}`,
            fontSize: '0.75rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          },
          body: {
            fontSize: '0.8125rem',
            borderBottom: `1px solid ${alpha(t.textPri, 0.06)}`,
          },
        },
      },
      MuiTableSortLabel: {
        styleOverrides: {
          root: {
            '&.Mui-active': { color: PRIMARY },
            '&:hover': { color: P_LIGHT },
          },
          icon: { color: 'inherit !important' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: RADIUS_SM, fontWeight: 500 },
          sizeSmall: { fontSize: '0.72rem' },
          label: { padding: '0 8px' },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: RADIUS_SM },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: `${RADIUS_SM}px !important`,
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: `1px solid ${alpha(t.textPri, 0.12)}`,
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: RADIUS_SM },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500, borderRadius: RADIUS_SM },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4 },
          bar: { borderRadius: 4 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: { fontSize: '0.72rem' },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: alpha(t.textPri, 0.08) },
        },
      },
      MuiSnackbar: {
        defaultProps: {
          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
          autoHideDuration: 2000,
        },
      },
    },
  });
}

// Static light theme — used as the default export for tests and any non-React consumer
// that needs a theme object without mounting AppThemeProvider (see theme.ts).
const theme = buildTheme('light');

interface AppThemeProviderProps { children: React.ReactNode; }

export function AppThemeProvider({ children }: AppThemeProviderProps): React.ReactElement {
  // Standalone mode never fires the SDK's themeApplied event, so this always resolves
  // to 'light' there — only the ADO extension host can switch it to 'dark'.
  const mode = useAdoTheme();
  const activeTheme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={activeTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export { theme };
