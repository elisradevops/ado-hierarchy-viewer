import { create } from 'zustand';
import { iconColorFromUrl } from '../theme/chipColor';

export interface WorkItemTypeMeta {
  types: Array<{ name: string; color: string; iconUrl: string }>;
  stateColors: Record<string, string>;    // stateName.toLowerCase() → '#hexcolor'
  fieldsByType?: Record<string, string[]>; // typeName → field reference names (optional for older BFF)
}

interface WorkItemMetaStore {
  typeColors: Record<string, string>;     // typeName → '#hexcolor'
  typeIconUrls: Record<string, string>;   // typeName → 'https://...'
  stateColors: Record<string, string>;    // stateName.toLowerCase() → '#hexcolor'
  fieldsByType: Record<string, string[]>; // typeName → field reference names (empty = not loaded yet)
  setMeta: (meta: WorkItemTypeMeta) => void;
  clear: () => void;
}

export const useWorkItemMetaStore = create<WorkItemMetaStore>((set) => ({
  typeColors: {},
  typeIconUrls: {},
  stateColors: {},
  fieldsByType: {},

  setMeta: (meta) => {
    const typeColors: Record<string, string> = {};
    const typeIconUrls: Record<string, string> = {};
    for (const t of meta.types) {
      // Icon's baked-in color (when present) is more trustworthy than
      // WorkItemType.color — see iconColorFromUrl for why they can drift.
      typeColors[t.name] = iconColorFromUrl(t.iconUrl) ?? t.color;
      if (t.iconUrl) typeIconUrls[t.name] = t.iconUrl;
    }
    set({ typeColors, typeIconUrls, stateColors: meta.stateColors, fieldsByType: meta.fieldsByType ?? {} });
  },

  clear: () => set({ typeColors: {}, typeIconUrls: {}, stateColors: {}, fieldsByType: {} }),
}));
