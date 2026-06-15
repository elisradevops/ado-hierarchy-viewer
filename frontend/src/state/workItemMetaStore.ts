import { create } from 'zustand';

export interface WorkItemTypeMeta {
  types: Array<{ name: string; color: string; iconUrl: string }>;
  stateColors: Record<string, string>;  // stateName.toLowerCase() → '#hexcolor'
}

interface WorkItemMetaStore {
  typeColors: Record<string, string>;   // typeName → '#hexcolor'
  typeIconUrls: Record<string, string>; // typeName → 'https://...'
  stateColors: Record<string, string>;  // stateName.toLowerCase() → '#hexcolor'
  setMeta: (meta: WorkItemTypeMeta) => void;
  clear: () => void;
}

export const useWorkItemMetaStore = create<WorkItemMetaStore>((set) => ({
  typeColors: {},
  typeIconUrls: {},
  stateColors: {},

  setMeta: (meta) => {
    const typeColors: Record<string, string> = {};
    const typeIconUrls: Record<string, string> = {};
    for (const t of meta.types) {
      typeColors[t.name] = t.color;
      if (t.iconUrl) typeIconUrls[t.name] = t.iconUrl;
    }
    set({ typeColors, typeIconUrls, stateColors: meta.stateColors });
  },

  clear: () => set({ typeColors: {}, typeIconUrls: {}, stateColors: {} }),
}));
