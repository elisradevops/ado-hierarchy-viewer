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
  relationTypes: ['System.LinkTypes.Hierarchy-Forward'],
  closedState: DEFAULT_CLOSED_STATE,
  effortField: DEFAULT_EFFORT_FIELD,
  queryId: '',
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
      version: 3,
      migrate(persisted: unknown, version: number) {
        let state = persisted as Record<string, unknown>;

        if (version < 1) {
          const cfg = (state['config'] ?? {}) as Record<string, unknown>;
          const relationType = cfg['relationType'];
          const migrated = { ...cfg };
          migrated['relationTypes'] = typeof relationType === 'string' && relationType
            ? [relationType]
            : DEFAULT_CONFIG.relationTypes;
          delete migrated['relationType'];
          delete migrated['direction'];
          state = { config: migrated };
        }

        if (version < 2) {
          // Strip artifact/resource link types (e.g. 'Hyperlink', 'ArtifactLink') that
          // were never valid in WIQL WorkItemLinks queries. Valid work-item link reference
          // names always contain a dot (System.LinkTypes.*, Elisra.*).
          const cfg = (state['config'] ?? {}) as Record<string, unknown>;
          const rels = Array.isArray(cfg['relationTypes']) ? cfg['relationTypes'] as string[] : [];
          const cleaned = rels.filter((r: string) => r.includes('.'));
          state = {
            ...state,
            config: {
              ...cfg,
              relationTypes: cleaned.length > 0 ? cleaned : DEFAULT_CONFIG.relationTypes,
            },
          };
        }

        if (version < 3) {
          // teamProject is authoritatively re-derived every load (from ADO context in
          // extension mode, from URL/user in standalone) and must never persist —
          // a stale persisted value could otherwise leak across modes/contexts
          // sharing a browser origin. Drop any previously-persisted value.
          const cfg = (state['config'] ?? {}) as Record<string, unknown>;
          state = { ...state, config: { ...cfg, teamProject: DEFAULT_CONFIG.teamProject } };
        }

        return state;
      },
      // teamProject is intentionally excluded — see version-3 migration note above.
      partialize: (state) => ({
        config: { ...state.config, teamProject: DEFAULT_CONFIG.teamProject },
      }),
    }
  )
);
