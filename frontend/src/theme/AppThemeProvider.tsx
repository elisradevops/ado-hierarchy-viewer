import React from 'react';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import type { Shadows } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// ─── Design tokens ───────────────────────────────────────────────
const PRIMARY   = '#1B458F';
const P_LIGHT   = '#3B60C0';
const P_DARK    = '#102951';
const BG        = '#f8fafc';
const SURFACE   = '#ffffff';
const TEXT_PRI  = '#0f172a';
const TEXT_SEC  = '#334155';
const SUCCESS   = '#15803d';
const DANGER    = '#D1434B';
const INFO      = '#2563eb';
const RADIUS    = 10;
const RADIUS_SM = 6;
const SHADOW    = '0px 6px 20px rgba(15,23,42,0.12)';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: PRIMARY, light: P_LIGHT, dark: P_DARK, contrastText: '#ffffff' },
    background: { default: BG, paper: SURFACE },
    text: { primary: TEXT_PRI, secondary: TEXT_SEC },
    success: { main: SUCCESS },
    error: { main: DANGER },
    info: { main: INFO },
    divider: alpha(TEXT_PRI, 0.08),
  },
  typography: {
    fontFamily: "'Inter', Roboto, Helvetica, Arial, sans-serif",
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
    '0px 1px 3px rgba(15,23,42,0.08)',
    SHADOW,
    ...Array<string>(22).fill(SHADOW),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: BG },
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
        paper: { borderRadius: RADIUS_SM, boxShadow: SHADOW },
        listbox: { fontSize: '0.8125rem' },
        option: { fontSize: '0.8125rem' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        elevation1: { boxShadow: '0px 1px 3px rgba(15,23,42,0.08)' },
        elevation2: { boxShadow: '0px 2px 8px rgba(15,23,42,0.10)' },
        elevation3: { boxShadow: SHADOW },
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
          color: TEXT_SEC,
          backgroundColor: BG,
          borderBottom: `2px solid ${alpha(TEXT_PRI, 0.08)}`,
          fontSize: '0.75rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        },
        body: {
          fontSize: '0.8125rem',
          borderBottom: `1px solid ${alpha(TEXT_PRI, 0.06)}`,
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
          border: `1px solid ${alpha(TEXT_PRI, 0.12)}`,
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
        root: { borderColor: alpha(TEXT_PRI, 0.08) },
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

interface AppThemeProviderProps { children: React.ReactNode; }

export function AppThemeProvider({ children }: AppThemeProviderProps): React.ReactElement {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export { theme };
