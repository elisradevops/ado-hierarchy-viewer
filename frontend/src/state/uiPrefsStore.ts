import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
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
  themeMode: ThemeMode;
  density: Density;
  expandedIds: Record<number, true>;
  sort: SortState;
  filter: FilterState;
  autoRefreshMs: number;
  sidebarCollapsed: boolean;

  setThemeMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
  toggleExpanded: (id: number) => void;
  expandAll: (ids: number[]) => void;
  collapseAll: () => void;
  setSort: (sort: SortState) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setAutoRefreshMs: (ms: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiPrefsStore = create<UiPrefsStore>()(
  persist(
    (set) => ({
      themeMode: 'system',
      density: 'comfortable',
      expandedIds: {},
      sort: { col: 'id', dir: 'asc' },
      filter: { text: '', types: [], states: [] },
      autoRefreshMs: 0,
      sidebarCollapsed: false,

      setThemeMode: (mode) => set({ themeMode: mode }),
      setDensity: (density) => set({ density }),

      toggleExpanded: (id) => set(state => {
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
    }),
    {
      name: 'ado-hierarchy-viewer:ui-prefs',
      partialize: (state) => ({
        themeMode: state.themeMode,
        density: state.density,
        sort: state.sort,
        autoRefreshMs: state.autoRefreshMs,
        sidebarCollapsed: state.sidebarCollapsed,
        // expandedIds and filter are session-only — not persisted
      }),
    }
  )
);
