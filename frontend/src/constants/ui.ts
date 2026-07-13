export const DEBOUNCE_MS = 250;

// Shared CSS Grid template for the hierarchy table header AND every data row.
// Title column fills remaining space; all metadata columns are fixed px.
// Must be kept in sync between HierarchyTreeTable (header) and TreeRow (rows).
// Title | Type | State | AssignedTo | AreaPath | IterationPath | StoryPoints | RemainingWork | OrigEstimate | Priority | Tags | Progress | Effort | TotalEffort
export const GRID_COLS = 'minmax(0, 1fr) 120px 110px 140px 180px 180px 100px 100px 100px 80px 100px 165px 90px 110px';

export const ROW_HEIGHT = { comfortable: 48, compact: 36 } as const;

// Items threshold above which graph/tree computation is offloaded to a Web Worker
export const WORKER_THRESHOLD = 1500;

// Below this viewport width (e.g. a narrow ADO extension hub panel), the sidebar
// auto-collapses, density switches to compact, and tree indentation shrinks so
// the table stays usable instead of forcing heavy horizontal scroll.
export const NARROW_VIEWPORT_PX = 700;

// Below this width, the toolbar folds Density/Columns/Legend into the "More
// actions" menu instead of letting them wrap into a broken multi-row layout.
// Deliberately wider (and reactive, not one-shot) than NARROW_VIEWPORT_PX — the
// toolbar runs out of room well before the sidebar's own breakpoint matters;
// they're independent axes, not substitutes for each other.
export const NARROW_TOOLBAR_PX = 950;

export const REQUEST_TIMEOUT_MS = 30_000;

export const AUTO_REFRESH_OPTIONS = [
  { label: 'Off',  menuLabel: 'Off',        tooltipLabel: 'Auto-refresh is off',             value: 0 },
  { label: '30s',  menuLabel: '30 seconds',  tooltipLabel: 'Auto-refresh every 30 seconds',   value: 30_000 },
  { label: '1m',   menuLabel: '1 minute',    tooltipLabel: 'Auto-refresh every 1 minute',     value: 60_000 },
  { label: '5m',   menuLabel: '5 minutes',   tooltipLabel: 'Auto-refresh every 5 minutes',    value: 300_000 },
] as const;

export type AutoRefreshOption = (typeof AUTO_REFRESH_OPTIONS)[number];
