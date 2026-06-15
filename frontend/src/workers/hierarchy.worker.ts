import type { BuildHierarchyInput, BuildHierarchyResult } from '../types';
import { buildHierarchy } from '../services/pipeline';

self.onmessage = (event: MessageEvent<BuildHierarchyInput>) => {
  try {
    const result: BuildHierarchyResult = buildHierarchy(event.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
