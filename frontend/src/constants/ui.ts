export const DEBOUNCE_MS = 250;

// Shared CSS Grid template for the hierarchy table header AND every data row.
// Title column fills remaining space; all metadata columns are fixed px.
// Must be kept in sync between HierarchyTreeTable (header) and TreeRow (rows).
export const GRID_COLS = 'minmax(0, 1fr) 120px 110px 165px 90px 110px';

export const ROW_HEIGHT = { comfortable: 48, compact: 36 } as const;

// Items threshold above which graph/tree computation is offloaded to a Web Worker
export const WORKER_THRESHOLD = 1500;

export const REQUEST_TIMEOUT_MS = 30_000;

export const AUTO_REFRESH_OPTIONS = [
  { label: 'Off',  menuLabel: 'Off',        tooltipLabel: 'Auto-refresh is off',             value: 0 },
  { label: '30s',  menuLabel: '30 seconds',  tooltipLabel: 'Auto-refresh every 30 seconds',   value: 30_000 },
  { label: '1m',   menuLabel: '1 minute',    tooltipLabel: 'Auto-refresh every 1 minute',     value: 60_000 },
  { label: '5m',   menuLabel: '5 minutes',   tooltipLabel: 'Auto-refresh every 5 minutes',    value: 300_000 },
] as const;

export type AutoRefreshOption = (typeof AUTO_REFRESH_OPTIONS)[number];
