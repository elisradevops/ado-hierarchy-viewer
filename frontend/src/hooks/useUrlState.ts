import { useEffect, useRef } from 'react';
import { useConfigStore } from '../state/configStore';
import type { HierarchyConfig } from '../types';

const PARAM_KEYS: Array<keyof HierarchyConfig> = [
  'tfsUrl', 'teamProject', 'relationTypes', 'closedState', 'effortField',
];

export function useUrlState(): void {
  const { setConfig } = useConfigStore();
  const initializedRef = useRef(false);

  // On mount: read URL params into config (backward-compat with old bookmarks),
  // then strip only the config keys from the URL, preserving all other params
  // (e.g. ADO extension params like hostorigin, extensionId).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const partial: Partial<HierarchyConfig> = {};

    for (const key of PARAM_KEYS) {
      const value = params.get(key);
      if (value !== null && value !== '') {
        if (key === 'relationTypes') {
          const parsed = value.split(',').filter(Boolean);
          if (parsed.length > 0) partial.relationTypes = parsed;
        } else {
          (partial as Record<string, string>)[key] = value;
        }
      }
    }

    if (Object.keys(partial).length > 0) setConfig(partial);

    // Strip config keys from URL, preserve all other params
    let changed = false;
    for (const key of PARAM_KEYS) {
      if (params.has(key)) { params.delete(key); changed = true; }
    }
    if (changed) {
      const newSearch = params.toString();
      window.history.replaceState(null, '', newSearch ? `?${newSearch}` : window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
