import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLUMN_DEFS, COLUMN_MIN_PX } from '../constants/columns';

/** Default-hidden column keys (columns where defaultVisible === false). Used to seed hiddenCols on first load. */
const DEFAULT_HIDDEN_COLS = COLUMN_DEFS
  .filter(c => c.defaultVisible === false)
  .map(c => c.key);

export type Density = 'comfortable' | 'compact';

export interface FilterState {
  text: string;
  types: string[];
  states: string[];
}

export interface SortState {
  col: string;
  dir: 'asc' | 'desc';
}

interface UiPrefsStore {
  density: Density;
  expandedIds: Record<number, true>;
  sort: SortState;
  filter: FilterState;
  autoRefreshMs: number;
  sidebarCollapsed: boolean;
  /** When true, the row list collapses to query filter matches (+ dimmed ancestor chain). Session-only. */
  showOnlyMatches: boolean;
  /** Keys of columns the user has explicitly hidden. Always-visible columns are never in this set. */
  hiddenCols: string[];
  /** Per-column widths overriding the default css track width (px). Empty = all defaults. */
  colWidths: Record<string, number>;

  setDensity: (density: Density) => void;
  toggleExpanded: (id: number) => void;
  expandAll: (ids: number[]) => void;
  collapseAll: () => void;
  setSort: (sort: SortState) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setAutoRefreshMs: (ms: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  toggleShowOnlyMatches: () => void;
  toggleCol: (key: string) => void;
  resetCols: () => void;
  setColWidth: (key: string, px: number) => void;
  resetColWidths: () => void;
}

export const useUiPrefsStore = create<UiPrefsStore>()(
  persist(
    (set) => ({
      density: 'comfortable',
      expandedIds: {},
      sort: { col: 'id', dir: 'asc' },
      filter: { text: '', types: [], states: [] },
      autoRefreshMs: 0,
      sidebarCollapsed: false,
      showOnlyMatches: false,
      hiddenCols: DEFAULT_HIDDEN_COLS,
      colWidths: {},

      setDensity: (density) => set({ density }),

      toggleExpanded: (id) => set(state => {
        // O(N) spread per toggle is unavoidable with immutable Record + Zustand reactivity.
        // Acceptable: toggleExpanded fires only on user click (low frequency, not per-render).
        if (state.expandedIds[id]) {
          const next = { ...state.expandedIds };
          delete next[id];
          return { expandedIds: next };
        }
        return { expandedIds: { ...state.expandedIds, [id]: true } };
      }),

      expandAll: (ids) => set(() => {
        const next: Record<number, true> = {};
        for (const id of ids) next[id] = true;
        return { expandedIds: next };
      }),

      collapseAll: () => set({ expandedIds: {} }),

      setSort: (sort) => set({ sort }),

      setFilter: (partial) => set(state => ({
        filter: { ...state.filter, ...partial },
      })),

      setAutoRefreshMs: (ms) => set({ autoRefreshMs: ms }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleShowOnlyMatches: () => set(state => ({ showOnlyMatches: !state.showOnlyMatches })),

      toggleCol: (key) => set(state => {
        const isHidden = state.hiddenCols.includes(key);
        return {
          hiddenCols: isHidden
            ? state.hiddenCols.filter(k => k !== key)
            : [...state.hiddenCols, key],
        };
      }),

      resetCols: () => set({ hiddenCols: DEFAULT_HIDDEN_COLS, colWidths: {} }),

      setColWidth: (key, px) => set(state => ({
        colWidths: { ...state.colWidths, [key]: Math.max(COLUMN_MIN_PX, Math.round(px)) },
      })),

      resetColWidths: () => set({ colWidths: {} }),
    }),
    {
      name: 'ado-hierarchy-viewer:ui-prefs',
      partialize: (state) => ({
        density: state.density,
        sort: state.sort,
        autoRefreshMs: state.autoRefreshMs,
        sidebarCollapsed: state.sidebarCollapsed,
        hiddenCols: state.hiddenCols,
        colWidths: state.colWidths,
        // expandedIds and filter are session-only — not persisted
      }),
    }
  )
);
