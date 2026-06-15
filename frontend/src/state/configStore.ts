import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HierarchyConfig } from '../types';
import { DEFAULT_CLOSED_STATE, DEFAULT_EFFORT_FIELD } from '../constants/fields';

interface ConfigStore {
  config: HierarchyConfig;
  setConfig: (partial: Partial<HierarchyConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: HierarchyConfig = {
  tfsUrl: '',
  teamProject: '',
  relationType: 'System.LinkTypes.Hierarchy-Forward',
  direction: 'forward',
  closedState: DEFAULT_CLOSED_STATE,
  effortField: DEFAULT_EFFORT_FIELD,
};

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_CONFIG },

      setConfig: (partial) =>
        set(state => ({
          config: { ...state.config, ...partial },
        })),

      resetConfig: () => set({ config: { ...DEFAULT_CONFIG } }),
    }),
    {
      name: 'ado-hierarchy-viewer:config',
      partialize: (state) => ({
        config: state.config,
      }),
    }
  )
);
